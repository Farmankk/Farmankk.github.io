// Car4Rent Pakistan - Main App Logic (PKR Currency & Dynamic Admin Data)

let appState = {
  settings: {},
  categories: [],
  brands: [],
  cars: [],
  reviews: []
};

let activeCategory = 'all';
let appliedDiscountPercent = 0;
let appliedPromoCode = '';
let activeDurationSlotDays = 3;

function fixImagePath(path) {
  if (!path) return '';
  if (path.startsWith('data:')) return path;
  let p = path.replace(/https?:\/\/car4rent\.com\.pk\/?/g, './');
  if (p.startsWith('/uploads/')) {
    p = '.' + p;
  } else if (p.startsWith('uploads/')) {
    p = './' + p;
  }
  p = p.replace('/logo.jpg', '/logo.webp').replace(/seo-car-1789727514573\.jpg/g, 'seo-car-1789727514573.webp');
  return p;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => loadAndRenderSite());
} else {
  loadAndRenderSite();
}

function renderAllSiteSections() {
  const safeRun = (fn, name) => {
    try {
      fn();
    } catch (err) {
      console.error(`Error executing ${name}:`, err);
    }
  };

  const runIdle = (fn, name) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => safeRun(fn, name), { timeout: 1000 });
    } else {
      setTimeout(() => safeRun(fn, name), 16);
    }
  };

  // Critical Above-the-Fold (Immediate Synchronous)
  safeRun(renderEmergencyAndOffer, 'renderEmergencyAndOffer');
  safeRun(renderBranding, 'renderBranding');
  safeRun(renderTypography, 'renderTypography');
  safeRun(renderSiteContent, 'renderSiteContent');
  safeRun(renderNavMenus, 'renderNavMenus');
  safeRun(renderBrandsTicker, 'renderBrandsTicker');
  safeRun(renderCategoryTabs, 'renderCategoryTabs');
  safeRun(renderFleet, 'renderFleet');
  safeRun(populateCarDropdown, 'populateCarDropdown');
  safeRun(initCalculator, 'initCalculator');
  safeRun(renderServicesSection, 'renderServicesSection');
  safeRun(renderWhyChooseUsSection, 'renderWhyChooseUsSection');

  if (window.lucide) {
    lucide.createIcons();
  }

  // Non-Critical Below-the-Fold (Deferred for 0ms TBT)
  runIdle(renderSeoHeroContent, 'renderSeoHeroContent');
  runIdle(renderKarachiServices, 'renderKarachiServices');
  runIdle(renderKarachiAreas, 'renderKarachiAreas');
  runIdle(renderHomepageFaqs, 'renderHomepageFaqs');
  runIdle(renderReviews, 'renderReviews');
  runIdle(renderFooter, 'renderFooter');
  runIdle(setupConversionTracking, 'setupConversionTracking');
  runIdle(() => { if (window.lucide) lucide.createIcons(); }, 'lucideDeferred');
}

// Load public data with instant synchronous hydration + background refresh
async function loadAndRenderSite() {
  // Auto-migrate localStorage if it contains old root paths or broken domain
  try {
    let raw = localStorage.getItem('dream_drive_db');
    if (raw && (raw.includes('"/uploads/') || raw.includes('car4rent.com.pk') || raw.includes('logo.jpg'))) {
      raw = raw.replace(/"\/uploads\//g, '"./uploads/')
               .replace(/https?:\/\/car4rent\.com\.pk\/uploads\//g, './uploads/')
               .replace(/logo\.jpg/g, 'logo.webp')
               .replace(/seo-car-1789727514573\.jpg/g, 'seo-car-1789727514573.webp');
      localStorage.setItem('dream_drive_db', raw);
    }
  } catch (e) {}

  // Step 1: INSTANT HYDRATION (0ms) from inlined server data or local cache
  if (window.__INITIAL_DATA__ && window.__INITIAL_DATA__.cars && window.__INITIAL_DATA__.cars.length > 0) {
    appState = { ...appState, ...window.__INITIAL_DATA__ };
    try {
      if (typeof saveLocalDB === 'function') {
        saveLocalDB({ ...getLocalDB(), ...window.__INITIAL_DATA__ });
      }
    } catch (e) {}
  } else {
    const local = getLocalDB();
    if (local && local.cars && local.cars.length > 0) {
      appState = { ...appState, ...local };
    }
  }

  // Render immediately so user NEVER sees blank header or empty fleet
  renderAllSiteSections();

  // Step 2: Background network fetch to keep data fresh without blocking UI
  try {
    const data = await fetchPublicData();
    if (data === null) return;
    if (data && data.cars && data.cars.length > 0) {
      if (JSON.stringify(data) !== JSON.stringify(appState)) {
        appState = data;
        renderAllSiteSections();
      }
    }
  } catch (e) {
    console.warn('Background sync check:', e);
  }
}

// 1. Emergency Hotline & Limited Offer
function renderEmergencyAndOffer() {
  const settings = appState.settings || {};
  const offer = settings.offer || {};

  // Emergency Call Link & Display
  const callLink = document.getElementById('emergencyCallLink');
  const phoneDisplay = document.getElementById('emergencyPhoneDisplay');
  const mobileCall = document.getElementById('mobileEmergencyLink');

  const phone = settings.emergencyPhone || '+92 300 5557433';
  const displayPhone = settings.emergencyDisplay || phone;

  if (callLink) callLink.href = `tel:${phone.replace(/\s+/g, '')}`;
  if (phoneDisplay) phoneDisplay.textContent = displayPhone;
  if (mobileCall) mobileCall.href = `tel:${phone.replace(/\s+/g, '')}`;

  // WhatsApp Link
  const topWa = document.getElementById('topWhatsappLink');
  const mobileWa = document.getElementById('mobileWhatsappLink');
  const waNum = settings.whatsappNumber || '923005557433';
  const waMsg = encodeURIComponent(settings.whatsappHelpText || `Hello ${settings.siteName || 'Car4Rent'}, I want to rent a car on self-drive.`);
  const waUrl = `https://wa.me/${waNum}?text=${waMsg}`;

  if (topWa) topWa.href = waUrl;
  if (mobileWa) mobileWa.href = waUrl;

  // Limited Offer Bar
  const offerContainer = document.getElementById('offerContainer');
  const offerBadge = document.getElementById('offerBadge');
  const offerText = document.getElementById('offerText');
  const offerCodeTag = document.getElementById('offerCodeTag');

  if (offer.active === false || !offer.active) {
    if (offerContainer) {
      offerContainer.classList.add('hidden');
      offerContainer.style.display = 'none';
    }
  } else {
    if (offerContainer) {
      offerContainer.classList.remove('hidden');
      offerContainer.style.display = 'flex';
    }
    if (offerBadge) offerBadge.innerHTML = `<i data-lucide="sparkles" class="w-3 h-3"></i> ${offer.badge || 'Limited Offer'}`;
    if (offerText) offerText.textContent = offer.text || 'Get 20% OFF on 3+ days rentals! Use promo code:';
    if (offerCodeTag) offerCodeTag.textContent = offer.promoCode || 'LUXURY20';
  }
}

// 2. Branding (Site Name & Logo)
function renderBranding() {
  const settings = appState.settings || {};
  const siteName = settings.siteName || 'Car4Rent';
  const tagline = settings.tagline || '';
  const logoText = (settings.logoText || '').trim();
  const rawLogoUrl = fixImagePath((settings.logoUrl || './uploads/logo.webp').trim());
  const v = settings.updated_at || (appState && appState.lastUpdated) || Date.now();
  const logoUrl = rawLogoUrl && !rawLogoUrl.startsWith('data:') && !rawLogoUrl.includes('v=')
    ? `${rawLogoUrl}${rawLogoUrl.includes('?') ? '&' : '?'}v=${v}`
    : rawLogoUrl;
  const cleanLogoUrl = fixImagePath(logoUrl);
  const mode = settings.logoDisplayMode || (rawLogoUrl ? 'logo_only' : (logoText ? 'icon_and_text' : 'text_only'));

  const fullTitle = `${siteName} | ${tagline || 'Enjoy The pleasure of self drive'}`;
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = fullTitle;
  document.title = fullTitle;

  if (cleanLogoUrl) {
    let favicon = document.getElementById('siteFavicon');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.id = 'siteFavicon';
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = cleanLogoUrl;
  }

  const navBrand = document.getElementById('navbarBrandLink');
  const footerBrand = document.getElementById('footerBrandLink');

  let navHtml = '';
  let footerHtml = '';

  if (mode === 'logo_only' && cleanLogoUrl) {
    // Mode 1: Only Logo Image (No extra text, No 'D' box!)
    navHtml = `
      <img src="${cleanLogoUrl}" alt="${siteName}" width="200" height="48" class="h-10 sm:h-12 w-auto max-w-[260px] object-contain group-hover:opacity-90 transition-opacity">
    `;
    footerHtml = `
      <img src="${cleanLogoUrl}" alt="${siteName}" width="180" height="44" class="h-9 sm:h-11 w-auto max-w-[220px] object-contain">
    `;
  } else if (mode === 'logo_and_text' && cleanLogoUrl) {
    // Mode 2: Logo Image + Text
    navHtml = `
      <img src="${cleanLogoUrl}" alt="${siteName}" width="50" height="40" class="h-9 sm:h-10 w-auto max-w-[55px] object-contain rounded-lg">
      <div class="flex flex-col">
        <span class="text-2xl font-bold font-heading tracking-tight text-black group-hover:text-zinc-700 transition-colors">${siteName}</span>
        ${tagline ? `<span class="text-[9px] uppercase tracking-widest text-zinc-400 font-bold -mt-1">${tagline}</span>` : ''}
      </div>
    `;
    footerHtml = `
      <img src="${cleanLogoUrl}" alt="${siteName}" width="45" height="32" class="h-8 w-auto max-w-[45px] object-contain rounded-lg">
      <div class="flex flex-col">
        <span class="text-2xl font-bold font-heading text-white">${siteName}</span>
        ${tagline ? `<span class="text-[9px] uppercase tracking-widest text-zinc-400 font-bold -mt-1">${tagline}</span>` : ''}
      </div>
    `;
  } else if (mode === 'icon_and_text' && logoText) {
    // Mode 3: Custom Icon Box + Text (Only if logoText is not blank)
    navHtml = `
      <div class="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-white font-black tracking-tighter shadow-md group-hover:scale-105 transition-transform">
        <span class="text-xl font-heading">${logoText}</span>
      </div>
      <div class="flex flex-col">
        <span class="text-2xl font-bold font-heading tracking-tight text-black group-hover:text-zinc-700 transition-colors">${siteName}</span>
        ${tagline ? `<span class="text-[9px] uppercase tracking-widest text-zinc-400 font-bold -mt-1">${tagline}</span>` : ''}
      </div>
    `;
    footerHtml = `
      <div class="w-9 h-9 bg-white text-black rounded-lg flex items-center justify-center font-black">
        <span class="text-lg font-heading">${logoText}</span>
      </div>
      <span class="text-2xl font-bold font-heading text-white">${siteName}</span>
    `;
  } else {
    // Mode 4: Text Only (Default) - Pure typography, NO icon box, NO 'D' box!
    navHtml = `
      <div class="flex flex-col">
        <span class="text-2xl sm:text-3xl font-bold font-heading tracking-tight text-black group-hover:text-zinc-700 transition-colors">${siteName}</span>
        ${tagline ? `<span class="text-[9px] sm:text-[10px] uppercase tracking-widest text-zinc-400 font-bold -mt-0.5">${tagline}</span>` : ''}
      </div>
    `;
    footerHtml = `
      <div class="flex flex-col">
        <span class="text-2xl font-bold font-heading text-white">${siteName}</span>
        ${tagline ? `<span class="text-[9px] uppercase tracking-widest text-zinc-400 font-bold mt-0.5">${tagline}</span>` : ''}
      </div>
    `;
  }

  if (navBrand) navBrand.innerHTML = navHtml;
  if (footerBrand) footerBrand.innerHTML = footerHtml;

  if (settings.footer) {
    const f = settings.footer;
    const aboutEl = document.getElementById('footerAboutText');
    if (aboutEl && f.aboutText) aboutEl.textContent = f.aboutText;
    const phoneEl = document.getElementById('footerEmergencyPhone');
    if (phoneEl && f.phone) phoneEl.innerHTML = `<i data-lucide="phone-call" class="w-4 h-4"></i> ${f.phone}`;
    const emailEl = document.getElementById('footerEmail');
    if (emailEl && f.email) emailEl.textContent = f.email;
    const addrEl = document.getElementById('footerAddress');
    if (addrEl && f.address) addrEl.textContent = f.address;
    const copyEl = document.getElementById('footerCopyright');
    if (copyEl && f.copyright) copyEl.innerHTML = f.copyright;
  }
}

// 2a. Dynamic Typography & Custom Fonts
function renderTypography() {
  const typo = appState.typography || {};
  const headingFont = typo.headingFont || 'Syne';
  const bodyFont = typo.bodyFont || 'Plus Jakarta Sans';
  const textTransform = typo.textTransform || 'uppercase';
  const h1Desktop = typo.h1Desktop || 42;
  const h1Mobile = typo.h1Mobile || 23;
  const h2Desktop = typo.h2Desktop || 40;
  const h2Mobile = typo.h2Mobile || 24;
  const bodyDesktop = typo.bodyDesktop || 17;
  const bodyMobile = typo.bodyMobile || 14;

  let styleTag = document.getElementById('dynamicTypographyStyles');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'dynamicTypographyStyles';
    document.head.appendChild(styleTag);
  }

  styleTag.textContent = `
    :root {
      --font-heading: '${headingFont}', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --font-body: '${bodyFont}', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --heading-transform: ${textTransform};
    }
    body, p, input, select, textarea, button, .font-body {
      font-family: var(--font-body);
      font-size: ${bodyDesktop}px;
    }
    h1, h2, h3, h4, .font-heading {
      font-family: var(--font-heading) !important;
      text-transform: var(--heading-transform) !important;
    }
    #heroH1Heading {
      font-size: ${h1Desktop}px !important;
      line-height: 1.15 !important;
      text-transform: var(--heading-transform) !important;
    }
    h2, .section-title {
      font-size: ${h2Desktop}px !important;
    }
    @media (max-width: 640px) {
      body, p, input, select, textarea, button, .font-body {
        font-size: ${bodyMobile}px;
      }
      #heroH1Heading {
        font-size: ${h1Mobile}px !important;
        line-height: 1.25 !important;
      }
      h2, .section-title {
        font-size: ${h2Mobile}px !important;
        line-height: 1.25 !important;
      }
    }
  `;
}

// 2a-2. Dynamic Site Content (About, Fleet, Stats, Hero Buttons)
function renderSiteContent() {
  // 1. Hero CTA Buttons
  const heroBtns = appState.heroButtons || {};
  const heroBtn1 = document.getElementById('heroBtn1Text');
  const heroBtn2 = document.getElementById('heroBtn2Text');
  if (heroBtn1 && heroBtns.btn1Text) heroBtn1.textContent = heroBtns.btn1Text;
  if (heroBtn2 && heroBtns.btn2Text) heroBtn2.textContent = heroBtns.btn2Text;

  // 2. About Section
  const about = appState.aboutSection || {};
  const aboutBadge = document.getElementById('aboutBadgeText');
  const aboutHeadline = document.getElementById('aboutHeadlineText');
  const aboutDesc = document.getElementById('aboutDescText');
  if (aboutBadge && about.badge) aboutBadge.textContent = about.badge;
  if (aboutHeadline && about.headline) aboutHeadline.textContent = about.headline;
  if (aboutDesc && about.description) aboutDesc.textContent = about.description;

  // 3. Fleet Section Header
  const fleet = appState.fleetSection || {};
  const fleetBadge = document.getElementById('fleetBadgeText');
  const fleetHeadline = document.getElementById('fleetHeadlineText');
  const fleetDesc = document.getElementById('fleetDescText');
  if (fleetBadge && fleet.badge) fleetBadge.textContent = fleet.badge;
  if (fleetHeadline && fleet.headline) fleetHeadline.textContent = fleet.headline;
  if (fleetDesc && fleet.description) fleetDesc.textContent = fleet.description;

  // 4. Stats Section (5 stats)
  const stats = appState.statsSection || [];
  if (Array.isArray(stats) && stats.length > 0) {
    stats.forEach((st, idx) => {
      const numEl = document.getElementById(`statNum-${idx + 1}`);
      const labelEl = document.getElementById(`statLabel-${idx + 1}`);
      if (numEl && st.num) numEl.textContent = st.num;
      if (labelEl && st.label) labelEl.textContent = st.label;
    });
  }
}

// 2b. Dynamic Navigation Menus (Add / Edit / Delete managed via Admin)
function renderNavMenus() {
  const desktopContainer = document.getElementById('desktopNavMenu');
  const mobileContainer = document.getElementById('mobileNavMenu');

  const defaultMenus = [
    { id: "menu-1", label: "Home", url: "#hero", isHighlight: false },
    { id: "menu-2", label: "About Us", url: "#about", isHighlight: false },
    { id: "menu-3", label: "Our Fleet", url: "#fleet", isHighlight: false },
    { id: "menu-4", label: "Our Services", url: "#services", isHighlight: false },
    { id: "menu-blog", label: "Rental Guides", url: "/blog", isHighlight: false },
    { id: "menu-5", label: "Brand new cars", url: "#fleet", isHighlight: false },
    { id: "menu-6", label: "Hassle free process", url: "#why-choose-us", isHighlight: false },
    { id: "menu-7", label: "Fuel efficient vehicles", url: "#fleet", isHighlight: false },
    { id: "menu-8", label: "No security deposit", url: "#calculator", isHighlight: false },
    { id: "menu-9", label: "Free home delivery", url: "#why-choose-us", isHighlight: false },
    { id: "menu-10", label: "Get Quote", url: "#calculator", isHighlight: true },
    { id: "menu-11", label: "Reviews", url: "#testimonials", isHighlight: false }
  ];

  const menus = (appState.navMenus && appState.navMenus.length > 0) ? appState.navMenus : defaultMenus;

  if (desktopContainer) {
    desktopContainer.innerHTML = menus.map(m => {
      if (m.isHighlight) {
        return `
          <a href="${m.url || '#'}" class="text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 transition-colors px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200">
            <i data-lucide="calculator" class="w-3.5 h-3.5"></i> ${m.label}
          </a>
        `;
      }
      return `
        <a href="${m.url || '#'}" class="hover:text-black transition-colors whitespace-nowrap">
          ${m.label}
        </a>
      `;
    }).join('');
  }

  if (mobileContainer) {
    mobileContainer.innerHTML = menus.map(m => {
      if (m.isHighlight) {
        return `
          <a href="${m.url || '#'}" onclick="toggleMobileMenu()" class="block text-base font-bold text-rose-600 py-1">
            ${m.label}
          </a>
        `;
      }
      return `
        <a href="${m.url || '#'}" onclick="toggleMobileMenu()" class="block text-base font-semibold text-zinc-800 hover:text-black py-1">
          ${m.label}
        </a>
      `;
    }).join('');
  }
}

// 4b. Our Services Section (Occasions, Wedding, Events)
function renderServicesSection() {
  const srvData = appState.servicesSection || {};
  const subtitleEl = document.getElementById('servicesSubtitle');
  const headlineEl = document.getElementById('servicesHeadline');
  const container = document.getElementById('servicesContainer');

  if (subtitleEl) subtitleEl.textContent = srvData.subtitle || 'Our Services';
  if (headlineEl) headlineEl.textContent = srvData.headline || 'We offer brand new car rent services on self-drive with best rate for various occasions.';

  if (!container) return;

  const defaultItems = [
    {
      title: "Occasions",
      desc: "Drive Our Luxurious Cars To Different Occasions You Want",
      icon: "calendar"
    },
    {
      title: "Wedding",
      desc: "Drive Our Comfortable And Attractive Cars To Wedding Hassle Free",
      icon: "heart"
    },
    {
      title: "Events",
      desc: "Avail Our Self Drive Services To Attend Different Occasions And Events",
      icon: "sparkles"
    }
  ];

  const items = (srvData.items && srvData.items.length > 0) ? srvData.items : defaultItems;

  const iconColors = [
    { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100' },
    { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100' },
    { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100' }
  ];

  container.innerHTML = items.map((item, idx) => {
    const col = iconColors[idx % iconColors.length];
    const iconName = item.icon || (idx === 0 ? 'calendar' : idx === 1 ? 'heart' : 'sparkles');
    return `
      <div class="bg-zinc-50 hover:bg-white rounded-3xl p-8 sm:p-10 border border-zinc-200/80 shadow-sm hover:shadow-xl transition-all duration-300 group">
        <div class="w-14 h-14 rounded-2xl ${col.bg} ${col.text} border ${col.border} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-sm">
          <i data-lucide="${iconName}" class="w-7 h-7"></i>
        </div>
        <h3 class="text-xl sm:text-2xl font-bold font-heading text-black group-hover:text-rose-600 transition-colors">
          ${item.title}
        </h3>
        <p class="text-zinc-600 text-sm sm:text-base mt-3 leading-relaxed">
          ${item.desc}
        </p>
        <div class="mt-6 pt-6 border-t border-zinc-200/60 flex items-center gap-2 text-xs font-bold text-zinc-900 group-hover:gap-3 transition-all">
          <span>Explore Fleet for ${item.title}</span>
          <i data-lucide="arrow-right" class="w-3.5 h-3.5 text-rose-600"></i>
        </div>
      </div>
    `;
  }).join('');
}

// 4c. Why Choose Us Section (Karachi Self Drive & 4 Numbered Points)
function renderWhyChooseUsSection() {
  const whyData = appState.whyChooseUsSection || {};
  const subtitleEl = document.getElementById('whySubtitle');
  const headlineEl = document.getElementById('whyHeadline');
  const companyEl = document.getElementById('whyCompanyText');
  const descEl = document.getElementById('whyDescription');
  const container = document.getElementById('whyChooseUsContainer');

  if (subtitleEl) subtitleEl.textContent = whyData.subtitle || 'Why Choose Us';
  if (headlineEl) headlineEl.textContent = whyData.headline || 'Explore our New model cars on SELF DRIVE with best rates';
  if (companyEl) companyEl.textContent = whyData.companyText || 'Car4Rent PVT LTD Is Providing Brand New And Luxurious Vehicles On Rent';
  if (descEl) descEl.textContent = whyData.description || 'Car4Rent Satisfies Its Customers By Providing Best Car Rental Service In Karachi';

  if (!container) return;

  const defaultPoints = [
    { num: "1", title: "Free Doorstep Delivery Service", desc: "Free doorstep delivery across Karachi" },
    { num: "2", title: "Discounted And Nominal Charges", desc: "Best affordable rates on self drive" },
    { num: "3", title: "Fast Car Delivery Service", desc: "Prompt delivery right when you need it" },
    { num: "4", title: "Luxury Cars On Self Drive", desc: "Enjoy the pleasure of self drive in brand new cars" }
  ];

  const points = (whyData.points && whyData.points.length > 0) ? whyData.points : defaultPoints;
  const pointIcons = ['truck', 'badge-percent', 'zap', 'car'];

  container.innerHTML = points.map((pt, idx) => {
    const iconName = pt.icon || pointIcons[idx % pointIcons.length];
    const displayNum = String(pt.num || idx + 1).padStart(2, '0');
    return `
      <div class="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-2xl p-6 transition-all duration-300 group">
        <div class="flex items-center justify-between mb-4">
          <span class="w-9 h-9 rounded-xl bg-rose-600/20 text-rose-400 border border-rose-500/30 text-xs font-mono font-black flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition-all">
            ${displayNum}
          </span>
          <i data-lucide="${iconName}" class="w-5 h-5 text-zinc-400 group-hover:text-rose-400 transition-colors"></i>
        </div>
        <h3 class="text-base sm:text-lg font-bold font-heading text-white group-hover:text-rose-300 transition-colors">
          ${pt.title}
        </h3>
        <p class="text-xs text-zinc-400 mt-2 leading-relaxed">
          ${pt.desc || ''}
        </p>
      </div>
    `;
  }).join('');
}

// 3. Brands Ticker
function renderBrandsTicker() {
  const container = document.getElementById('brandsTickerContainer');
  if (!container) return;

  const brands = appState.brands && appState.brands.length > 0 
    ? appState.brands 
    : ['PORSCHE', 'MERCEDES-BENZ', 'AUDI', 'BMW', 'RANGE ROVER', 'CADILLAC', 'TOYOTA', 'LEXUS'];

  container.innerHTML = brands.map(b => `
    <span class="hover:text-black cursor-pointer transition-colors tracking-tighter px-2">${b}</span>
  `).join('');
}

// 4. Category Tabs
function renderCategoryTabs() {
  const container = document.getElementById('categoryTabsContainer');
  if (!container) return;

  const categories = appState.categories || [];
  
  let tabsHtml = `
    <button 
      onclick="switchCategory('all')" 
      id="tab-all" 
      class="category-tab px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${activeCategory === 'all' ? 'bg-black text-white shadow-sm' : 'text-zinc-700 hover:text-black'}">
      All Fleet
    </button>
  `;

  categories.forEach(cat => {
    const isSelected = activeCategory === (cat.slug || cat.id);
    tabsHtml += `
      <button 
        onclick="switchCategory('${cat.slug || cat.id}')" 
        id="tab-${cat.slug || cat.id}" 
        class="category-tab px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${isSelected ? 'bg-black text-white shadow-sm' : 'text-zinc-700 hover:text-black'}">
        ${cat.icon ? cat.icon + ' ' : ''}${cat.name}
      </button>
    `;
  });

  container.innerHTML = tabsHtml;
}

function switchCategory(cat) {
  activeCategory = cat;
  renderCategoryTabs();
  renderFleet();
}

function getCarSlug(car) {
  if (!car) return 'car';
  if (car.slug && typeof car.slug === 'string' && car.slug.trim()) {
    return car.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  return (car.name || car.id || 'car').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Render Fleet Grid in PKR
function renderFleet() {
  const container = document.getElementById('carsGrid');
  const emptyState = document.getElementById('noCarsState');
  if (!container) return;

  const cars = appState.cars || [];
  let filtered = cars;

  if (activeCategory !== 'all') {
    filtered = cars.filter(c => c.category === activeCategory || c.categoryId === activeCategory);
  }

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  container.innerHTML = filtered.map(car => {
    const carSlug = getCarSlug(car);
    const carImg = fixImagePath(car.image);
    const carWaText = encodeURIComponent(`Hi CAR 4 RENT, I am interested in renting ${car.name} on self-drive.`);
    const carWaUrl = `https://wa.me/923023650000?text=${carWaText}`;

    return `
    <div class="bg-white rounded-3xl overflow-hidden border border-zinc-200/80 shadow-sm car-card-hover flex flex-col justify-between group">
      
      <!-- Top Image & Badges -->
      <div class="relative bg-zinc-100 overflow-hidden h-60 flex items-center justify-center p-4">
        <!-- Category Badge -->
        <span class="absolute top-4 left-4 z-10 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white/90 backdrop-blur-md text-zinc-800 shadow-sm border border-zinc-200">
          ${car.categoryName || getCategoryLabel(car.category)}
        </span>

        ${car.featured ? `
          <span class="absolute top-4 right-4 z-10 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-rose-600 text-white shadow-md">
            Top Pick
          </span>
        ` : ''}

        <!-- Car Image -->
        <a href="/cars/${carSlug}" aria-label="View details for ${car.name}" class="w-full h-full block">
          <img 
            src="${carImg}" 
            alt="${car.name} on Rent in Karachi" 
            width="400"
            height="240"
            loading="lazy"
            decoding="async"
            class="w-full h-full object-cover rounded-2xl car-img-zoom group-hover:scale-105 transition-transform duration-500"
            onerror="this.src='./uploads/seo-car-1789727514573.webp'"
          >
        </a>
      </div>

      <!-- Content -->
      <div class="p-6 flex-1 flex flex-col justify-between">
        
        <div>
          <!-- Brand & Name -->
          <div class="text-xs uppercase tracking-wider text-zinc-400 font-bold">${car.brand}</div>
          <h3 class="text-xl font-bold font-heading text-black mt-1 group-hover:text-rose-600 transition-colors">
            <a href="/cars/${carSlug}">${car.name}</a>
          </h3>
          <p class="text-xs text-zinc-500 mt-2 line-clamp-2 leading-relaxed">
            ${car.description || 'Experience ultimate luxury, safety, and VIP protocol on Pakistani roads.'}
          </p>

          <!-- Key Specs Grid -->
          <div class="grid grid-cols-3 gap-2 mt-4 py-3 border-y border-zinc-100 text-center">
            <div class="bg-zinc-50 rounded-xl p-2">
              <span class="text-[10px] text-zinc-400 block font-semibold">POWER</span>
              <span class="text-xs font-bold text-zinc-800 font-mono">${car.hp || '500+ HP'}</span>
            </div>
            <div class="bg-zinc-50 rounded-xl p-2">
              <span class="text-[10px] text-zinc-400 block font-semibold">0-100</span>
              <span class="text-xs font-bold text-zinc-800 font-mono">${car.accel || '4.0s'}</span>
            </div>
            <div class="bg-zinc-50 rounded-xl p-2">
              <span class="text-[10px] text-zinc-400 block font-semibold">SEATS</span>
              <span class="text-xs font-bold text-zinc-800 font-mono">${car.seats || 5} Seats</span>
            </div>
          </div>

          <!-- Standard Client Fleet Badges -->
          <div class="flex flex-wrap gap-1.5 mt-3.5">
            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
              <i data-lucide="video" class="w-3 h-3 text-emerald-600"></i> Video-Proved
            </span>
            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/70">
              <i data-lucide="sparkles" class="w-3 h-3 text-blue-600"></i> Sanitized
            </span>
            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/70">
              <i data-lucide="shield-check" class="w-3 h-3 text-amber-600"></i> Zero Deposit
            </span>
          </div>

          <!-- Handover Locations Tag -->
          <div class="mt-3 pt-2 text-[11px] text-zinc-500 flex items-center gap-1.5 border-t border-zinc-100 font-medium">
            <i data-lucide="map-pin" class="w-3.5 h-3.5 text-rose-500 shrink-0"></i>
            <span class="truncate">Airport Handover • At Your Doorstep</span>
          </div>
        </div>

        <!-- Price in PKR and Action CTAs -->
        <div class="mt-5 pt-3 border-t border-zinc-100 space-y-2.5">
          <div class="flex items-center justify-between">
            <div>
              <span class="text-xl sm:text-2xl font-black font-heading text-black">${formatPKR(car.dailyPrice)}</span>
              <span class="text-xs text-zinc-400 font-medium">/ day</span>
            </div>
            <a 
              href="/cars/${carSlug}" 
              class="text-xs font-bold text-zinc-600 hover:text-black flex items-center gap-1 transition-colors">
              <span>Car Details</span>
              <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
            </a>
          </div>

          <div class="grid grid-cols-1 gap-2">
            <a 
              href="${carWaUrl}" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow flex items-center justify-center gap-1.5">
              <i data-lucide="message-circle" class="w-4 h-4"></i>
              <span>Book This Car on WhatsApp</span>
            </a>
          </div>
        </div>

      </div>

    </div>
  `;
  }).join('');

  if (window.lucide) {
    lucide.createIcons();
  }
}

function getCategoryLabel(catSlug) {
  const cat = (appState.categories || []).find(c => c.slug === catSlug || c.id === catSlug);
  return cat ? cat.name : (catSlug || 'Exotic Fleet');
}

// Populate quotation dropdown
function populateCarDropdown() {
  const select = document.getElementById('calcCarSelect');
  if (!select) return;

  const fallbackCars = (typeof DEFAULT_INITIAL_DB !== 'undefined' ? DEFAULT_INITIAL_DB.cars : []);
  const cars = (appState.cars && appState.cars.length) ? appState.cars : fallbackCars;
  if (cars.length === 0) return;

  select.innerHTML = cars.map(car => `
    <option value="${car.id}" class="bg-[#1e2229] text-white py-1.5">
      ${car.name} (${car.categoryName || getCategoryLabel(car.category)}) — ${formatPKR(car.dailyPrice)}/day
    </option>
  `).join('');

  if (!select.value && cars[0]) {
    select.value = cars[0].id;
  }
}

// Safe local date parsing to avoid any UTC or timezone offsets
function parseLocalDate(str) {
  if (!str) return new Date();
  const parts = String(str).split('-');
  if (parts.length === 3) {
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
  }
  return new Date(str);
}

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function calcDaysDiff(d1Str, d2Str) {
  if (!d1Str || !d2Str) return 1;
  const d1 = parseLocalDate(d1Str);
  const d2 = parseLocalDate(d2Str);
  const diffMs = d2.getTime() - d1.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 1;
}

// Set default dates and initialize dynamic calculator
function setDefaultDates() {
  const pickup = document.getElementById('calcPickupDate');
  const ret = document.getElementById('calcReturnDate');
  if (!pickup || !ret) return;

  const today = new Date();
  const returnDate = new Date(today);
  returnDate.setDate(returnDate.getDate() + (activeDurationSlotDays || 3));

  const todayStr = formatLocalDate(today);
  const retStr = formatLocalDate(returnDate);

  pickup.value = todayStr;
  ret.value = retStr;
  pickup.min = todayStr;
  ret.min = todayStr;
}

function initCalculator() {
  setDefaultDates();
  renderCalculatorLocations();
  renderCalculatorAddons();
  renderCalculatorSlots();
  applyCalculatorFeatureToggles();
  updateEstimateCalculation();
}

function renderCalculatorLocations() {
  const pickupList = document.getElementById('pickupLocationsList');
  const dropList = document.getElementById('dropLocationsList');
  const pickupInput = document.getElementById('calcPickupLoc');
  const dropInput = document.getElementById('calcDropLoc');

  const fallbackLocs = (typeof DEFAULT_INITIAL_DB !== 'undefined' ? DEFAULT_INITIAL_DB.calculatorConfig?.locations : []);
  const config = appState.calculatorConfig || {};
  const rawLocs = (config.locations && config.locations.length) ? config.locations : fallbackLocs;
  const locations = (rawLocs || []).filter(l => l.active !== false);

  if (locations.length === 0) return;

  const opts = locations.map(l => `<option value="${l.name}">${l.city || 'Karachi'}</option>`).join('');
  if (pickupList) pickupList.innerHTML = opts;
  if (dropList) dropList.innerHTML = `<option value="Same as Pickup Location">Default (Same as Pickup)</option>` + opts;

  if (pickupInput && !pickupInput.value) {
    pickupInput.value = locations[0]?.name || 'Karachi - Jinnah International Airport';
  }
  if (dropInput && !dropInput.value) {
    dropInput.value = 'Same as Pickup Location';
  }
}

function renderCalculatorAddons() {
  const container = document.getElementById('calcAddonsContainer');
  if (!container) return;

  const fallbackAddons = (typeof DEFAULT_INITIAL_DB !== 'undefined' ? DEFAULT_INITIAL_DB.calculatorConfig?.addons : []);
  const config = appState.calculatorConfig || {};
  const rawAddons = (config.addons && config.addons.length) ? config.addons : fallbackAddons;
  const addons = (rawAddons || []).filter(a => a.active !== false);

  if (addons.length === 0) {
    container.innerHTML = '<div class="col-span-full text-xs text-zinc-500 py-3 text-center">No optional add-ons configured.</div>';
    return;
  }

  container.innerHTML = addons.map(a => `
    <label class="flex items-center justify-between p-3.5 bg-[#1e2229] border border-white/10 rounded-xl cursor-pointer hover:border-white/25 transition-all">
      <div class="flex items-center gap-3">
        <input 
          type="checkbox" 
          id="addon_${a.id}" 
          data-addon-id="${a.id}"
          data-addon-price="${a.price || 0}"
          data-addon-type="${a.pricingType || 'daily'}"
          data-addon-title="${a.title}"
          onchange="updateEstimateCalculation()" 
          ${a.defaultChecked ? 'checked' : ''} 
          class="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 bg-zinc-800 border-zinc-600">
        <div>
          <div class="text-sm font-bold text-white">${a.title}</div>
          <div class="text-[11px] text-zinc-400">${a.description || ''}</div>
        </div>
      </div>
      <span class="text-xs font-mono font-bold text-rose-400">
        +Rs. ${(a.price || 0).toLocaleString()}${a.pricingType === 'flat' ? ' flat' : '/day'}
      </span>
    </label>
  `).join('');
}

function renderCalculatorSlots() {
  const container = document.getElementById('calcSlotsContainer');
  if (!container) return;

  const fallbackSlots = (typeof DEFAULT_INITIAL_DB !== 'undefined' ? DEFAULT_INITIAL_DB.calculatorConfig?.slots : []);
  const config = appState.calculatorConfig || {};
  const rawSlots = (config.slots && config.slots.length) ? config.slots : fallbackSlots;
  const slots = (rawSlots || []).filter(s => s.active !== false).sort((a, b) => a.days - b.days);

  if (slots.length === 0) {
    container.innerHTML = '';
    return;
  }

  // Find matching slot based on current active duration days
  let matchedSlot = null;
  const sortedDesc = [...slots].sort((a, b) => b.days - a.days);
  for (let s of sortedDesc) {
    if (activeDurationSlotDays >= s.days) {
      matchedSlot = s;
      break;
    }
  }
  if (!matchedSlot) matchedSlot = slots[0];

  container.innerHTML = slots.map(s => {
    const isSelected = matchedSlot && matchedSlot.id === s.id;
    return `
      <button 
        type="button" 
        onclick="selectDurationSlot(${s.days})" 
        class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 ${isSelected ? 'bg-rose-600 text-white border-rose-500 shadow-md ring-2 ring-rose-500/30' : 'bg-[#1e2229] hover:bg-[#252a33] text-zinc-300 border-white/10'}">
        <span>${s.label}</span>
        ${s.discountValue > 0 ? `<span class="text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold ${isSelected ? 'bg-black/30 text-amber-300' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}">-Rs.${s.discountValue.toLocaleString()}/day</span>` : ''}
      </button>
    `;
  }).join('');
}

function selectDurationSlot(days) {
  activeDurationSlotDays = Number(days) || 1;
  const pickup = document.getElementById('calcPickupDate');
  const ret = document.getElementById('calcReturnDate');
  if (pickup && ret) {
    const pDate = pickup.value ? parseLocalDate(pickup.value) : new Date();
    const rDate = new Date(pDate);
    rDate.setDate(rDate.getDate() + activeDurationSlotDays);
    ret.value = formatLocalDate(rDate);
    ret.min = pickup.value || formatLocalDate(new Date());
  }
  renderCalculatorSlots();
  updateEstimateCalculation();
}

function handleDateChange() {
  const pickup = document.getElementById('calcPickupDate');
  const ret = document.getElementById('calcReturnDate');
  if (!pickup || !ret) return;

  if (pickup.value) {
    ret.min = pickup.value;
    if (ret.value && ret.value <= pickup.value) {
      // If return date is on or before pickup, advance it to pickup + 1
      const pDate = parseLocalDate(pickup.value);
      pDate.setDate(pDate.getDate() + 1);
      ret.value = formatLocalDate(pDate);
    }
  }

  if (pickup.value && ret.value) {
    const diff = calcDaysDiff(pickup.value, ret.value);
    activeDurationSlotDays = diff > 0 ? diff : 1;
  }

  renderCalculatorSlots();
  updateEstimateCalculation();
}

function applyCalculatorFeatureToggles() {
  const config = appState.calculatorConfig || {};
  const feats = config.features || {};

  const toggle = (id, show) => {
    const el = document.getElementById(id);
    if (el) {
      if (show === false) el.classList.add('hidden');
      else el.classList.remove('hidden');
    }
  };

  toggle('calcLocationsWrapper', feats.showLocations !== false);
  toggle('calcAddonsWrapper', feats.showAddons !== false);
  toggle('summaryAddonsRow', feats.showAddons !== false);
  if (feats.showAddons === false) {
    const addonInputs = document.querySelectorAll('#calcAddonsContainer input[type="checkbox"]');
    addonInputs.forEach(input => { input.checked = false; });
  }
  toggle('calcContactWrapper', feats.showContactDetails !== false);
  toggle('calcPromoWrapper', feats.showPromoCode !== false);
  toggle('discountRow', feats.showPromoCode !== false);
  toggle('summaryDepositRow', feats.showSecurityDeposit !== false && config.securityDeposit?.enabled !== false);
  toggle('calcOfficialQuoteBtn', feats.showOfficialQuoteBtn !== false);
  toggle('calcWhatsAppBtn', feats.showWhatsAppBtn !== false);
  toggle('calcPrintBtn', feats.showPrintBtn !== false);

  const mode = feats.durationMode || 'both';
  if (mode === 'slots_only') {
    toggle('calcSlotsWrapper', true);
    toggle('calcDatesWrapper', false);
  } else if (mode === 'dates_only') {
    toggle('calcSlotsWrapper', false);
    toggle('calcDatesWrapper', true);
  } else {
    toggle('calcSlotsWrapper', feats.showSlotsBar !== false);
    toggle('calcDatesWrapper', true);
  }
}

// Select car and smooth scroll to calculator
function selectCarForQuotation(carId) {
  const select = document.getElementById('calcCarSelect');
  if (select) {
    select.value = carId;
    updateEstimateCalculation();
  }
  const calcSection = document.getElementById('calculator');
  if (calcSection) {
    calcSection.scrollIntoView({ behavior: 'smooth' });
  }
  showToast('Vehicle selected for instant PKR estimate!');
}

// Select area and smooth scroll to estimate calculator
function selectAreaForEstimate(areaName, event) {
  if (event) {
    event.preventDefault();
  }
  const pickupLoc = document.getElementById('calcPickupLoc');
  if (pickupLoc && areaName) {
    pickupLoc.value = areaName.includes('Karachi') ? areaName : `${areaName}, Karachi`;
    updateEstimateCalculation();
  }
  const calcSection = document.getElementById('calculator') || document.getElementById('estimate');
  if (calcSection) {
    calcSection.scrollIntoView({ behavior: 'smooth' });
  } else {
    window.location.hash = '#calculator';
  }
  if (typeof showToast === 'function') {
    showToast(`Instant estimate calculator: ${areaName || 'Karachi'}`);
  }
}

// Real-time calculation in PKR with Slots & Security Deposit
function calculateCurrentQuote() {
  const select = document.getElementById('calcCarSelect');
  const pickup = document.getElementById('calcPickupDate');
  const ret = document.getElementById('calcReturnDate');

  if (!select) return null;

  const fallbackCars = (typeof DEFAULT_INITIAL_DB !== 'undefined' ? DEFAULT_INITIAL_DB.cars : []);
  const cars = (appState.cars && appState.cars.length) ? appState.cars : fallbackCars;
  const selectedCar = cars.find(c => c.id === select.value) || cars[0];
  if (!selectedCar) return null;

  // Calculate rental days
  let days = activeDurationSlotDays || 3;
  if (pickup && ret && pickup.value && ret.value) {
    days = calcDaysDiff(pickup.value, ret.value);
  }
  if (days < 1) days = 1;

  // Daily vehicle rate
  const baseRate = selectedCar.dailyPrice;
  const baseVehicleTotal = baseRate * days;

  // Duration Slot Tier Discount (e.g. 1 Day: 3900, 3 Days: 3700)
  const config = appState.calculatorConfig || {};
  const slots = (config.slots || []).filter(s => s.active !== false).sort((a, b) => b.days - a.days);
  let slotDiscountPerDay = 0;
  let matchingSlot = null;

  for (let s of slots) {
    if (days >= s.days) {
      slotDiscountPerDay = s.discountValue || 0;
      matchingSlot = s;
      break;
    }
  }
  const totalSlotDiscount = slotDiscountPerDay * days;

  // Dynamic Add-ons in PKR
  const isAddonsEnabled = config.features?.showAddons !== false;
  let addonDaily = 0;
  let addonFlat = 0;
  const addonsSelected = [];

  if (isAddonsEnabled) {
    const addonInputs = document.querySelectorAll('#calcAddonsContainer input[type="checkbox"]');
    addonInputs.forEach(input => {
      if (input.checked) {
        const price = Number(input.dataset.addonPrice) || 0;
        const type = input.dataset.addonType;
        const title = input.dataset.addonTitle;
        if (type === 'flat') {
          addonFlat += price;
          addonsSelected.push(`${title} (Rs. ${price.toLocaleString()} flat)`);
        } else {
          addonDaily += price;
          addonsSelected.push(`${title} (Rs. ${price.toLocaleString()}/day)`);
        }
      }
    });
  }

  const addonsTotal = isAddonsEnabled ? ((addonDaily * days) + addonFlat) : 0;

  // Promo Discount
  let promoDiscountAmount = 0;
  if (appliedDiscountPercent > 0) {
    const vehicleAfterSlot = Math.max(0, baseVehicleTotal - totalSlotDiscount);
    promoDiscountAmount = Math.round((vehicleAfterSlot * appliedDiscountPercent) / 100);
  }

  // Security Deposit (100% Refundable)
  const secDep = config.securityDeposit || {};
  const isDepositEnabled = secDep.enabled !== false && config.features?.showSecurityDeposit !== false;
  const depositAmount = isDepositEnabled ? (secDep.amount !== undefined ? secDep.amount : 50000) : 0;
  const includeDepositInTotal = isDepositEnabled && (secDep.includeInGrandTotal !== false);

  const totalDiscounts = totalSlotDiscount + promoDiscountAmount;
  const netVehicleTotal = Math.max(0, baseVehicleTotal - totalDiscounts);
  const grandTotal = netVehicleTotal + addonsTotal + (includeDepositInTotal ? depositAmount : 0);

  return {
    car: selectedCar,
    days,
    baseRate,
    baseVehicleTotal,
    matchingSlot,
    slotDiscountPerDay,
    totalSlotDiscount,
    isAddonsEnabled,
    addonsTotal,
    addonsSelected,
    promoDiscountAmount,
    totalDiscounts,
    deposit: depositAmount,
    depositLabel: secDep.label || 'Security Deposit (100% Refundable)',
    depositPolicy: secDep.policyText || '100% Refundable on vehicle inspection',
    includeDepositInTotal,
    isDepositEnabled,
    grandTotal,
    pickupDate: pickup?.value || '',
    returnDate: ret?.value || '',
    pickupLocation: document.getElementById('calcPickupLoc')?.value || 'Karachi - Jinnah International Airport',
    dropLocation: document.getElementById('calcDropLoc')?.value || 'Same as Pickup Location'
  };
}

function updateEstimateCalculation() {
  const quote = calculateCurrentQuote();
  if (!quote) return;

  const thumb = document.getElementById('calcCarThumb');
  const nameEl = document.getElementById('calcCarName');
  const rateEl = document.getElementById('calcCarRate');

  if (thumb) thumb.src = quote.car.image;
  if (nameEl) nameEl.textContent = quote.car.name;
  if (rateEl) {
    if (quote.slotDiscountPerDay > 0) {
      const discountedRate = Math.max(0, quote.baseRate - quote.slotDiscountPerDay);
      rateEl.innerHTML = `<span class="line-through text-zinc-500 font-normal text-xs mr-1">${formatPKR(quote.baseRate)}</span> <span class="text-rose-400 font-bold">${formatPKR(discountedRate)}/day</span>`;
    } else {
      rateEl.textContent = `${formatPKR(quote.car.dailyPrice)} / day`;
    }
  }

  // Dynamic duration deal notice above slots bar
  const slotNotice = document.getElementById('slotDiscountNotice');
  if (slotNotice) {
    if (quote.totalSlotDiscount > 0) {
      slotNotice.innerHTML = `<span class="text-amber-400 font-bold">✨ Applied ${quote.matchingSlot ? quote.matchingSlot.label : quote.days + ' Days'} Deal: Save Rs. ${quote.slotDiscountPerDay.toLocaleString()}/day (-Rs. ${quote.totalSlotDiscount.toLocaleString()} Total)</span>`;
    } else {
      slotNotice.textContent = 'Select 3+ days for instant tiered discounts';
    }
  }

  const daysEl = document.getElementById('summaryDays');
  const baseEl = document.getElementById('summaryBasePrice');
  const addonsEl = document.getElementById('summaryAddons');
  const slotDiscountRow = document.getElementById('slotDiscountRow');
  const slotDiscountEl = document.getElementById('summarySlotDiscount');
  const slotDiscountLabel = document.getElementById('slotDiscountLabel');
  const discountRow = document.getElementById('discountRow');
  const discountEl = document.getElementById('summaryDiscount');
  const depositRow = document.getElementById('summaryDepositRow');
  const depositLabel = document.getElementById('summaryDepositLabel');
  const depositEl = document.getElementById('summaryDeposit');
  const policyEl = document.getElementById('depositPolicyNotice');
  const totalEl = document.getElementById('summaryTotal');

  if (daysEl) daysEl.textContent = `${quote.days} Day(s)`;
  if (baseEl) baseEl.textContent = `${formatPKR(quote.baseVehicleTotal)} (${formatPKR(quote.baseRate)} × ${quote.days}d)`;

  // Selected Add-ons row (only show if addons enabled AND selected)
  const summaryAddonsRow = document.getElementById('summaryAddonsRow');
  if (summaryAddonsRow) {
    if (quote.isAddonsEnabled && quote.addonsTotal > 0) {
      summaryAddonsRow.classList.remove('hidden');
      if (addonsEl) addonsEl.textContent = `+${formatPKR(quote.addonsTotal)}`;
    } else {
      summaryAddonsRow.classList.add('hidden');
    }
  }

  // Slot discount row
  if (slotDiscountRow && slotDiscountEl) {
    if (quote.totalSlotDiscount > 0) {
      slotDiscountRow.classList.remove('hidden');
      if (slotDiscountLabel) slotDiscountLabel.textContent = `Duration Deal (${quote.matchingSlot ? quote.matchingSlot.label : quote.days + ' Days'}):`;
      slotDiscountEl.textContent = `-${formatPKR(quote.totalSlotDiscount)} (-Rs. ${quote.slotDiscountPerDay.toLocaleString()}/day)`;
    } else {
      slotDiscountRow.classList.add('hidden');
    }
  }

  // Promo discount row
  if (discountRow && discountEl) {
    if (quote.promoDiscountAmount > 0) {
      discountRow.classList.remove('hidden');
      discountEl.textContent = `-${formatPKR(quote.promoDiscountAmount)}`;
    } else {
      discountRow.classList.add('hidden');
    }
  }

  // Security Deposit row
  if (depositRow) {
    if (quote.isDepositEnabled && quote.deposit > 0) {
      depositRow.classList.remove('hidden');
      if (depositLabel) depositLabel.textContent = quote.depositLabel + ':';
      if (depositEl) depositEl.textContent = formatPKR(quote.deposit);
    } else {
      depositRow.classList.add('hidden');
    }
  }

  if (policyEl) {
    if (quote.isDepositEnabled) {
      if (!quote.includeDepositInTotal) {
        policyEl.textContent = `* ${quote.depositLabel} (${formatPKR(quote.deposit)}) collected separately upon delivery and ${quote.depositPolicy.toLowerCase()}.`;
      } else {
        policyEl.textContent = `* Includes ${quote.depositLabel} (${formatPKR(quote.deposit)}). ${quote.depositPolicy}.`;
      }
    } else {
      policyEl.textContent = '✓ Zero security deposit promotion active.';
    }
  }

  if (totalEl) totalEl.textContent = formatPKR(quote.grandTotal);
}

// Promo Code
function applyPromoCode() {
  const input = document.getElementById('promoCodeInput');
  const msg = document.getElementById('promoMsg');
  if (!input || !msg) return;

  const code = input.value.trim().toUpperCase();
  const configuredOffer = appState.settings?.offer || {};
  const validCode = (configuredOffer.promoCode || 'LUXURY20').toUpperCase();
  const validPercent = configuredOffer.discountPercent || 20;

  msg.classList.remove('hidden');

  if (code === validCode) {
    appliedDiscountPercent = validPercent;
    appliedPromoCode = validCode;
    msg.className = 'text-xs font-semibold text-emerald-400 mt-1';
    msg.textContent = `✓ Promo Code ${validCode} applied! ${validPercent}% discount granted on vehicle rental.`;
    showToast(`${validPercent}% Discount applied successfully!`);
  } else if (code === '') {
    appliedDiscountPercent = 0;
    appliedPromoCode = '';
    msg.textContent = '';
    msg.classList.add('hidden');
  } else {
    appliedDiscountPercent = 0;
    appliedPromoCode = '';
    msg.className = 'text-xs font-semibold text-rose-400 mt-1';
    msg.textContent = `✕ Invalid promo code. Try ${validCode}`;
  }

  updateEstimateCalculation();
}

function copyPromoCodeTag() {
  const configuredOffer = appState.settings?.offer || {};
  const code = configuredOffer.promoCode || 'LUXURY20';
  navigator.clipboard.writeText(code);
  const input = document.getElementById('promoCodeInput');
  if (input) {
    input.value = code;
    applyPromoCode();
  }
  showToast(`Copied promo code: ${code}`);
}

// Handle Form Submission
async function handleQuotationSubmit(e) {
  e.preventDefault();
  const quote = calculateCurrentQuote();
  if (!quote) return;

  const name = document.getElementById('clientFullName').value.trim();
  const phone = document.getElementById('clientPhone').value.trim();

  if (!name || !phone) {
    alert('Please enter your full name and Pakistani phone/WhatsApp number.');
    return;
  }

  const quoteSubmission = {
    clientName: name,
    clientPhone: phone,
    carName: quote.car.name,
    carCategory: quote.car.categoryName || quote.car.category,
    pickupDate: quote.pickupDate,
    returnDate: quote.returnDate,
    days: quote.days,
    pickupLocation: quote.pickupLocation,
    dropLocation: quote.dropLocation,
    addons: quote.addonsSelected,
    promoCode: appliedPromoCode || 'None',
    totalPrice: quote.grandTotal,
    currency: 'PKR'
  };

  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quoteSubmission)
    });

    if (res.ok) {
      showToast('✓ Quotation saved in system! Opening WhatsApp for instant concierge...');
      setTimeout(() => {
        sendWhatsAppQuote();
      }, 500);
    }
  } catch (err) {
    console.error('Network quote submit, saving locally:', err);
    const local = getLocalDB();
    local.quotes = local.quotes || [];
    local.quotes.unshift({ ...quoteSubmission, id: 'quote-' + Date.now(), createdAt: new Date().toLocaleString(), status: 'Pending' });
    saveLocalDB(local);
    showToast('✓ Quotation recorded! Opening WhatsApp...');
    setTimeout(() => {
      sendWhatsAppQuote();
    }, 500);
  }
}

// WhatsApp Booking in PKR
function sendWhatsAppQuote() {
  const quote = calculateCurrentQuote();
  if (!quote) return;

  const name = document.getElementById('clientFullName')?.value.trim() || 'Valued Guest';
  const phone = document.getElementById('clientPhone')?.value.trim() || 'N/A';
  const waNum = appState.settings?.whatsappNumber || '923005557433';

  const depositText = quote.isDepositEnabled
    ? (quote.includeDepositInTotal
        ? `(Includes ${formatPKR(quote.deposit)} refundable security deposit)`
        : `(+ ${formatPKR(quote.deposit)} refundable security deposit upon pickup)`)
    : `(Zero security deposit required)`;

  const slotDealText = quote.totalSlotDiscount > 0
    ? `*Duration Deal:* -${formatPKR(quote.totalSlotDiscount)} applied (${quote.matchingSlot ? quote.matchingSlot.label : quote.days + ' Days'})\n`
    : '';

  const message = 
`*${(appState.settings?.siteName || 'CAR4RENT').toUpperCase()} - RENTAL ESTIMATE & INQUIRY*
━━━━━━━━━━━━━━━━━━━━━
*Vehicle:* ${quote.car.name}
*Daily Rate:* ${formatPKR(quote.car.dailyPrice)}/day
*Duration:* ${quote.days} Day(s) (${quote.pickupDate} to ${quote.returnDate})
${slotDealText}*Pickup Location:* ${quote.pickupLocation}
*Drop Location:* ${quote.dropLocation}
*Add-ons:* ${quote.addonsSelected.length > 0 ? quote.addonsSelected.join(', ') : 'None'}
*Applied Promo:* ${appliedPromoCode || 'None'}
━━━━━━━━━━━━━━━━━━━━━
*Estimated Total:* ${formatPKR(quote.grandTotal)} ${depositText}
━━━━━━━━━━━━━━━━━━━━━
*Client Name:* ${name}
*Contact Number:* ${phone}

I would like to verify availability and proceed with booking.`;

  const url = `https://wa.me/${waNum}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

// Print Receipt in PKR
function printQuotationReceipt() {
  const quote = calculateCurrentQuote();
  if (!quote) return;

  const name = document.getElementById('clientFullName')?.value.trim() || 'Guest Customer';
  const phone = document.getElementById('clientPhone')?.value.trim() || 'N/A';
  const settings = appState.settings || {};

  const printWindow = window.open('', '', 'width=800,height=900');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${settings.siteName || 'Car4Rent'} - Official Rental Estimate (PKR)</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #111; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 20px; }
        .title { font-size: 26px; font-weight: 900; }
        .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 30px 0; }
        .details-card { background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #eee; }
        .details-card p { margin: 6px 0; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; font-size: 14px; }
        th { background-color: #f2f2f2; font-weight: bold; }
        .total-row { font-size: 18px; font-weight: bold; border-top: 2px solid #111; }
        .footer { margin-top: 40px; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 15px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="title">${settings.siteName || 'Car4Rent'}</div>
          <p style="color: #666; margin-top: 4px; font-size: 13px;">${settings.tagline || 'Luxury & Executive Car Rental'}</p>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: bold;">OFFICIAL ESTIMATE SLIP</div>
          <div style="font-size: 12px; color: #666; margin-top: 4px;">Date: ${new Date().toLocaleDateString('en-PK')}</div>
        </div>
      </div>

      <div class="details-grid">
        <div class="details-card">
          <p><strong>Customer Information:</strong></p>
          <p>Name: ${name}</p>
          <p>Phone: ${phone}</p>
        </div>
        <div class="details-card">
          <p><strong>Reservation Timeline:</strong></p>
          <p>Pickup: ${quote.pickupDate} (${quote.pickupLocation})</p>
          <p>Return: ${quote.returnDate} (${quote.dropLocation})</p>
          <p>Duration: ${quote.days} Days</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Rate</th>
            <th>Days</th>
            <th>Amount (PKR)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>${quote.car.name}</strong> (${quote.car.categoryName || quote.car.category})</td>
            <td>${formatPKR(quote.baseRate)}/day</td>
            <td>${quote.days} days</td>
            <td>${formatPKR(quote.baseVehicleTotal)}</td>
          </tr>
          ${quote.addonsSelected.map(addon => `
            <tr>
              <td>Add-on: ${addon}</td>
              <td>Selected tier</td>
              <td>${quote.days} days</td>
              <td>Included in total</td>
            </tr>
          `).join('')}
          ${quote.totalSlotDiscount > 0 ? `
            <tr style="color: #e11d48;">
              <td colspan="3">Duration Deal (${quote.matchingSlot ? quote.matchingSlot.label : quote.days + ' Days'})</td>
              <td>-${formatPKR(quote.totalSlotDiscount)}</td>
            </tr>
          ` : ''}
          ${quote.promoDiscountAmount > 0 ? `
            <tr style="color: #059669;">
              <td colspan="3">Promo Discount (${appliedPromoCode})</td>
              <td>-${formatPKR(quote.promoDiscountAmount)}</td>
            </tr>
          ` : ''}
          ${quote.isDepositEnabled && quote.deposit > 0 ? `
            <tr>
              <td colspan="3">${quote.depositLabel} ${quote.includeDepositInTotal ? '' : '(Collected separately)'}</td>
              <td>${formatPKR(quote.deposit)}</td>
            </tr>
          ` : ''}
          <tr class="total-row">
            <td colspan="3">Estimated Grand Total</td>
            <td>${formatPKR(quote.grandTotal)}</td>
          </tr>
        </tbody>
      </table>

      <div class="footer">
        <p>This quotation slip is valid for 48 hours. Vehicles subject to prior booking availability.</p>
        <p>Helpline: ${settings.emergencyPhone || '+92 302 3650000'} | Email: ${settings.footer?.email || 'info@car4rent.pk'}</p>
      </div>

      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

// 5. Render Active Reviews
function renderReviews() {
  const container = document.getElementById('reviewsGridContainer');
  if (!container) return;

  const reviews = appState.reviews || [];
  if (reviews.length === 0) {
    container.innerHTML = `<div class="text-zinc-400 text-center col-span-3">No client reviews available.</div>`;
    return;
  }

  container.innerHTML = reviews.map(rev => `
    <div class="bg-zinc-50 rounded-2xl p-8 border border-zinc-200/80 flex flex-col justify-between">
      <div>
        <div class="flex items-center gap-1 text-amber-400 mb-4">
          ${Array.from({ length: rev.rating || 5 }).map(() => `
            <i data-lucide="star" class="w-4 h-4 fill-amber-400"></i>
          `).join('')}
        </div>
        <p class="text-zinc-700 text-sm leading-relaxed italic">
          "${rev.comment || rev.text || ''}"
        </p>
      </div>
      <div class="flex items-center gap-3 mt-6 pt-6 border-t border-zinc-200">
        <div class="w-10 h-10 rounded-full bg-black text-white font-bold flex items-center justify-center text-sm">
          ${getInitials(rev.clientName)}
        </div>
        <div>
          <div class="text-sm font-bold text-black">${rev.clientName}</div>
          <div class="text-xs text-zinc-500">${rev.location || 'Pakistan'}</div>
        </div>
      </div>
    </div>
  `).join('');

  if (window.lucide) {
    lucide.createIcons();
  }
}

function getInitials(name) {
  if (!name) return 'PK';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

// 6. Render Footer from Settings
function renderFooter() {
  const settings = appState.settings || {};
  const footer = settings.footer || {};

  const footerNameEl = document.getElementById('footerSiteName');
  if (footerNameEl) footerNameEl.textContent = settings.siteName || 'Car4Rent';
  document.getElementById('footerAboutText').textContent = footer.aboutText || '';
  document.getElementById('footerEmergencyPhone').innerHTML = `<i data-lucide="phone-call" class="w-4 h-4"></i> ${footer.phone || settings.emergencyDisplay || '+92 300 555-RIDE'}`;
  document.getElementById('footerEmail').textContent = footer.email || 'info@car4rent.pk';
  document.getElementById('footerAddress').textContent = footer.address || 'Karachi, Pakistan';
  document.getElementById('footerCopyright').innerHTML = footer.copyright || `&copy; 2026 ${settings.siteName || 'Car4Rent'}. All rights reserved.`;

  const phone = settings.emergencyPhone || '+92 300 5557433';
  const waNum = settings.whatsappNumber || '923005557433';
  document.getElementById('footerCallLink').href = `tel:${phone.replace(/\s+/g, '')}`;
  document.getElementById('footerWhatsappLink').href = `https://wa.me/${waNum}`;

  // Footer categories list
  const catList = document.getElementById('footerCategoriesList');
  if (catList && appState.categories) {
    catList.innerHTML = appState.categories.map(c => `
      <li><a href="#fleet" onclick="switchCategory('${c.slug || c.id}')" class="hover:text-white transition-colors">${c.name}</a></li>
    `).join('');
  }
}

// Mobile Menu
function toggleMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  if (menu) menu.classList.toggle('hidden');
}

// Search Modal
function openCarSearchModal() {
  const modal = document.getElementById('searchModal');
  if (modal) {
    modal.classList.remove('hidden');
    document.getElementById('modalSearchInput').focus();
    handleLiveSearch('');
  }
}

function closeCarSearchModal() {
  const modal = document.getElementById('searchModal');
  if (modal) modal.classList.add('hidden');
}

function handleLiveSearch(query) {
  const resultsContainer = document.getElementById('searchResults');
  if (!resultsContainer) return;

  const cars = appState.cars || [];
  const q = query.toLowerCase().trim();

  const matches = cars.filter(c => 
    c.name.toLowerCase().includes(q) || 
    c.brand.toLowerCase().includes(q) || 
    c.category.toLowerCase().includes(q)
  );

  if (matches.length === 0) {
    resultsContainer.innerHTML = `<div class="text-xs text-zinc-500 text-center py-4">No matching vehicles found.</div>`;
    return;
  }

  resultsContainer.innerHTML = matches.map(car => `
    <div onclick="selectFromSearch('${car.id}')" class="flex items-center justify-between p-2.5 hover:bg-zinc-100 rounded-xl cursor-pointer transition-colors">
      <div class="flex items-center gap-3">
        <img src="${car.image}" alt="${car.name}" width="48" height="36" loading="lazy" decoding="async" class="w-12 h-9 object-cover rounded-lg">
        <div>
          <div class="text-sm font-bold text-black">${car.name}</div>
          <div class="text-[11px] text-zinc-500">${car.brand} • ${car.categoryName || car.category}</div>
        </div>
      </div>
      <div class="text-right">
        <div class="text-xs font-bold text-black">${formatPKR(car.dailyPrice)}/day</div>
        <span class="text-[10px] text-rose-600 font-semibold">Select</span>
      </div>
    </div>
  `).join('');
}

function selectFromSearch(carId) {
  closeCarSearchModal();
  selectCarForQuotation(carId);
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

// ====================================================
// KARACHI SEO & DYNAMIC RANKING ENGINE
// ====================================================

function renderSeoHeroContent() {
  const seo = appState.seoSettings || {};
  const h1El = document.getElementById('heroH1Heading');
  const subEl = document.getElementById('heroSubtitleText');

  if (h1El && seo.h1Heading) {
    h1El.textContent = seo.h1Heading;
  }
  if (subEl && seo.heroSubtitle) {
    subEl.textContent = seo.heroSubtitle;
  }
  const heroImg = document.getElementById('heroCarImg');
  if (heroImg) {
    const rawHero = seo.ogImage || appState.settings?.heroCarImage || './uploads/seo-car-1789727514573.webp';
    heroImg.src = fixImagePath(rawHero);
  }
  if (seo.siteTitle) {
    document.title = seo.siteTitle;
  }
}

function getServiceLink(slug) {
  const clean = (slug || '').replace(/^\/+|\/+$/g, '');
  if (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '3000')) {
    return `landing.html?slug=${clean}`;
  }
  return `/${clean}`;
}

function renderKarachiServices() {
  const container = document.getElementById('karachiServicesGridContainer');
  if (!container) return;

  const pages = (appState.seoLandingPages || []).filter(p => p.active !== false);
  if (pages.length === 0) {
    container.innerHTML = '<div class="col-span-full text-center text-xs text-zinc-400 py-6">No dedicated services published yet. Manage them via Admin Portal.</div>';
    return;
  }

  const icons = {
    'karachi-airport-rent-a-car': 'plane-takeoff',
    'luxury-car-rental-karachi': 'user-check',
    'rent-a-car-without-driver-karachi': 'key',
    'monthly-car-rental-karachi': 'calendar-check'
  };

  container.innerHTML = pages.map(page => {
    const iconName = icons[page.slug] || 'car';
    const cleanUrl = getServiceLink(page.slug);
    const firstHighlight = (page.highlights && page.highlights[0]) || 'Guaranteed Doorstep Delivery';

    return `
      <div class="bg-white rounded-3xl border border-zinc-200/90 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group">
        <div>
          <div class="w-12 h-12 rounded-2xl bg-zinc-900 text-white flex items-center justify-center mb-5 group-hover:bg-rose-600 transition-colors shadow-md">
            <i data-lucide="${iconName}" class="w-6 h-6"></i>
          </div>
          <span class="inline-block text-[10px] font-bold uppercase tracking-widest text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-full mb-2">
            ${page.navTitle || 'Karachi Service'}
          </span>
          <h3 class="text-xl font-bold font-heading text-black leading-snug">
            ${page.h1}
          </h3>
          <p class="text-xs text-zinc-500 mt-2 line-clamp-3 leading-relaxed">
            ${page.metaDescription || page.h2 || ''}
          </p>
          <div class="mt-4 pt-3 border-t border-zinc-100 flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
            <i data-lucide="check-circle" class="w-3.5 h-3.5"></i>
            <span class="truncate">${firstHighlight}</span>
          </div>
        </div>

        <div class="mt-6 pt-2">
          <a href="${cleanUrl}" class="w-full py-3 bg-zinc-100 hover:bg-black text-zinc-900 hover:text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all">
            <span>Explore Service & Rates</span>
            <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
          </a>
        </div>
      </div>
    `;
  }).join('');
}

function renderKarachiAreas() {
  const container = document.getElementById('karachiAreasGridContainer');
  if (!container) return;

  const areas = appState.karachiAreas || [];
  if (areas.length === 0) {
    container.innerHTML = '<div class="col-span-full text-center text-xs text-zinc-400 py-6">No areas listed.</div>';
    return;
  }

  container.innerHTML = areas.map(area => `
    <div class="bg-zinc-50 hover:bg-white rounded-2xl border border-zinc-200/80 p-4 transition-all hover:shadow-md hover:border-zinc-300">
      <div class="flex items-center gap-2.5 mb-2">
        <div class="w-7 h-7 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
          <i data-lucide="map-pin" class="w-3.5 h-3.5"></i>
        </div>
        <h3 class="font-bold text-sm text-black font-heading">${area.name}</h3>
      </div>
      <p class="text-xs text-zinc-500 leading-relaxed">${area.desc || area.title || ''}</p>
      <div class="mt-3 flex items-center justify-between text-[11px] font-semibold">
        <span class="text-zinc-400">Available 24/7</span>
        <a href="#calculator" onclick="selectAreaForEstimate('${(area.name || '').replace(/'/g, "\\'")}', event)" class="text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 font-bold cursor-pointer">
          <span>Estimate</span> &rarr;
        </a>
      </div>
    </div>
  `).join('');
}

function renderHomepageFaqs() {
  const container = document.getElementById('homepageFaqsAccordion');
  if (!container) return;

  const faqs = appState.seoFaqs || [];
  if (faqs.length === 0) {
    container.innerHTML = '<div class="text-center text-xs text-zinc-400 py-6">No FAQs configured yet.</div>';
    return;
  }

  container.innerHTML = faqs.map((f, i) => `
    <div class="bg-white border border-zinc-200/90 rounded-2xl overflow-hidden shadow-sm hover:shadow transition-shadow">
      <button onclick="toggleHomepageFaq(${i})" class="w-full p-5 text-left font-bold text-black flex items-center justify-between gap-4 hover:bg-zinc-50 transition-colors">
        <span class="text-sm sm:text-base font-heading flex items-center gap-3">
          <span class="w-6 h-6 rounded-full bg-rose-50 text-rose-600 text-xs flex items-center justify-center font-mono font-bold">${i+1}</span>
          ${f.question}
        </span>
        <i data-lucide="chevron-down" id="homeFaqIcon-${i}" class="w-5 h-5 text-zinc-400 transition-transform duration-200 shrink-0"></i>
      </button>
      <div id="homeFaqAns-${i}" class="hidden px-5 pb-5 pt-1 text-sm text-zinc-600 leading-relaxed border-t border-zinc-100 bg-zinc-50/50">
        ${f.answer}
      </div>
    </div>
  `).join('');
}

function toggleHomepageFaq(idx) {
  const ans = document.getElementById('homeFaqAns-' + idx);
  const icon = document.getElementById('homeFaqIcon-' + idx);
  if (ans) {
    const isHidden = ans.classList.contains('hidden');
    ans.classList.toggle('hidden');
    if (icon) {
      icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    }
  }
}

// Section 11 of SEO Plan: Conversion & Click Tracking
function setupConversionTracking() {
  // Track Phone Clicks
  document.querySelectorAll('a[href^="tel:"]').forEach(link => {
    link.addEventListener('click', () => {
      console.log('⚡ [Conversion Tracked] Phone Call Click:', link.href);
      if (window.gtag) {
        window.gtag('event', 'phone_call_click', {
          event_category: 'engagement',
          event_label: link.href
        });
      }
    });
  });

  // Track WhatsApp Clicks
  document.querySelectorAll('a[href*="wa.me"]').forEach(link => {
    link.addEventListener('click', () => {
      console.log('⚡ [Conversion Tracked] WhatsApp Inquiry Click:', link.href);
      if (window.gtag) {
        window.gtag('event', 'whatsapp_click', {
          event_category: 'engagement',
          event_label: link.href
        });
      }
    });
  });
}

// 6. Dynamic Footer Services
function renderFooter() {
  const footerList = document.getElementById('footerKarachiServicesList');
  if (footerList) {
    const pages = (appState.seoLandingPages && appState.seoLandingPages.length > 0)
      ? appState.seoLandingPages.filter(p => p.active !== false)
      : [
        { slug: 'karachi-airport-rent-a-car', navTitle: 'Airport Car Rental' },
        { slug: 'luxury-car-rental-karachi', navTitle: 'Luxury Car Rental' },
        { slug: 'rent-a-car-without-driver-karachi', navTitle: 'Self Drive Rental' },
        { slug: 'monthly-car-rental-karachi', navTitle: 'Monthly Car Hire' }
      ];

    const isLocalOrFile = window.location.protocol === 'file:' || (window.location.port && window.location.port !== '3000');
    const sitemapUrl = isLocalOrFile ? 'sitemap.xml' : '/sitemap.xml';

    footerList.innerHTML = pages.map(p => `
      <li><a href="${getServiceLink(p.slug)}" class="hover:text-white transition-colors">${p.navTitle || p.h1 || p.slug}</a></li>
    `).join('') + `<li><a href="${sitemapUrl}" target="_blank" class="hover:text-white transition-colors text-xs text-zinc-500">XML Sitemap</a></li>`;
  }
}

// Universal Link Interceptor for file://, Live Server, and Static Environments
document.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href) return;

  const isLocalOrFile = window.location.protocol === 'file:' || (window.location.port && window.location.port !== '3000');
  if (isLocalOrFile) {
    if (href === '/') {
      e.preventDefault();
      window.location.href = 'index.html';
    } else if (href.startsWith('/') && !href.startsWith('//') && !href.includes(':')) {
      const s = href.replace(/^\/+|\/+$/g, '');
      if (s && !s.endsWith('.xml') && !s.endsWith('.html') && !s.startsWith('#')) {
        e.preventDefault();
        window.location.href = `landing.html?slug=${s}`;
      }
    }
  }
});


