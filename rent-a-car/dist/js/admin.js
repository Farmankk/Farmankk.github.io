// Car4Rent Pakistan - Resilient Admin Portal Logic

let adminState = {
  settings: {},
  users: [],
  categories: [],
  brands: [],
  cars: [],
  reviews: [],
  quotes: []
};

let currentModalCarImg = '';

document.addEventListener('DOMContentLoaded', async () => {
  renderAdminHeaderBranding();
  const authenticated = await checkAuth();
  if (authenticated) {
    await loadAdminDashboard();
  }
});

// ====================================================
// CRYPTOGRAPHIC TOKEN-BASED AUTHENTICATION & SESSION
// ====================================================

function getAdminToken() {
  return sessionStorage.getItem('c4r_admin_token') || localStorage.getItem('c4r_admin_token');
}

function getAdminCurrentUser() {
  try {
    const raw = sessionStorage.getItem('c4r_admin_user') || localStorage.getItem('c4r_admin_user');
    if (raw) {
      const u = JSON.parse(raw);
      const dbUser = (adminState.users || []).find(x => x.id === u.id || x.username === u.username);
      if (dbUser && dbUser.permissions) {
        u.permissions = dbUser.permissions;
      }
      return u;
    }
  } catch (e) {}
  // Resilient fallback: examine logged-in badge or default to Super Admin
  const userDisplay = document.getElementById('loggedInUserDisplay')?.textContent || '';
  if (userDisplay && !userDisplay.includes('Super Admin')) {
    const match = (adminState.users || []).find(u => userDisplay.includes(u.name) || userDisplay.includes(u.username));
    if (match) return match;
  }
  return { role: 'Super Admin', name: 'Master Admin' };
}

function setAdminToken(token, user, remember) {
  sessionStorage.setItem('c4r_admin_token', token);
  sessionStorage.setItem('c4r_admin_user', JSON.stringify(user));
  localStorage.setItem('c4r_admin_token', token);
  localStorage.setItem('c4r_admin_user', JSON.stringify(user));
}

function clearAdminSession() {
  sessionStorage.removeItem('c4r_admin_token');
  sessionStorage.removeItem('c4r_admin_user');
  localStorage.removeItem('c4r_admin_token');
  localStorage.removeItem('c4r_admin_user');
  sessionStorage.removeItem('dream_drive_admin_logged');
  sessionStorage.removeItem('dream_drive_user');
}

function isLoggedIn() {
  return !!getAdminToken();
}

// Inactivity Auto-Logout Tracker (15 Minutes Idle Timeout)
let inactivityTimer = null;
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 mins

function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  if (!getAdminToken()) return;
  inactivityTimer = setTimeout(() => {
    showToast('Session expired due to inactivity. Please log in again.', 'warning');
    handleAdminLogout();
  }, INACTIVITY_TIMEOUT_MS);
}

function startInactivityTracker() {
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    window.addEventListener(evt, resetInactivityTimer, { passive: true });
  });
  resetInactivityTimer();
}

function stopInactivityTracker() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    window.removeEventListener(evt, resetInactivityTimer);
  });
}

// Server-Side Verified checkAuth
async function checkAuth() {
  const modal = document.getElementById('loginModal');
  const app = document.getElementById('adminApp');
  const token = getAdminToken();

  if (!token) {
    if (modal) modal.classList.remove('hidden');
    if (app) app.classList.add('hidden');
    return false;
  }

  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/admin/verify-session`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        if (modal) modal.classList.add('hidden');
        if (app) app.classList.remove('hidden');
        const user = data.user || {};
        sessionStorage.setItem('c4r_admin_user', JSON.stringify(user));
        const userDisplay = document.getElementById('loggedInUserDisplay');
        if (userDisplay) {
          userDisplay.textContent = `${user.name || user.username} (${user.role || 'Admin'})`;
        }
        startInactivityTracker();
        return true;
      }
    }
  } catch (e) {
    console.warn('Session verification network error:', e);
  }

  // Token invalid or expired on server
  clearAdminSession();
  stopInactivityTracker();
  if (modal) modal.classList.remove('hidden');
  if (app) app.classList.add('hidden');
  return false;
}

// Secure Login Handler
async function handleAdminLogin(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('adminUsernameInput');
  const passwordInput = document.getElementById('adminPasswordInput');
  const rememberCheck = document.getElementById('rememberMeCheck');
  const errorEl = document.getElementById('loginError');
  const submitBtn = e.target.querySelector('button[type="submit"]');

  const username = usernameInput ? usernameInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value.trim() : '';
  const remember = rememberCheck ? rememberCheck.checked : false;
  const base = getApiBase();

  errorEl.classList.add('hidden');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="inline-block animate-spin mr-2">⟳</span> Authenticating...';
  }

  try {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 404 || res.status === 502 || res.status === 503) {
      errorEl.textContent = 'Backend Node.js server is offline or unreachable. Please verify Node.js is running in cPanel.';
      errorEl.classList.remove('hidden');
      return;
    }

    if (res.status === 429) {
      errorEl.textContent = data.message || 'Security Lockout: Too many failed attempts. Please try again in 15 minutes.';
      errorEl.classList.remove('hidden');
      return;
    }

    if (res.status === 403) {
      errorEl.textContent = data.message || 'This administrator account has been disabled. Please contact the administrator.';
      errorEl.classList.remove('hidden');
      return;
    }

    if (!res.ok || !data.success) {
      errorEl.textContent = data.message || 'Invalid username or password. Please verify your credentials.';
      errorEl.classList.remove('hidden');
      return;
    }

    // Login Successful: Store Session Token
    setAdminToken(data.token, data.user, remember);
    if (passwordInput) passwordInput.value = '';

    const verified = await checkAuth();
    if (verified) {
      await loadAdminDashboard();
      showToast(`Welcome back, ${data.user.name || data.user.username}!`);
    }
  } catch (err) {
    errorEl.textContent = 'Network error: Unable to connect to the authentication server.';
    errorEl.classList.remove('hidden');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-lucide="shield-check" class="w-4 h-4"></i> Secure Admin Login';
      if (window.lucide) lucide.createIcons();
    }
  }
}

// Secure Logout Handler
async function handleAdminLogout() {
  const token = getAdminToken();
  const base = getApiBase();
  try {
    if (token) {
      await fetch(`${base}/api/admin/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
  } catch (e) {}

  clearAdminSession();
  stopInactivityTracker();
  await checkAuth();
  showToast('Logged out successfully.');
}

// Load All Admin Data from Server / Local DB
async function loadAdminDashboard() {
  const data = await fetchAdminData();
  if (data) {
    adminState = data;
  }

  updateMetrics();
  renderFleetTable();
  renderCategoriesGrid();
  renderBrandsList();
  populateSettingsForm();
  renderReviewsTable();
  renderUsersTable();
  renderQuotesTable();
  renderMenusTable();

  // Load SEO modules
  populateGlobalSeoForm();
  renderSeoLandingPagesTable();
  renderKarachiAreasTable();
  renderSeoFaqsTable();
  loadRobotsTxt();

  // Load Calculator module
  renderCalculatorTab();

  // Load Typography & Content module
  renderContentAndTypographyTab();

  // Load Blogs & Guides module
  renderBlogsTab();

  populateModalDropdowns();

  // Apply user role and page access permissions
  if (typeof applyCurrentUserPermissions === 'function') {
    applyCurrentUserPermissions();
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

function switchTab(tabId) {
  if (typeof getCurrentUserTabPermission === 'function') {
    const perm = getCurrentUserTabPermission(tabId);
    if (!perm.canView) {
      showToast('Access Restricted: You do not have permission to view this section.', 'error');
      return;
    }
  }

  const tabs = ['fleet', 'categories', 'brands', 'offerEmergency', 'brandingFooter', 'reviews', 'users', 'quotes', 'menus', 'seo', 'blogs', 'content', 'calculator', 'license'];
  tabs.forEach(t => {
    const pane = document.getElementById(`tabContent-${t}`);
    const btn = document.getElementById(`tabBtn-${t}`);
    if (pane && btn) {
      if (t === tabId) {
        pane.classList.remove('hidden');
        btn.className = 'admin-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all bg-white text-black shadow';
      } else {
        pane.classList.add('hidden');
        btn.className = 'admin-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all text-zinc-400 hover:text-white';
      }
    }
  });

  if (typeof applyTabActionRestrictions === 'function') {
    applyTabActionRestrictions(tabId);
  }

  if (tabId === 'calculator') {
    renderCalculatorTab();
  } else if (tabId === 'license') {
    fetchAndRenderLicenseDetails();
  } else if (tabId === 'seo') {
    updateSerpPreview();
  } else if (tabId === 'blogs') {
    renderBlogsTab();
  } else if (tabId === 'content') {
    renderContentAndTypographyTab();
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

// Render Dynamic Admin Header Logo & Title from Settings
function renderAdminHeaderBranding() {
  const s = (adminState && adminState.settings && Object.keys(adminState.settings).length > 0) 
    ? adminState.settings 
    : (typeof getLocalDB === 'function' ? (getLocalDB().settings || {}) : {});
  const siteName = s.siteName || 'Car4Rent';
  const rawLogo = (s.logoUrl || '').trim();
  const logoUrl = rawLogo && !rawLogo.startsWith('data:') && !rawLogo.includes('v=')
    ? `${rawLogo}${rawLogo.includes('?') ? '&' : '?'}v=${s.updated_at || Date.now()}`
    : rawLogo;
  const logoText = (s.logoText || '').trim();

  const nameEl = document.getElementById('adminSiteNameDisplay');
  if (nameEl) nameEl.textContent = siteName;

  const logoIcon = document.getElementById('adminHeaderLogoIcon');
  if (logoIcon) {
    if (logoUrl) {
      logoIcon.className = 'h-10 max-w-[170px] bg-white/5 border border-white/10 rounded-xl px-2 py-1 flex items-center justify-center';
      logoIcon.innerHTML = `<img src="${logoUrl}" alt="${siteName}" class="h-8 max-h-8 w-auto max-w-[150px] object-contain">`;
    } else if (logoText) {
      logoIcon.className = 'w-10 h-10 bg-rose-600 text-white rounded-xl flex items-center justify-center font-black';
      logoIcon.innerHTML = `<span class="text-xl font-heading">${logoText}</span>`;
    } else {
      logoIcon.className = 'w-10 h-10 bg-rose-600 text-white rounded-xl flex items-center justify-center font-black';
      logoIcon.innerHTML = `<span class="text-xl font-heading">${(siteName.charAt(0) || 'C').toUpperCase()}</span>`;
    }
  }

  const modalTitle = document.getElementById('loginModalTitle');
  if (modalTitle) {
    modalTitle.textContent = `${siteName} Admin Portal`;
  }

  // Dynamic Browser Tab Title & Favicon from Settings
  document.title = `${siteName} | Executive Admin Portal`;
  if (logoUrl) {
    let favicon = document.getElementById('siteFavicon');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.id = 'siteFavicon';
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = logoUrl;
  }
}

// Update Top Metrics
function updateMetrics() {
  document.getElementById('kpiCars').textContent = (adminState.cars || []).length;
  document.getElementById('kpiCategories').textContent = (adminState.categories || []).length;
  document.getElementById('kpiBrands').textContent = (adminState.brands || []).length;
  document.getElementById('kpiReviews').textContent = (adminState.reviews || []).length;
  document.getElementById('kpiQuotes').textContent = (adminState.quotes || []).length;
  document.getElementById('quotesCountBadge').textContent = (adminState.quotes || []).length;
  document.getElementById('adminSiteNameDisplay').textContent = adminState.settings?.siteName || 'Car4Rent';
  renderAdminHeaderBranding();

  const seoPages = (adminState.seoLandingPages || []).length;
  const seoAreas = (adminState.karachiAreas || []).length;
  const seoFaqs = (adminState.seoFaqs || []).length;
  if (document.getElementById('seoPagesCount')) document.getElementById('seoPagesCount').textContent = seoPages;
  if (document.getElementById('seoAreasCount')) document.getElementById('seoAreasCount').textContent = seoAreas;
  if (document.getElementById('seoFaqsCount')) document.getElementById('seoFaqsCount').textContent = seoFaqs;
  if (document.getElementById('sitemapLandingCount')) document.getElementById('sitemapLandingCount').textContent = seoPages + ' URLs';
  if (document.getElementById('sitemapCarsCount')) document.getElementById('sitemapCarsCount').textContent = (adminState.cars || []).length + ' URLs';
}

// Helper to send authenticated mutation to server
async function postAdminMutation(endpoint, payload) {
  const base = getApiBase();
  const token = getAdminToken();
  if (!token) {
    handleAdminLogout();
    return null;
  }
  try {
    const res = await fetch(`${base}${endpoint}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    if (res.status === 401 || res.status === 403) {
      showToast('Admin session expired. Please login again.', 'warning');
      handleAdminLogout();
      return null;
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return data;
    } else {
      showToast(data.error || data.message || 'Operation failed on server.', 'error');
      return null;
    }
  } catch (e) {
    console.warn('Server sync failed:', e.message);
    showToast('Network error: Could not reach server.', 'error');
  }
  return null;
}

// ==============================================
// 1. FLEET INVENTORY (Cars)
// ==============================================
function renderFleetTable() {
  const tbody = document.getElementById('fleetTableBody');
  if (!tbody) return;

  const cars = adminState.cars || [];
  if (cars.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-zinc-500">No vehicles in fleet. Add one above.</td></tr>`;
    return;
  }

  tbody.innerHTML = cars.map(car => `
    <tr class="hover:bg-white/5 transition-colors">
      <td class="px-6 py-4">
        <div class="flex items-center gap-3">
          <img src="${car.image}" class="w-14 h-10 object-cover rounded-lg bg-zinc-800 flex-shrink-0" onerror="this.src='/uploads/seo-car-1789727514573.jpg'">
          <div>
            <div class="font-bold text-white">${car.name}</div>
            <div class="text-xs text-zinc-400">${car.brand}</div>
            <a href="/cars/${car.slug || car.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}" target="_blank" class="text-[10px] text-rose-400 hover:text-rose-300 font-mono inline-flex items-center gap-1 mt-0.5">
              <span>/cars/${car.slug || car.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}</span>
              <i data-lucide="external-link" class="w-2.5 h-2.5"></i>
            </a>
          </div>
        </div>
      </td>
      <td class="px-6 py-4">
        <span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/10 text-zinc-300">
          ${car.categoryName || car.category}
        </span>
      </td>
      <td class="px-6 py-4 font-mono font-bold text-white">
        ${formatPKR(car.dailyPrice)} <span class="text-xs text-zinc-500 font-normal">/day</span>
      </td>
      <td class="px-6 py-4 text-xs text-zinc-400">
        <div>${car.hp || '500 HP'} • ${car.accel || '4.0s'}</div>
        <div class="text-zinc-500">${car.seats || 5} Seats</div>
      </td>
      <td class="px-6 py-4">
        ${car.featured ? `
          <span class="text-rose-400 font-bold text-xs flex items-center gap-1">
            <i data-lucide="star" class="w-3.5 h-3.5 fill-rose-500"></i> Yes
          </span>
        ` : `<span class="text-zinc-600 text-xs">No</span>`}
      </td>
      <td class="px-6 py-4 text-right space-x-2">
        <button onclick="openCarModal('edit', '${car.id}')" class="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Edit Car">
          <i data-lucide="edit-3" class="w-4 h-4"></i>
        </button>
        <button onclick="deleteCar('${car.id}')" class="p-2 text-rose-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors" title="Delete Car">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function populateModalDropdowns() {
  const brandSelect = document.getElementById('modalCarBrand');
  const catSelect = document.getElementById('modalCarCategory');

  if (brandSelect) {
    brandSelect.innerHTML = (adminState.brands || []).map(b => `<option value="${b}">${b}</option>`).join('');
  }
  if (catSelect) {
    catSelect.innerHTML = (adminState.categories || []).map(c => `<option value="${c.slug || c.id}">${c.icon || ''} ${c.name}</option>`).join('');
  }
}

function onCarNameInput(val) {
  const slugInput = document.getElementById('modalCarSlug');
  if (!slugInput) return;
  if (!slugInput.dataset.manualEdited) {
    slugInput.value = (val || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
}

function openCarModal(mode, carId = null) {
  populateModalDropdowns();
  const modal = document.getElementById('carModal');
  const title = document.getElementById('carModalTitle');
  const form = document.getElementById('carModalForm');
  form.reset();

  const slugInput = document.getElementById('modalCarSlug');
  if (slugInput) {
    delete slugInput.dataset.manualEdited;
    slugInput.value = '';
  }

  if (mode === 'edit' && carId) {
    const car = (adminState.cars || []).find(c => c.id === carId);
    if (!car) return;
    title.textContent = `Edit: ${car.name}`;
    document.getElementById('modalCarId').value = car.id;
    document.getElementById('modalCarName').value = car.name;
    if (slugInput) {
      slugInput.value = car.slug || (car.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }
    document.getElementById('modalCarBrand').value = car.brand;
    document.getElementById('modalCarCategory').value = car.category;
    document.getElementById('modalCarPrice').value = car.dailyPrice;
    document.getElementById('modalCarHp').value = car.hp || '';
    document.getElementById('modalCarAccel').value = car.accel || '';
    document.getElementById('modalCarSpeed').value = car.speed || '';
    document.getElementById('modalCarSeats').value = car.seats || 5;
    document.getElementById('modalCarDesc').value = car.description || '';
    document.getElementById('modalCarFeatured').checked = !!car.featured;

    currentModalCarImg = car.image;
    document.getElementById('modalCarPreviewImg').src = car.image;
    document.getElementById('modalCarImageUrl').value = car.image.startsWith('data:') ? '' : car.image;
  } else {
    title.textContent = 'Add Luxury Vehicle';
    document.getElementById('modalCarId').value = '';
    currentModalCarImg = '/uploads/seo-car-1789727514573.jpg';
    document.getElementById('modalCarPreviewImg').src = currentModalCarImg;
  }

  modal.classList.remove('hidden');
}

function closeCarModal() {
  document.getElementById('carModal').classList.add('hidden');
}

function handleModalImageFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    currentModalCarImg = evt.target.result;
    document.getElementById('modalCarPreviewImg').src = currentModalCarImg;
    document.getElementById('modalCarImageUrl').value = '';
  };
  reader.readAsDataURL(file);
}

function handleModalImageUrl(val) {
  if (val.trim()) {
    currentModalCarImg = val.trim();
    document.getElementById('modalCarPreviewImg').src = currentModalCarImg;
  }
}

async function handleCarModalSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('modalCarId').value;
  const name = document.getElementById('modalCarName').value.trim();
  const brand = document.getElementById('modalCarBrand').value;
  const category = document.getElementById('modalCarCategory').value;
  const dailyPrice = parseFloat(document.getElementById('modalCarPrice').value);
  const hp = document.getElementById('modalCarHp').value.trim() || '500 HP';
  const accel = document.getElementById('modalCarAccel').value.trim() || '4.0s';
  const speed = document.getElementById('modalCarSpeed').value.trim() || '250 km/h';
  const seats = parseInt(document.getElementById('modalCarSeats').value) || 5;
  const description = document.getElementById('modalCarDesc').value.trim();
  const featured = document.getElementById('modalCarFeatured').checked;

  const catObj = (adminState.categories || []).find(c => (c.slug || c.id) === category);
  const categoryName = catObj ? catObj.name : category;

  const slugRaw = document.getElementById('modalCarSlug')?.value.trim();
  const slug = (slugRaw || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const carData = {
    id: id || ('car-' + Date.now()),
    name,
    slug,
    brand,
    category,
    categoryName,
    dailyPrice,
    image: currentModalCarImg,
    hp,
    accel,
    speed,
    seats,
    description,
    featured
  };

  const action = id ? 'edit' : 'add';

  // 1. Update state locally
  if (action === 'add') {
    adminState.cars.unshift(carData);
  } else {
    const idx = adminState.cars.findIndex(c => c.id === id);
    if (idx !== -1) adminState.cars[idx] = carData;
  }
  saveLocalDB(adminState);

  // 2. Sync to server
  const resp = await postAdminMutation('/api/admin/cars', { action, car: carData });
  if (resp && resp.cars) {
    adminState.cars = resp.cars;
  }

  renderFleetTable();
  updateMetrics();
  closeCarModal();
  showToast(`✓ Vehicle ${name} saved!`);
}

async function deleteCar(id) {
  const car = (adminState.cars || []).find(c => c.id === id);
  if (!car) return;

  if (confirm(`Are you sure you want to delete "${car.name}" from the fleet?`)) {
    adminState.cars = adminState.cars.filter(c => c.id !== id);
    saveLocalDB(adminState);

    const resp = await postAdminMutation('/api/admin/cars', { action: 'delete', car: { id } });
    if (resp && resp.cars) {
      adminState.cars = resp.cars;
    }

    renderFleetTable();
    updateMetrics();
    showToast(`Deleted ${car.name}`);
  }
}

// ==============================================
// 2. CATEGORIES MANAGEMENT
// ==============================================
function renderCategoriesGrid() {
  const container = document.getElementById('categoriesGrid');
  if (!container) return;

  const categories = adminState.categories || [];
  container.innerHTML = categories.map(cat => {
    const carCount = (adminState.cars || []).filter(c => c.category === cat.slug || c.category === cat.id).length;
    return `
      <div class="bg-[#161822] p-6 rounded-2xl border border-white/10 flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between">
            <span class="text-3xl">${cat.icon || '🚗'}</span>
            <span class="text-xs bg-white/10 px-2.5 py-1 rounded-full font-mono text-zinc-300">${carCount} Cars</span>
          </div>
          <h4 class="text-lg font-bold font-heading text-white mt-3">${cat.name}</h4>
          <div class="text-xs text-zinc-500 font-mono mt-0.5">slug: ${cat.slug || cat.id}</div>
          <p class="text-xs text-zinc-400 mt-2">${cat.description || 'Curated category fleet'}</p>
        </div>
        <div class="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
          <button onclick="openCategoryModal('edit', '${cat.id}')" class="text-xs text-blue-400 hover:text-blue-300 font-semibold">
            Edit Details
          </button>
          <button onclick="deleteCategory('${cat.id}')" class="text-xs text-rose-400 hover:text-rose-300 font-semibold">
            Delete
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function openCategoryModal(mode, id = null) {
  const modal = document.getElementById('categoryModal');
  const title = document.getElementById('categoryModalTitle');
  const form = document.getElementById('categoryModalForm');
  form.reset();

  if (mode === 'edit' && id) {
    const cat = (adminState.categories || []).find(c => c.id === id);
    if (!cat) return;
    title.textContent = `Edit: ${cat.name}`;
    document.getElementById('modalCategoryId').value = cat.id;
    document.getElementById('modalCategoryName').value = cat.name;
    document.getElementById('modalCategorySlug').value = cat.slug || cat.id;
    document.getElementById('modalCategoryIcon').value = cat.icon || '';
    document.getElementById('modalCategoryDesc').value = cat.description || '';
  } else {
    title.textContent = 'Add Category';
    document.getElementById('modalCategoryId').value = '';
  }

  modal.classList.remove('hidden');
}

function closeCategoryModal() {
  document.getElementById('categoryModal').classList.add('hidden');
}

async function handleCategoryModalSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('modalCategoryId').value;
  const name = document.getElementById('modalCategoryName').value.trim();
  const slug = document.getElementById('modalCategorySlug').value.trim().toLowerCase();
  const icon = document.getElementById('modalCategoryIcon').value.trim();
  const description = document.getElementById('modalCategoryDesc').value.trim();

  const action = id ? 'edit' : 'add';
  const categoryData = { id: id || ('cat-' + Date.now()), name, slug, icon, description };

  if (action === 'add') {
    adminState.categories.push(categoryData);
  } else {
    const idx = adminState.categories.findIndex(c => c.id === id);
    if (idx !== -1) adminState.categories[idx] = categoryData;
  }
  saveLocalDB(adminState);

  const resp = await postAdminMutation('/api/admin/categories', { action, category: categoryData });
  if (resp && resp.categories) {
    adminState.categories = resp.categories;
  }

  renderCategoriesGrid();
  populateModalDropdowns();
  updateMetrics();
  closeCategoryModal();
  showToast(`✓ Category ${name} saved!`);
}

async function deleteCategory(id) {
  const cat = (adminState.categories || []).find(c => c.id === id);
  if (!cat) return;

  if (confirm(`Delete category "${cat.name}"?`)) {
    adminState.categories = adminState.categories.filter(c => c.id !== id);
    saveLocalDB(adminState);

    const resp = await postAdminMutation('/api/admin/categories', { action: 'delete', category: { id } });
    if (resp && resp.categories) {
      adminState.categories = resp.categories;
    }

    renderCategoriesGrid();
    populateModalDropdowns();
    updateMetrics();
    showToast(`Category removed.`);
  }
}

// ==============================================
// 3. BRAND PARTNERS
// ==============================================
function renderBrandsList() {
  const container = document.getElementById('brandsListContainer');
  if (!container) return;

  const brands = adminState.brands || [];
  container.innerHTML = brands.map(b => `
    <div class="bg-[#161822] border border-white/10 px-4 py-2.5 rounded-xl flex items-center gap-3">
      <span class="text-sm font-bold text-white font-mono tracking-wider">${b}</span>
      <button onclick="deleteBrand('${b}')" class="text-zinc-500 hover:text-rose-400 transition-colors">
        <i data-lucide="x" class="w-3.5 h-3.5"></i>
      </button>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

async function handleAddBrand() {
  const input = document.getElementById('newBrandInput');
  const brand = input.value.trim().toUpperCase();
  if (!brand) return;

  if (!adminState.brands.includes(brand)) {
    adminState.brands.push(brand);
    saveLocalDB(adminState);
  }

  const resp = await postAdminMutation('/api/admin/brands', { action: 'add', brand });
  if (resp && resp.brands) {
    adminState.brands = resp.brands;
  }

  renderBrandsList();
  populateModalDropdowns();
  updateMetrics();
  input.value = '';
  showToast(`✓ Added brand: ${brand}`);
}

async function deleteBrand(brand) {
  if (confirm(`Remove "${brand}" from partners list?`)) {
    adminState.brands = adminState.brands.filter(b => b !== brand);
    saveLocalDB(adminState);

    const resp = await postAdminMutation('/api/admin/brands', { action: 'delete', brand });
    if (resp && resp.brands) {
      adminState.brands = resp.brands;
    }

    renderBrandsList();
    populateModalDropdowns();
    updateMetrics();
    showToast(`Removed brand: ${brand}`);
  }
}

// ==============================================
// 4 & 5. SETTINGS FORM POPULATION & SAVE
// ==============================================
let currentLogoImageDataUrl = '';

function handleLogoFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    currentLogoImageDataUrl = evt.target.result;
    const preview = document.getElementById('logoImagePreview');
    const noPrev = document.getElementById('logoNoPreviewText');
    const rmBtn = document.getElementById('removeLogoBtn');

    if (preview) {
      preview.src = currentLogoImageDataUrl;
      preview.classList.remove('hidden');
    }
    if (noPrev) noPrev.classList.add('hidden');
    if (rmBtn) rmBtn.classList.remove('hidden');

    document.getElementById('settingLogoUrl').value = '';

    const modeSelect = document.getElementById('settingLogoDisplayMode');
    if (modeSelect && (modeSelect.value === 'text_only' || modeSelect.value === 'icon_and_text')) {
      modeSelect.value = 'logo_only';
      handleLogoDisplayModeChange('logo_only');
    }
    showToast('Logo image uploaded ready to save!');
  };
  reader.readAsDataURL(file);
}

function handleLogoUrlInput(val) {
  currentLogoImageDataUrl = val.trim();
  const preview = document.getElementById('logoImagePreview');
  const noPrev = document.getElementById('logoNoPreviewText');
  const rmBtn = document.getElementById('removeLogoBtn');

  if (val.trim()) {
    if (preview) {
      preview.src = val.trim();
      preview.classList.remove('hidden');
    }
    if (noPrev) noPrev.classList.add('hidden');
    if (rmBtn) rmBtn.classList.remove('hidden');
  } else {
    if (preview) preview.classList.add('hidden');
    if (noPrev) noPrev.classList.remove('hidden');
    if (rmBtn) rmBtn.classList.add('hidden');
  }
}

function removeLogoImage() {
  currentLogoImageDataUrl = '';
  document.getElementById('settingLogoUrl').value = '';
  const fileInput = document.getElementById('logoFileInput');
  if (fileInput) fileInput.value = '';

  const preview = document.getElementById('logoImagePreview');
  const noPrev = document.getElementById('logoNoPreviewText');
  const rmBtn = document.getElementById('removeLogoBtn');

  if (preview) {
    preview.src = '';
    preview.classList.add('hidden');
  }
  if (noPrev) noPrev.classList.remove('hidden');
  if (rmBtn) rmBtn.classList.add('hidden');

  const modeSelect = document.getElementById('settingLogoDisplayMode');
  if (modeSelect && modeSelect.value === 'logo_only') {
    modeSelect.value = 'text_only';
    handleLogoDisplayModeChange('text_only');
  }
  showToast('Logo image removed.');
}

function handleLogoDisplayModeChange(mode) {
  const hint = document.getElementById('logoModeHint');
  const iconSec = document.getElementById('logoIconSection');
  const imgSec = document.getElementById('logoImageSection');

  if (mode === 'logo_only') {
    if (hint) hint.textContent = '✓ Only your logo image will be displayed on header & footer. Site name text and icon box will be hidden.';
    if (iconSec) iconSec.classList.add('hidden');
    if (imgSec) imgSec.classList.remove('hidden');
  } else if (mode === 'text_only') {
    if (hint) hint.textContent = '✓ Only Site Name and Tagline will be displayed. Clean typography with NO icon box.';
    if (iconSec) iconSec.classList.add('hidden');
    if (imgSec) imgSec.classList.add('hidden');
  } else if (mode === 'logo_and_text') {
    if (hint) hint.textContent = '✓ Logo image will be shown alongside your Site Name and Tagline.';
    if (iconSec) iconSec.classList.add('hidden');
    if (imgSec) imgSec.classList.remove('hidden');
  } else if (mode === 'icon_and_text') {
    if (hint) hint.textContent = '✓ An icon box with your custom letter will appear next to the Site Name.';
    if (iconSec) iconSec.classList.remove('hidden');
    if (imgSec) imgSec.classList.add('hidden');
  }
}

function populateSettingsForm() {
  const s = adminState.settings || {};
  const offer = s.offer || {};
  const footer = s.footer || {};

  document.getElementById('settingEmergencyPhone').value = s.emergencyPhone || '+92 300 5557433';
  document.getElementById('settingEmergencyDisplay').value = s.emergencyDisplay || '+92 300 555-RIDE';
  document.getElementById('settingWhatsappNumber').value = s.whatsappNumber || '923005557433';
  document.getElementById('settingWhatsappHelpText').value = s.whatsappHelpText || '';

  document.getElementById('settingOfferActive').checked = offer.active !== false;
  document.getElementById('settingOfferBadge').value = offer.badge || 'Limited Offer';
  document.getElementById('settingOfferText').value = offer.text || '';
  document.getElementById('settingOfferPromoCode').value = offer.promoCode || 'LUXURY20';
  document.getElementById('settingOfferDiscountPercent').value = offer.discountPercent || 20;

  // Logo & Branding
  const logoMode = s.logoDisplayMode || (s.logoUrl ? 'logo_only' : (s.logoText ? 'icon_and_text' : 'text_only'));
  const modeEl = document.getElementById('settingLogoDisplayMode');
  if (modeEl) {
    modeEl.value = logoMode;
    handleLogoDisplayModeChange(logoMode);
  }

  document.getElementById('settingSiteName').value = s.siteName || '';
  document.getElementById('settingTagline').value = s.tagline || '';
  document.getElementById('settingLogoText').value = s.logoText || '';
  document.getElementById('settingLogoUrl').value = s.logoUrl && !s.logoUrl.startsWith('data:') ? s.logoUrl : '';

  currentLogoImageDataUrl = s.logoUrl || '';
  const preview = document.getElementById('logoImagePreview');
  const noPrev = document.getElementById('logoNoPreviewText');
  const rmBtn = document.getElementById('removeLogoBtn');

  if (s.logoUrl) {
    if (preview) {
      preview.src = s.logoUrl;
      preview.classList.remove('hidden');
    }
    if (noPrev) noPrev.classList.add('hidden');
    if (rmBtn) rmBtn.classList.remove('hidden');
  } else {
    if (preview) preview.classList.add('hidden');
    if (noPrev) noPrev.classList.remove('hidden');
    if (rmBtn) rmBtn.classList.add('hidden');
  }

  document.getElementById('settingFooterAbout').value = footer.aboutText || '';
  document.getElementById('settingFooterPhone').value = footer.phone || '';
  document.getElementById('settingFooterEmail').value = footer.email || '';
  document.getElementById('settingFooterAddress').value = footer.address || '';
  document.getElementById('settingFooterCopyright').value = footer.copyright || '';
}

async function handleSaveEmergencySettings(e) {
  e.preventDefault();
  const emergencyPhone = document.getElementById('settingEmergencyPhone').value.trim();
  const emergencyDisplay = document.getElementById('settingEmergencyDisplay').value.trim();
  const whatsappNumber = document.getElementById('settingWhatsappNumber').value.trim();
  const whatsappHelpText = document.getElementById('settingWhatsappHelpText').value.trim();

  await updateSettingsLocalAndServer({ emergencyPhone, emergencyDisplay, whatsappNumber, whatsappHelpText });
  showToast('✓ Emergency & WhatsApp settings saved!');
}

async function handleSaveOfferSettings(e) {
  e.preventDefault();
  const active = document.getElementById('settingOfferActive').checked;
  const badge = document.getElementById('settingOfferBadge').value.trim();
  const text = document.getElementById('settingOfferText').value.trim();
  const promoCode = document.getElementById('settingOfferPromoCode').value.trim().toUpperCase();
  const discountPercent = parseInt(document.getElementById('settingOfferDiscountPercent').value) || 20;

  await updateSettingsLocalAndServer({ offer: { active, badge, text, promoCode, discountPercent } });
  showToast('✓ Top offer settings updated!');
}

async function handleSaveBrandingAndFooter(e) {
  e.preventDefault();
  const siteName = document.getElementById('settingSiteName').value.trim();
  const tagline = document.getElementById('settingTagline').value.trim();
  const logoDisplayMode = document.getElementById('settingLogoDisplayMode').value;
  const logoText = document.getElementById('settingLogoText').value.trim();
  const logoUrl = currentLogoImageDataUrl || document.getElementById('settingLogoUrl').value.trim();

  const aboutText = document.getElementById('settingFooterAbout').value.trim();
  const phone = document.getElementById('settingFooterPhone').value.trim();
  const email = document.getElementById('settingFooterEmail').value.trim();
  const address = document.getElementById('settingFooterAddress').value.trim();
  const copyright = document.getElementById('settingFooterCopyright').value.trim();

  await updateSettingsLocalAndServer({
    siteName,
    tagline,
    logoDisplayMode,
    logoText,
    logoUrl,
    footer: { aboutText, phone, email, address, copyright }
  });
  showToast('✓ Branding & Footer updated successfully!');
}

async function updateSettingsLocalAndServer(partialSettings) {
  partialSettings.updated_at = Date.now();
  adminState.settings = { ...adminState.settings, ...partialSettings };
  saveLocalDB(adminState);

  const resp = await postAdminMutation('/api/admin/settings', partialSettings);
  if (resp && resp.settings) {
    adminState.settings = resp.settings;
    if (typeof renderBranding === 'function') renderBranding();
  }
  updateMetrics();
}

// ==============================================
// 6. CLIENT REVIEWS
// ==============================================
function renderReviewsTable() {
  const tbody = document.getElementById('reviewsTableBody');
  if (!tbody) return;

  const reviews = adminState.reviews || [];
  if (reviews.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-zinc-500">No client reviews yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = reviews.map(r => `
    <tr class="hover:bg-white/5 transition-colors">
      <td class="px-6 py-4 font-bold text-white">${r.clientName}</td>
      <td class="px-6 py-4 text-xs text-zinc-400">${r.location || 'Pakistan'}</td>
      <td class="px-6 py-4 text-amber-400 font-mono text-xs">⭐ ${r.rating || 5} Stars</td>
      <td class="px-6 py-4 text-xs text-zinc-300 max-w-sm truncate italic">"${r.comment || r.text}"</td>
      <td class="px-6 py-4">
        <button onclick="toggleReviewActive('${r.id}')" class="px-2.5 py-1 rounded-full text-xs font-bold transition-all ${r.active !== false ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40' : 'bg-zinc-800 text-zinc-500'}">
          ${r.active !== false ? '✓ Active (Shown)' : '✕ Inactive (Hidden)'}
        </button>
      </td>
      <td class="px-6 py-4 text-right space-x-2">
        <button onclick="openReviewModal('edit', '${r.id}')" class="p-2 text-zinc-400 hover:text-white" title="Edit Review">
          <i data-lucide="edit-3" class="w-4 h-4"></i>
        </button>
        <button onclick="deleteReview('${r.id}')" class="p-2 text-rose-500 hover:text-rose-400" title="Delete Review">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function openReviewModal(mode, id = null) {
  const modal = document.getElementById('reviewModal');
  const title = document.getElementById('reviewModalTitle');
  const form = document.getElementById('reviewModalForm');
  form.reset();

  if (mode === 'edit' && id) {
    const rev = (adminState.reviews || []).find(r => r.id === id);
    if (!rev) return;
    title.textContent = `Edit Review: ${rev.clientName}`;
    document.getElementById('modalReviewId').value = rev.id;
    document.getElementById('modalReviewName').value = rev.clientName;
    document.getElementById('modalReviewLocation').value = rev.location || '';
    document.getElementById('modalReviewRating').value = rev.rating || 5;
    document.getElementById('modalReviewComment').value = rev.comment || rev.text || '';
    document.getElementById('modalReviewActive').checked = rev.active !== false;
  } else {
    title.textContent = 'Add Client Review';
    document.getElementById('modalReviewId').value = '';
    document.getElementById('modalReviewActive').checked = true;
  }

  modal.classList.remove('hidden');
}

function closeReviewModal() {
  document.getElementById('reviewModal').classList.add('hidden');
}

async function handleReviewModalSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('modalReviewId').value;
  const clientName = document.getElementById('modalReviewName').value.trim();
  const location = document.getElementById('modalReviewLocation').value.trim();
  const rating = parseInt(document.getElementById('modalReviewRating').value) || 5;
  const comment = document.getElementById('modalReviewComment').value.trim();
  const active = document.getElementById('modalReviewActive').checked;

  const action = id ? 'edit' : 'add';
  const reviewData = { id: id || ('rev-' + Date.now()), clientName, location, rating, comment, active };

  if (action === 'add') {
    adminState.reviews.unshift(reviewData);
  } else {
    const idx = adminState.reviews.findIndex(r => r.id === id);
    if (idx !== -1) adminState.reviews[idx] = reviewData;
  }
  saveLocalDB(adminState);

  const resp = await postAdminMutation('/api/admin/reviews', { action, review: reviewData });
  if (resp && resp.reviews) {
    adminState.reviews = resp.reviews;
  }

  renderReviewsTable();
  updateMetrics();
  closeReviewModal();
  showToast('✓ Review saved successfully!');
}

async function toggleReviewActive(id) {
  const item = adminState.reviews.find(r => r.id === id);
  if (item) {
    item.active = !item.active;
    saveLocalDB(adminState);
    renderReviewsTable();
    showToast('Review visibility toggled.');

    await postAdminMutation('/api/admin/reviews', { action: 'toggle', review: { id } });
  }
}

async function deleteReview(id) {
  if (confirm('Delete this client review?')) {
    adminState.reviews = adminState.reviews.filter(r => r.id !== id);
    saveLocalDB(adminState);
    renderReviewsTable();
    updateMetrics();
    showToast('Review deleted.');

    await postAdminMutation('/api/admin/reviews', { action: 'delete', review: { id } });
  }
}

// ==============================================
// 7. ADMIN USERS (Add, Edit, View Passwords, Disable/Enable, Delete)
// ==============================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function togglePasswordInput(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!input) return;

  if (input.type === 'password') {
    input.type = 'text';
    if (icon) icon.setAttribute('data-lucide', 'eye-off');
  } else {
    input.type = 'password';
    if (icon) icon.setAttribute('data-lucide', 'eye');
  }
  if (window.lucide) lucide.createIcons();
}

function toggleTableRowPassword(userId, actualPwd) {
  const textEl = document.getElementById(`pwdText-${userId}`);
  const iconEl = document.getElementById(`pwdIcon-${userId}`);
  if (!textEl) return;

  if (textEl.getAttribute('data-revealed') === 'true') {
    textEl.textContent = '••••••••';
    textEl.removeAttribute('data-revealed');
    textEl.classList.remove('text-rose-400', 'font-bold');
    if (iconEl) iconEl.setAttribute('data-lucide', 'eye');
  } else {
    textEl.textContent = actualPwd || '(empty)';
    textEl.setAttribute('data-revealed', 'true');
    textEl.classList.add('text-rose-400', 'font-bold');
    if (iconEl) iconEl.setAttribute('data-lucide', 'eye-off');
  }
  if (window.lucide) lucide.createIcons();
}

function copyToClipboard(text, msg = 'Copied to clipboard!') {
  if (!text) return;
  navigator.clipboard.writeText(text);
  showToast(msg);
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  const users = adminState.users || [];
  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-zinc-500">No admin users configured.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => {
    const isActive = u.active !== false && u.status !== 'disabled';
    const isSuperAdmin = u.role === 'Super Admin';
    const pwd = u.password || '';

    return `
      <tr class="hover:bg-white/5 transition-colors ${!isActive ? 'opacity-50 bg-red-950/10' : ''}">
        <td class="px-5 py-4">
          <div class="font-bold text-white flex items-center gap-2">
            <span>${escapeHtml(u.name || u.username)}</span>
            ${isSuperAdmin ? `<span class="text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/30 px-1.5 py-0.5 rounded font-mono font-bold">SUPER</span>` : ''}
          </div>
        </td>
        <td class="px-5 py-4 text-xs font-mono text-zinc-300">
          <span class="inline-flex items-center gap-1.5 bg-black/40 px-2.5 py-1 rounded-lg border border-white/5">
            <i data-lucide="at-sign" class="w-3 h-3 text-rose-400"></i>
            <span>${escapeHtml(u.username)}</span>
          </span>
        </td>
        <td class="px-5 py-4 text-xs font-mono text-zinc-300">
          <span class="inline-flex items-center gap-1.5 bg-[#202430] border border-white/10 px-2.5 py-1 rounded-lg text-emerald-400">
            <i data-lucide="shield-check" class="w-3.5 h-3.5"></i>
            <span>Encrypted</span>
          </span>
        </td>
        <td class="px-5 py-4">
          <span class="px-2.5 py-1 rounded-full text-[11px] font-bold ${isSuperAdmin ? 'bg-rose-950/60 text-rose-300 border border-rose-800/40' : 'bg-blue-950/40 text-blue-300 border border-blue-800/40'}">
            ${escapeHtml(u.role || 'Admin')}
          </span>
          ${(() => {
            const up = u.permissions;
            if (up && typeof up === 'object' && Object.keys(up).length > 0) {
              const activeCount = Object.keys(up).filter(k => up[k] && up[k].view).length;
              return `<div class="mt-1"><span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30"><i data-lucide="shield-check" class="w-3 h-3"></i> ${activeCount} Pages Allowed</span></div>`;
            }
            return '';
          })()}
        </td>
        <td class="px-5 py-4">
          <button 
            type="button" 
            onclick="toggleAdminUserStatus('${u.id}')" 
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${isActive ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/40 hover:bg-emerald-900/60' : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'}"
            title="Click to ${isActive ? 'Disable (Deactivate)' : 'Enable (Activate)'} User">
            <span class="w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}"></span>
            <span>${isActive ? 'Active' : 'Disabled'}</span>
          </button>
        </td>
        <td class="px-5 py-4 text-xs text-zinc-500 font-mono">${escapeHtml(u.createdAt || 'Initial')}</td>
        <td class="px-5 py-4 text-right">
            <!-- Permissions Access Control Button -->
            <button 
              type="button" 
              onclick="openUserPermissionsModal('${u.id}')" 
              class="p-2 text-purple-400 hover:text-white bg-purple-500/10 hover:bg-purple-500/20 rounded-lg transition-colors" 
              title="Configure Page Access & Action Permissions">
              <i data-lucide="shield-check" class="w-4 h-4"></i>
            </button>

            <!-- Edit Button -->
            <button 
              type="button" 
              onclick="openEditUserModal('${u.id}')" 
              class="p-2 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors" 
              title="Edit Admin User">
              <i data-lucide="pencil" class="w-4 h-4"></i>
            </button>

            <!-- Toggle Status Button -->
            <button 
              type="button" 
              onclick="toggleAdminUserStatus('${u.id}')" 
              class="p-2 rounded-lg transition-colors ${isActive ? 'text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20' : 'text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20'}" 
              title="${isActive ? 'Disable User Login' : 'Enable User Login'}">
              <i data-lucide="${isActive ? 'user-x' : 'user-check'}" class="w-4 h-4"></i>
            </button>

            <!-- Delete Button -->
            <button 
              type="button" 
              onclick="deleteAdminUser('${u.id}', '${escapeHtml(u.username)}')" 
              class="p-2 text-rose-500 hover:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg transition-colors" 
              title="Delete Account">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function openUserModal() {
  const form = document.getElementById('userModalForm');
  if (form) form.reset();

  document.getElementById('modalUserId').value = '';
  document.getElementById('userModalTitle').textContent = 'Create New Admin User';
  document.getElementById('modalUserFullName').value = '';
  document.getElementById('modalUserUsername').value = '';
  document.getElementById('modalUserRole').value = 'Fleet Manager';

  const pwdInput = document.getElementById('modalUserPassword');
  pwdInput.value = '';
  pwdInput.required = true;
  pwdInput.placeholder = 'Strong password';
  pwdInput.type = 'password';

  document.getElementById('modalUserPasswordLabel').textContent = 'Password *';
  document.getElementById('modalUserPasswordHelp').classList.add('hidden');
  document.getElementById('modalUserActive').checked = true;
  document.getElementById('modalUserSubmitBtn').textContent = 'Create Admin Account';

  const eye = document.getElementById('modalEyeIcon');
  if (eye) eye.setAttribute('data-lucide', 'eye');

  document.getElementById('userModal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function openEditUserModal(userId) {
  const users = adminState.users || [];
  const u = users.find(x => x.id === userId);
  if (!u) {
    showToast('Admin user not found!');
    return;
  }

  document.getElementById('modalUserId').value = u.id;
  document.getElementById('userModalTitle').textContent = `Edit Admin User: ${u.name || u.username}`;
  document.getElementById('modalUserFullName').value = u.name || '';
  document.getElementById('modalUserUsername').value = u.username || '';
  document.getElementById('modalUserRole').value = u.role || 'Fleet Manager';

  const pwdInput = document.getElementById('modalUserPassword');
  pwdInput.value = '';
  pwdInput.required = false;
  pwdInput.placeholder = 'Leave blank to keep current password';
  pwdInput.type = 'password';

  document.getElementById('modalUserPasswordLabel').textContent = 'Password (Optional)';
  document.getElementById('modalUserPasswordHelp').classList.remove('hidden');
  document.getElementById('modalUserActive').checked = (u.active !== false && u.status !== 'disabled');
  document.getElementById('modalUserSubmitBtn').textContent = 'Save User Changes';

  const eye = document.getElementById('modalEyeIcon');
  if (eye) eye.setAttribute('data-lucide', 'eye');

  document.getElementById('userModal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeUserModal() {
  document.getElementById('userModal').classList.add('hidden');
}

async function handleUserModalSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('modalUserId').value.trim();
  const name = document.getElementById('modalUserFullName').value.trim();
  const username = document.getElementById('modalUserUsername').value.trim();
  const password = document.getElementById('modalUserPassword').value.trim();
  const role = document.getElementById('modalUserRole').value;
  const active = document.getElementById('modalUserActive').checked;

  if (!name || !username) {
    alert('Full Name and Username are required!');
    return;
  }

  if (!id) {
    // 1. ADD NEW USER
    if (!password) {
      alert('Password is required when creating a new user!');
      return;
    }

    const newUser = {
      id: 'user-' + Date.now(),
      name,
      username,
      password,
      role,
      active,
      status: active ? 'active' : 'disabled',
      createdAt: new Date().toISOString().split('T')[0]
    };

    adminState.users = adminState.users || [];
    adminState.users.push(newUser);
    saveLocalDB(adminState);

    const resp = await postAdminMutation('/api/admin/users', { action: 'add', user: newUser });
    if (resp && resp.users) {
      adminState.users = resp.users;
    }

    renderUsersTable();
    closeUserModal();
    showToast(`✓ Admin user "${username}" created!`);
  } else {
    // 2. EDIT EXISTING USER
    const userUpdate = {
      id,
      name,
      username,
      role,
      active,
      status: active ? 'active' : 'disabled'
    };
    if (password) {
      userUpdate.password = password;
    }

    const idx = (adminState.users || []).findIndex(u => u.id === id);
    if (idx !== -1) {
      adminState.users[idx] = { ...adminState.users[idx], ...userUpdate };
      saveLocalDB(adminState);
    }

    const resp = await postAdminMutation('/api/admin/users', { action: 'edit', user: userUpdate });
    if (resp && resp.users) {
      adminState.users = resp.users;
      if (resp.newToken && resp.currentUser) {
        setAdminToken(resp.newToken, resp.currentUser, true);
        const userDisplay = document.getElementById('loggedInUserDisplay');
        if (userDisplay) {
          userDisplay.textContent = `${resp.currentUser.name || resp.currentUser.username} (${resp.currentUser.role || 'Admin'})`;
        }
      }
      renderUsersTable();
      closeUserModal();
      showToast(`✓ Admin user "${username}" updated successfully!`);
    }
  }
}

async function toggleAdminUserStatus(id) {
  const users = adminState.users || [];
  const u = users.find(x => x.id === id);
  if (!u) return;

  const currentStatus = (u.active !== false && u.status !== 'disabled');
  const newActive = !currentStatus;

  // Local optimistic update
  u.active = newActive;
  u.status = newActive ? 'active' : 'disabled';
  saveLocalDB(adminState);
  renderUsersTable();

  const resp = await postAdminMutation('/api/admin/users', { action: 'toggle', user: { id } });
  if (resp && resp.users) {
    adminState.users = resp.users;
    renderUsersTable();
  }

  showToast(`Admin @${u.username} is now ${newActive ? 'Active (Login Enabled)' : 'Disabled (Login Blocked)'}!`);
}

async function deleteAdminUser(id, username) {
  if (confirm(`Are you sure you want to delete admin user "${username}"?`)) {
    if ((adminState.users || []).length <= 1) {
      alert('Cannot delete the only remaining admin account!');
      return;
    }

    adminState.users = adminState.users.filter(u => u.id !== id && u.username !== username);
    saveLocalDB(adminState);

    const resp = await postAdminMutation('/api/admin/users', { action: 'delete', user: { id, username } });
    if (resp && resp.users) {
      adminState.users = resp.users;
    }

    renderUsersTable();
    showToast(`User ${username} deleted.`);
  }
}

// ==============================================
// 8. QUOTATIONS & LEADS
// ==============================================
function renderQuotesTable() {
  const tbody = document.getElementById('quotesTableBody');
  if (!tbody) return;

  const quotes = adminState.quotes || [];
  if (quotes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-zinc-500">No quotation inquiries received yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = quotes.map(q => `
    <tr class="hover:bg-white/5 transition-colors">
      <td class="px-6 py-4 text-xs text-zinc-400 font-mono">${q.createdAt || 'Recent'}</td>
      <td class="px-6 py-4">
        <div class="font-bold text-white">${q.clientName}</div>
        <div class="text-xs text-emerald-400 font-mono">${q.clientPhone}</div>
      </td>
      <td class="px-6 py-4">
        <div class="font-bold text-white">${q.carName}</div>
        <div class="text-xs text-zinc-500">${q.carCategory || 'Luxury'}</div>
      </td>
      <td class="px-6 py-4 text-xs text-zinc-300">
        <div>${q.pickupDate} &rarr; ${q.returnDate} (${q.days}d)</div>
        <span class="text-zinc-500 text-[11px]">${q.pickupLocation}</span>
      </td>
      <td class="px-6 py-4 text-xs text-zinc-400 max-w-xs truncate">
        ${q.addons && q.addons.length > 0 ? q.addons.join(', ') : 'Standard'}
      </td>
      <td class="px-6 py-4 font-mono font-bold text-rose-400">
        ${formatPKR(q.totalPrice)}
      </td>
      <td class="px-6 py-4">
        <select onchange="updateQuoteStatus('${q.id}', this.value)" class="bg-[#202430] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white">
          <option value="Pending" ${q.status === 'Pending' ? 'selected' : ''}>Pending</option>
          <option value="Contacted" ${q.status === 'Contacted' ? 'selected' : ''}>Contacted</option>
          <option value="Confirmed" ${q.status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
        </select>
      </td>
      <td class="px-6 py-4 text-right space-x-2">
        <a href="https://wa.me/${cleanPhoneForWhatsApp(q.clientPhone)}?text=Hello%20${encodeURIComponent(q.clientName)},%20thank%20you%20for%20your%20inquiry%20at%20Dream%20Drive%20Pakistan%20for%20the%20${encodeURIComponent(q.carName)}.%20Let%27s%20confirm%20your%20booking!" target="_blank" class="p-2 text-emerald-400 hover:text-emerald-300 inline-block" title="WhatsApp Reply">
          <i data-lucide="message-circle" class="w-4 h-4"></i>
        </a>
        <button onclick="deleteQuote('${q.id}')" class="p-2 text-rose-500 hover:text-rose-400 inline-block" title="Delete Inquiry">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function cleanPhoneForWhatsApp(phone) {
  if (!phone) return '';
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) clean = '92' + clean.substring(1);
  return clean;
}

async function updateQuoteStatus(id, status) {
  const item = adminState.quotes.find(q => q.id === id);
  if (item) {
    item.status = status;
    saveLocalDB(adminState);
    showToast(`Status updated to ${status}`);
    await postAdminMutation('/api/admin/quotes', { action: 'update_status', id, status });
  }
}

async function deleteQuote(id) {
  if (confirm('Delete this inquiry record?')) {
    adminState.quotes = adminState.quotes.filter(q => q.id !== id);
    saveLocalDB(adminState);
    renderQuotesTable();
    updateMetrics();
    showToast('Inquiry deleted.');
    await postAdminMutation('/api/admin/quotes', { action: 'delete', id });
  }
}

async function clearAllQuotes() {
  if (confirm('Clear all inquiry history?')) {
    adminState.quotes = [];
    saveLocalDB(adminState);
    renderQuotesTable();
    updateMetrics();
    showToast('All inquiries cleared.');
    await postAdminMutation('/api/admin/quotes', { action: 'clear_all' });
  }
}

// Toast
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toastNotification');
  const toastMsg = document.getElementById('toastMessage');
  const toastIconWrap = document.getElementById('toastIconWrap');
  if (!toast || !toastMsg) return;

  toastMsg.textContent = msg;

  if (toastIconWrap) {
    toastIconWrap.className = 'shrink-0 flex items-center justify-center';
    if (type === 'error') {
      toastIconWrap.innerHTML = '<svg class="w-5 h-5 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    } else if (type === 'warning') {
      toastIconWrap.innerHTML = '<svg class="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
    } else {
      toastIconWrap.innerHTML = '<svg class="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg>';
    }
  }

  toast.style.display = 'flex';
  requestAnimationFrame(() => {
    toast.classList.remove('opacity-0', 'translate-y-6', 'pointer-events-none');
    toast.classList.add('opacity-100', 'translate-y-0', 'pointer-events-auto', 'show');
  });

  if (window.toastTimeout) clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => {
    toast.classList.remove('opacity-100', 'translate-y-0', 'pointer-events-auto', 'show');
    toast.classList.add('opacity-0', 'translate-y-6', 'pointer-events-none');
    setTimeout(() => {
      if (toast.classList.contains('opacity-0')) {
        toast.style.display = 'none';
      }
    }, 320);
  }, 2500);
}

// ==============================================
// NAVIGATION MENUS (Add / Edit / Delete)
// ==============================================

function renderMenusTable() {
  const tbody = document.getElementById('menusTableBody');
  if (!tbody) return;

  const menus = adminState.navMenus || [];

  if (menus.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-zinc-500">No navigation menus found. Add one above.</td></tr>`;
    return;
  }

  tbody.innerHTML = menus.map((m, idx) => `
    <tr class="hover:bg-white/5 transition-colors">
      <td class="px-6 py-4 text-zinc-500 text-xs font-mono">${idx + 1}</td>
      <td class="px-6 py-4">
        <span class="font-semibold text-white">${m.label}</span>
      </td>
      <td class="px-6 py-4">
        <code class="text-xs text-zinc-400 bg-white/5 px-2 py-0.5 rounded">${m.url || ''}</code>
      </td>
      <td class="px-6 py-4">
        ${m.isHighlight
          ? `<span class="px-2 py-0.5 bg-rose-600/20 text-rose-400 text-[10px] font-bold rounded-full border border-rose-500/30">Highlighted</span>`
          : `<span class="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-[10px] font-bold rounded-full">Normal</span>`
        }
      </td>
      <td class="px-6 py-4 text-right">
        <div class="flex items-center justify-end gap-2">
          <button onclick="openMenuModal('edit', '${m.id}')" class="px-3 py-1.5 bg-blue-700/30 hover:bg-blue-700/50 text-blue-300 text-xs font-semibold rounded-lg transition-all">Edit</button>
          <button onclick="deleteMenu('${m.id}')" class="px-3 py-1.5 bg-rose-900/30 hover:bg-rose-900/50 text-rose-400 text-xs font-semibold rounded-lg transition-all">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function openMenuModal(mode, menuId) {
  const modal = document.getElementById('menuModal');
  const title = document.getElementById('menuModalTitle');
  const idInput = document.getElementById('modalMenuId');
  const labelInput = document.getElementById('modalMenuLabel');
  const urlInput = document.getElementById('modalMenuUrl');
  const highlightChk = document.getElementById('modalMenuHighlight');

  idInput.value = '';
  labelInput.value = '';
  urlInput.value = '';
  highlightChk.checked = false;

  if (mode === 'edit' && menuId) {
    const m = (adminState.navMenus || []).find(x => x.id === menuId);
    if (m) {
      title.textContent = 'Edit Menu Item';
      idInput.value = m.id;
      labelInput.value = m.label;
      urlInput.value = m.url || '';
      highlightChk.checked = !!m.isHighlight;
    }
  } else {
    title.textContent = 'Add Menu Item';
  }

  modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeMenuModal() {
  document.getElementById('menuModal').classList.add('hidden');
}

async function handleMenuModalSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('modalMenuId').value;
  const label = document.getElementById('modalMenuLabel').value.trim();
  const url = document.getElementById('modalMenuUrl').value.trim();
  const isHighlight = document.getElementById('modalMenuHighlight').checked;

  const action = id ? 'edit' : 'add';
  const item = { id, label, url, isHighlight };

  const result = await postAdminMutation('/api/admin/menus', { action, item });

  if (result && result.navMenus) {
    adminState.navMenus = result.navMenus;
  } else {
    // Local fallback
    if (!adminState.navMenus) adminState.navMenus = [];
    if (action === 'add') {
      item.id = 'menu-' + Date.now();
      adminState.navMenus.push(item);
    } else {
      const idx = adminState.navMenus.findIndex(m => m.id === id);
      if (idx !== -1) adminState.navMenus[idx] = { ...adminState.navMenus[idx], ...item };
    }
  }

  renderMenusTable();
  closeMenuModal();
  showToast(action === 'add' ? `Menu "${label}" added!` : `Menu "${label}" updated!`);
}

async function deleteMenu(menuId) {
  const m = (adminState.navMenus || []).find(x => x.id === menuId);
  if (!m) return;
  if (!confirm(`Delete menu item "${m.label}"? This cannot be undone.`)) return;

  const result = await postAdminMutation('/api/admin/menus', { action: 'delete', item: { id: menuId } });

  if (result && result.navMenus) {
    adminState.navMenus = result.navMenus;
  } else {
    adminState.navMenus = (adminState.navMenus || []).filter(x => x.id !== menuId);
  }

  renderMenusTable();
  showToast(`Menu item deleted.`);
}

// ====================================================
// 🎯 SEO & RANKINGS ENGINE (Karachi Implementation Plan)
// ====================================================

// 1. Sub-Tab Switcher
function switchSeoSubTab(subId) {
  const subTabs = ['global', 'pages', 'areas', 'faqs', 'technical'];
  subTabs.forEach(s => {
    const pane = document.getElementById(`seoSubContent-${s}`);
    const btn = document.getElementById(`seoSubBtn-${s}`);
    if (pane && btn) {
      if (s === subId) {
        pane.classList.remove('hidden');
        btn.className = 'seo-sub-btn px-4 py-2 rounded-xl text-xs font-bold transition-all bg-white text-black shadow';
      } else {
        pane.classList.add('hidden');
        btn.className = 'seo-sub-btn px-4 py-2 rounded-xl text-xs font-bold transition-all text-zinc-400 hover:text-white';
      }
    }
  });

  if (window.lucide) lucide.createIcons();
}

// 2. Populate Global SEO Form & SERP Preview
function populateGlobalSeoForm() {
  const seo = adminState.seoSettings || {};

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  setVal('seoSiteTitleInput', seo.siteTitle || 'Rent a Car in Karachi | Car 4 Rent');
  setVal('seoMetaDescInput', seo.metaDescription || '');
  setVal('seoMetaKeywordsInput', seo.metaKeywords || '');
  setVal('seoH1HeadingInput', seo.h1Heading || 'Reliable Rent a Car Service in Karachi');
  setVal('seoCanonicalUrlInput', seo.canonicalUrl || 'http://localhost:3000');
  setVal('seoHeroSubtitleInput', seo.heroSubtitle || '');
  setVal('seoTargetCityInput', seo.targetCity || 'Karachi');
  setVal('seoLatitudeInput', seo.latitude || '24.8607');
  setVal('seoLongitudeInput', seo.longitude || '67.0011');
  setVal('seoGbpUrlInput', seo.googleBusinessUrl || '');
  setVal('seoGoogleVerifInput', seo.googleVerification || '');
  setVal('seoGa4Input', seo.ga4MeasurementId || '');
  setVal('seoBingVerifInput', seo.bingVerification || '');
  setVal('seoOgImageInput', seo.ogImage || '');
  renderSeoOgImagePreview(seo.ogImage || '');

  updateSerpPreview();
  runAiSeoAudit();
}

function previewAiStrategyHint() {
  const select = document.getElementById('aiMarketStrategySelect');
  const val = select ? select.value : 'all_rounder';
  const hints = {
    all_rounder: '🏆 All-Rounder: High rankings for Karachi Airport, luxury fleet & self-drive.',
    airport_express: '✈️ Airport Express: Focus on flight travelers, 24/7 terminal pickup & drop.',
    budget_economy: '💰 Budget Economy: Focus on low rental rates, Alto/Cultus & affordable car hire.',
    luxury_wedding: '👑 Luxury & Wedding: Focus on Prado, Fortuner, VIP protocol & event rentals.'
  };
  const insightEl = document.getElementById('aiMarketInsightText');
  if (insightEl && hints[val]) {
    insightEl.textContent = hints[val];
  }
}

// Debounce helper for AI real-time audit
let seoAiDebounceTimer = null;
function onSeoInputChanged() {
  updateSerpPreview();
  clearTimeout(seoAiDebounceTimer);
  seoAiDebounceTimer = setTimeout(() => {
    runAiSeoAudit();
  }, 300);
}

// Live Google SERP Snippet Simulator
function updateSerpPreview() {
  const title = document.getElementById('seoSiteTitleInput')?.value.trim() || 'Rent a Car in Karachi | Car 4 Rent';
  const desc = document.getElementById('seoMetaDescInput')?.value.trim() || 'Car 4 Rent provides reliable rent a car in Karachi. Daily, weekly & monthly car rental on self-drive with zero deposit.';
  const canon = document.getElementById('seoCanonicalUrlInput')?.value.trim() || 'https://car4rent.pk';

  const previewTitle = document.getElementById('serpPreviewTitle');
  const previewSnippet = document.getElementById('serpPreviewSnippet');
  const previewUrl = document.getElementById('serpPreviewUrl');
  const previewDomain = document.getElementById('serpPreviewDomain');

  if (previewTitle) previewTitle.textContent = title;
  if (previewSnippet) previewSnippet.textContent = desc;

  try {
    const parsed = new URL(canon.startsWith('http') ? canon : 'https://' + canon);
    if (previewDomain) previewDomain.textContent = parsed.hostname;
    if (previewUrl) previewUrl.textContent = parsed.origin + '/';
  } catch (e) {
    if (previewDomain) previewDomain.textContent = 'car4rent.pk';
    if (previewUrl) previewUrl.textContent = 'https://car4rent.pk/';
  }

  // Length meters
  const titleCounter = document.getElementById('metaTitleCounter');
  if (titleCounter) {
    const len = title.length;
    titleCounter.textContent = `${len} / 60 Chars`;
    titleCounter.className = (len >= 48 && len <= 60)
      ? 'text-[11px] text-emerald-400 font-mono font-bold'
      : (len > 60 ? 'text-[11px] text-rose-400 font-mono font-bold' : 'text-[11px] text-amber-400 font-mono');
  }

  const descCounter = document.getElementById('metaDescCounter');
  if (descCounter) {
    const len = desc.length;
    descCounter.textContent = `${len} / 160 Chars`;
    descCounter.className = (len >= 135 && len <= 160)
      ? 'text-[11px] text-emerald-400 font-mono font-bold'
      : (len > 160 ? 'text-[11px] text-rose-400 font-mono font-bold' : 'text-[11px] text-amber-400 font-mono');
  }

  // Update Favicon / Logo in SERP Preview
  const serpFaviconWrap = document.getElementById('serpPreviewFaviconWrap');
  if (serpFaviconWrap) {
    const s = (adminState && adminState.settings) || {};
    const logoUrl = (s.logoUrl || '').trim();
    if (logoUrl) {
      serpFaviconWrap.className = 'w-6 h-6 rounded-full bg-black border border-zinc-200 overflow-hidden flex items-center justify-center shadow-sm flex-shrink-0';
      serpFaviconWrap.innerHTML = `<img src="${logoUrl}" alt="${s.siteName || 'Logo'}" class="w-full h-full object-cover">`;
    } else {
      const initial = (s.siteName || 'Car4Rent').charAt(0).toUpperCase();
      serpFaviconWrap.className = 'w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center text-[10px] font-bold text-black flex-shrink-0';
      serpFaviconWrap.innerHTML = `<span>${initial}</span>`;
    }
  }

  // Google SERP Thumbnail Preview
  const ogImg = document.getElementById('seoOgImageInput')?.value.trim() || '';
  const serpImgWrap = document.getElementById('serpPreviewImageWrap');
  const serpImg = document.getElementById('serpPreviewImage');
  if (serpImg && serpImgWrap) {
    if (ogImg) {
      serpImg.src = ogImg;
      serpImgWrap.classList.remove('hidden');
    } else {
      serpImgWrap.classList.add('hidden');
    }
  }
}

function renderSeoOgImagePreview(url) {
  const preview = document.getElementById('seoOgImagePreview');
  const noPrev = document.getElementById('seoOgNoPreviewText');
  const clearBtn = document.getElementById('btnClearOgImage');
  if (url && url.trim()) {
    if (preview) {
      preview.src = url.trim();
      preview.classList.remove('hidden');
    }
    if (noPrev) noPrev.classList.add('hidden');
    if (clearBtn) clearBtn.classList.remove('hidden');
  } else {
    if (preview) {
      preview.src = '';
      preview.classList.add('hidden');
    }
    if (noPrev) noPrev.classList.remove('hidden');
    if (clearBtn) clearBtn.classList.add('hidden');
  }
  updateSerpPreview();
}

function onSeoOgImageUrlChanged(val) {
  renderSeoOgImagePreview(val);
}

function clearSeoOgImage() {
  const input = document.getElementById('seoOgImageInput');
  if (input) input.value = '';
  const fileInput = document.getElementById('seoOgImageFileInput');
  if (fileInput) fileInput.value = '';
  renderSeoOgImagePreview('');
  showToast('Thumbnail removed. Click Save to apply.', 'info');
}

function compressImageForSeo(file, maxWidth = 900, quality = 0.70) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > 550) {
          width = Math.round((width * 550) / height);
          height = 550;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Progressively compress until below 80KB so hosting 413 limit is NEVER hit
        let q = quality;
        let dataUrl = canvas.toDataURL('image/jpeg', q);
        while (dataUrl.length > 80 * 1024 && q > 0.3) {
          q -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', q);
        }
        resolve(dataUrl);
      };
      img.onerror = () => resolve(null);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function handleSeoOgImageFileUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Please select a valid image file (JPG, PNG, WebP).', 'warning');
    return;
  }

  const btn = document.getElementById('btnUploadOgImage');
  const btnText = document.getElementById('uploadOgBtnText');
  const input = document.getElementById('seoOgImageInput');

  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Optimizing image...';

  try {
    const compressedDataUrl = await compressImageForSeo(file, 1200, 0.85);
    if (!compressedDataUrl) {
      showToast('Could not process selected image file.', 'error');
      return;
    }

    // Immediately show visual preview so user sees their vehicle
    renderSeoOgImagePreview(compressedDataUrl);

    if (input) {
      input.value = 'Uploading to your website (car4rent.com.pk)...';
      input.disabled = true;
    }

    if (btnText) btnText.textContent = 'Uploading to your server...';

    // Upload to /api/admin/upload-image
    const resp = await postAdminMutation('/api/admin/upload-image', {
      data: compressedDataUrl,
      prefix: 'seo-car'
    });

    if (resp && resp.success && resp.url) {
      if (input) {
        input.value = resp.url;
        input.disabled = false;
      }
      renderSeoOgImagePreview(resp.url);
      if (adminState.seoSettings) {
        adminState.seoSettings.ogImage = resp.url;
      }
      showToast('✓ Car photo uploaded successfully to your domain!');
    } else {
      if (input) {
        input.value = adminState.seoSettings?.ogImage || '';
        input.disabled = false;
      }
      showToast(resp?.error || 'Failed to upload car photo to server.', 'error');
    }
  } catch (err) {
    if (input) {
      input.value = adminState.seoSettings?.ogImage || '';
      input.disabled = false;
    }
    showToast('Upload failed: ' + (err.message || 'Network error'), 'error');
  } finally {
    if (btnText) btnText.textContent = 'Upload Car Photo From Computer / Phone';
    if (btn) btn.disabled = false;
    if (input) input.disabled = false;
    if (event.target) event.target.value = '';
    if (window.lucide) lucide.createIcons();
  }
}

// Real-time AI SEO Audit & Recommendations Engine
async function runAiSeoAudit() {
  const title = document.getElementById('seoSiteTitleInput')?.value || '';
  const desc = document.getElementById('seoMetaDescInput')?.value || '';
  const keywords = document.getElementById('seoMetaKeywordsInput')?.value || '';
  const h1 = document.getElementById('seoH1HeadingInput')?.value || '';
  const subtitle = document.getElementById('seoHeroSubtitleInput')?.value || '';

  try {
    const resp = await postAdminMutation('/api/admin/ai-seo-advisor', {
      title, desc, keywords, h1, subtitle
    });

    if (resp && resp.success) {
      renderAiAuditResults(resp);
    }
  } catch (err) {
    console.error('AI Audit error:', err);
  }
}

function renderAiAuditResults(data) {
  const scoreNumEl = document.getElementById('aiScoreNumber');
  const scoreStatusEl = document.getElementById('aiScoreStatus');
  const scoreBadgeEl = document.getElementById('aiScoreBadge');
  const dosListEl = document.getElementById('aiDosList');
  const dontsListEl = document.getElementById('aiDontsList');
  const chipsEl = document.getElementById('aiMissingChips');
  const chipsContainer = document.getElementById('aiMissingKeywordsContainer');
  const insightEl = document.getElementById('aiMarketInsightText');

  if (scoreNumEl) scoreNumEl.textContent = data.score;
  if (scoreStatusEl) scoreStatusEl.textContent = data.statusText.replace(/[^\w\s/]/gi, '').trim();

  if (scoreBadgeEl) {
    if (data.score >= 90) {
      scoreBadgeEl.className = 'px-3 py-1 rounded-full text-xs font-bold font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 self-start sm:self-auto';
    } else if (data.score >= 70) {
      scoreBadgeEl.className = 'px-3 py-1 rounded-full text-xs font-bold font-mono bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1.5 self-start sm:self-auto';
    } else {
      scoreBadgeEl.className = 'px-3 py-1 rounded-full text-xs font-bold font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 self-start sm:self-auto';
    }
  }

  // Render Dos
  if (dosListEl) {
    const dos = data.dos || [];
    if (dos.length === 0) {
      dosListEl.innerHTML = `<li class="text-zinc-500 italic">Abhi koi strong SEO signal detect nahi hua.</li>`;
    } else {
      dosListEl.innerHTML = dos.slice(0, 4).map(d => `
        <li class="flex items-start gap-2">
          <span class="text-emerald-400 font-bold shrink-0">✓</span>
          <span>${d.message}</span>
        </li>
      `).join('');
    }
  }

  // Render Don'ts
  if (dontsListEl) {
    const donts = data.donts || [];
    if (donts.length === 0) {
      dontsListEl.innerHTML = `
        <li class="flex items-start gap-2 text-emerald-400">
          <span>✓</span> <span>Zabardast! Koi barhi SEO mistake detect nahi hui.</span>
        </li>
      `;
    } else {
      dontsListEl.innerHTML = donts.map(d => `
        <li class="flex items-start gap-2 ${d.type === 'critical' ? 'text-rose-400 font-medium' : 'text-amber-300'}">
          <span class="shrink-0">${d.type === 'critical' ? '✖' : '⚠'}</span>
          <span>${d.message}</span>
        </li>
      `).join('');
    }
  }

  // Render Missing Keyword Chips
  if (chipsEl && chipsContainer) {
    const suggs = data.suggestions || [];
    if (suggs.length === 0) {
      chipsContainer.classList.add('hidden');
    } else {
      chipsContainer.classList.remove('hidden');
      chipsEl.innerHTML = suggs.map(s => `
        <button 
          type="button" 
          onclick="addAiKeywordChip('${s.chip}')"
          class="px-2.5 py-1 bg-purple-900/40 hover:bg-purple-800/60 border border-purple-500/40 rounded-lg text-purple-200 text-[10px] font-semibold transition-all flex items-center gap-1"
          title="${s.tip}">
          <span>+ ${s.chip}</span>
        </button>
      `).join('');
    }
  }

  if (insightEl && data.marketInsight) {
    insightEl.textContent = data.marketInsight;
  }

  if (window.lucide) lucide.createIcons();
}

// 1-Click Apply Strategy
async function handleApplyAiStrategy() {
  const select = document.getElementById('aiMarketStrategySelect');
  const strategy = select ? select.value : 'all_rounder';
  const btn = document.getElementById('btnApplyAiStrategy');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Generating...</span>`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    const resp = await postAdminMutation('/api/admin/ai-seo-generate', { strategy });
    if (resp && resp.preset) {
      const p = resp.preset;
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
      };

      setVal('seoSiteTitleInput', p.title);
      setVal('seoMetaDescInput', p.metaDescription);
      setVal('seoMetaKeywordsInput', p.metaKeywords);
      setVal('seoH1HeadingInput', p.h1Heading);
      setVal('seoHeroSubtitleInput', p.heroSubtitle);

      onSeoInputChanged();
      showToast(`✓ AI Optimization Applied: ${p.name}`);
    }
  } catch (err) {
    showToast('Failed to generate AI SEO content.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="zap" class="w-4 h-4"></i><span>⚡ 1-Click Auto-Optimize</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

// Add Missing Keyword Chip Helper
function addAiKeywordChip(chipText) {
  const descEl = document.getElementById('seoMetaDescInput');
  const kwEl = document.getElementById('seoMetaKeywordsInput');

  if (descEl) {
    let cur = descEl.value.trim();
    if (!cur.toLowerCase().includes(chipText.toLowerCase())) {
      if (cur.endsWith('.')) cur = cur.slice(0, -1);
      descEl.value = `${cur}. Includes ${chipText}.`;
    }
  }

  if (kwEl) {
    let curKw = kwEl.value.trim();
    if (!curKw.toLowerCase().includes(chipText.toLowerCase())) {
      kwEl.value = curKw ? `${curKw}, ${chipText.toLowerCase()}` : chipText.toLowerCase();
    }
  }

  onSeoInputChanged();
  showToast(`Added "+ ${chipText}" to SEO content!`);
}

// Instant AI Fill for Single Field
function aiFillField(field) {
  const select = document.getElementById('aiMarketStrategySelect');
  const strategy = select ? select.value : 'all_rounder';

  // Instant Karachi templates
  const templates = {
    title: {
      all_rounder: 'Rent a Car in Karachi | 100% Self Drive Fleet | Car 4 Rent',
      airport_express: 'Karachi Airport Rent a Car | 24/7 Terminal Pickup | Car 4 Rent',
      budget_economy: 'Cheap Rent a Car in Karachi | Low Rates Self Drive | Car 4 Rent',
      luxury_wedding: 'Luxury Rent a Car Karachi | Prado, Fortuner & Weddings | C4R'
    },
    desc: {
      all_rounder: 'Top-rated rent a car in Karachi. Daily, weekly & monthly car rental on self-drive with zero deposit. 24/7 Jinnah Airport pickup & DHA delivery. Book now at lowest rates!',
      airport_express: '24/7 Karachi Airport rent a car service with real-time flight tracking. Instant terminal pickup & drop-off at Jinnah International Airport. Book clean cars now!',
      budget_economy: 'Most affordable rent a car in Karachi. Alto, Cultus, WagonR & Yaris on lowest daily & monthly rates without driver. No hidden charges & instant doorstep delivery!',
      luxury_wedding: 'Premium luxury car rental in Karachi. Prado, Land Cruiser, Fortuner & Audi on self-drive for weddings, corporate events & VIP protocol. Book 24/7!'
    },
    keywords: {
      all_rounder: 'rent a car karachi, car rental karachi without driver, rent a car in karachi self drive, cheap car hire karachi, karachi airport car rental, monthly car rental karachi, wedding car rental karachi, luxury prado rent karachi',
      airport_express: 'karachi airport rent a car, rent a car karachi airport, jinnah international airport car rental, airport pickup car karachi, 24/7 airport taxi alternative karachi, airport car hire',
      budget_economy: 'cheap rent a car in karachi, low budget car rental karachi, alto for rent karachi, cultus rent a car karachi, monthly car rental karachi low rates, rent a car karachi without driver cheap',
      luxury_wedding: 'luxury rent a car karachi, prado for rent in karachi, fortuner rental karachi, wedding car rental karachi, limousine rent karachi, executive car hire karachi, vip protocol cars'
    },
    h1: {
      all_rounder: 'Premier Rent a Car Service in Karachi - 100% Self Drive',
      airport_express: '24/7 Karachi Airport Rent a Car & VIP Terminal Transfers',
      budget_economy: 'Affordable & Low-Budget Rent a Car in Karachi',
      luxury_wedding: 'Luxury & VIP Protocol Rent a Car in Karachi'
    }
  };

  const val = templates[field]?.[strategy] || templates[field]?.all_rounder;
  if (!val) return;

  if (field === 'title') document.getElementById('seoSiteTitleInput').value = val;
  if (field === 'desc') document.getElementById('seoMetaDescInput').value = val;
  if (field === 'keywords') document.getElementById('seoMetaKeywordsInput').value = val;
  if (field === 'h1') document.getElementById('seoH1HeadingInput').value = val;

  onSeoInputChanged();
  showToast(`AI updated ${field.toUpperCase()}!`);
}

// Save Global SEO Configuration
async function handleSaveGlobalSeo(e) {
  e.preventDefault();

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  const payload = {
    siteTitle: document.getElementById('seoSiteTitleInput')?.value.trim(),
    metaDescription: document.getElementById('seoMetaDescInput')?.value.trim(),
    metaKeywords: document.getElementById('seoMetaKeywordsInput')?.value.trim(),
    h1Heading: document.getElementById('seoH1HeadingInput')?.value.trim(),
    canonicalUrl: document.getElementById('seoCanonicalUrlInput')?.value.trim(),
    heroSubtitle: document.getElementById('seoHeroSubtitleInput')?.value.trim(),
    targetCity: document.getElementById('seoTargetCityInput')?.value.trim() || 'Karachi',
    targetRegion: 'Sindh',
    targetCountry: 'Pakistan',
    latitude: document.getElementById('seoLatitudeInput')?.value.trim() || '24.8607',
    longitude: document.getElementById('seoLongitudeInput')?.value.trim() || '67.0011',
    googleBusinessUrl: document.getElementById('seoGbpUrlInput')?.value.trim(),
    googleVerification: (function(){
      let val = document.getElementById('seoGoogleVerifInput')?.value.trim() || '';
      let m = val.match(/content=["']?([^"'>\s]+)["']?/i);
      return m ? m[1] : val.replace(/[<>'"]/g, '').trim();
    })(),
    ga4MeasurementId: (function(){
      let val = document.getElementById('seoGa4Input')?.value.trim() || '';
      let m = val.match(/(G-[A-Za-z0-9]+)/i);
      return m ? m[1].toUpperCase() : val.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
    })(),
    bingVerification: (function(){
      let val = document.getElementById('seoBingVerifInput')?.value.trim() || '';
      let m = val.match(/content=["']?([a-fA-F0-9]{20,40})["']?/i);
      if (!m) m = val.match(/([a-fA-F0-9]{20,40})/i);
      return m ? m[1].toUpperCase() : val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    })(),
    ogImage: document.getElementById('seoOgImageInput')?.value.trim()
  };

  // Sync cleaned values back into inputs
  if (payload.googleVerification) setVal('seoGoogleVerifInput', payload.googleVerification);
  if (payload.ga4MeasurementId) setVal('seoGa4Input', payload.ga4MeasurementId);
  if (payload.bingVerification) setVal('seoBingVerifInput', payload.bingVerification);

  const result = await postAdminMutation('/api/admin/seo-settings', payload);
  if (result && result.seoSettings) {
    adminState.seoSettings = result.seoSettings;
    if (result.seoSettings.ogImage) {
      const ogInput = document.getElementById('seoOgImageInput');
      if (ogInput) ogInput.value = result.seoSettings.ogImage;
      renderSeoOgImagePreview(result.seoSettings.ogImage);
    }
  } else {
    adminState.seoSettings = { ...(adminState.seoSettings || {}), ...payload };
  }

  showToast('✓ Global SEO & Google Snippet Configuration Saved Live!');
}

// ====================================================
// 3. DEDICATED LANDING PAGES MANAGER (CRUD)
// ====================================================

function renderSeoLandingPagesTable() {
  const tbody = document.getElementById('seoLandingPagesTableBody');
  if (!tbody) return;

  const pages = adminState.seoLandingPages || [];
  if (pages.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-xs text-zinc-500">No landing pages added yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = pages.map(p => {
    const isAct = p.active !== false;
    const cleanSlug = (p.slug || '').replace(/^\/+|\/+$/g, '');
    const isFile = window.location.protocol === 'file:';
    const baseOrigin = isFile ? 'http://localhost:3000' : '';
    const fullUrl = `${baseOrigin}/${cleanSlug}`;
    const faqsCount = (p.faqs || []).length;

    return `
      <tr class="hover:bg-white/[0.02] transition-colors">
        <td class="px-6 py-4">
          <div class="font-bold text-white text-sm">${p.navTitle || p.h1}</div>
          <div class="text-xs text-zinc-400 line-clamp-1 mt-0.5">${p.title}</div>
        </td>
        <td class="px-6 py-4 font-mono text-xs">
          <a href="${fullUrl}" target="_blank" class="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-all group">
            <span>${fullUrl}</span>
            <i data-lucide="external-link" class="w-3.5 h-3.5 text-rose-400 group-hover:translate-x-0.5 transition-transform"></i>
          </a>
        </td>
        <td class="px-6 py-4">
          <button type="button" onclick="toggleSeoPageStatus('${p.id}')" class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-all ${isAct ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400 border border-white/10'}">
            ${isAct ? '● Published' : '○ Draft'}
          </button>
        </td>
        <td class="px-6 py-4 text-xs font-mono text-zinc-300">
          <span class="bg-[#202430] px-2 py-0.5 rounded">${faqsCount} FAQs</span>
        </td>
        <td class="px-6 py-4 text-xs font-mono text-zinc-400">
          ${p.priority || '0.9'}
        </td>
        <td class="px-6 py-4 text-right">
          <div class="flex items-center justify-end gap-2">
            <a href="${fullUrl}" target="_blank" class="p-2 bg-emerald-950/40 hover:bg-emerald-900/60 rounded-lg text-emerald-400 hover:text-emerald-300 transition-colors" title="View Live Page">
              <i data-lucide="external-link" class="w-4 h-4"></i>
            </a>
            <button type="button" onclick="openSeoPageModal('edit', '${p.id}')" class="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-zinc-300 hover:text-white transition-colors" title="Edit Page">
              <i data-lucide="pencil" class="w-4 h-4"></i>
            </button>
            <button type="button" onclick="deleteSeoPage('${p.id}')" class="p-2 bg-rose-950/40 hover:bg-rose-900/60 rounded-lg text-rose-400 hover:text-rose-300 transition-colors" title="Delete Page">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function openSeoPageModal(mode, pageId = null) {
  const modal = document.getElementById('seoPageModal');
  const titleEl = document.getElementById('seoPageModalTitle');
  const idInput = document.getElementById('modalSeoPageId');

  if (mode === 'add') {
    titleEl.textContent = 'Add Dedicated SEO Landing Page';
    idInput.value = '';
    document.getElementById('modalSeoSlug').value = '';
    document.getElementById('modalSeoNavTitle').value = '';
    document.getElementById('modalSeoTitle').value = '';
    document.getElementById('modalSeoMetaDesc').value = '';
    document.getElementById('modalSeoKeywords').value = '';
    document.getElementById('modalSeoH1').value = '';
    document.getElementById('modalSeoH2').value = '';
    document.getElementById('modalSeoContent').value = '';
    document.getElementById('modalSeoHighlights').value = '';
    document.getElementById('modalSeoTargetAreas').value = '';
    document.getElementById('modalSeoPriority').value = '0.9';
    document.getElementById('modalSeoActive').checked = true;
  } else {
    const p = (adminState.seoLandingPages || []).find(x => x.id === pageId);
    if (!p) return;

    titleEl.textContent = `Edit SEO Landing Page: ${p.navTitle || p.h1}`;
    idInput.value = p.id;
    document.getElementById('modalSeoSlug').value = p.slug || '';
    document.getElementById('modalSeoNavTitle').value = p.navTitle || '';
    document.getElementById('modalSeoTitle').value = p.title || '';
    document.getElementById('modalSeoMetaDesc').value = p.metaDescription || '';
    document.getElementById('modalSeoKeywords').value = p.focusKeywords || '';
    document.getElementById('modalSeoH1').value = p.h1 || '';
    document.getElementById('modalSeoH2').value = p.h2 || '';
    document.getElementById('modalSeoContent').value = p.content || '';
    document.getElementById('modalSeoHighlights').value = (p.highlights || []).join('\n');
    document.getElementById('modalSeoTargetAreas').value = (p.targetAreas || []).join('\n');
    document.getElementById('modalSeoPriority').value = p.priority || '0.9';
    document.getElementById('modalSeoActive').checked = p.active !== false;
  }

  modal.classList.remove('hidden');
}

function closeSeoPageModal() {
  document.getElementById('seoPageModal').classList.add('hidden');
}

async function handleSaveSeoPage(e) {
  e.preventDefault();

  const id = document.getElementById('modalSeoPageId').value;
  const action = id ? 'edit' : 'add';

  const highlightsRaw = document.getElementById('modalSeoHighlights').value;
  const highlights = highlightsRaw.split('\n').map(s => s.trim()).filter(Boolean);

  const areasRaw = document.getElementById('modalSeoTargetAreas').value;
  const targetAreas = areasRaw.split('\n').map(s => s.trim()).filter(Boolean);

  // Preserve existing FAQs if editing
  let existingFaqs = [];
  if (id) {
    const existing = (adminState.seoLandingPages || []).find(x => x.id === id);
    if (existing && existing.faqs) existingFaqs = existing.faqs;
  }

  const page = {
    id: id || undefined,
    slug: document.getElementById('modalSeoSlug').value.trim(),
    navTitle: document.getElementById('modalSeoNavTitle').value.trim(),
    title: document.getElementById('modalSeoTitle').value.trim(),
    metaDescription: document.getElementById('modalSeoMetaDesc').value.trim(),
    focusKeywords: document.getElementById('modalSeoKeywords').value.trim(),
    h1: document.getElementById('modalSeoH1').value.trim(),
    h2: document.getElementById('modalSeoH2').value.trim(),
    content: document.getElementById('modalSeoContent').value.trim(),
    highlights,
    targetAreas,
    priority: document.getElementById('modalSeoPriority').value.trim() || '0.9',
    active: document.getElementById('modalSeoActive').checked,
    faqs: existingFaqs
  };

  const result = await postAdminMutation('/api/admin/seo-pages', { action, page });
  if (result && result.seoLandingPages) {
    adminState.seoLandingPages = result.seoLandingPages;
  } else {
    if (action === 'add') {
      page.id = 'seo-' + Date.now();
      adminState.seoLandingPages = adminState.seoLandingPages || [];
      adminState.seoLandingPages.push(page);
    } else {
      const idx = adminState.seoLandingPages.findIndex(p => p.id === id);
      if (idx !== -1) adminState.seoLandingPages[idx] = { ...adminState.seoLandingPages[idx], ...page };
    }
  }

  renderSeoLandingPagesTable();
  updateMetrics();
  closeSeoPageModal();
  showToast(action === 'add' ? `Landing page /${page.slug} published live!` : `Landing page /${page.slug} updated!`);
}

async function toggleSeoPageStatus(pageId) {
  const result = await postAdminMutation('/api/admin/seo-pages', { action: 'toggle', page: { id: pageId } });
  if (result && result.seoLandingPages) {
    adminState.seoLandingPages = result.seoLandingPages;
  } else {
    const item = (adminState.seoLandingPages || []).find(p => p.id === pageId);
    if (item) item.active = !item.active;
  }
  renderSeoLandingPagesTable();
  showToast('Page publish status updated.');
}

async function deleteSeoPage(pageId) {
  const p = (adminState.seoLandingPages || []).find(x => x.id === pageId);
  if (!p) return;
  if (!confirm(`Are you sure you want to delete landing page /${p.slug}?`)) return;

  const result = await postAdminMutation('/api/admin/seo-pages', { action: 'delete', page: { id: pageId } });
  if (result && result.seoLandingPages) {
    adminState.seoLandingPages = result.seoLandingPages;
  } else {
    adminState.seoLandingPages = (adminState.seoLandingPages || []).filter(x => x.id !== pageId);
  }

  renderSeoLandingPagesTable();
  updateMetrics();
  showToast('Landing page deleted.');
}

// ====================================================
// 4. KARACHI LOCAL AREAS MATRIX (Local SEO)
// ====================================================

function renderKarachiAreasTable() {
  const tbody = document.getElementById('karachiAreasTableBody');
  if (!tbody) return;

  const areas = adminState.karachiAreas || [];
  if (areas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-xs text-zinc-500">No Karachi areas added yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = areas.map(a => `
    <tr class="hover:bg-white/[0.02] transition-colors">
      <td class="px-6 py-4 font-bold text-white text-sm flex items-center gap-2">
        <i data-lucide="map-pin" class="w-3.5 h-3.5 text-rose-500 shrink-0"></i>
        <span>${a.name}</span>
      </td>
      <td class="px-6 py-4 text-xs font-semibold text-rose-300">${a.title || a.name}</td>
      <td class="px-6 py-4 text-xs text-zinc-400 line-clamp-2">${a.desc || ''}</td>
      <td class="px-6 py-4 text-right">
        <div class="flex items-center justify-end gap-2">
          <button type="button" onclick="openKarachiAreaModal('edit', '${a.id}')" class="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-zinc-300 hover:text-white transition-colors" title="Edit Area">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
          <button type="button" onclick="deleteKarachiArea('${a.id}')" class="p-2 bg-rose-950/40 hover:bg-rose-900/60 rounded-lg text-rose-400 hover:text-rose-300 transition-colors" title="Delete Area">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function openKarachiAreaModal(mode, areaId = null) {
  const modal = document.getElementById('karachiAreaModal');
  const titleEl = document.getElementById('karachiAreaModalTitle');
  const idInput = document.getElementById('modalAreaId');

  if (mode === 'add') {
    titleEl.textContent = 'Add Karachi Target Area';
    idInput.value = '';
    document.getElementById('modalAreaName').value = '';
    document.getElementById('modalAreaTitle').value = '';
    document.getElementById('modalAreaDesc').value = '';
  } else {
    const a = (adminState.karachiAreas || []).find(x => x.id === areaId);
    if (!a) return;
    titleEl.textContent = `Edit Karachi Area: ${a.name}`;
    idInput.value = a.id;
    document.getElementById('modalAreaName').value = a.name || '';
    document.getElementById('modalAreaTitle').value = a.title || '';
    document.getElementById('modalAreaDesc').value = a.desc || '';
  }

  modal.classList.remove('hidden');
}

function closeKarachiAreaModal() {
  document.getElementById('karachiAreaModal').classList.add('hidden');
}

async function handleSaveKarachiArea(e) {
  e.preventDefault();

  const id = document.getElementById('modalAreaId').value;
  const action = id ? 'edit' : 'add';

  const area = {
    id: id || undefined,
    name: document.getElementById('modalAreaName').value.trim(),
    title: document.getElementById('modalAreaTitle').value.trim(),
    desc: document.getElementById('modalAreaDesc').value.trim()
  };

  const result = await postAdminMutation('/api/admin/seo-areas', { action, area });
  if (result && result.karachiAreas) {
    adminState.karachiAreas = result.karachiAreas;
  } else {
    if (action === 'add') {
      area.id = 'area-' + Date.now();
      adminState.karachiAreas = adminState.karachiAreas || [];
      adminState.karachiAreas.push(area);
    } else {
      const idx = adminState.karachiAreas.findIndex(a => a.id === id);
      if (idx !== -1) adminState.karachiAreas[idx] = { ...adminState.karachiAreas[idx], ...area };
    }
  }

  renderKarachiAreasTable();
  updateMetrics();
  closeKarachiAreaModal();
  showToast(action === 'add' ? `Area "${area.name}" added!` : `Area "${area.name}" updated!`);
}

async function deleteKarachiArea(areaId) {
  const a = (adminState.karachiAreas || []).find(x => x.id === areaId);
  if (!a) return;
  if (!confirm(`Delete area "${a.name}"?`)) return;

  const result = await postAdminMutation('/api/admin/seo-areas', { action: 'delete', area: { id: areaId } });
  if (result && result.karachiAreas) {
    adminState.karachiAreas = result.karachiAreas;
  } else {
    adminState.karachiAreas = (adminState.karachiAreas || []).filter(x => x.id !== areaId);
  }

  renderKarachiAreasTable();
  updateMetrics();
  showToast('Area deleted.');
}

// ====================================================
// 5. HOMEPAGE FAQs & GOOGLE FAQPage SCHEMA (CRUD)
// ====================================================

function renderSeoFaqsTable() {
  const tbody = document.getElementById('seoFaqsTableBody');
  if (!tbody) return;

  const faqs = adminState.seoFaqs || [];
  if (faqs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-xs text-zinc-500">No homepage FAQs configured.</td></tr>`;
    return;
  }

  tbody.innerHTML = faqs.map((f, i) => `
    <tr class="hover:bg-white/[0.02] transition-colors">
      <td class="px-6 py-4 text-xs font-mono text-zinc-500">${i+1}</td>
      <td class="px-6 py-4 font-bold text-white text-sm max-w-xs">${f.question}</td>
      <td class="px-6 py-4 text-xs text-zinc-400 max-w-sm line-clamp-2">${f.answer}</td>
      <td class="px-6 py-4 text-xs">
        <span class="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full text-[10px] font-bold">
          <i data-lucide="check" class="w-3 h-3"></i> JSON-LD Active
        </span>
      </td>
      <td class="px-6 py-4 text-right">
        <div class="flex items-center justify-end gap-2">
          <button type="button" onclick="openSeoFaqModal('edit', '${f.id}')" class="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-zinc-300 hover:text-white transition-colors" title="Edit FAQ">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
          <button type="button" onclick="deleteSeoFaq('${f.id}')" class="p-2 bg-rose-950/40 hover:bg-rose-900/60 rounded-lg text-rose-400 hover:text-rose-300 transition-colors" title="Delete FAQ">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function openSeoFaqModal(mode, faqId = null) {
  const modal = document.getElementById('seoFaqModal');
  const titleEl = document.getElementById('seoFaqModalTitle');
  const idInput = document.getElementById('modalFaqId');

  if (mode === 'add') {
    titleEl.textContent = 'Add FAQ Question & Answer';
    idInput.value = '';
    document.getElementById('modalFaqQuestion').value = '';
    document.getElementById('modalFaqAnswer').value = '';
  } else {
    const f = (adminState.seoFaqs || []).find(x => x.id === faqId);
    if (!f) return;
    titleEl.textContent = 'Edit FAQ Item';
    idInput.value = f.id;
    document.getElementById('modalFaqQuestion').value = f.question || '';
    document.getElementById('modalFaqAnswer').value = f.answer || '';
  }

  modal.classList.remove('hidden');
}

function closeSeoFaqModal() {
  document.getElementById('seoFaqModal').classList.add('hidden');
}

async function handleSaveSeoFaq(e) {
  e.preventDefault();

  const id = document.getElementById('modalFaqId').value;
  const action = id ? 'edit' : 'add';

  const faq = {
    id: id || undefined,
    question: document.getElementById('modalFaqQuestion').value.trim(),
    answer: document.getElementById('modalFaqAnswer').value.trim()
  };

  const result = await postAdminMutation('/api/admin/seo-faqs', { action, faq });
  if (result && result.seoFaqs) {
    adminState.seoFaqs = result.seoFaqs;
  } else {
    if (action === 'add') {
      faq.id = 'faq-' + Date.now();
      adminState.seoFaqs = adminState.seoFaqs || [];
      adminState.seoFaqs.push(faq);
    } else {
      const idx = adminState.seoFaqs.findIndex(f => f.id === id);
      if (idx !== -1) adminState.seoFaqs[idx] = { ...adminState.seoFaqs[idx], ...faq };
    }
  }

  renderSeoFaqsTable();
  updateMetrics();
  closeSeoFaqModal();
  showToast(action === 'add' ? 'FAQ added & JSON-LD schema updated!' : 'FAQ updated!');
}

async function deleteSeoFaq(faqId) {
  const f = (adminState.seoFaqs || []).find(x => x.id === faqId);
  if (!f) return;
  if (!confirm(`Delete FAQ: "${f.question}"?`)) return;

  const result = await postAdminMutation('/api/admin/seo-faqs', { action: 'delete', faq: { id: faqId } });
  if (result && result.seoFaqs) {
    adminState.seoFaqs = result.seoFaqs;
  } else {
    adminState.seoFaqs = (adminState.seoFaqs || []).filter(x => x.id !== faqId);
  }

  renderSeoFaqsTable();
  updateMetrics();
  showToast('FAQ deleted.');
}

// ====================================================
// 6. TECHNICAL SEO: ROBOTS.TXT
// ====================================================

function loadRobotsTxt() {
  const el = document.getElementById('seoCustomRobotsTxt');
  if (!el) return;

  const content = adminState.seoSettings?.customRobotsTxt || "User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /api/admin/\n\nSitemap: /sitemap.xml";
  el.value = content;
}

async function saveRobotsTxt() {
  const val = document.getElementById('seoCustomRobotsTxt')?.value.trim();
  const result = await postAdminMutation('/api/admin/seo-settings', { customRobotsTxt: val });
  if (result && result.seoSettings) {
    adminState.seoSettings = result.seoSettings;
  }
  showToast('Robots.txt rules saved live!');
}

// ====================================================
// 7. CALCULATOR & ESTIMATION MANAGEMENT MODULE
// ====================================================

function renderCalculatorTab() {
  const cfg = adminState.calculatorConfig || {};
  const feats = cfg.features || {};
  const secDep = cfg.securityDeposit || {};

  // 1. Populate Feature Toggles
  const setCheck = (id, val, def = true) => {
    const el = document.getElementById(id);
    if (el) el.checked = val !== undefined ? !!val : def;
  };

  setCheck('calcToggleLocations', feats.showLocations, true);
  setCheck('calcToggleAddons', feats.showAddons, true);
  setCheck('calcToggleSlotsBar', feats.showSlotsBar, true);
  setCheck('calcTogglePromo', feats.showPromoCode, true);
  setCheck('calcToggleContact', feats.showContactDetails, true);
  setCheck('calcToggleOfficialBtn', feats.showOfficialQuoteBtn, true);
  setCheck('calcToggleWhatsAppBtn', feats.showWhatsAppBtn, true);
  setCheck('calcTogglePrintBtn', feats.showPrintBtn, true);

  const durMode = document.getElementById('calcDurationMode');
  if (durMode) durMode.value = feats.durationMode || 'both';

  // 2. Populate Security Deposit
  setCheck('secDepEnabled', secDep.enabled, true);
  setCheck('secDepIncludeInTotal', secDep.includeInGrandTotal, true);
  const depAmt = document.getElementById('secDepAmount');
  if (depAmt) depAmt.value = secDep.amount !== undefined ? secDep.amount : 50000;
  const depLbl = document.getElementById('secDepLabel');
  if (depLbl) depLbl.value = secDep.label || 'Security Deposit (100% Refundable)';

  // 3. Render Tables
  renderCalculatorSlotsTable();
  renderCalculatorLocationsTable();
  renderCalculatorAddonsTable();
}

async function saveCalculatorFeatures() {
  const features = {
    showLocations: document.getElementById('calcToggleLocations')?.checked ?? true,
    showAddons: document.getElementById('calcToggleAddons')?.checked ?? true,
    showSlotsBar: document.getElementById('calcToggleSlotsBar')?.checked ?? true,
    showPromoCode: document.getElementById('calcTogglePromo')?.checked ?? true,
    showContactDetails: document.getElementById('calcToggleContact')?.checked ?? true,
    showOfficialQuoteBtn: document.getElementById('calcToggleOfficialBtn')?.checked ?? true,
    showWhatsAppBtn: document.getElementById('calcToggleWhatsAppBtn')?.checked ?? true,
    showPrintBtn: document.getElementById('calcTogglePrintBtn')?.checked ?? true,
    durationMode: document.getElementById('calcDurationMode')?.value || 'both'
  };

  adminState.calculatorConfig = adminState.calculatorConfig || {};
  adminState.calculatorConfig.features = features;

  const res = await postAdminMutation('/api/admin/calculator-config', { features });
  if (res && res.calculatorConfig) {
    adminState.calculatorConfig = res.calculatorConfig;
  }
  showToast('Calculator display & feature controls saved!');
}

async function saveCalculatorSecurityDeposit() {
  const securityDeposit = {
    enabled: document.getElementById('secDepEnabled')?.checked ?? true,
    amount: Number(document.getElementById('secDepAmount')?.value) || 0,
    label: document.getElementById('secDepLabel')?.value.trim() || 'Security Deposit (100% Refundable)',
    includeInGrandTotal: document.getElementById('secDepIncludeInTotal')?.checked ?? true
  };

  adminState.calculatorConfig = adminState.calculatorConfig || {};
  adminState.calculatorConfig.securityDeposit = securityDeposit;

  const res = await postAdminMutation('/api/admin/calculator-config', { securityDeposit });
  if (res && res.calculatorConfig) {
    adminState.calculatorConfig = res.calculatorConfig;
  }
  showToast('Security deposit settings saved!');
}

// ----------------------------------------------------
// DURATION SLOTS (1 Day: 3900, 3 Days: 3700)
// ----------------------------------------------------

function renderCalculatorSlotsTable() {
  const tbody = document.getElementById('calculatorSlotsTableBody');
  if (!tbody) return;

  const slots = (adminState.calculatorConfig && adminState.calculatorConfig.slots) || [];
  if (slots.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-6 text-center text-xs text-zinc-500">No duration slots added yet. Click "+ Add New Duration Slot".</td></tr>`;
    return;
  }

  tbody.innerHTML = slots.map(s => `
    <tr class="hover:bg-white/[0.02] transition-colors">
      <td class="px-6 py-4 font-mono font-bold text-white text-sm">
        <span class="px-2.5 py-1 rounded-lg bg-white/10 text-white">${s.days} Day${s.days > 1 ? 's' : ''}</span>
      </td>
      <td class="px-6 py-4 text-xs font-bold text-zinc-200">${s.label}</td>
      <td class="px-6 py-4 font-mono font-bold text-rose-400 text-xs">
        ${s.discountValue > 0 ? `-Rs. ${s.discountValue.toLocaleString()} / day` : '<span class="text-zinc-500">Standard Rate (Rs. 0)</span>'}
      </td>
      <td class="px-6 py-4">
        ${s.badge ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/30">${s.badge}</span>` : '<span class="text-zinc-600 text-xs">—</span>'}
      </td>
      <td class="px-6 py-4">
        <button type="button" onclick="toggleCalculatorSlot('${s.id}')" class="px-2.5 py-1 rounded-full text-[11px] font-bold ${s.active !== false ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'}">
          ${s.active !== false ? 'Active' : 'Disabled'}
        </button>
      </td>
      <td class="px-6 py-4 text-right">
        <div class="flex items-center justify-end gap-2">
          <button type="button" onclick="openCalculatorSlotModal('edit', '${s.id}')" class="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-zinc-300 hover:text-white" title="Edit Slot">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
          <button type="button" onclick="deleteCalculatorSlot('${s.id}')" class="p-2 bg-rose-950/40 hover:bg-rose-900/60 rounded-lg text-rose-400 hover:text-rose-300" title="Delete Slot">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function openCalculatorSlotModal(mode, slotId = null) {
  const modal = document.getElementById('calculatorSlotModal');
  const title = document.getElementById('calculatorSlotModalTitle');
  const idInput = document.getElementById('modalSlotId');
  if (!modal) return;

  if (mode === 'add') {
    title.textContent = 'Add Duration Slot';
    idInput.value = '';
    document.getElementById('modalSlotDays').value = '';
    document.getElementById('modalSlotDiscount').value = '0';
    document.getElementById('modalSlotLabel').value = '';
    document.getElementById('modalSlotBadge').value = '';
    document.getElementById('modalSlotActive').checked = true;
  } else {
    const slots = (adminState.calculatorConfig && adminState.calculatorConfig.slots) || [];
    const s = slots.find(x => x.id === slotId);
    if (!s) return;
    title.textContent = `Edit Duration Slot (${s.days} Days)`;
    idInput.value = s.id;
    document.getElementById('modalSlotDays').value = s.days;
    document.getElementById('modalSlotDiscount').value = s.discountValue || 0;
    document.getElementById('modalSlotLabel').value = s.label || '';
    document.getElementById('modalSlotBadge').value = s.badge || '';
    document.getElementById('modalSlotActive').checked = s.active !== false;
  }
  modal.classList.remove('hidden');
}

function closeCalculatorSlotModal() {
  const modal = document.getElementById('calculatorSlotModal');
  if (modal) modal.classList.add('hidden');
}

async function handleSaveCalculatorSlot(e) {
  e.preventDefault();
  const id = document.getElementById('modalSlotId').value;
  const days = Number(document.getElementById('modalSlotDays').value) || 1;
  const discountValue = Number(document.getElementById('modalSlotDiscount').value) || 0;
  const label = document.getElementById('modalSlotLabel').value.trim();
  const badge = document.getElementById('modalSlotBadge').value.trim();
  const active = document.getElementById('modalSlotActive').checked;

  const slotData = {
    id: id || ('slot-' + Date.now()),
    days,
    discountType: 'amount_per_day',
    discountValue,
    label,
    badge,
    active
  };

  const action = id ? 'edit' : 'add';
  const res = await postAdminMutation('/api/admin/calculator-slots', { action, slot: slotData });
  if (res && res.slots) {
    adminState.calculatorConfig = adminState.calculatorConfig || {};
    adminState.calculatorConfig.slots = res.slots;
  } else {
    adminState.calculatorConfig = adminState.calculatorConfig || {};
    adminState.calculatorConfig.slots = adminState.calculatorConfig.slots || [];
    if (action === 'add') {
      adminState.calculatorConfig.slots.push(slotData);
    } else {
      const idx = adminState.calculatorConfig.slots.findIndex(x => x.id === id);
      if (idx !== -1) adminState.calculatorConfig.slots[idx] = slotData;
    }
    adminState.calculatorConfig.slots.sort((a, b) => a.days - b.days);
  }

  renderCalculatorSlotsTable();
  closeCalculatorSlotModal();
  showToast(action === 'add' ? 'Duration slot added!' : 'Duration slot updated!');
}

async function deleteCalculatorSlot(slotId) {
  if (!confirm('Are you sure you want to delete this duration slot?')) return;
  const res = await postAdminMutation('/api/admin/calculator-slots', { action: 'delete', slot: { id: slotId } });
  if (res && res.slots) {
    adminState.calculatorConfig.slots = res.slots;
  } else {
    adminState.calculatorConfig.slots = (adminState.calculatorConfig.slots || []).filter(x => x.id !== slotId);
  }
  renderCalculatorSlotsTable();
  showToast('Duration slot deleted.');
}

async function toggleCalculatorSlot(slotId) {
  const res = await postAdminMutation('/api/admin/calculator-slots', { action: 'toggle', slot: { id: slotId } });
  if (res && res.slots) {
    adminState.calculatorConfig.slots = res.slots;
  } else {
    const s = (adminState.calculatorConfig.slots || []).find(x => x.id === slotId);
    if (s) s.active = !s.active;
  }
  renderCalculatorSlotsTable();
  showToast('Slot status updated.');
}

// ----------------------------------------------------
// PICKUP & DROP LOCATIONS MANAGEMENT
// ----------------------------------------------------

function renderCalculatorLocationsTable() {
  const tbody = document.getElementById('calculatorLocationsTableBody');
  if (!tbody) return;

  const locs = (adminState.calculatorConfig && adminState.calculatorConfig.locations) || [];
  if (locs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-6 text-center text-xs text-zinc-500">No locations added yet. Click "+ Add New Location".</td></tr>`;
    return;
  }

  tbody.innerHTML = locs.map(l => `
    <tr class="hover:bg-white/[0.02] transition-colors">
      <td class="px-6 py-4 font-bold text-white text-sm flex items-center gap-2">
        <i data-lucide="map-pin" class="w-4 h-4 text-blue-400 shrink-0"></i>
        <span>${l.name}</span>
      </td>
      <td class="px-6 py-4">
        <button type="button" onclick="toggleCalculatorLocation('${l.id}')" class="px-2.5 py-1 rounded-full text-[11px] font-bold ${l.active !== false ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'}">
          ${l.active !== false ? 'Active' : 'Disabled'}
        </button>
      </td>
      <td class="px-6 py-4 text-right">
        <div class="flex items-center justify-end gap-2">
          <button type="button" onclick="openCalculatorLocationModal('edit', '${l.id}')" class="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-zinc-300 hover:text-white" title="Edit Location">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
          <button type="button" onclick="deleteCalculatorLocation('${l.id}')" class="p-2 bg-rose-950/40 hover:bg-rose-900/60 rounded-lg text-rose-400 hover:text-rose-300" title="Delete Location">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function openCalculatorLocationModal(mode, locId = null) {
  const modal = document.getElementById('calculatorLocationModal');
  const title = document.getElementById('calculatorLocationModalTitle');
  const idInput = document.getElementById('modalLocationId');
  if (!modal) return;

  if (mode === 'add') {
    title.textContent = 'Add Calculator Location';
    idInput.value = '';
    document.getElementById('modalLocationName').value = '';
    document.getElementById('modalLocationActive').checked = true;
  } else {
    const locs = (adminState.calculatorConfig && adminState.calculatorConfig.locations) || [];
    const l = locs.find(x => x.id === locId);
    if (!l) return;
    title.textContent = 'Edit Calculator Location';
    idInput.value = l.id;
    document.getElementById('modalLocationName').value = l.name;
    document.getElementById('modalLocationActive').checked = l.active !== false;
  }
  modal.classList.remove('hidden');
}

function closeCalculatorLocationModal() {
  const modal = document.getElementById('calculatorLocationModal');
  if (modal) modal.classList.add('hidden');
}

async function handleSaveCalculatorLocation(e) {
  e.preventDefault();
  const id = document.getElementById('modalLocationId').value;
  const name = document.getElementById('modalLocationName').value.trim();
  const active = document.getElementById('modalLocationActive').checked;

  const locData = {
    id: id || ('loc-' + Date.now()),
    name,
    active
  };

  const action = id ? 'edit' : 'add';
  const res = await postAdminMutation('/api/admin/calculator-locations', { action, location: locData });
  if (res && res.locations) {
    adminState.calculatorConfig = adminState.calculatorConfig || {};
    adminState.calculatorConfig.locations = res.locations;
  } else {
    adminState.calculatorConfig = adminState.calculatorConfig || {};
    adminState.calculatorConfig.locations = adminState.calculatorConfig.locations || [];
    if (action === 'add') {
      adminState.calculatorConfig.locations.push(locData);
    } else {
      const idx = adminState.calculatorConfig.locations.findIndex(x => x.id === id);
      if (idx !== -1) adminState.calculatorConfig.locations[idx] = locData;
    }
  }

  renderCalculatorLocationsTable();
  closeCalculatorLocationModal();
  showToast(action === 'add' ? 'Location added!' : 'Location updated!');
}

async function deleteCalculatorLocation(locId) {
  if (!confirm('Are you sure you want to delete this location?')) return;
  const res = await postAdminMutation('/api/admin/calculator-locations', { action: 'delete', location: { id: locId } });
  if (res && res.locations) {
    adminState.calculatorConfig.locations = res.locations;
  } else {
    adminState.calculatorConfig.locations = (adminState.calculatorConfig.locations || []).filter(x => x.id !== locId);
  }
  renderCalculatorLocationsTable();
  showToast('Location deleted.');
}

async function toggleCalculatorLocation(locId) {
  const res = await postAdminMutation('/api/admin/calculator-locations', { action: 'toggle', location: { id: locId } });
  if (res && res.locations) {
    adminState.calculatorConfig.locations = res.locations;
  } else {
    const l = (adminState.calculatorConfig.locations || []).find(x => x.id === locId);
    if (l) l.active = !l.active;
  }
  renderCalculatorLocationsTable();
  showToast('Location status updated.');
}

// ----------------------------------------------------
// OPTIONAL ADD-ONS MANAGEMENT
// ----------------------------------------------------

function renderCalculatorAddonsTable() {
  const tbody = document.getElementById('calculatorAddonsTableBody');
  if (!tbody) return;

  const addons = (adminState.calculatorConfig && adminState.calculatorConfig.addons) || [];
  if (addons.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-6 text-center text-xs text-zinc-500">No add-ons created yet. Click "+ Add New Add-on".</td></tr>`;
    return;
  }

  tbody.innerHTML = addons.map(a => `
    <tr class="hover:bg-white/[0.02] transition-colors">
      <td class="px-6 py-4 font-bold text-white text-sm">${a.title}</td>
      <td class="px-6 py-4 text-xs text-zinc-400">${a.description || '—'}</td>
      <td class="px-6 py-4 font-mono font-bold text-purple-400 text-xs">Rs. ${(a.price || 0).toLocaleString()}</td>
      <td class="px-6 py-4 text-xs text-zinc-300">
        <span class="px-2 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-[11px]">${a.pricingType === 'flat' ? 'One-Time Flat' : 'Per Day'}</span>
      </td>
      <td class="px-6 py-4 text-xs">
        ${a.defaultChecked ? '<span class="text-emerald-400 font-bold">✓ Pre-checked</span>' : '<span class="text-zinc-500">Unchecked</span>'}
      </td>
      <td class="px-6 py-4">
        <button type="button" onclick="toggleCalculatorAddon('${a.id}')" class="px-2.5 py-1 rounded-full text-[11px] font-bold ${a.active !== false ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'}">
          ${a.active !== false ? 'Active' : 'Disabled'}
        </button>
      </td>
      <td class="px-6 py-4 text-right">
        <div class="flex items-center justify-end gap-2">
          <button type="button" onclick="openCalculatorAddonModal('edit', '${a.id}')" class="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-zinc-300 hover:text-white" title="Edit Add-on">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
          <button type="button" onclick="deleteCalculatorAddon('${a.id}')" class="p-2 bg-rose-950/40 hover:bg-rose-900/60 rounded-lg text-rose-400 hover:text-rose-300" title="Delete Add-on">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function openCalculatorAddonModal(mode, addonId = null) {
  const modal = document.getElementById('calculatorAddonModal');
  const title = document.getElementById('calculatorAddonModalTitle');
  const idInput = document.getElementById('modalAddonId');
  if (!modal) return;

  if (mode === 'add') {
    title.textContent = 'Add Optional Add-on';
    idInput.value = '';
    document.getElementById('modalAddonTitle').value = '';
    document.getElementById('modalAddonDesc').value = '';
    document.getElementById('modalAddonPrice').value = '3000';
    document.getElementById('modalAddonType').value = 'daily';
    document.getElementById('modalAddonDefaultChecked').checked = false;
    document.getElementById('modalAddonActive').checked = true;
  } else {
    const addons = (adminState.calculatorConfig && adminState.calculatorConfig.addons) || [];
    const a = addons.find(x => x.id === addonId);
    if (!a) return;
    title.textContent = 'Edit Optional Add-on';
    idInput.value = a.id;
    document.getElementById('modalAddonTitle').value = a.title;
    document.getElementById('modalAddonDesc').value = a.description || '';
    document.getElementById('modalAddonPrice').value = a.price || 0;
    document.getElementById('modalAddonType').value = a.pricingType || 'daily';
    document.getElementById('modalAddonDefaultChecked').checked = !!a.defaultChecked;
    document.getElementById('modalAddonActive').checked = a.active !== false;
  }
  modal.classList.remove('hidden');
}

function closeCalculatorAddonModal() {
  const modal = document.getElementById('calculatorAddonModal');
  if (modal) modal.classList.add('hidden');
}

async function handleSaveCalculatorAddon(e) {
  e.preventDefault();
  const id = document.getElementById('modalAddonId').value;
  const title = document.getElementById('modalAddonTitle').value.trim();
  const description = document.getElementById('modalAddonDesc').value.trim();
  const price = Number(document.getElementById('modalAddonPrice').value) || 0;
  const pricingType = document.getElementById('modalAddonType').value;
  const defaultChecked = document.getElementById('modalAddonDefaultChecked').checked;
  const active = document.getElementById('modalAddonActive').checked;

  const addonData = {
    id: id || ('addon-' + Date.now()),
    title,
    description,
    price,
    pricingType,
    defaultChecked,
    active
  };

  const action = id ? 'edit' : 'add';
  const res = await postAdminMutation('/api/admin/calculator-addons', { action, addon: addonData });
  if (res && res.addons) {
    adminState.calculatorConfig = adminState.calculatorConfig || {};
    adminState.calculatorConfig.addons = res.addons;
  } else {
    adminState.calculatorConfig = adminState.calculatorConfig || {};
    adminState.calculatorConfig.addons = adminState.calculatorConfig.addons || [];
    if (action === 'add') {
      adminState.calculatorConfig.addons.push(addonData);
    } else {
      const idx = adminState.calculatorConfig.addons.findIndex(x => x.id === id);
      if (idx !== -1) adminState.calculatorConfig.addons[idx] = addonData;
    }
  }

  renderCalculatorAddonsTable();
  closeCalculatorAddonModal();
  showToast(action === 'add' ? 'Add-on created!' : 'Add-on updated!');
}

async function deleteCalculatorAddon(addonId) {
  if (!confirm('Are you sure you want to delete this add-on?')) return;
  const res = await postAdminMutation('/api/admin/calculator-addons', { action: 'delete', addon: { id: addonId } });
  if (res && res.addons) {
    adminState.calculatorConfig.addons = res.addons;
  } else {
    adminState.calculatorConfig.addons = (adminState.calculatorConfig.addons || []).filter(x => x.id !== addonId);
  }
  renderCalculatorAddonsTable();
  showToast('Add-on deleted.');
}

async function toggleCalculatorAddon(addonId) {
  const res = await postAdminMutation('/api/admin/calculator-addons', { action: 'toggle', addon: { id: addonId } });
  if (res && res.addons) {
    adminState.calculatorConfig.addons = res.addons;
  } else {
    const a = (adminState.calculatorConfig.addons || []).find(x => x.id === addonId);
    if (a) a.active = !a.active;
  }
  renderCalculatorAddonsTable();
  showToast('Add-on status updated.');
}

// ====================================================
// LICENSE & SECURITY TAB LOGIC
// ====================================================

async function fetchAndRenderLicenseDetails() {
  const hostPrompt = document.getElementById('adminCurrentDomainPrompt');
  if (hostPrompt) {
    hostPrompt.textContent = window.location.hostname || 'localhost';
  }

  try {
    const res = await fetch('/api/license-status');
    const data = await res.json();

    const badge = document.getElementById('adminLicenseBadge');
    const domEl = document.getElementById('adminLicDomain');
    const typeEl = document.getElementById('adminLicType');
    const daysEl = document.getElementById('adminLicDaysLeft');
    const expEl = document.getElementById('adminLicExpiry');
    const hostEl = document.getElementById('adminLicHost');

    if (data && data.isLicensed && data.license) {
      const lic = data.license;
      if (badge) {
        badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-800';
        badge.textContent = 'Active & Verified';
      }
      if (domEl) domEl.textContent = lic.domain;
      if (typeEl) {
        const typeLabels = {
          '3_months': '3 Months Plan',
          '6_months': '6 Months Plan',
          '1_year': '1 Year Plan',
          'lifetime': 'Lifetime Access'
        };
        typeEl.textContent = typeLabels[lic.type] || lic.type;
      }
      if (daysEl) {
        daysEl.textContent = lic.daysLeft === 'Lifetime' ? 'Lifetime (Unlimited)' : `${lic.daysLeft} Days Remaining`;
      }
      if (expEl) {
        expEl.textContent = `Expires: ${lic.expiresAt}`;
      }
      if (hostEl) {
        hostEl.textContent = data.currentDomain || window.location.hostname;
      }
    } else {
      if (badge) {
        badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-950 text-rose-300 border border-rose-800';
        badge.textContent = 'Inactive / Expired';
      }
      if (domEl) domEl.textContent = 'Not Licensed';
      if (typeEl) typeEl.textContent = 'None';
      if (daysEl) daysEl.textContent = '0 Days (Locked)';
      if (expEl) expEl.textContent = data.reason || 'License missing or expired';
      if (hostEl) hostEl.textContent = data.currentDomain || window.location.hostname;
    }
  } catch (err) {
    console.error('Failed to fetch license status:', err);
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

async function handleAdminUpdateLicense(e) {
  e.preventDefault();
  const keyInput = document.getElementById('adminLicenseKeyInput');
  const btn = document.getElementById('adminLicenseSubmitBtn');
  const key = (keyInput ? keyInput.value : '').trim();

  if (!key) {
    alert('Please paste a valid license key.');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="inline-block animate-spin mr-2">⟳</span> Validating...';
  }

  try {
    const res = await fetch('/api/activate-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast('License activated successfully for this domain!');
      if (keyInput) keyInput.value = '';
      await fetchAndRenderLicenseDetails();
    } else {
      alert('License Activation Failed:\n' + (data.error || data.reason || 'Invalid license key for this domain.'));
    }
  } catch (err) {
    alert('Failed to connect to server: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4"></i><span>Validate & Save License</span>';
      if (window.lucide) lucide.createIcons();
    }
  }
}

// ==============================================
// TYPOGRAPHY & SITE CONTENT MANAGEMENT
// ==============================================

let currentPreviewMode = 'desktop';

function renderContentAndTypographyTab() {
  const typo = adminState.typography || {};
  const about = adminState.aboutSection || {};
  const fleet = adminState.fleetSection || {};
  const stats = adminState.statsSection || [];
  const heroBtns = adminState.heroButtons || {};
  const srv = adminState.servicesSection || {};

  // 1. Typography Fonts & Letter Casing
  const headFontEl = document.getElementById('contentHeadingFont');
  const bodyFontEl = document.getElementById('contentBodyFont');
  const transformEl = document.getElementById('contentHeadingTransform');
  if (headFontEl) headFontEl.value = typo.headingFont || 'Syne';
  if (bodyFontEl) bodyFontEl.value = typo.bodyFont || 'Plus Jakarta Sans';
  if (transformEl) transformEl.value = typo.textTransform || 'uppercase';

  // 2. Responsive Font Sizes
  const h1D = typo.h1Desktop || 56;
  const h1M = typo.h1Mobile || 32;
  const h2D = typo.h2Desktop || 40;
  const h2M = typo.h2Mobile || 24;
  const bD = typo.bodyDesktop || 17;
  const bM = typo.bodyMobile || 14;

  const h1DEl = document.getElementById('contentH1Desktop');
  const h1MEl = document.getElementById('contentH1Mobile');
  const h2DEl = document.getElementById('contentH2Desktop');
  const h2MEl = document.getElementById('contentH2Mobile');
  const bDEl = document.getElementById('contentBodyDesktop');
  const bMEl = document.getElementById('contentBodyMobile');

  if (h1DEl) h1DEl.value = h1D;
  if (h1MEl) h1MEl.value = h1M;
  if (h2DEl) h2DEl.value = h2D;
  if (h2MEl) h2MEl.value = h2M;
  if (bDEl) bDEl.value = bD;
  if (bMEl) bMEl.value = bM;

  // 3. Hero CTA Buttons
  const btn1El = document.getElementById('contentHeroBtn1');
  const btn2El = document.getElementById('contentHeroBtn2');
  if (btn1El) btn1El.value = heroBtns.btn1Text || 'Book Your Ride';
  if (btn2El) btn2El.value = heroBtns.btn2Text || 'Browse Our Fleet';

  // 4. About Section
  const abBadgeEl = document.getElementById('contentAboutBadge');
  const abHeadEl = document.getElementById('contentAboutHeadline');
  const abDescEl = document.getElementById('contentAboutDesc');
  if (abBadgeEl) abBadgeEl.value = about.badge || 'Unrivaled Excellence';
  if (abHeadEl) abHeadEl.value = about.headline || 'Drive Luxury Live Freedom';
  if (abDescEl) abDescEl.value = about.description || 'Experience premium car rentals crafted for comfort, performance, and executive protocol. Whether it\'s a VIP business delegation, an elite wedding celebration, or an unforgettable weekend tour, our fleet is tailored to elevate your journey.';

  // 5. Fleet Section Header
  const flBadgeEl = document.getElementById('contentFleetBadge');
  const flHeadEl = document.getElementById('contentFleetHeadline');
  const flDescEl = document.getElementById('contentFleetDesc');
  if (flBadgeEl) flBadgeEl.value = fleet.badge || 'Curated Collection';
  if (flHeadEl) flHeadEl.value = fleet.headline || 'Find Your Perfect Ride';
  if (flDescEl) flDescEl.value = fleet.description || 'Explore our handpicked collection of exotic supercars, presidential sedans, and luxury SUVs across Pakistan. All rates in PKR.';


  // 7. Services Section
  const srvSubEl = document.getElementById('contentServicesSubtitle');
  const srvHeadEl = document.getElementById('contentServicesHeadline');
  if (srvSubEl) srvSubEl.value = srv.subtitle || 'Our Services';
  if (srvHeadEl) srvHeadEl.value = srv.headline || 'We offer brand new car rent services on self-drive with best rate for various occasions.';

  updateTypographyPreview();
}

function updateTypographyPreview() {
  const h1D = document.getElementById('contentH1Desktop')?.value || 56;
  const h1M = document.getElementById('contentH1Mobile')?.value || 30;
  const h2D = document.getElementById('contentH2Desktop')?.value || 40;
  const h2M = document.getElementById('contentH2Mobile')?.value || 24;
  const bD = document.getElementById('contentBodyDesktop')?.value || 17;
  const bM = document.getElementById('contentBodyMobile')?.value || 14;

  const headFont = document.getElementById('contentHeadingFont')?.value || 'Plus Jakarta Sans';
  const bodyFont = document.getElementById('contentBodyFont')?.value || 'Plus Jakarta Sans';

  // Update slider numerical labels
  const lH1D = document.getElementById('labelH1Desktop');
  const lH1M = document.getElementById('labelH1Mobile');
  const lH2D = document.getElementById('labelH2Desktop');
  const lH2M = document.getElementById('labelH2Mobile');
  const lBD = document.getElementById('labelBodyDesktop');
  const lBM = document.getElementById('labelBodyMobile');

  if (lH1D) lH1D.textContent = `${h1D}px`;
  if (lH1M) lH1M.textContent = `${h1M}px`;
  if (lH2D) lH2D.textContent = `${h2D}px`;
  if (lH2M) lH2M.textContent = `${h2M}px`;
  if (lBD) lBD.textContent = `${bD}px`;
  if (lBM) lBM.textContent = `${bM}px`;

  // Apply preview styles
  const previewBox = document.getElementById('typographyPreviewBox');
  const pBadge = document.getElementById('previewBadge');
  const pH1 = document.getElementById('previewH1');
  const pBody = document.getElementById('previewBody');

  if (!previewBox) return;

  const isMobile = currentPreviewMode === 'mobile';
  const activeH1 = isMobile ? h1M : h1D;
  const activeBody = isMobile ? bM : bD;

  const headTransform = document.getElementById('contentHeadingTransform')?.value || 'uppercase';

  if (pH1) {
    pH1.style.fontFamily = `'${headFont}', sans-serif`;
    pH1.style.fontSize = `${activeH1}px`;
    pH1.style.lineHeight = '1.15';
    pH1.style.textTransform = headTransform;
  }
  if (pBody) {
    pBody.style.fontFamily = `'${bodyFont}', sans-serif`;
    pBody.style.fontSize = `${activeBody}px`;
  }
  if (pBadge) {
    pBadge.style.fontFamily = `'${bodyFont}', sans-serif`;
  }
}

function setPreviewMode(mode) {
  currentPreviewMode = mode;
  const desktopBtn = document.getElementById('previewModeDesktop');
  const mobileBtn = document.getElementById('previewModeMobile');
  const box = document.getElementById('typographyPreviewBox');

  if (mode === 'mobile') {
    if (desktopBtn) {
      desktopBtn.className = 'px-3 py-1 text-xs rounded-lg font-bold bg-white/5 text-zinc-400 hover:text-white transition-all';
    }
    if (mobileBtn) {
      mobileBtn.className = 'px-3 py-1 text-xs rounded-lg font-bold bg-purple-600 text-white transition-all';
    }
    if (box) {
      box.style.maxWidth = '375px';
      box.style.margin = '0 auto';
      box.style.border = '2px solid rgba(168, 85, 247, 0.4)';
    }
  } else {
    if (desktopBtn) {
      desktopBtn.className = 'px-3 py-1 text-xs rounded-lg font-bold bg-purple-600 text-white transition-all';
    }
    if (mobileBtn) {
      mobileBtn.className = 'px-3 py-1 text-xs rounded-lg font-bold bg-white/5 text-zinc-400 hover:text-white transition-all';
    }
    if (box) {
      box.style.maxWidth = '100%';
      box.style.margin = '0';
      box.style.border = '1px solid rgba(255, 255, 255, 0.05)';
    }
  }

  updateTypographyPreview();
}

async function saveContentAndTypography() {
  const headFont = document.getElementById('contentHeadingFont')?.value || 'Syne';
  const bodyFont = document.getElementById('contentBodyFont')?.value || 'Plus Jakarta Sans';
  const headTransform = document.getElementById('contentHeadingTransform')?.value || 'uppercase';
  const h1D = parseInt(document.getElementById('contentH1Desktop')?.value || '56', 10);
  const h1M = parseInt(document.getElementById('contentH1Mobile')?.value || '32', 10);
  const h2D = parseInt(document.getElementById('contentH2Desktop')?.value || '40', 10);
  const h2M = parseInt(document.getElementById('contentH2Mobile')?.value || '24', 10);
  const bD = parseInt(document.getElementById('contentBodyDesktop')?.value || '17', 10);
  const bM = parseInt(document.getElementById('contentBodyMobile')?.value || '14', 10);

  const heroBtn1 = (document.getElementById('contentHeroBtn1')?.value || '').trim() || 'Book Your Ride';
  const heroBtn2 = (document.getElementById('contentHeroBtn2')?.value || '').trim() || 'Browse Our Fleet';

  const aboutBadge = (document.getElementById('contentAboutBadge')?.value || '').trim() || 'Unrivaled Excellence';
  const aboutHeadline = (document.getElementById('contentAboutHeadline')?.value || '').trim() || 'Drive Luxury Live Freedom';
  const aboutDesc = (document.getElementById('contentAboutDesc')?.value || '').trim();

  const fleetBadge = (document.getElementById('contentFleetBadge')?.value || '').trim() || 'Curated Collection';
  const fleetHeadline = (document.getElementById('contentFleetHeadline')?.value || '').trim() || 'Find Your Perfect Ride';
  const fleetDesc = (document.getElementById('contentFleetDesc')?.value || '').trim();

  const statsList = [];

  const srvSubtitle = (document.getElementById('contentServicesSubtitle')?.value || '').trim() || 'Our Services';
  const srvHeadline = (document.getElementById('contentServicesHeadline')?.value || '').trim();

  const payload = {
    typography: {
      headingFont: headFont,
      bodyFont: bodyFont,
      textTransform: headTransform,
      h1Desktop: h1D,
      h1Mobile: h1M,
      h2Desktop: h2D,
      h2Mobile: h2M,
      bodyDesktop: bD,
      bodyMobile: bM
    },
    heroButtons: {
      btn1Text: heroBtn1,
      btn2Text: heroBtn2
    },
    aboutSection: {
      badge: aboutBadge,
      headline: aboutHeadline,
      description: aboutDesc
    },
    fleetSection: {
      badge: fleetBadge,
      headline: fleetHeadline,
      description: fleetDesc
    },
    statsSection: statsList,
    servicesSection: {
      subtitle: srvSubtitle,
      headline: srvHeadline
    }
  };

  try {
    const res = await postAdminMutation('/api/admin/content-typography', payload);
    if (res && res.success) {
      adminState.typography = payload.typography;
      adminState.heroButtons = payload.heroButtons;
      adminState.aboutSection = payload.aboutSection;
      adminState.fleetSection = payload.fleetSection;
      adminState.statsSection = payload.statsSection;
      adminState.servicesSection = payload.servicesSection;

      // Also persist to local backup if present
      if (typeof getLocalDB === 'function' && typeof saveLocalDB === 'function') {
        const local = getLocalDB();
        local.typography = payload.typography;
        local.heroButtons = payload.heroButtons;
        local.aboutSection = payload.aboutSection;
        local.fleetSection = payload.fleetSection;
        local.statsSection = payload.statsSection;
        local.servicesSection = payload.servicesSection;
        saveLocalDB(local);
      }

      showToast('Typography and site content updated successfully!');
    } else {
      showToast('Failed to save typography settings: ' + (res?.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('Error saving: ' + err.message, 'error');
  }
}

// ==============================================
// 14. BLOG ARTICLES & GUIDES (SEO Content Engine)
// ==============================================

function renderBlogsTab() {
  const blogs = adminState.blogs || [];
  const tbody = document.getElementById('blogsTableBody');
  const countBadge = document.getElementById('blogsCountBadge');
  const countDisplay = document.getElementById('adminBlogCountDisplay');

  if (countBadge) countBadge.textContent = blogs.length;
  if (countDisplay) countDisplay.textContent = blogs.length;

  if (!tbody) return;

  if (blogs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-8 text-center text-zinc-500">
          <i data-lucide="book-open" class="w-8 h-8 mx-auto mb-2 text-zinc-600"></i>
          <p>No blog articles published yet. Click "Write New Article" to create your first SEO guide.</p>
        </td>
      </tr>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

function getBlogThumbnailHtml(mediaUrl, title, posterUrl) {
  const trimmed = (mediaUrl || '').trim();
  const poster = (posterUrl || '').trim();

  // If custom poster / cover image exists, use it with play badge
  if (poster) {
    return `<div class="w-12 h-9 rounded-lg bg-black overflow-hidden relative shrink-0"><img src="${escapeHtml(poster)}" alt="${escapeHtml(title)}" class="w-full h-full object-cover"><div class="absolute inset-0 flex items-center justify-center bg-black/40"><i data-lucide="play" class="w-3 h-3 text-rose-500 fill-current"></i></div></div>`;
  }

  const ytMatch = trimmed.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (ytMatch && ytMatch[1]) {
    return `<div class="w-12 h-9 rounded-lg bg-black overflow-hidden relative shrink-0"><img src="https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg" alt="${escapeHtml(title)}" class="w-full h-full object-cover"><div class="absolute inset-0 flex items-center justify-center bg-black/40"><i data-lucide="play" class="w-3 h-3 text-red-500 fill-current"></i></div></div>`;
  }
  if (trimmed.includes('instagram.com') || trimmed.includes('instagr.am')) {
    return `<div class="w-12 h-9 rounded-lg bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center shrink-0 shadow text-white" title="Instagram Reel/Post"><i data-lucide="instagram" class="w-4 h-4"></i></div>`;
  }
  if (trimmed.includes('tiktok.com')) {
    return `<div class="w-12 h-9 rounded-lg bg-zinc-900 border border-white/20 flex items-center justify-center shrink-0 shadow text-cyan-400" title="TikTok Video"><i data-lucide="music-2" class="w-4 h-4"></i></div>`;
  }
  if (trimmed.includes('facebook.com') || trimmed.includes('fb.watch')) {
    return `<div class="w-12 h-9 rounded-lg bg-[#1877F2] flex items-center justify-center shrink-0 shadow text-white" title="Facebook Video"><i data-lucide="video" class="w-4 h-4"></i></div>`;
  }
  if (/\.(mp4|webm|mov|ogg|ogv)(\?.*)?$/i.test(trimmed) || trimmed.startsWith('data:video/')) {
    return `<div class="w-12 h-9 rounded-lg bg-zinc-800 border border-white/10 flex items-center justify-center shrink-0 text-white" title="Video"><i data-lucide="play-circle" class="w-4 h-4"></i></div>`;
  }
  return `<img src="${escapeHtml(trimmed || '/uploads/seo-car-1789727514573.jpg')}" alt="${escapeHtml(title)}" onerror="this.src='/uploads/seo-car-1789727514573.webp'" class="w-12 h-9 object-cover rounded-lg bg-zinc-800 shrink-0">`;
}

  tbody.innerHTML = blogs.map(b => {
    const isPub = b.published !== false;
    const isFeatured = !!b.featured;
    return `
      <tr class="hover:bg-white/5 transition-colors group">
        <td class="py-3 px-4">
          <div class="flex items-center gap-3">
            ${getBlogThumbnailHtml(b.image, b.title, b.poster)}
            <div>
              <div class="font-bold text-white group-hover:text-sky-400 transition-colors flex items-center gap-1.5">
                <span>${escapeHtml(b.title)}</span>
                ${isFeatured ? '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">★ Featured</span>' : ''}
              </div>
              <div class="text-[11px] text-zinc-500 font-mono flex items-center gap-1 mt-0.5">
                <span>/blog/${escapeHtml(b.slug)}</span>
                <a href="/blog/${b.slug}" target="_blank" class="text-zinc-400 hover:text-white" title="Open Public Page">
                  <i data-lucide="external-link" class="w-3 h-3"></i>
                </a>
              </div>
            </div>
          </div>
        </td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/10 text-zinc-300">
            ${escapeHtml(b.category || 'Rental Guide')}
          </span>
          <div class="text-[10px] text-zinc-500 mt-1">${escapeHtml(b.readTime || '4 min read')}</div>
        </td>
        <td class="py-3 px-4">
          <div class="text-white font-medium">${escapeHtml(b.author || 'Car4Rent Team')}</div>
          <div class="text-[10px] text-zinc-500">${escapeHtml(b.date || '')}</div>
        </td>
        <td class="py-3 px-4">
          <button onclick="toggleBlogStatus('${b.id}')" class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${isPub ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900' : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'}" title="Click to Toggle Status">
            ${isPub ? 'Published' : 'Draft'}
          </button>
        </td>
        <td class="py-3 px-4 text-right">
          <div class="flex items-center justify-end gap-2">
            <button onclick="openBlogModal('${b.id}')" class="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors cursor-pointer" title="Edit Article">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="deleteBlog('${b.id}')" class="p-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 rounded-lg transition-colors border border-rose-800/40 cursor-pointer" title="Delete Article">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function filterAdminBlogs() {
  const q = (document.getElementById('adminBlogSearchInput')?.value || '').toLowerCase().trim();
  const rows = document.querySelectorAll('#blogsTableBody tr');
  let visibleCount = 0;
  rows.forEach(r => {
    const text = r.textContent.toLowerCase();
    if (!q || text.includes(q)) {
      r.style.display = '';
      visibleCount++;
    } else {
      r.style.display = 'none';
    }
  });
  const countEl = document.getElementById('adminBlogCountDisplay');
  if (countEl) countEl.textContent = visibleCount;
}

function autoGenerateBlogSlug(title, force = false) {
  const slugInput = document.getElementById('modalBlogSlug');
  if (!slugInput) return;
  // Auto update slug if forced, or if slug is currently empty, or if user hasn't typed a custom slug
  if (force || !slugInput.value.trim() || !slugInput.dataset.custom) {
    const clean = (title || '')
      .toLowerCase()
      .trim()
      .replace(/https?:\/\/[^\s]+/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    slugInput.value = clean;
  }
}
window.autoGenerateBlogSlug = autoGenerateBlogSlug;

const BLOG_SUGGESTION_TOPICS = [
  { topic: 'Documents Required for Self-Drive Car Rental in Karachi (2026 Complete Guide)', cat: 'Rental Guides', read: '4 min read' },
  { topic: 'Karachi Airport VIP Terminal Handover & How to Avoid Taxi Scams', cat: 'Airport Services', read: '5 min read' },
  { topic: 'Top Fuel Efficient Cars for Daily Karachi Traffic & Commute', cat: 'Economy Hatchbacks', read: '4 min read' },
  { topic: 'How to Rent a Car in Karachi with Zero Security Deposit', cat: 'Rental Guides', read: '4 min read' },
  { topic: 'Toyota Yaris ATIV Rental Karachi: Complete Executive Sedan Guide', cat: 'Executive Sedans', read: '5 min read' },
  { topic: 'Suzuki Alto Auto vs Manual Rental Karachi: Rates, Mileage & Best Choice', cat: 'Economy Hatchbacks', read: '4 min read' },
  { topic: 'Kia Sportage All-Wheel-Drive Rental in Karachi: Luxury Family SUV Guide', cat: 'Luxury SUVs', read: '5 min read' },
  { topic: 'Suzuki Swift Automatic: Best Sporty Hatchback for Karachi Roads', cat: 'Economy Hatchbacks', read: '4 min read' },
  { topic: 'Toyota Hilux Revo Rocco Rental Karachi: Northern Areas & VIP Protocol', cat: '4x4 & Pickups', read: '6 min read' },
  { topic: 'Best Luxury Cars for Weddings in DHA & Clifton Karachi', cat: 'VIP & Weddings', read: '5 min read' },
  { topic: 'Doorstep Car Handover in Karachi: DHA, Johar, North Nazimabad & Airport', cat: 'Doorstep Handover', read: '4 min read' },
  { topic: 'Self-Drive vs With Driver Car Rental in Karachi: Cost & Freedom Comparison', cat: 'Rental Guides', read: '5 min read' },
  { topic: 'Motorway Travel from Karachi: Safe Self-Drive Cars for Hyderabad & Sukkur', cat: 'Intercity Travel', read: '6 min read' },
  { topic: 'Monthly Corporate Car Lease in Karachi: Cost Saving Guide for Businesses', cat: 'Corporate Fleet', read: '5 min read' },
  { topic: 'Emergency Roadside Assistance: What Happens If Your Rental Breaks Down in Karachi?', cat: 'Safety & Support', read: '4 min read' },
  { topic: 'Weekend Road Trips from Karachi: Best SUVs for Gorakh Hill, Kund Malir & Ormara', cat: 'Road Trips', read: '6 min read' }
];

function populateAiBlogCarDropdown(selectedId = '') {
  const select = document.getElementById('aiBlogCarSelect');
  if (!select) return;
  const cars = adminState.cars || [];
  select.innerHTML = '<option value="">-- Or Pick Fleet Car --</option>' + cars.map(c => `
    <option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)} (${c.brand || 'Luxury'})</option>
  `).join('');
}

function handleAiCarSelectChange(carId) {
  if (!carId) return;
  const cars = adminState.cars || [];
  const car = cars.find(c => c.id === carId);
  if (!car) return;
  const input = document.getElementById('aiBlogTopicInput');
  if (input) {
    input.value = `${car.name} Rental Karachi: Rates, Mileage & Complete Guide (2026)`;
  }
  const dropdown = document.getElementById('aiBlogSuggestionsDropdown');
  if (dropdown) dropdown.classList.add('hidden');
}

function handleAiBlogTopicInput(val) {
  const dropdown = document.getElementById('aiBlogSuggestionsDropdown');
  if (!dropdown) return;
  const raw = (val || '').trim();
  const query = raw.toLowerCase();

  // Live sync what user types in topic input into Article Title & Slug
  const titleInput = document.getElementById('modalBlogTitle');
  if (titleInput) {
    titleInput.value = raw;
    autoGenerateBlogSlug(raw);
  }

  if (!raw) {
    // Show diverse starter topics across Business, Travel, Operations, and Guides
    const starterTopics = [
      { topic: 'Rent a Car Business Overview: Market Size, Challenges & Success Guide', cat: 'Business & Strategy' },
      { topic: 'Top 10 Fuel Efficient Cars for Daily City Traffic & Commuting', cat: 'Guides & Tips' },
      { topic: 'Documents Required for Self-Drive Car Rental: Complete 2026 Checklist', cat: 'Rental Guides' },
      { topic: 'How to Choose the Best Fleet Management Software for Car Rental Agencies', cat: 'Fleet Operations' },
      { topic: 'Karachi to Gwadar Coastal Highway: Road Trip Preparation & Safety Guide', cat: 'Travel & Tourism' },
      { topic: 'Corporate Car Leasing vs Daily Rental: Cost Analysis for Businesses', cat: 'Corporate Fleet' }
    ];
    dropdown.innerHTML = starterTopics.map(item => `
      <div onclick="selectAiBlogTopic('${escapeHtml(item.topic).replace(/'/g, "\\'")}')" class="p-3 hover:bg-purple-900/30 cursor-pointer flex items-center justify-between gap-3 text-left transition-colors">
        <div class="flex items-center gap-2">
          <i data-lucide="sparkles" class="w-3.5 h-3.5 text-purple-400 shrink-0"></i>
          <span class="text-xs text-white font-medium hover:text-sky-300">${escapeHtml(item.topic)}</span>
        </div>
        <span class="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 text-[10px] font-mono border border-purple-500/20 shrink-0">${escapeHtml(item.cat)}</span>
      </div>
    `).join('');
    dropdown.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
    return;
  }

  // When user has typed ANY custom topic:
  const items = [];
  // 1. Direct custom AI Write button
  items.push(`
    <div onclick="selectAiBlogTopic('${escapeHtml(raw).replace(/'/g, "\\'")}')" class="p-3 bg-purple-950/60 hover:bg-purple-900/70 cursor-pointer flex items-center justify-between gap-3 text-left transition-colors border-b border-purple-500/30">
      <div class="flex items-center gap-2">
        <span class="px-1.5 py-0.5 rounded bg-gradient-to-r from-purple-600 to-sky-600 text-white text-[10px] font-bold">✨ AI AUTO-WRITE</span>
        <span class="text-xs text-purple-200 font-bold">Write complete article on: <span class="text-white underline">"${escapeHtml(raw)}"</span></span>
      </div>
      <i data-lucide="arrow-right" class="w-3.5 h-3.5 text-purple-300 shrink-0"></i>
    </div>
  `);

  // 2. Dynamic extensions tailored to the user's input
  const extensions = [
    `${raw}: Complete 2026 In-Depth Guide & Practical Insights`,
    `${raw}: Essential Checklist & Best Practices`,
    `${raw}: Common Challenges, Risks & How to Overcome Them`,
    `${raw}: Strategic Overview, Budgeting & ROI Breakdown`
  ];

  extensions.forEach(ext => {
    items.push(`
      <div onclick="selectAiBlogTopic('${escapeHtml(ext).replace(/'/g, "\\'")}')" class="p-3 hover:bg-purple-900/30 cursor-pointer flex items-center justify-between gap-3 text-left transition-colors">
        <div class="flex items-center gap-2">
          <i data-lucide="sparkles" class="w-3.5 h-3.5 text-purple-400 shrink-0"></i>
          <span class="text-xs text-white font-medium hover:text-sky-300">${escapeHtml(ext)}</span>
        </div>
        <span class="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 text-[10px] font-mono border border-purple-500/20 shrink-0">Suggestion</span>
      </div>
    `);
  });

  dropdown.innerHTML = items.join('');
  dropdown.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function selectAiBlogTopic(topicText) {
  const input = document.getElementById('aiBlogTopicInput');
  if (input) input.value = topicText;
  const dropdown = document.getElementById('aiBlogSuggestionsDropdown');
  if (dropdown) dropdown.classList.add('hidden');
  triggerAiBlogGenerateFromTopic();
}

// Close suggestion dropdown if clicked outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('aiBlogSuggestionsDropdown');
  const input = document.getElementById('aiBlogTopicInput');
  if (!dropdown) return;
  if (input && (input === e.target || input.contains(e.target))) return;
  if (dropdown.contains(e.target)) return;
  dropdown.classList.add('hidden');
});

function openBlogModalWithAi() {
  openBlogModal();
  const input = document.getElementById('aiBlogTopicInput');
  if (input) {
    input.value = '';
    input.focus();
    handleAiBlogTopicInput('');
  }
}

function triggerAiBlogGenerateFromTopic() {
  const topicInput = document.getElementById('aiBlogTopicInput');
  let topic = topicInput ? topicInput.value.trim() : '';

  if (!topic) {
    const select = document.getElementById('aiBlogCarSelect');
    if (select && select.value) {
      const car = (adminState.cars || []).find(c => c.id === select.value);
      if (car) topic = `${car.name} Rental Karachi: Rates, Mileage & Complete Guide (2026)`;
    }
  }

  if (!topic) {
    showToast('Please type what you want the blog about.', 'warning');
    if (topicInput) topicInput.focus();
    return;
  }

  const dropdown = document.getElementById('aiBlogSuggestionsDropdown');
  if (dropdown) dropdown.classList.add('hidden');

  const btn = document.getElementById('btnAiBlogGenerate');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="inline-block animate-spin mr-1">⟳</span> Writing Article...';
  }

  setTimeout(() => {
    // Capitalize title
    let title = topic.trim();
    if (title === title.toLowerCase()) {
      title = title.replace(/\b\w/g, l => l.toUpperCase());
    }

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    // Inferred category for ANY topic
    let category = 'Business & Strategy';
    const low = topic.toLowerCase();
    if (low.includes('business') || low.includes('market') || low.includes('startup') || low.includes('finance') || low.includes('profit') || low.includes('overview') || low.includes('industry')) {
      category = 'Business & Strategy';
    } else if (low.includes('travel') || low.includes('tourism') || low.includes('trip') || low.includes('tour') || low.includes('hotel') || low.includes('beach') || low.includes('gwadar') || low.includes('route')) {
      category = 'Travel & Tourism';
    } else if (low.includes('airport') || low.includes('flight') || low.includes('terminal')) {
      category = 'Airport Services';
    } else if (low.includes('fleet') || low.includes('maintenance') || low.includes('driver') || low.includes('management')) {
      category = 'Fleet Operations';
    } else if (low.includes('guide') || low.includes('how to') || low.includes('tips') || low.includes('checklist') || low.includes('document')) {
      category = 'Guides & Insights';
    } else if (low.includes('wedding') || low.includes('vip') || low.includes('luxury') || low.includes('suv')) {
      category = 'VIP & Luxury';
    } else {
      category = 'Guides & Insights';
    }

    const readTime = '5 min read';

    // Keep existing media if user uploaded/pasted one, otherwise keep completely EMPTY
    const existingMedia = document.getElementById('modalBlogImage') ? document.getElementById('modalBlogImage').value.trim() : '';
    const featuredMedia = existingMedia || '';

    const excerpt = `A comprehensive overview of ${title.toLowerCase()}: key market dynamics, proven operational strategies, essential checklists, and actionable insights.`;

    const content = `<h2>Executive Summary: ${title}</h2>
<p>Understanding <strong>${title}</strong> is essential for optimizing operational efficiency, evaluating key market dynamics, and building scalable success. Whether you are an industry practitioner, business owner, or client, this comprehensive guide delivers structured insights and actionable frameworks.</p>

<h3>1. Key Drivers & Core Fundamentals</h3>
<p>When analyzing this domain, several fundamental pillars stand out:</p>
<ul>
  <li><strong>Market Demand & Consumer Behavior:</strong> Prioritizing transparent service delivery, dependable operations, and frictionless customer touchpoints.</li>
  <li><strong>Asset Integrity & Quality Standards:</strong> Establishing rigorous checklists, transparent agreements, and verifiable quality controls.</li>
  <li><strong>Financial Viability & Risk Management:</strong> Evaluating upfront capital commitments against recurring operational costs, insurance, and long-term asset value.</li>
  <li><strong>Digital Transformation:</strong> Leveraging modern digital channels, automated communication, and real-time support over WhatsApp.</li>
</ul>

<h3>2. Step-by-Step Strategic Framework</h3>
<p>To implement successfully, focus on these structured phases:</p>
<ul>
  <li><strong>Phase 1: Research & Benchmark Analysis</strong> — Assess current market benchmarks, consumer expectations, and emerging opportunities.</li>
  <li><strong>Phase 2: Transparent Operating Standards</strong> — Build long-term trust through upfront pricing, verifiable records, and zero hidden terms.</li>
  <li><strong>Phase 3: Scalable Service Delivery</strong> — Invest in responsive customer care, fast response turnarounds, and robust emergency protocols.</li>
</ul>

<h3>3. Future Trends & Strategic Outlook</h3>
<p>Looking ahead, market growth will be heavily driven by digital verification systems, agile fleet customization, and personalized concierge experiences. Organizations that embrace transparency and customer-first workflows will continue to lead the sector.</p>

<div class="my-6 p-5 bg-sky-950/30 border border-sky-800/40 rounded-2xl text-sky-200">
  <h4 class="font-bold text-white text-base mb-1">Have Questions About This Topic?</h4>
  <p class="text-xs text-zinc-300 mb-3">Our concierge desk is active 24/7 on WhatsApp to provide professional guidance, custom solutions, and immediate assistance.</p>
  <a href="https://wa.me/923023650000?text=Hi%20Car4Rent%2C%20I%20have%20an%20inquiry%20regarding%3A%20${encodeURIComponent(title)}" target="_blank" class="inline-block px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all shadow-md">Chat with Concierge on WhatsApp</a>
</div>`;

    document.getElementById('modalBlogTitle').value = title;
    document.getElementById('modalBlogSlug').value = slug;
    document.getElementById('modalBlogCategory').value = category;
    document.getElementById('modalBlogReadTime').value = readTime;
    document.getElementById('modalBlogAuthor').value = 'Car4Rent Editorial Team';
    document.getElementById('modalBlogImage').value = featuredMedia;
    document.getElementById('modalBlogExcerpt').value = excerpt;
    document.getElementById('modalBlogContent').value = content;
    document.getElementById('modalBlogMetaTitle').value = `${title} | Car4Rent`;
    document.getElementById('modalBlogMetaDesc').value = excerpt.substring(0, 155);

    renderBlogMediaPreview(featuredMedia);

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="wand-2" class="w-3.5 h-3.5"></i> Auto-Generate';
      if (window.lucide) lucide.createIcons();
    }

    showToast(`✓ AI article generated successfully for "${title}"!`);
  }, 400);
}

function handleBlogMediaUrlChange(url) {
  renderBlogMediaPreview(url);
}

function renderBlogMediaPreview(url) {
  const container = document.getElementById('modalBlogMediaPreviewContainer');
  const placeholder = document.getElementById('modalBlogMediaPlaceholder');
  const imgEl = document.getElementById('modalBlogImagePreview');
  const videoEl = document.getElementById('modalBlogVideoPreview');
  const iframeEl = document.getElementById('modalBlogIframePreview');

  if (!container || !placeholder || !imgEl || !videoEl || !iframeEl) return;

  const trimmed = (url || '').trim();

  // Reset preview states - keep container strictly uniform 16:9 aspect-video
  container.classList.remove('h-[540px]', 'max-w-[340px]');
  if (!container.classList.contains('aspect-video')) container.classList.add('aspect-video');
  if (!container.classList.contains('max-h-80')) container.classList.add('max-h-80');
  if (!container.classList.contains('w-full')) container.classList.add('w-full');

  placeholder.classList.remove('hidden');
  imgEl.classList.add('hidden');
  imgEl.src = '';
  videoEl.classList.add('hidden');
  videoEl.pause();
  videoEl.src = '';
  iframeEl.classList.add('hidden');
  iframeEl.src = '';
  iframeEl.style.position = '';
  iframeEl.style.top = '';
  iframeEl.style.left = '';
  iframeEl.style.transform = '';
  iframeEl.style.width = '';
  iframeEl.style.height = '';
  iframeEl.style.clipPath = '';
  iframeEl.style.webkitClipPath = '';
  iframeEl.removeAttribute('scrolling');

  if (!trimmed) return;

  // 1. YouTube Link (videos, shorts, embed)
  const ytMatch = trimmed.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (ytMatch && ytMatch[1]) {
    placeholder.classList.add('hidden');
    iframeEl.style.position = 'relative';
    iframeEl.style.width = '100%';
    iframeEl.style.height = '100%';
    iframeEl.src = `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?rel=0&modestbranding=1`;
    iframeEl.classList.remove('hidden');

    // Auto-populate thumbnail into poster field if empty
    const posterInput = document.getElementById('modalBlogPoster');
    if (posterInput && !posterInput.value.trim()) {
      posterInput.value = `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
    }
    return;
  }

  // 2. Facebook Video / Reels / Watch
  if (trimmed.includes('facebook.com') || trimmed.includes('fb.watch')) {
    placeholder.classList.add('hidden');
    iframeEl.style.position = 'relative';
    iframeEl.style.width = '100%';
    iframeEl.style.height = '100%';
    iframeEl.src = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(trimmed)}&show_text=0&autoplay=0`;
    iframeEl.classList.remove('hidden');
    return;
  }

  // 3. Instagram Reel / Post / Video (Clean Video Only - White footer with likes/more clipped completely)
  const igMatch = trimmed.match(/(?:instagram\.com|instagr\.am)\/(?:[^/]+\/)?(?:reel|reels|p|tv|share\/[rp])\/([a-zA-Z0-9_-]+)/i)
               || trimmed.match(/(?:reel|reels|p|tv)\/([a-zA-Z0-9_-]+)/i);
  if ((igMatch && igMatch[1]) || trimmed.includes('instagram.com') || trimmed.includes('instagr.am')) {
    const embedUrl = (igMatch && igMatch[1])
      ? `https://www.instagram.com/reel/${igMatch[1]}/embed/`
      : `${trimmed.split('?')[0].replace(/\/+$/, '')}/embed/`;

    placeholder.classList.add('hidden');
    iframeEl.setAttribute('scrolling', 'no');
    iframeEl.style.position = 'absolute';
    iframeEl.style.top = '-62px';
    iframeEl.style.left = '0';
    iframeEl.style.transform = '';
    iframeEl.style.width = '100%';
    iframeEl.style.maxWidth = '100%';
    iframeEl.style.height = 'calc(100% + 160px)';
    iframeEl.style.clipPath = 'inset(0 0 130px 0)';
    iframeEl.style.webkitClipPath = 'inset(0 0 130px 0)';
    iframeEl.src = embedUrl;
    iframeEl.classList.remove('hidden');
    return;
  }

  // 4. TikTok Video (Player v1 endpoint, centered in uniform player)
  const ttIdMatch = trimmed.match(/(?:video\/|v\/|player\/v1\/|embed\/v2\/)(\d+)/i) || trimmed.match(/\/(\d{15,22})/);
  if ((ttIdMatch && ttIdMatch[1]) || trimmed.includes('tiktok.com')) {
    const embedUrl = (ttIdMatch && ttIdMatch[1])
      ? `https://www.tiktok.com/player/v1/${ttIdMatch[1]}?autoplay=0`
      : `https://www.tiktok.com/embed?url=${encodeURIComponent(trimmed)}`;

    placeholder.classList.add('hidden');
    iframeEl.style.position = 'absolute';
    iframeEl.style.top = '0';
    iframeEl.style.left = '50%';
    iframeEl.style.transform = 'translateX(-50%)';
    iframeEl.style.width = '320px';
    iframeEl.style.maxWidth = '100%';
    iframeEl.style.height = '100%';
    iframeEl.src = embedUrl;
    iframeEl.classList.remove('hidden');
    return;
  }

  // 5. Vimeo Link
  const vimeoMatch = trimmed.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|album\/(?:\d+)\/video\/|video\/|)(\d+)/i);
  if (vimeoMatch && vimeoMatch[1]) {
    placeholder.classList.add('hidden');
    iframeEl.style.position = 'relative';
    iframeEl.style.width = '100%';
    iframeEl.style.height = '100%';
    iframeEl.src = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    iframeEl.classList.remove('hidden');
    return;
  }

  // 6. Direct HTML5 Video (.mp4, .webm, .mov, data:video/)
  if (/\.(mp4|webm|mov|ogg|ogv)(\?.*)?$/i.test(trimmed) || trimmed.startsWith('data:video/')) {
    placeholder.classList.add('hidden');
    const posterVal = document.getElementById('modalBlogPoster')?.value.trim();
    if (posterVal) videoEl.poster = posterVal;
    videoEl.src = trimmed;
    videoEl.classList.remove('hidden');
    return;
  }

  // 7. Default to Image (.jpg, .png, .webp, .svg, or generic URL)
  placeholder.classList.add('hidden');
  imgEl.src = trimmed;
  imgEl.classList.remove('hidden');
}

function captureVideoThumbnail(fileOrBlob) {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      const blobUrl = URL.createObjectURL(fileOrBlob);
      video.src = blobUrl;

      let isResolved = false;
      const finish = (result) => {
        if (isResolved) return;
        isResolved = true;
        try { URL.revokeObjectURL(blobUrl); } catch (e) {}
        resolve(result);
      };

      video.onloadeddata = () => {
        const seekTime = Math.min(1.0, Math.max(0.1, (video.duration || 1) * 0.15));
        video.currentTime = seekTime;
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          finish(dataUrl);
        } catch (e) {
          finish(null);
        }
      };

      video.onerror = () => finish(null);
      setTimeout(() => finish(null), 4000);
    } catch (e) {
      resolve(null);
    }
  });
}

async function handleBlogMediaUpload(input, type) {
  const file = input.files && input.files[0];
  if (!file) return;

  if (file.size > 80 * 1024 * 1024) {
    showToast('File is too large. Maximum allowed size is 80MB.', 'error');
    return;
  }

  showToast(`Processing and uploading ${type}...`, 'info');

  // Auto-capture video thumbnail directly from video frame!
  if (type === 'video') {
    captureVideoThumbnail(file).then(async (thumbDataUrl) => {
      if (thumbDataUrl) {
        try {
          const thumbResp = await postAdminMutation('/api/admin/upload-image', {
            data: thumbDataUrl,
            prefix: 'blog-cover'
          });
          if (thumbResp && thumbResp.success && thumbResp.url) {
            const posterInput = document.getElementById('modalBlogPoster');
            if (posterInput) {
              posterInput.value = thumbResp.url;
              const videoEl = document.getElementById('modalBlogVideoPreview');
              if (videoEl) videoEl.poster = thumbResp.url;
              showToast('✓ Video feature image captured automatically!', 'success');
            }
          }
        } catch (e) {
          console.warn('Auto video thumb capture warning:', e);
        }
      }
    });
  }

  const reader = new FileReader();
  reader.onload = async function(e) {
    const dataUrl = e.target.result;
    renderBlogMediaPreview(dataUrl);

    try {
      const resp = await postAdminMutation('/api/admin/upload-image', {
        data: dataUrl,
        prefix: type === 'video' ? 'blog-video' : 'blog-image'
      });

      if (resp && resp.success && resp.url) {
        document.getElementById('modalBlogImage').value = resp.url;
        renderBlogMediaPreview(resp.url);
        showToast(`✓ ${type === 'video' ? 'Video' : 'Image'} uploaded successfully!`);
      } else {
        showToast(resp?.error || `Failed to upload ${type}.`, 'error');
      }
    } catch (err) {
      showToast(`Upload error: ${err.message}`, 'error');
    }
  };
  reader.readAsDataURL(file);
}

async function handleBlogPosterUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  if (file.size > 15 * 1024 * 1024) {
    showToast('Cover image is too large. Maximum size is 15MB.', 'error');
    return;
  }

  showToast('Uploading custom video thumbnail...', 'info');

  const reader = new FileReader();
  reader.onload = async function(e) {
    const dataUrl = e.target.result;
    try {
      const resp = await postAdminMutation('/api/admin/upload-image', {
        data: dataUrl,
        prefix: 'blog-cover'
      });

      if (resp && resp.success && resp.url) {
        const posterEl = document.getElementById('modalBlogPoster');
        if (posterEl) posterEl.value = resp.url;
        showToast('✓ Custom video thumbnail uploaded successfully!');
      } else {
        showToast(resp?.error || 'Failed to upload thumbnail.', 'error');
      }
    } catch (err) {
      showToast(`Upload error: ${err.message}`, 'error');
    }
  };
  reader.readAsDataURL(file);
}

function openBlogModal(blogId) {
  const modal = document.getElementById('blogModal');
  const title = document.getElementById('blogModalTitle');
  if (!modal) return;

  populateAiBlogCarDropdown();

  const blogs = adminState.blogs || [];
  const b = blogId ? blogs.find(x => x.id === blogId) : null;

  const topicInput = document.getElementById('aiBlogTopicInput');
  if (topicInput) topicInput.value = b ? b.title : '';

  const carSelect = document.getElementById('aiBlogCarSelect');
  if (carSelect) carSelect.value = '';

  const dropdown = document.getElementById('aiBlogSuggestionsDropdown');
  if (dropdown) dropdown.classList.add('hidden');

  document.getElementById('modalBlogId').value = b ? b.id : '';
  document.getElementById('modalBlogTitle').value = b ? b.title : '';
  const slugInput = document.getElementById('modalBlogSlug');
  if (slugInput) {
    slugInput.value = b ? (b.slug || '') : '';
    slugInput.dataset.custom = (b && b.slug) ? 'true' : '';
    if (!slugInput.value && b && b.title) {
      autoGenerateBlogSlug(b.title, true);
    }
  }
  document.getElementById('modalBlogCategory').value = b ? b.category : '';
  document.getElementById('modalBlogReadTime').value = b ? b.readTime : '5 min read';
  document.getElementById('modalBlogAuthor').value = b ? (b.author || 'Car4Rent Editorial Team') : 'Car4Rent Editorial Team';
  
  // NEVER pre-select image for new article!
  const mediaUrl = b ? (b.image || '') : '';
  document.getElementById('modalBlogImage').value = mediaUrl;
  const posterInput = document.getElementById('modalBlogPoster');
  if (posterInput) posterInput.value = b ? (b.poster || '') : '';
  renderBlogMediaPreview(mediaUrl);

  document.getElementById('modalBlogExcerpt').value = b ? (b.excerpt || '') : '';
  document.getElementById('modalBlogContent').value = b ? (b.content || '') : '';
  document.getElementById('modalBlogMetaTitle').value = b ? (b.metaTitle || '') : '';
  document.getElementById('modalBlogMetaDesc').value = b ? (b.metaDescription || '') : '';
  document.getElementById('modalBlogPublished').checked = b ? b.published !== false : true;
  document.getElementById('modalBlogFeatured').checked = b ? !!b.featured : false;

  if (title) {
    title.textContent = b ? 'Edit Article' : 'Write New Article';
  }

  modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeBlogModal() {
  const modal = document.getElementById('blogModal');
  if (modal) modal.classList.add('hidden');
}

async function handleSaveBlog(e) {
  e.preventDefault();
  const id = document.getElementById('modalBlogId').value.trim();
  const title = document.getElementById('modalBlogTitle').value.trim();
  let slug = document.getElementById('modalBlogSlug').value.trim();
  const category = document.getElementById('modalBlogCategory').value.trim();
  const readTime = document.getElementById('modalBlogReadTime').value.trim();
  const author = document.getElementById('modalBlogAuthor').value.trim();
  const image = document.getElementById('modalBlogImage').value.trim();
  const poster = document.getElementById('modalBlogPoster')?.value.trim() || undefined;
  const excerpt = document.getElementById('modalBlogExcerpt').value.trim();
  const content = document.getElementById('modalBlogContent').value.trim();
  const metaTitle = document.getElementById('modalBlogMetaTitle').value.trim();
  const metaDescription = document.getElementById('modalBlogMetaDesc').value.trim();
  const published = document.getElementById('modalBlogPublished').checked;
  const featured = document.getElementById('modalBlogFeatured').checked;

  if (!title) {
    showToast('Article title is required.', 'warning');
    return;
  }

  if (!slug) {
    slug = (title || 'article-' + Date.now()).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || ('article-' + Date.now());
    const slugInput = document.getElementById('modalBlogSlug');
    if (slugInput) slugInput.value = slug;
  }

  const blogPayload = {
    id: id || undefined,
    title,
    slug,
    category: category || 'Rental Guides',
    readTime: readTime || '5 min read',
    author: author || 'Car4Rent Team',
    date: new Date().toISOString().split('T')[0],
    image: image || '/uploads/seo-car-1789727514573.jpg',
    poster,
    excerpt,
    content,
    metaTitle: metaTitle || title,
    metaDescription: metaDescription || excerpt,
    metaKeywords: `${category}, rent a car karachi, car rental guide, ${title.toLowerCase()}`,
    tags: [category, 'Karachi', 'Car Rental'],
    published,
    featured
  };

  const action = id ? 'edit' : 'add';
  const res = await postAdminMutation('/api/admin/blogs', { action, blog: blogPayload });
  if (res && res.success) {
    adminState.blogs = res.blogs;
    if (typeof getLocalDB === 'function' && typeof saveLocalDB === 'function') {
      const local = getLocalDB();
      local.blogs = res.blogs;
      saveLocalDB(local);
    }
    renderBlogsTab();
    closeBlogModal();
    showToast(`Article "${title}" saved successfully!`);
  }
}

async function toggleBlogStatus(blogId) {
  const res = await postAdminMutation('/api/admin/blogs', { action: 'toggle', blog: { id: blogId } });
  if (res && res.success) {
    adminState.blogs = res.blogs;
    renderBlogsTab();
    showToast('Article visibility toggled.');
  }
}

async function deleteBlog(blogId) {
  if (!confirm('Are you sure you want to permanently delete this blog article?')) return;
  const res = await postAdminMutation('/api/admin/blogs', { action: 'delete', blog: { id: blogId } });
  if (res && res.success) {
    adminState.blogs = res.blogs;
    renderBlogsTab();
    showToast('Article deleted successfully.');
  }
}

// ==============================================
// 15. USER ROLE & PAGE PERMISSIONS MATRIX (DYNAMIC)
// ==============================================

let currentEditingPermUserId = null;

// Registry of known sections + dynamic discovery for ANY future tab
function getAllAdminSections() {
  const standardSections = {
    fleet: { name: 'Cars Fleet Inventory', icon: 'car', category: 'Fleet Operations' },
    categories: { name: 'Vehicle Categories', icon: 'folder', category: 'Fleet Operations' },
    brands: { name: 'Automobile Brands', icon: 'tag', category: 'Fleet Operations' },
    quotes: { name: 'Client Quotations & Leads', icon: 'file-text', category: 'Sales & Inquiries' },
    blogs: { name: 'Blog & Rental Guides', icon: 'newspaper', category: 'Marketing & Content' },
    seo: { name: 'Karachi SEO & Landing Hub', icon: 'target', category: 'Marketing & Content' },
    reviews: { name: 'Client Reviews & Ratings', icon: 'star', category: 'Marketing & Content' },
    content: { name: 'Typography & Content Engine', icon: 'type', category: 'Site Settings' },
    offerEmergency: { name: 'Offer & Emergency Hotline', icon: 'bell', category: 'Site Settings' },
    brandingFooter: { name: 'Logo, Branding & Footer', icon: 'award', category: 'Site Settings' },
    menus: { name: 'Navigation Menus', icon: 'menu', category: 'Site Settings' },
    calculator: { name: 'Calculator & Estimation Config', icon: 'calculator', category: 'Fleet Operations' },
    users: { name: 'Admin Users & Roles', icon: 'users', category: 'Security & Access' },
    license: { name: 'Domain License & Security', icon: 'shield', category: 'Security & Access' }
  };

  const discovered = {};

  // 1. Scan DOM for any element with id^="tabContent-"
  const panes = document.querySelectorAll('.tab-pane[id^="tabContent-"]');
  panes.forEach(pane => {
    const key = pane.id.replace('tabContent-', '');
    if (!key) return;

    if (standardSections[key]) {
      discovered[key] = { key, ...standardSections[key] };
    } else {
      // Dynamic: a new page was added!
      const btn = document.querySelector(`button[onclick*="switchTab('${key}')"]`) || document.getElementById(`tabBtn-${key}`);
      let label = btn ? btn.textContent.trim().replace(/\s+/g, ' ') : '';
      if (!label) {
        label = key.charAt(0).toUpperCase() + key.slice(1) + ' Page';
      }
      discovered[key] = {
        key,
        name: label,
        icon: 'layout',
        category: 'Custom / New Pages'
      };
    }
  });

  // Ensure all standard ones are included as fallback
  Object.keys(standardSections).forEach(k => {
    if (!discovered[k]) {
      discovered[k] = { key: k, ...standardSections[k] };
    }
  });

  return discovered;
}

function updateHeaderCheckboxesState() {
  const allSections = getAllAdminSections();
  const keys = Object.keys(allSections);
  if (keys.length === 0) return;

  let allViews = true, someViews = false;
  let allEdits = true, someEdits = false;
  let allDels = true, someDels = false;

  keys.forEach(k => {
    const v = document.getElementById(`perm_view_${k}`)?.checked;
    const e = document.getElementById(`perm_edit_${k}`)?.checked;
    const d = document.getElementById(`perm_delete_${k}`)?.checked;

    if (v) someViews = true; else allViews = false;
    if (e) someEdits = true; else allEdits = false;
    if (d) someDels = true; else allDels = false;
  });

  const masterView = document.getElementById('permColumnViewAll');
  if (masterView) {
    masterView.checked = allViews;
    masterView.indeterminate = someViews && !allViews;
  }

  const masterEdit = document.getElementById('permColumnEditAll');
  if (masterEdit) {
    masterEdit.checked = allEdits;
    masterEdit.indeterminate = someEdits && !allEdits;
  }

  const masterDel = document.getElementById('permColumnDeleteAll');
  if (masterDel) {
    masterDel.checked = allDels;
    masterDel.indeterminate = someDels && !allDels;
  }

  const masterAll = document.getElementById('permMasterSelectAll');
  if (masterAll) {
    const isAllChecked = allViews && allEdits && allDels;
    const isSomeChecked = someViews || someEdits || someDels;
    masterAll.checked = isAllChecked;
    masterAll.indeterminate = isSomeChecked && !isAllChecked;
  }
}

function toggleColumnPermissions(colType, isChecked) {
  const allSections = getAllAdminSections();
  Object.keys(allSections).forEach(secKey => {
    const view = document.getElementById(`perm_view_${secKey}`);
    const edit = document.getElementById(`perm_edit_${secKey}`);
    const del = document.getElementById(`perm_delete_${secKey}`);

    if (colType === 'view') {
      if (view) view.checked = isChecked;
      onPermViewChange(secKey, isChecked);
    } else if (colType === 'edit') {
      if (isChecked && view && !view.checked) {
        view.checked = true;
        onPermViewChange(secKey, true);
      }
      if (edit && !edit.disabled) edit.checked = isChecked;
    } else if (colType === 'delete') {
      if (isChecked && view && !view.checked) {
        view.checked = true;
        onPermViewChange(secKey, true);
      }
      if (del && !del.disabled) del.checked = isChecked;
    }
  });
  updateHeaderCheckboxesState();
}

function toggleMasterSelectAll(isChecked) {
  const allSections = getAllAdminSections();
  Object.keys(allSections).forEach(secKey => {
    const view = document.getElementById(`perm_view_${secKey}`);
    const edit = document.getElementById(`perm_edit_${secKey}`);
    const del = document.getElementById(`perm_delete_${secKey}`);

    if (view) view.checked = isChecked;
    onPermViewChange(secKey, isChecked);
    if (edit && !edit.disabled) edit.checked = isChecked;
    if (del && !del.disabled) del.checked = isChecked;
  });
  updateHeaderCheckboxesState();
}

function openUserPermissionsModal(userId) {
  let users = adminState.users || [];
  let u = users.find(x => x.id === userId);
  if (!u) {
    const local = getLocalDB();
    if (local && local.users) {
      adminState.users = local.users;
      u = local.users.find(x => x.id === userId);
    }
  }
  if (!u) {
    showToast('User not found!', 'error');
    return;
  }
  if (u && (!u.permissions || Object.keys(u.permissions).length === 0)) {
    const local = getLocalDB();
    const localUser = local?.users?.find(x => x.id === userId);
    if (localUser && localUser.permissions && Object.keys(localUser.permissions).length > 0) {
      u.permissions = localUser.permissions;
    }
  }

  currentEditingPermUserId = userId;
  const isSuper = u.role === 'Super Admin';

  // Hide in-modal feedback alert
  const alertContainer = document.getElementById('permSaveAlert');
  if (alertContainer) {
    alertContainer.className = 'hidden';
    alertContainer.innerHTML = '';
  }

  // Fill Header Info
  const avatarEl = document.getElementById('permUserAvatar');
  if (avatarEl) avatarEl.textContent = (u.name || u.username || 'U').charAt(0).toUpperCase();
  const nameEl = document.getElementById('permUserName');
  if (nameEl) nameEl.textContent = u.name || u.username;
  const userEl = document.getElementById('permUserUsername');
  if (userEl) userEl.textContent = `@${u.username}`;
  const roleEl = document.getElementById('permUserRole');
  if (roleEl) roleEl.textContent = `Role: ${u.role || 'Admin'}`;

  const allSections = getAllAdminSections();
  const userPerms = (u.permissions && typeof u.permissions === 'object') ? u.permissions : {};
  const tbody = document.getElementById('permissionsTableBody');
  const hasSavedPerms = Object.keys(userPerms).length > 0;

  if (tbody) {
    tbody.innerHTML = Object.keys(allSections).map(secKey => {
      const sec = allSections[secKey];
      // If user has saved custom permissions, ALWAYS prioritize saved settings.
      // Otherwise default fallback: Super Admin gets full access, standard user gets view only.
      const secPerm = (hasSavedPerms && userPerms[secKey] !== undefined)
        ? userPerms[secKey]
        : (isSuper ? { view: true, edit: true, delete: true } : { view: true, edit: false, delete: false });

      const canView = secPerm.view === true;
      const canEdit = canView && secPerm.edit === true;
      const canDelete = canView && secPerm.delete === true;

      return `
        <tr class="hover:bg-white/5 transition-colors border-b border-white/5" id="permRow_${secKey}">
          <td class="px-5 py-3.5">
            <div class="flex items-center gap-3">
              <span class="p-1.5 rounded-lg bg-white/5 text-purple-400 border border-white/10 shrink-0">
                <i data-lucide="${sec.icon || 'layout'}" class="w-4 h-4"></i>
              </span>
              <div>
                <span class="font-bold text-white block text-xs sm:text-sm">${escapeHtml(sec.name)}</span>
                <span class="text-[10px] font-mono text-zinc-500">ID: ${secKey} • ${sec.category || 'General'}</span>
              </div>
            </div>
          </td>
          <!-- View Checkbox -->
          <td class="px-4 py-3.5 text-center">
            <label class="inline-flex items-center justify-center cursor-pointer p-1">
              <input 
                type="checkbox" 
                id="perm_view_${secKey}" 
                ${canView ? 'checked' : ''} 
                onchange="onPermViewChange('${secKey}', this.checked)"
                class="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 bg-zinc-800 border-zinc-600 cursor-pointer">
            </label>
          </td>
          <!-- Edit Checkbox -->
          <td class="px-4 py-3.5 text-center">
            <label class="inline-flex items-center justify-center cursor-pointer p-1">
              <input 
                type="checkbox" 
                id="perm_edit_${secKey}" 
                ${canEdit ? 'checked' : ''} 
                ${!canView ? 'disabled' : ''}
                onchange="updateHeaderCheckboxesState()"
                class="w-4 h-4 rounded text-blue-500 focus:ring-blue-400 bg-zinc-800 border-zinc-600 cursor-pointer disabled:opacity-30">
            </label>
          </td>
          <!-- Delete Checkbox -->
          <td class="px-4 py-3.5 text-center">
            <label class="inline-flex items-center justify-center cursor-pointer p-1">
              <input 
                type="checkbox" 
                id="perm_delete_${secKey}" 
                ${canDelete ? 'checked' : ''} 
                ${!canView ? 'disabled' : ''}
                onchange="updateHeaderCheckboxesState()"
                class="w-4 h-4 rounded text-rose-500 focus:ring-rose-400 bg-zinc-800 border-zinc-600 cursor-pointer disabled:opacity-30">
            </label>
          </td>
          <!-- Row Quick Toggle -->
          <td class="px-4 py-3.5 text-right">
            <button 
              type="button" 
              onclick="togglePermRow('${secKey}')" 
              class="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors" 
              title="Toggle all 3 for ${sec.name}">
              Toggle Row
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  updateHeaderCheckboxesState();

  const modal = document.getElementById('userPermissionsModal');
  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeUserPermissionsModal() {
  const modal = document.getElementById('userPermissionsModal');
  if (modal) modal.classList.add('hidden');
  currentEditingPermUserId = null;
}

function onPermViewChange(secKey, isChecked) {
  const editBox = document.getElementById(`perm_edit_${secKey}`);
  const delBox = document.getElementById(`perm_delete_${secKey}`);
  if (editBox) {
    if (!isChecked) {
      editBox.checked = false;
      editBox.disabled = true;
    } else {
      editBox.disabled = false;
    }
  }
  if (delBox) {
    if (!isChecked) {
      delBox.checked = false;
      delBox.disabled = true;
    } else {
      delBox.disabled = false;
    }
  }
  updateHeaderCheckboxesState();
}

function togglePermRow(secKey) {
  const view = document.getElementById(`perm_view_${secKey}`);
  const edit = document.getElementById(`perm_edit_${secKey}`);
  const del = document.getElementById(`perm_delete_${secKey}`);
  if (!view) return;

  const anyUnchecked = !view.checked || !edit?.checked || !del?.checked;
  view.checked = anyUnchecked;
  onPermViewChange(secKey, anyUnchecked);
  if (edit && !edit.disabled) edit.checked = anyUnchecked;
  if (del && !del.disabled) del.checked = anyUnchecked;
  updateHeaderCheckboxesState();
}

function bulkSetPermissions(mode) {
  const allSections = getAllAdminSections();
  Object.keys(allSections).forEach(secKey => {
    const view = document.getElementById(`perm_view_${secKey}`);
    const edit = document.getElementById(`perm_edit_${secKey}`);
    const del = document.getElementById(`perm_delete_${secKey}`);

    if (mode === 'all') {
      if (view) view.checked = true;
      onPermViewChange(secKey, true);
      if (edit) edit.checked = true;
      if (del) del.checked = true;
    } else if (mode === 'view_only') {
      if (view) view.checked = true;
      onPermViewChange(secKey, true);
      if (edit) edit.checked = false;
      if (del) del.checked = false;
    } else if (mode === 'clear') {
      if (view) view.checked = false;
      onPermViewChange(secKey, false);
      if (edit) edit.checked = false;
      if (del) del.checked = false;
    }
  });
  updateHeaderCheckboxesState();
}

async function saveUserPermissions() {
  if (!currentEditingPermUserId) return;
  let users = adminState.users || [];
  let u = users.find(x => x.id === currentEditingPermUserId);
  if (!u) {
    const local = getLocalDB();
    if (local && local.users) {
      adminState.users = local.users;
      u = local.users.find(x => x.id === currentEditingPermUserId);
    }
  }
  if (!u) return;

  const btn = document.getElementById('btnSavePermissions');
  const alertContainer = document.getElementById('permSaveAlert');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="inline-block animate-spin mr-1">⟳</span> Saving...';
  }

  const allSections = getAllAdminSections();
  const permissions = {};

  Object.keys(allSections).forEach(secKey => {
    const view = document.getElementById(`perm_view_${secKey}`)?.checked || false;
    const edit = document.getElementById(`perm_edit_${secKey}`)?.checked || false;
    const del = document.getElementById(`perm_delete_${secKey}`)?.checked || false;
    permissions[secKey] = { view, edit, delete: del };
  });

  // 1. Immediately update in local state & localStorage
  u.permissions = permissions;
  saveLocalDB(adminState);

  // 2. Sync to server: Use action 'edit' which has ALWAYS existed in server.js
  let resp = await postAdminMutation('/api/admin/users', {
    action: 'edit',
    user: {
      id: currentEditingPermUserId,
      name: u.name,
      username: u.username,
      role: u.role,
      permissions: permissions
    }
  });

  // Fallback to update_permissions if edit fails or doesn't return users
  if (!resp || !resp.users) {
    resp = await postAdminMutation('/api/admin/users', {
      action: 'update_permissions',
      user: { id: currentEditingPermUserId, permissions }
    });
  }

  // 3. Ensure local permissions are NEVER overwritten with empty data
  if (resp && resp.users) {
    resp.users.forEach(su => {
      if (su.id === currentEditingPermUserId) {
        su.permissions = permissions;
      }
    });
    adminState.users = resp.users;
    saveLocalDB(adminState);
  }

  // 4. Update UI button state & in-modal visual feedback
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="check" class="w-4 h-4 text-emerald-400"></i> Saved!';
    setTimeout(() => {
      if (btn) btn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Save Permissions';
      if (window.lucide) lucide.createIcons();
    }, 2500);
  }

  // Show prominent confirmation alert right in the modal
  if (alertContainer) {
    const allowedCount = Object.keys(permissions).filter(k => permissions[k].view).length;
    alertContainer.className = 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-4 py-3 rounded-2xl flex items-center justify-between text-xs font-semibold mb-4 transition-all shadow-lg shadow-emerald-950/40';
    alertContainer.innerHTML = `
      <div class="flex items-center gap-2.5">
        <span class="p-1 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
          <i data-lucide="check-circle" class="w-4 h-4"></i>
        </span>
        <div>
          <div class="font-bold text-white text-xs">✓ Permissions Saved Successfully!</div>
          <div class="text-[11px] text-emerald-300 font-normal mt-0.5">Active access set for <b>${allowedCount} Pages</b> for @${escapeHtml(u.username)}. Settings locked.</div>
        </div>
      </div>
      <button type="button" onclick="this.parentElement.classList.add('hidden')" class="text-zinc-400 hover:text-white p-1">✕</button>
    `;
    alertContainer.classList.remove('hidden');
  }

  renderUsersTable();
  applyCurrentUserPermissions();
  showToast(`✓ Permissions successfully updated for ${u.username}!`, 'success');
  if (window.lucide) lucide.createIcons();
}

function getCurrentUserTabPermission(tabId) {
  const current = getAdminCurrentUser();
  if (!current) return { canView: true, canEdit: true, canDelete: true };

  const dbUser = (adminState.users || []).find(u => u.id === current.id || u.username === current.username);
  const perms = dbUser?.permissions || current.permissions;
  
  // If no custom permissions saved at all
  if (!perms || Object.keys(perms).length === 0) {
    if (current.role === 'Super Admin') return { canView: true, canEdit: true, canDelete: true };
    return { canView: true, canEdit: false, canDelete: false };
  }

  const p = perms[tabId];
  if (!p) {
    if (current.role === 'Super Admin') return { canView: true, canEdit: true, canDelete: true };
    return { canView: true, canEdit: false, canDelete: false };
  }

  return {
    canView: p.view !== false,
    canEdit: p.view !== false && p.edit === true,
    canDelete: p.view !== false && p.delete === true
  };
}

function applyCurrentUserPermissions() {
  const current = getAdminCurrentUser();
  if (!current) return;

  const dbUser = (adminState.users || []).find(u => u.id === current.id || u.username === current.username);
  const perms = dbUser?.permissions || current.permissions;

  // Commercial Proposal & Pricing Button: Strictly restricted to Master Super Admin ('super_admin' / user-1) only
  const proposalBtn = document.getElementById('btnClientProposal');
  if (proposalBtn) {
    const isMasterAdmin = current && (current.username === 'super_admin' || current.id === 'user-1');
    if (isMasterAdmin) {
      proposalBtn.classList.remove('hidden');
      proposalBtn.style.display = 'inline-flex';
    } else {
      proposalBtn.classList.add('hidden');
      proposalBtn.style.display = 'none';
    }
  }

  // If no custom permissions and is Super Admin, keep all tabs visible
  if ((!perms || Object.keys(perms).length === 0) && current.role === 'Super Admin') {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.style.display = '');
    return;
  }

  const allSections = getAllAdminSections();
  let firstAllowedTab = null;

  Object.keys(allSections).forEach(secKey => {
    const btn = document.getElementById(`tabBtn-${secKey}`);
    const secPerm = perms ? perms[secKey] : null;
    const canView = secPerm !== undefined ? (secPerm.view === true) : (current.role === 'Super Admin');

    if (btn) {
      if (!canView) {
        btn.style.display = 'none';
      } else {
        btn.style.display = '';
        if (!firstAllowedTab) firstAllowedTab = secKey;
      }
    }
  });

  // Check currently active tab
  const activePane = document.querySelector('.tab-pane:not(.hidden)');
  if (activePane) {
    const activeKey = activePane.id.replace('tabContent-', '');
    const tabPerm = getCurrentUserTabPermission(activeKey);
    if (!tabPerm.canView && firstAllowedTab) {
      switchTab(firstAllowedTab);
    }
  }
}

function applyTabActionRestrictions(tabId) {
  const perm = getCurrentUserTabPermission(tabId);
  const pane = document.getElementById(`tabContent-${tabId}`);
  if (!pane) return;

  // Edit restriction: hide add/save buttons if not permitted
  if (!perm.canEdit) {
    pane.querySelectorAll('button[type="submit"], button[onclick*="open"], button[onclick*="save"], button[onclick*="handleSave"]').forEach(b => {
      const txt = b.textContent.toLowerCase();
      if (!txt.includes('cancel') && !txt.includes('close')) {
        b.dataset.permHidden = 'true';
        b.style.display = 'none';
      }
    });
  } else {
    pane.querySelectorAll('[data-perm-hidden="true"]').forEach(b => {
      b.style.display = '';
      delete b.dataset.permHidden;
    });
  }

  // Delete restriction: hide delete buttons if not permitted
  if (!perm.canDelete) {
    pane.querySelectorAll('button[onclick*="delete"], button[onclick*="clear"]').forEach(b => {
      b.dataset.permDeleteHidden = 'true';
      b.style.display = 'none';
    });
  } else {
    pane.querySelectorAll('[data-perm-delete-hidden="true"]').forEach(b => {
      b.style.display = '';
      delete b.dataset.permDeleteHidden;
    });
  }
}


