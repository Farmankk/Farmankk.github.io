const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { verifyLicenseKey, normalizeDomain } = require('./license-manager');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database', 'db.json');

// ====================================================
// ENTERPRISE SECURITY ENGINE: PASSWORDS, SESSIONS, BRUTE-FORCE
// ====================================================

// 1. Password Hashing (Salted PBKDF2-SHA512)
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  if (!stored.includes(':')) {
    return password === stored;
  }
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHash] = parts;
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  const bufA = Buffer.from(hash, 'hex');
  const bufB = Buffer.from(originalHash, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function autoMigratePasswords() {
  try {
    const db = readDatabase();
    if (!db || !Array.isArray(db.users)) return;
    let updated = false;
    db.users.forEach(u => {
      if (u.password && !u.password.includes(':')) {
        u.password = hashPassword(u.password);
        updated = true;
      }
    });
    if (updated) {
      writeDatabase(db);
      console.log('[SECURITY ENGINE] All admin passwords successfully converted to Salted PBKDF2-SHA512.');
    }
  } catch (e) {
    console.error('[SECURITY ENGINE] Password migration failed:', e);
  }
}

// 2. Cryptographic Stateless HMAC Sessions (Survives Passenger Multi-Workers & Process Recycling)
const SESSION_SECRET_FILE = path.join(__dirname, 'database', '.session_secret');
let SESSION_SECRET = '';

try {
  if (fs.existsSync(SESSION_SECRET_FILE)) {
    SESSION_SECRET = fs.readFileSync(SESSION_SECRET_FILE, 'utf-8').trim();
  }
  if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
    SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    const dbDir = path.join(__dirname, 'database');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    fs.writeFileSync(SESSION_SECRET_FILE, SESSION_SECRET, 'utf-8');
  }
} catch (e) {
  SESSION_SECRET = 'c4r_enterprise_hmac_secret_key_849204928172938172938';
}

const SESSION_MAX_IDLE = 30 * 60 * 1000; // 30 minutes

function createAdminSession(user) {
  const now = Date.now();
  const expiresAt = now + SESSION_MAX_IDLE;
  const payload = {
    uid: user.id,
    usr: user.username,
    name: user.name || user.username,
    rol: user.role || 'Super Admin',
    iat: now,
    exp: expiresAt
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('hex');
  const token = `${payloadB64}.${hmac}`;
  return {
    token,
    userId: user.id,
    username: user.username,
    name: user.name || user.username,
    role: user.role || 'Super Admin',
    createdAt: now,
    expiresAt: expiresAt
  };
}

function validateAdminSession(req) {
  let token = '';
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    const cookieHeader = req.headers['cookie'] || '';
    const match = cookieHeader.match(/admin_token=([a-zA-Z0-9_\-\.]+)/);
    if (match) token = match[1];
  }

  if (!token || !token.includes('.')) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;

  // Timing-safe signature check
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('hex');
  const bufA = Buffer.from(signature, 'hex');
  const bufB = Buffer.from(expectedSig, 'hex');
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    const now = Date.now();
    if (now > payload.exp) {
      return null; // Expired session
    }
    return {
      token,
      userId: payload.uid,
      username: payload.usr,
      name: payload.name,
      role: payload.rol,
      expiresAt: payload.exp
    };
  } catch (e) {
    return null;
  }
}

function revokeAdminSession(token) {
  // Stateless token self-expires at payload.exp
}

// 3. Brute-Force Lockout (5 attempts max -> 15 min lock)
const loginAttempts = new Map(); // ip -> { count, lockedUntil, firstAttempt }

function checkBruteForce(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec) return { allowed: true };
  if (rec.lockedUntil && rec.lockedUntil > now) {
    const remMins = Math.ceil((rec.lockedUntil - now) / 60000);
    return {
      allowed: false,
      message: `Security Lockout: Too many failed login attempts. Please try again after ${remMins} minute(s).`
    };
  }
  if (rec.lockedUntil && rec.lockedUntil <= now) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }
  if (rec.firstAttempt && (now - rec.firstAttempt) > 15 * 60 * 1000) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }
  return { allowed: true };
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip) || { count: 0, firstAttempt: now };
  rec.count += 1;
  rec.lastAttempt = now;
  if (rec.count >= 5) {
    rec.lockedUntil = now + (15 * 60 * 1000);
    console.warn(`[SECURITY ALERT] IP ${ip} locked out for 15 minutes due to 5 failed attempts.`);
  }
  loginAttempts.set(ip, rec);
}

function resetFailedLogin(ip) {
  loginAttempts.delete(ip);
}

// 4. Centralized Authentication Middleware for All Admin Routes
function requireAdminAuth(req, res) {
  const session = validateAdminSession(req);
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Unauthorized',
      message: 'Admin session is missing, invalid, or expired. Please log in again.'
    }));
    return null;
  }
  return session;
}

// Helper to read DB
function readDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return null;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading db.json:', err);
    return null;
  }
}

// Helper to write DB
function writeDatabase(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing to db.json:', err);
    return false;
  }
}

// Helper to save base64 image strings directly to disk to prevent db.json bloating
function saveBase64Image(dataUri, prefix = 'car') {
  if (!dataUri || typeof dataUri !== 'string' || !dataUri.startsWith('data:image/')) {
    return dataUri;
  }
  try {
    const matches = dataUri.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches) return dataUri;
    let ext = matches[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    if (ext === 'svg+xml') ext = 'svg';
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    const folder = prefix === 'logo' ? 'uploads' : path.join('uploads', 'cars');
    const uploadDir = path.join(__dirname, folder);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${ext}`;
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, buffer);
    return prefix === 'logo' ? `/uploads/${filename}` : `/uploads/cars/${filename}`;
  } catch (err) {
    console.error('Failed to save base64 image:', err);
    return dataUri;
  }
}

// Automatically upgrade legacy plain text passwords on server start
autoMigratePasswords();

// Helper to read request JSON body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Safeguard against huge payloads (up to 100MB for media/video uploads)
      if (body.length > 100 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.ogg': 'video/ogg',
  '.ogv': 'video/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0'
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getCarSlug(car) {
  if (!car) return 'car';
  if (car.slug && typeof car.slug === 'string' && car.slug.trim()) {
    return car.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  const name = car.name || car.id || 'car';
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function getBaseUrl(req, db) {
  const custom = db && db.seoSettings && db.seoSettings.canonicalUrl;
  if (custom && !custom.includes('localhost') && custom.startsWith('http')) {
    return custom.replace(/\/$/, '');
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  const proto = req.headers['x-forwarded-proto'] || ((host.includes('localhost') || host.includes('127.0.0.1')) ? 'http' : 'https');
  return `${proto}://${host}`.replace(/\/$/, '');
}

// Render branded luxury error page with reason explanation
function sendErrorPage(req, res, statusCode, title, reason) {
  const isHtml = req.headers && req.headers.accept && req.headers.accept.includes('text/html');
  if (!isHtml) {
    if (statusCode === 403) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        error: 'Access Denied: Protected System Resource',
        reason: reason || 'You do not have permission to access this protected resource.'
      }));
    }
    res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(`${statusCode} ${title || 'Error'}: ${reason || ''}`);
  }

  const errorHtmlPath = path.join(__dirname, 'error.html');
  let html = '';
  try {
    if (fs.existsSync(errorHtmlPath)) {
      html = fs.readFileSync(errorHtmlPath, 'utf8');
    }
  } catch (e) {}

  if (html) {
    const defaultTitle = statusCode === 403 ? 'Access Restricted' : (statusCode === 500 ? 'Internal Server Error' : 'Page or Vehicle Not Found');
    const defaultReason = statusCode === 403
      ? 'You do not have permission to access this protected system resource or directory.'
      : (statusCode === 500
        ? 'A temporary server error occurred while processing your request. Our technical team has been notified.'
        : 'The requested page or vehicle does not exist, has been moved, or you do not have permission to view it.');

    const finalTitle = title || defaultTitle;
    const finalReason = reason || defaultReason;

    const rendered = html
      .replace(/{{ERROR_CODE}}/g, String(statusCode))
      .replace(/{{ERROR_TITLE}}/g, escapeHtml(finalTitle))
      .replace(/{{ERROR_REASON}}/g, escapeHtml(finalReason));
    
    res.writeHead(statusCode, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    return res.end(rendered);
  }

  res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  return res.end(`<!DOCTYPE html><html><body style="background:#090a0c;color:#fff;font-family:sans-serif;padding:50px;text-align:center;"><h1>${statusCode} - ${title}</h1><p>${reason}</p><p><a href="/" style="color:#e11d48;font-weight:bold;">Return to Homepage</a></p></body></html>`);
}

// Bulletproof Base64 Image/Video Media Storage Helper
function saveBase64ImageFile(dataUrl, prefix, req, db) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const trimmed = dataUrl.trim();
  if (!trimmed.startsWith('data:image/') && !trimmed.startsWith('data:video/')) return trimmed;

  const commaIdx = trimmed.indexOf(',');
  if (commaIdx === -1) {
    throw new Error('Invalid media payload: missing base64 separator.');
  }

  const header = trimmed.substring(0, commaIdx).toLowerCase();
  const rawBase64 = trimmed.substring(commaIdx + 1).replace(/[\r\n\s]/g, '');

  let ext = '.jpg';
  if (header.includes('png')) ext = '.png';
  else if (header.includes('webp')) ext = '.webp';
  else if (header.includes('svg')) ext = '.svg';
  else if (header.includes('gif')) ext = '.gif';
  else if (header.includes('mp4')) ext = '.mp4';
  else if (header.includes('webm')) ext = '.webm';
  else if (header.includes('quicktime') || header.includes('mov')) ext = '.mov';
  else if (header.includes('ogg') || header.includes('ogv')) ext = '.ogv';
  else if (header.startsWith('data:video/')) ext = '.mp4';

  const safePrefix = (prefix || 'blog-media').replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = `${safePrefix}-${Date.now()}${ext}`;

  // Priority 1: uploads/ directory in project root
  let targetDir = path.join(__dirname, 'uploads');
  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true, mode: 0o755 });
    }
    fs.writeFileSync(path.join(targetDir, filename), Buffer.from(rawBase64, 'base64'));
  } catch (err1) {
    console.warn('[IMAGE UPLOADER] Could not write to uploads/, falling back to database/uploads/:', err1.message);
    try {
      targetDir = path.join(__dirname, 'database', 'uploads');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true, mode: 0o755 });
      }
      fs.writeFileSync(path.join(targetDir, filename), Buffer.from(rawBase64, 'base64'));
    } catch (err2) {
      console.error('[IMAGE UPLOADER] Storage write failed:', err2);
      throw new Error('Storage write failed on server: ' + err2.message);
    }
  }

  const base = getBaseUrl(req, db);
  return `${base}/uploads/${filename}`;
}

// ====================================================
// AI SEO COPILOT & KARACHI MARKET KNOWLEDGE ENGINE
// ====================================================

const KARACHI_MARKET_PRESETS = {
  all_rounder: {
    key: 'all_rounder',
    name: '🏆 Karachi Market Leader (All-Rounder)',
    description: 'Perfect balance of Airport transfers, Self-drive luxury, and Monthly rentals for maximum Google clicks.',
    title: '& Self Drive | Car 4 Rent',
    metaDescription: 'Top-rated rent a car in Karachi. Daily, weekly & monthly rentals on self-drive with zero deposit. 24/7 Jinnah Airport pickup & DHA delivery. Book at lowest rates!',
    metaKeywords: 'rent a car karachi, car rental karachi without driver, cheap car hire karachi, karachi airport car rental, monthly car rental karachi, wedding car rental karachi, luxury prado rent karachi',
    h1Heading: 'Premier Self-Drive Rent a Car Service in Karachi',
    heroSubtitle: 'Affordable, reliable & luxury car rentals across Karachi. 24/7 Jinnah Airport pickup, zero security deposit, and instant delivery to DHA, Clifton, and Gulshan.'
  },
  airport_express: {
    key: 'airport_express',
    name: '✈️ Karachi Airport & 24/7 Terminal Transfers',
    description: 'Target overseas Pakistanis and business travelers landing at Jinnah International Airport.',
    title: 'Karachi Airport Rent a Car | 24/7 Terminal Pickup | Car 4 Rent',
    metaDescription: '24/7 Karachi Airport rent a car with live flight tracking. Prompt pickup & drop at Jinnah International Airport. Pristine cars on self-drive. Book online now!',
    metaKeywords: 'karachi airport rent a car, rent a car karachi airport, jinnah international airport car rental, airport pickup car karachi, 24/7 airport taxi alternative karachi, airport car hire',
    h1Heading: '24/7 Karachi Airport Rent a Car & VIP Terminal Transfers',
    heroSubtitle: 'Hassle-free airport pick & drop at Jinnah International Airport. Terminal handover, sanitized sedans & luxury SUVs ready upon your flight landing.'
  },
  budget_economy: {
    key: 'budget_economy',
    name: '💰 Budget Saver & Sasti Cars (Alto, Cultus, WagonR)',
    description: 'Target high-volume daily commuters and cost-conscious renters looking for low daily rates.',
    title: 'Cheap Rent a Car in Karachi | Low Rates Self Drive | Car 4 Rent',
    metaDescription: 'Affordable rent a car in Karachi. Alto, Cultus, WagonR & Yaris on lowest daily rates without driver. No hidden charges & instant delivery. Book low budget car!',
    metaKeywords: 'cheap rent a car in karachi, low budget car rental karachi, alto for rent karachi, cultus rent a car karachi, monthly car rental karachi low rates, rent a car karachi without driver cheap',
    h1Heading: 'Affordable & Low-Budget Rent a Car in Karachi',
    heroSubtitle: 'Rent economy cars starting from Rs. 3,500/day. Clean, fuel-efficient hatchbacks and sedans for self-drive or daily city commute across Karachi.'
  },
  luxury_wedding: {
    key: 'luxury_wedding',
    name: '👑 Luxury VIP Protocol & Wedding Cars (Prado, Fortuner)',
    description: 'Target VIP delegates, corporate executives, and grand Karachi weddings & events.',
    title: 'Luxury Rent a Car Karachi | Prado, Fortuner & Weddings | C4R',
    metaDescription: 'Luxury car rental in Karachi. Prado, Land Cruiser & Fortuner for weddings on self-drive, corporate events & VIP protocol. 24/7 self-drive booking!',
    metaKeywords: 'luxury rent a car karachi, prado for rent in karachi, fortuner rental karachi, wedding car rental karachi, limousine rent karachi, executive car hire karachi, vip protocol cars',
    h1Heading: 'Luxury & VIP Protocol Rent a Car in Karachi',
    heroSubtitle: 'Make an entrance with Karachi\'s premier luxury fleet. Land Cruiser, Prado, Fortuner and executive sedans on self-drive with zero deposit.'
  }
};

function evaluateSeoMarketHealth(data = {}) {
  const title = (data.title || '').trim();
  const desc = (data.desc || '').trim();
  const keywords = (data.keywords || '').trim();
  const h1 = (data.h1 || '').trim();
  const combined = `${title.toLowerCase()} ${desc.toLowerCase()} ${keywords.toLowerCase()} ${h1.toLowerCase()}`;

  let score = 100;
  const dos = [];
  const donts = [];
  const suggestions = [];

  // 1. Check Title Length
  if (title.length === 0) {
    score -= 30;
    donts.push({
      type: 'critical',
      tag: 'Empty Title',
      message: 'Meta Title is empty. A descriptive title is required for search engines to index and rank your website.'
    });
  } else if (title.length < 45) {
    score -= 15;
    donts.push({
      type: 'warning',
      tag: 'Title Too Short',
      message: `Your title is only ${title.length} characters. Google displays 50–60 characters. Consider adding high-intent keywords.`
    });
  } else if (title.length > 65) {
    score -= 10;
    donts.push({
      type: 'warning',
      tag: 'Title Too Long',
      message: `Title is too long (${title.length} characters). Google will truncate it after 60 characters with ellipses (...).`
    });
  } else {
    dos.push({
      type: 'success',
      tag: 'Optimal Length',
      message: `Title length is optimal (${title.length}/60 characters).`
    });
  }

  // 2. Check Description Length
  if (desc.length === 0) {
    score -= 25;
    donts.push({
      type: 'critical',
      tag: 'Empty Description',
      message: 'Meta Description is empty. 140–160 characters are required to maximize search click-through rates (CTR).'
    });
  } else if (desc.length < 130) {
    score -= 15;
    donts.push({
      type: 'warning',
      tag: 'Description Too Short',
      message: `Meta description is short (${desc.length} characters). Market standard is 140–160 characters.`
    });
  } else if (desc.length > 165) {
    score -= 10;
    donts.push({
      type: 'warning',
      tag: 'Description Too Long',
      message: `Meta description is long (${desc.length} characters) and may be truncated in search snippets.`
    });
  } else {
    dos.push({
      type: 'success',
      tag: 'Optimal Description',
      message: `Meta description length is optimal (${desc.length}/160 characters).`
    });
  }

  // 3. Check City / Geo Mention
  if (!combined.includes('karachi')) {
    score -= 20;
    donts.push({
      type: 'critical',
      tag: 'Missing City',
      message: 'Target city "Karachi" is missing. Local SEO ranking requires the primary city in tags.'
    });
  } else {
    dos.push({
      type: 'success',
      tag: 'Local SEO',
      message: 'Target city "Karachi" is properly included.'
    });
  }

  // 4. Missing High-Volume Market Intent Drivers
  const highIntentKeywords = [
    { key: 'airport', label: 'Karachi Airport Pickup / Drop', weight: 8, chip: 'Airport Pickup' },
    { key: 'luxury', label: 'Luxury Self Drive Fleet', weight: 8, chip: 'Luxury Self Drive' },
    { key: 'self', alt: 'without driver', label: 'Without Driver / Self-Drive', weight: 8, chip: 'Without Driver' },
    { key: 'rate', alt: 'cheap|lowest|affordable|best rate', label: 'Pricing / Best Rates Guarantee', weight: 6, chip: 'Best Rates' },
    { key: 'dha', alt: 'clifton|gulshan', label: 'High-Demand Areas (DHA, Clifton, Gulshan)', weight: 5, chip: 'DHA & Clifton' },
    { key: '24/7', alt: '24 hours|round the clock', label: '24/7 Availability / Emergency Booking', weight: 4, chip: '24/7 Service' },
    { key: 'book', alt: 'whatsapp|call|reserve|contact', label: 'Call to Action (Book Now / WhatsApp)', weight: 6, chip: 'Book Now' }
  ];

  highIntentKeywords.forEach(kw => {
    const hasKey = kw.alt 
      ? new RegExp(kw.key + '|' + kw.alt, 'i').test(combined)
      : combined.includes(kw.key);

    if (hasKey) {
      dos.push({
        type: 'success',
        tag: 'Market Match',
        message: `High-converting keyword "${kw.label}" is included.`
      });
    } else {
      score -= kw.weight;
      suggestions.push({
        label: kw.label,
        chip: kw.chip,
        tip: `Searchers frequently query "${kw.label}".`
      });
    }
  });

  // 5. Keyword Stuffing Detection (in visible snippets)
  const snippetText = `${title.toLowerCase()} ${desc.toLowerCase()}`;
  const carCount = (snippetText.match(/\bcar\b/g) || []).length;
  const rentCount = (snippetText.match(/\brent\b/g) || []).length;
  if (carCount > 4 || rentCount > 4) {
    score -= 10;
    donts.push({
      type: 'warning',
      tag: 'Keyword Stuffing',
      message: 'Keyword stuffing detected. "Car" or "Rent" is repeated more than 4 times, risking search penalties.'
    });
  }

  // 6. ALL CAPS Check
  if (/[A-Z]{4,}/.test(title) || /[A-Z]{4,}/.test(desc)) {
    score -= 5;
    donts.push({
      type: 'warning',
      tag: 'Excessive Capitals',
      message: 'Avoid ALL CAPS words. Search engines and users perceive excessive capitals as spam.'
    });
  }

  // 7. Generic Phrases Check
  if (combined.includes('best car in world') || combined.includes('welcome to our website')) {
    score -= 5;
    donts.push({
      type: 'warning',
      tag: 'Vague Text',
      message: '"Welcome to our website" jese fuzool jumlay na likhein — seedha services aur pricing batayein.'
    });
  }

  score = Math.max(15, Math.min(100, Math.round(score)));

  let statusText = 'Needs Improvement ⚠️';
  let badgeColor = 'amber';
  if (score >= 90) {
    statusText = 'Market Ready / Top Ranked 🚀';
    badgeColor = 'emerald';
  } else if (score >= 70) {
    statusText = 'Good / Almost Competitive 👍';
    badgeColor = 'blue';
  }

  return {
    score,
    statusText,
    badgeColor,
    dos,
    donts,
    suggestions,
    marketInsight: 'Karachi rental car market mein 60%+ organic traffic "without driver" aur "airport rent a car" par aata hai. In terms ko Title aur Meta Description mein lazmi shamil karein.'
  };
}

const server = http.createServer(async (req, res) => {
  // CORS Headers for seamless local access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;
  const reqHost = req.headers.host || 'localhost';
  const currentDomain = normalizeDomain(reqHost);

  // ====================================================
  // LEGACY WORDPRESS & FEED 301 REDIRECTS (Google Search Console Cleanup)
  // ====================================================
  const lowerPath = pathname.toLowerCase();
  if (
    lowerPath.startsWith('/wp-') ||
    lowerPath.includes('admin-ajax.php') ||
    lowerPath === '/feed' ||
    lowerPath === '/feed/' ||
    lowerPath.startsWith('/feed/') ||
    lowerPath.endsWith('/feed') ||
    lowerPath.endsWith('/feed/') ||
    lowerPath.startsWith('/comments/feed')
  ) {
    res.writeHead(301, {
      'Location': '/',
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000'
    });
    return res.end('301 Moved Permanently');
  }


  // ====================================================
  // 1. HTTP FIREWALL: Block any attempt to access internal/sensitive files
  // ====================================================
  const normalizedPath = path.normalize(pathname).toLowerCase().replace(/\\/g, '/');
  if (
    normalizedPath.includes('/database') ||
    normalizedPath.includes('db.json') ||
    normalizedPath.endsWith('.json') ||
    normalizedPath.endsWith('.bat') ||
    normalizedPath.endsWith('.env') ||
    normalizedPath.endsWith('.md') ||
    normalizedPath.endsWith('.lock') ||
    (normalizedPath.endsWith('.txt') && !normalizedPath.endsWith('robots.txt')) ||
    normalizedPath.includes('keygen') ||
    normalizedPath.includes('build_') ||
    normalizedPath.includes('node_modules') ||
    normalizedPath.includes('/.')
  ) {
    return sendErrorPage(req, res, 403, 'Access Restricted', 'You do not have permission to access this protected system resource or directory.');
  }

  // ====================================================
  // 2. ADMIN AUTHENTICATION GUARD for all /api/admin/* endpoints
  // ====================================================
  if (pathname.startsWith('/api/admin/')) {
    const session = requireAdminAuth(req, res);
    if (!session) return; // 401 response already sent
    req.adminSession = session;
  }

  // ====================================================
  // LICENSE ACTIVATION & VERIFICATION SYSTEM
  // ====================================================

  // Check License Status Endpoint
  if (pathname === '/api/license-status' && req.method === 'GET') {
    const db = readDatabase() || {};
    const currentLicenseKey = (db.license && db.license.key) || '';
    const check = verifyLicenseKey(currentLicenseKey, currentDomain);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      success: true,
      currentDomain: currentDomain,
      isLicensed: check.valid,
      license: check.valid ? {
        domain: check.domain,
        type: check.type,
        expiresAt: check.expiresAt,
        daysLeft: check.daysLeft,
        activatedAt: db.license && db.license.activatedAt
      } : null,
      reason: check.valid ? null : check.reason
    }));
  }

  // Activate License Endpoint
  if (pathname === '/api/activate-license' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { key } = body || {};
      if (!key || typeof key !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'License key is required.' }));
      }
      const check = verifyLicenseKey(key.trim(), currentDomain);
      if (!check.valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          error: check.reason || 'Invalid license key for this domain.'
        }));
      }

      // Valid! Save to central database
      const db = readDatabase() || {};
      db.license = {
        key: key.trim(),
        domain: check.domain,
        type: check.type,
        expiresAt: check.expiresAt,
        activatedAt: new Date().toISOString()
      };
      writeDatabase(db);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        message: 'Domain license successfully activated!',
        domain: check.domain,
        type: check.type,
        expiresAt: check.expiresAt,
        daysLeft: check.daysLeft
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: e.message }));
    }
  }

  // Check if Static Asset or Activation Page (Allow access to render activate.html)
  const isStaticAsset = /\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|otf|map|mp4|webm|txt|xml)$/i.test(pathname);
  const isActivationRoute = pathname === '/activate.html' || pathname === '/activate';

  // License Guard Enforcement
  const dbForLicense = readDatabase() || {};
  const currentKey = (dbForLicense.license && dbForLicense.license.key) || '';
  const licenseCheck = verifyLicenseKey(currentKey, currentDomain);

  if (!licenseCheck.valid && !isStaticAsset && !isActivationRoute) {
    if (pathname.startsWith('/api/')) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: false,
        error: 'LICENSE_REQUIRED',
        message: licenseCheck.reason || 'Software license key is missing or invalid for this domain.',
        hostDomain: currentDomain,
        redirect: '/activate'
      }));
    }

    res.writeHead(302, { 'Location': '/activate' });
    return res.end();
  }

  // Dynamic Favicon from Admin Panel Logo
  if (pathname === '/favicon.ico' && req.method === 'GET') {
    const db = readDatabase() || {};
    const logoUrl = db.settings && db.settings.logoUrl;
    if (logoUrl && logoUrl.startsWith('data:image/')) {
      try {
        const parts = logoUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
        const buf = Buffer.from(parts[1], 'base64');
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400' });
        return res.end(buf);
      } catch (e) {}
    }
  }

  // ====================================================
  // TECHNICAL SEO: SITEMAP.XML & ROBOTS.TXT
  // ====================================================

  // Dynamic XML Sitemap
  if (pathname === '/sitemap.xml' && req.method === 'GET') {
    const db = readDatabase() || {};
    const baseUrl = getBaseUrl(req, db);
    const today = new Date().toISOString().split('T')[0];

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // 1. Homepage
    xml += `  <url>\n    <loc>${baseUrl}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

    // 2. Active Dedicated SEO Landing Pages
    const pages = (db.seoLandingPages || []).filter(p => p.active !== false);
    pages.forEach(p => {
      const slug = p.slug.startsWith('/') ? p.slug : `/${p.slug}`;
      xml += `  <url>\n    <loc>${baseUrl}${slug}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>${p.priority || '0.9'}</priority>\n  </url>\n`;
    });

    // 3. Dynamic Individual Car Dedicated SEO Pages
    (db.cars || []).forEach(c => {
      const slug = getCarSlug(c);
      xml += `  <url>\n    <loc>${baseUrl}/cars/${slug}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.85</priority>\n  </url>\n`;
    });

    // 4. Main Blog Page & Individual Blog Articles
    xml += `  <url>\n    <loc>${baseUrl}/blog</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.85</priority>\n  </url>\n`;
    (db.blogs || []).filter(b => b.published !== false).forEach(b => {
      xml += `  <url>\n    <loc>${baseUrl}/blog/${b.slug}</loc>\n    <lastmod>${b.date || today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.80</priority>\n  </url>\n`;
    });

    xml += '</urlset>';

    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    return res.end(xml);
  }

  // Dynamic Robots.txt
  if (pathname === '/robots.txt' && req.method === 'GET') {
    const db = readDatabase() || {};
    const baseUrl = getBaseUrl(req, db);

    let content = db.seoSettings && db.seoSettings.customRobotsTxt;
    if (!content) {
      content = `User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /api/admin/\n\nSitemap: ${baseUrl}/sitemap.xml`;
    } else {
      content = content.replace(/\{baseUrl\}|\$baseUrl/g, baseUrl);
      if (!content.includes('Sitemap:')) {
        content += `\n\nSitemap: ${baseUrl}/sitemap.xml`;
      }
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(content);
  }

  // Dynamic LLMs.txt for AI Agents / WebMCP Discoverability
  if (pathname === '/llms.txt' && req.method === 'GET') {
    const filePath = path.join(__dirname, 'llms.txt');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      return res.end(content);
    }
    const db = readDatabase() || {};
    const baseUrl = getBaseUrl(req, db);
    const fallback = `# CAR 4 RENT (Pvt. Ltd.)\n> Karachi's premier self-drive car rental company.\n\n- Website: ${baseUrl}/\n- Fleet: ${baseUrl}/#fleet\n- Rate Calculator: ${baseUrl}/#calculator\n- Phone: +92 302 3650000\n- WhatsApp: https://wa.me/923023650000\n`;
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
    return res.end(fallback);
  }

  // ====================================================
  // API ROUTING
  // ====================================================

  // 1. GET /api/public-data - For visitors / homepage
  if (pathname === '/api/public-data' && req.method === 'GET') {
    const db = readDatabase();
    if (!db) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Database unreadable' }));
    }
    const publicData = {
      settings: db.settings,
      categories: db.categories || [],
      brands: db.brands || [],
      cars: db.cars || [],
      reviews: (db.reviews || []).filter(r => r.active !== false),
      navMenus: db.navMenus || [],
      servicesSection: db.servicesSection || {},
      whyChooseUsSection: db.whyChooseUsSection || {},
      typography: db.typography || {},
      aboutSection: db.aboutSection || {},
      fleetSection: db.fleetSection || {},
      statsSection: db.statsSection || [],
      heroButtons: db.heroButtons || {},
      seoSettings: db.seoSettings || {},
      seoLandingPages: (db.seoLandingPages || []).filter(p => p.active !== false),
      seoFaqs: db.seoFaqs || [],
      karachiAreas: db.karachiAreas || [],
      calculatorConfig: db.calculatorConfig || {}
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(publicData));
  }

  // 1.1 GET /api/public-blogs - Published blog articles for client filtering
  if (pathname === '/api/public-blogs' && req.method === 'GET') {
    const db = readDatabase() || {};
    const published = (db.blogs || []).filter(b => b.published !== false);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(published));
  }

  // 2. POST /api/login - Hardened Admin Authentication with Anti-Brute-Force & PBKDF2
  if (pathname === '/api/login' && req.method === 'POST') {
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const ip = rawIp.split(',')[0].trim();

    const bruteCheck = checkBruteForce(ip);
    if (!bruteCheck.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: bruteCheck.message }));
    }

    try {
      const { username, password } = await parseJsonBody(req);
      if (!username || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Username aur password zaroori hain.' }));
      }

      const db = readDatabase() || {};
      const user = (db.users || []).find(u => u.username.toLowerCase() === username.trim().toLowerCase());

      if (!user || !verifyPassword(password.trim(), user.password)) {
        recordFailedLogin(ip);
        // Delay 600ms to eliminate timing attack vectors and slow down automated attacks
        await new Promise(r => setTimeout(r, 600));
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ 
          success: false, 
          message: 'Invalid username or password. Please verify your credentials.' 
        }));
      }

      if (user.active === false || user.status === 'disabled') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ 
          success: false, 
          message: 'This administrator account has been disabled. Please contact the system administrator.' 
        }));
      }

      // Upgrade plain password to PBKDF2 hash on successful login if not already hashed
      if (!user.password.includes(':')) {
        user.password = hashPassword(password.trim());
        writeDatabase(db);
      }

      // Successful login: reset brute force counter
      resetFailedLogin(ip);

      // Create cryptographically secure session
      const session = createAdminSession(user);

      // Set cookie for browser session backup
      res.setHeader('Set-Cookie', `admin_token=${session.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        token: session.token,
        expiresIn: SESSION_MAX_IDLE,
        user: { 
          id: user.id, 
          username: user.username, 
          name: user.name, 
          role: user.role,
          permissions: user.permissions || {}
        }
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Authentication error: ' + e.message }));
    }
  }

  // 2B. GET /api/admin/verify-session - Validate token and get active session details
  if (pathname === '/api/admin/verify-session' && req.method === 'GET') {
    const session = req.adminSession;
    const db = readDatabase() || {};
    const currentUser = (db.users || []).find(u => u.id === session.userId) || {};
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      success: true,
      user: {
        id: session.userId,
        username: session.username,
        name: session.name,
        role: session.role,
        permissions: currentUser.permissions || {}
      },
      expiresIn: Math.max(0, session.expiresAt - Date.now())
    }));
  }

  // 2C. POST /api/admin/logout - Invalidate admin session immediately
  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    if (req.adminSession && req.adminSession.token) {
      revokeAdminSession(req.adminSession.token);
    }
    res.setHeader('Set-Cookie', 'admin_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, message: 'Logged out successfully' }));
  }

  // 3. GET /api/admin/all - Full database for logged in admin (Passwords STRIPPED)
  if (pathname === '/api/admin/all' && req.method === 'GET') {
    const db = readDatabase() || {};
    const safeUsers = (db.users || []).map(u => ({
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      active: u.active !== false,
      status: u.active !== false ? 'active' : 'disabled',
      createdAt: u.createdAt || '',
      permissions: u.permissions || {}
      // Passwords are strictly never sent to client
    }));
    const adminData = {
      ...db,
      users: safeUsers
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(adminData));
  }

  // 4. POST /api/admin/settings - Update site settings, emergency, offer, logo, footer
  if (pathname === '/api/admin/settings' && req.method === 'POST') {
    try {
      const newSettings = await parseJsonBody(req);
      newSettings.updated_at = Date.now();
      if (newSettings.logoUrl && newSettings.logoUrl.startsWith('data:image/')) {
        newSettings.logoUrl = saveBase64Image(newSettings.logoUrl, 'logo');
      }
      if (newSettings.heroCarImage && newSettings.heroCarImage.startsWith('data:image/')) {
        newSettings.heroCarImage = saveBase64Image(newSettings.heroCarImage, 'hero');
      }
      const db = readDatabase();
      db.settings = {
        ...db.settings,
        ...newSettings
      };
      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, settings: db.settings }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 5. POST /api/admin/categories - Manage Categories (Add / Edit / Delete)
  if (pathname === '/api/admin/categories' && req.method === 'POST') {
    try {
      const { action, category } = await parseJsonBody(req);
      const db = readDatabase();
      db.categories = db.categories || [];

      if (action === 'add') {
        category.id = 'cat-' + Date.now();
        db.categories.push(category);
      } else if (action === 'edit') {
        const idx = db.categories.findIndex(c => c.id === category.id);
        if (idx !== -1) {
          db.categories[idx] = { ...db.categories[idx], ...category };
        }
      } else if (action === 'delete') {
        db.categories = db.categories.filter(c => c.id !== category.id);
      }

      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, categories: db.categories }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 6. POST /api/admin/brands - Manage Brands
  if (pathname === '/api/admin/brands' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const db = readDatabase();
      db.brands = db.brands || [];

      if (Array.isArray(body.brands)) {
        db.brands = body.brands;
      } else if (body.action === 'add' && body.brand) {
        if (!db.brands.includes(body.brand.toUpperCase())) {
          db.brands.push(body.brand.toUpperCase());
        }
      } else if (body.action === 'edit' && body.oldBrand && body.brand) {
        const idx = db.brands.indexOf(body.oldBrand.toUpperCase());
        if (idx !== -1) {
          db.brands[idx] = body.brand.toUpperCase();
        }
      } else if (body.action === 'delete' && body.brand) {
        db.brands = db.brands.filter(b => b !== body.brand.toUpperCase());
      }

      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, brands: db.brands }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 7. POST /api/admin/cars - Manage Cars (Add, Edit, Delete)
  if (pathname === '/api/admin/cars' && req.method === 'POST') {
    try {
      const { action, car } = await parseJsonBody(req);
      const db = readDatabase();
      db.cars = db.cars || [];

      if (action === 'add' || action === 'edit') {
        if (car && car.image && car.image.startsWith('data:image/')) {
          car.image = saveBase64Image(car.image, 'car');
        }
      }

      if (action === 'add') {
        car.id = 'car-' + Date.now();
        db.cars.unshift(car);
      } else if (action === 'edit') {
        const idx = db.cars.findIndex(c => c.id === car.id);
        if (idx !== -1) {
          db.cars[idx] = { ...db.cars[idx], ...car };
        }
      } else if (action === 'delete') {
        db.cars = db.cars.filter(c => c.id !== car.id);
      }

      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, cars: db.cars }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 8. POST /api/admin/reviews - Manage Reviews (Add, Edit, Toggle Active, Delete)
  if (pathname === '/api/admin/reviews' && req.method === 'POST') {
    try {
      const { action, review } = await parseJsonBody(req);
      const db = readDatabase();
      db.reviews = db.reviews || [];

      if (action === 'add') {
        review.id = 'rev-' + Date.now();
        if (review.active === undefined) review.active = true;
        db.reviews.unshift(review);
      } else if (action === 'edit') {
        const idx = db.reviews.findIndex(r => r.id === review.id);
        if (idx !== -1) {
          db.reviews[idx] = { ...db.reviews[idx], ...review };
        }
      } else if (action === 'toggle') {
        const item = db.reviews.find(r => r.id === review.id);
        if (item) {
          item.active = !item.active;
        }
      } else if (action === 'delete') {
        db.reviews = db.reviews.filter(r => r.id !== review.id);
      }

      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, reviews: db.reviews }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 9. POST /api/admin/users - Manage Admin Users (Add, Edit, Toggle Active, Delete)
  if (pathname === '/api/admin/users' && req.method === 'POST') {
    try {
      const { action, user } = await parseJsonBody(req);
      const db = readDatabase();
      db.users = db.users || [];

      if (action === 'add') {
        if (!user.username || !user.password) {
          throw new Error('Username and Password required');
        }
        if (db.users.some(u => u.username.toLowerCase() === user.username.toLowerCase())) {
          throw new Error('Username already exists');
        }
        user.id = 'user-' + Date.now();
        user.password = hashPassword(user.password.trim());
        user.active = user.active !== false;
        user.status = user.active ? 'active' : 'disabled';
        user.createdAt = user.createdAt || new Date().toISOString().split('T')[0];
        db.users.push(user);
      } else if (action === 'edit') {
        const idx = db.users.findIndex(u => u.id === user.id);
        if (idx === -1) {
          throw new Error('User not found');
        }
        if (user.username && db.users.some(u => u.username.toLowerCase() === user.username.toLowerCase() && u.id !== user.id)) {
          throw new Error('Username already taken by another admin');
        }
        const existing = db.users[idx];
        db.users[idx] = {
          ...existing,
          name: user.name !== undefined ? user.name : existing.name,
          username: user.username !== undefined ? user.username : existing.username,
          role: user.role !== undefined ? user.role : existing.role,
          active: user.active !== undefined ? user.active : (existing.active !== false),
          status: (user.active !== undefined ? user.active : (existing.active !== false)) ? 'active' : 'disabled',
          permissions: user.permissions !== undefined ? user.permissions : (existing.permissions || {})
        };
        if (user.password && user.password.trim().length > 0) {
          db.users[idx].password = hashPassword(user.password.trim());
        }
      } else if (action === 'update_permissions') {
        const idx = db.users.findIndex(u => u.id === user.id);
        if (idx === -1) {
          throw new Error('User not found');
        }
        db.users[idx].permissions = user.permissions || {};
      } else if (action === 'toggle') {
        const item = db.users.find(u => u.id === user.id);
        if (item) {
          item.active = item.active === false ? true : false;
          item.status = item.active ? 'active' : 'disabled';
        }
      } else if (action === 'delete') {
        if (db.users.length <= 1) {
          throw new Error('Cannot delete the last remaining admin account!');
        }
        db.users = db.users.filter(u => u.id !== user.id && u.username !== user.username);
      }

      writeDatabase(db);
      const updatedUsers = db.users.map(u => ({
        id: u.id,
        username: u.username,
        name: u.name,
        role: u.role,
        active: u.active !== false,
        status: u.active !== false ? 'active' : 'disabled',
        createdAt: u.createdAt || '',
        permissions: u.permissions || {}
        // Passwords strictly omitted
      }));

      let newToken = null;
      let currentUser = null;
      if (req.adminSession && user && req.adminSession.userId === user.id) {
        const updatedSelf = db.users.find(u => u.id === user.id);
        if (updatedSelf) {
          const freshSession = createAdminSession(updatedSelf);
          newToken = freshSession.token;
          currentUser = {
            id: updatedSelf.id,
            username: updatedSelf.username,
            name: updatedSelf.name,
            role: updatedSelf.role
          };
          res.setHeader('Set-Cookie', `admin_token=${freshSession.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800`);
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ 
        success: true, 
        users: updatedUsers,
        newToken,
        currentUser
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 9b. POST /api/admin/menus - Manage Navigation Menus (Add, Edit, Delete)
  if (pathname === '/api/admin/menus' && req.method === 'POST') {
    try {
      const { action, item } = await parseJsonBody(req);
      const db = readDatabase();
      db.navMenus = db.navMenus || [];

      if (action === 'add') {
        item.id = 'menu-' + Date.now();
        db.navMenus.push(item);
      } else if (action === 'edit') {
        const idx = db.navMenus.findIndex(m => m.id === item.id);
        if (idx !== -1) db.navMenus[idx] = { ...db.navMenus[idx], ...item };
      } else if (action === 'delete') {
        db.navMenus = db.navMenus.filter(m => m.id !== item.id);
      }

      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, navMenus: db.navMenus }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 9c. POST /api/admin/services - Manage Services Section
  if (pathname === '/api/admin/services' && req.method === 'POST') {
    try {
      const servicesData = await parseJsonBody(req);
      const db = readDatabase();
      db.servicesSection = servicesData;
      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, servicesSection: db.servicesSection }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 9d. POST /api/admin/why-choose-us - Manage Why Choose Us Section
  if (pathname === '/api/admin/why-choose-us' && req.method === 'POST') {
    try {
      const whyData = await parseJsonBody(req);
      const db = readDatabase();
      db.whyChooseUsSection = whyData;
      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, whyChooseUsSection: db.whyChooseUsSection }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 10. POST /api/quote - Public Quotation Inquiry Submission
  if (pathname === '/api/quote' && req.method === 'POST') {
    try {
      const quote = await parseJsonBody(req);
      const db = readDatabase();
      db.quotes = db.quotes || [];

      quote.id = 'quote-' + Date.now();
      quote.createdAt = new Date().toLocaleString();
      quote.status = 'Pending';
      db.quotes.unshift(quote);

      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, quoteId: quote.id }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 10b. GET & POST /api/proposal - Commercial Client Proposal & Pricing Engine
  if (pathname === '/api/proposal' && req.method === 'GET') {
    const db = readDatabase() || {};
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, proposal: db.clientProposal || null }));
  }

  if (pathname === '/api/proposal' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const db = readDatabase() || {};
      db.clientProposal = data;
      writeDatabase(db);
      const distDbPath = path.join(__dirname, 'dist', 'database', 'db.json');
      if (fs.existsSync(distDbPath)) {
        fs.writeFileSync(distDbPath, JSON.stringify(db, null, 2), 'utf8');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, proposal: db.clientProposal }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 11. POST /api/admin/quotes - Admin manage quotes (status, delete)
  if (pathname === '/api/admin/quotes' && req.method === 'POST') {
    try {
      const { action, id, status } = await parseJsonBody(req);
      const db = readDatabase();
      db.quotes = db.quotes || [];

      if (action === 'update_status') {
        const item = db.quotes.find(q => q.id === id);
        if (item) item.status = status;
      } else if (action === 'delete') {
        db.quotes = db.quotes.filter(q => q.id !== id);
      } else if (action === 'clear_all') {
        db.quotes = [];
      }

      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, quotes: db.quotes }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 11b. POST /api/admin/upload-image - Upload Image (SEO OG Cover, Fleet, Logo) to local server storage
  if (pathname === '/api/admin/upload-image' && req.method === 'POST') {
    try {
      const { data, prefix } = await parseJsonBody(req);
      if (!data || typeof data !== 'string') {
        throw new Error('Image data is required.');
      }
      const db = readDatabase() || {};
      const publicUrl = saveBase64ImageFile(data, prefix || 'seo-car', req, db);
      if (!publicUrl) {
        throw new Error('Failed to process image.');
      }

      // Automatically sync to seoSettings if this was for SEO car
      if ((prefix === 'seo-car' || prefix === 'seo-og') && db.seoSettings) {
        db.seoSettings.ogImage = publicUrl;
        writeDatabase(db);
      }

      const filename = path.basename(publicUrl);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ 
        success: true, 
        url: publicUrl,
        relativeUrl: `/uploads/${filename}`,
        filename 
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // ====================================================
  // SEO SPECIFIC ADMIN APIs
  // ====================================================

  // 12. POST /api/admin/seo-settings - Manage Global SEO Engine
  if (pathname === '/api/admin/seo-settings' && req.method === 'POST') {
    try {
      const newSeoSettings = await parseJsonBody(req);
      const db = readDatabase() || {};

      // If ogImage was submitted as base64, auto-convert it to physical file on disk
      if (newSeoSettings.ogImage && newSeoSettings.ogImage.startsWith('data:image/')) {
        const savedUrl = saveBase64ImageFile(newSeoSettings.ogImage, 'seo-car', req, db);
        if (savedUrl) {
          newSeoSettings.ogImage = savedUrl;
        }
      }

      db.seoSettings = {
        ...(db.seoSettings || {}),
        ...newSeoSettings
      };
      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, seoSettings: db.seoSettings }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 12B. POST /api/admin/content-typography - Manage Typography, Font Families, Desktop/Mobile Sizes & Section Content
  if (pathname === '/api/admin/content-typography' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const db = readDatabase() || {};

      if (payload.typography) {
        db.typography = { ...(db.typography || {}), ...payload.typography };
      }
      if (payload.aboutSection) {
        db.aboutSection = { ...(db.aboutSection || {}), ...payload.aboutSection };
      }
      if (payload.fleetSection) {
        db.fleetSection = { ...(db.fleetSection || {}), ...payload.fleetSection };
      }
      if (payload.statsSection) {
        db.statsSection = payload.statsSection;
      }
      if (payload.heroButtons) {
        db.heroButtons = { ...(db.heroButtons || {}), ...payload.heroButtons };
      }
      if (payload.heroContent) {
        db.seoSettings = db.seoSettings || {};
        if (payload.heroContent.h1Heading !== undefined) {
          db.seoSettings.h1Heading = payload.heroContent.h1Heading;
        }
        if (payload.heroContent.heroSubtitle !== undefined) {
          db.seoSettings.heroSubtitle = payload.heroContent.heroSubtitle;
        }
      }
      if (payload.servicesSection) {
        db.servicesSection = { ...(db.servicesSection || {}), ...payload.servicesSection };
      }

      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ 
        success: true, 
        typography: db.typography,
        aboutSection: db.aboutSection,
        fleetSection: db.fleetSection,
        statsSection: db.statsSection,
        heroButtons: db.heroButtons,
        seoSettings: db.seoSettings,
        servicesSection: db.servicesSection
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 13. POST /api/admin/seo-pages - Manage Dedicated Landing Pages
  if (pathname === '/api/admin/seo-pages' && req.method === 'POST') {
    try {
      const { action, page } = await parseJsonBody(req);
      const db = readDatabase();
      db.seoLandingPages = db.seoLandingPages || [];

      if (action === 'add') {
        page.id = 'seo-' + Date.now();
        page.slug = (page.slug || ('page-' + Date.now())).toLowerCase().replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9-_]/g, '-');
        if (page.active === undefined) page.active = true;
        db.seoLandingPages.push(page);
      } else if (action === 'edit') {
        const idx = db.seoLandingPages.findIndex(p => p.id === page.id);
        if (idx !== -1) {
          if (page.slug) {
            page.slug = page.slug.toLowerCase().replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9-_]/g, '-');
          }
          db.seoLandingPages[idx] = { ...db.seoLandingPages[idx], ...page };
        }
      } else if (action === 'toggle') {
        const item = db.seoLandingPages.find(p => p.id === page.id);
        if (item) item.active = !item.active;
      } else if (action === 'delete') {
        db.seoLandingPages = db.seoLandingPages.filter(p => p.id !== page.id);
      }

      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, seoLandingPages: db.seoLandingPages }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 14. POST /api/admin/seo-faqs - Manage Homepage FAQs
  if (pathname === '/api/admin/seo-faqs' && req.method === 'POST') {
    try {
      const { action, faq } = await parseJsonBody(req);
      const db = readDatabase();
      db.seoFaqs = db.seoFaqs || [];

      if (action === 'add') {
        faq.id = 'faq-' + Date.now();
        db.seoFaqs.push(faq);
      } else if (action === 'edit') {
        const idx = db.seoFaqs.findIndex(f => f.id === faq.id);
        if (idx !== -1) db.seoFaqs[idx] = { ...db.seoFaqs[idx], ...faq };
      } else if (action === 'delete') {
        db.seoFaqs = db.seoFaqs.filter(f => f.id !== faq.id);
      }

      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, seoFaqs: db.seoFaqs }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 15. POST /api/admin/seo-areas - Manage Karachi Local Areas Matrix
  if (pathname === '/api/admin/seo-areas' && req.method === 'POST') {
    try {
      const { action, area } = await parseJsonBody(req);
      const db = readDatabase();
      db.karachiAreas = db.karachiAreas || [];

      if (action === 'add') {
        area.id = 'area-' + Date.now();
        db.karachiAreas.push(area);
      } else if (action === 'edit') {
        const idx = db.karachiAreas.findIndex(a => a.id === area.id);
        if (idx !== -1) db.karachiAreas[idx] = { ...db.karachiAreas[idx], ...area };
      } else if (action === 'delete') {
        db.karachiAreas = db.karachiAreas.filter(a => a.id !== area.id);
      }

      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, karachiAreas: db.karachiAreas }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 15.1 POST /api/admin/blogs - Complete CRUD for Blog Articles & Guides
  if (pathname === '/api/admin/blogs' && req.method === 'POST') {
    try {
      const { action, blog } = await parseJsonBody(req);
      const db = readDatabase();
      db.blogs = db.blogs || [];

      if (action === 'add') {
        blog.id = 'blog-' + Date.now();
        blog.slug = (blog.slug || blog.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        blog.date = blog.date || new Date().toISOString().split('T')[0];
        blog.published = blog.published !== false;
        db.blogs.unshift(blog);
      } else if (action === 'edit') {
        const idx = db.blogs.findIndex(b => b.id === blog.id);
        if (idx !== -1) {
          blog.slug = (blog.slug || blog.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
          db.blogs[idx] = { ...db.blogs[idx], ...blog };
        }
      } else if (action === 'delete') {
        db.blogs = db.blogs.filter(b => b.id !== blog.id);
      } else if (action === 'toggle') {
        const item = db.blogs.find(b => b.id === blog.id);
        if (item) item.published = !item.published;
      }

      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, blogs: db.blogs }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 16. POST /api/admin/ai-seo-advisor - Real-time AI Evaluation & Recommendations
  if (pathname === '/api/admin/ai-seo-advisor' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const analysis = evaluateSeoMarketHealth(data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, ...analysis }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 17. POST /api/admin/ai-seo-generate - Generate Market-Winning SEO Content & Presets
  if (pathname === '/api/admin/ai-seo-generate' && req.method === 'POST') {
    try {
      const { strategy } = await parseJsonBody(req);
      const presetKey = strategy || 'all_rounder';
      const preset = KARACHI_MARKET_PRESETS[presetKey] || KARACHI_MARKET_PRESETS.all_rounder;
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ 
        success: true, 
        preset,
        allPresets: Object.values(KARACHI_MARKET_PRESETS)
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 18. POST /api/admin/calculator-config - Save features & security deposit
  if (pathname === '/api/admin/calculator-config' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const db = readDatabase();
      db.calculatorConfig = db.calculatorConfig || {};
      if (data.features) {
        db.calculatorConfig.features = { ...(db.calculatorConfig.features || {}), ...data.features };
      }
      if (data.securityDeposit) {
        db.calculatorConfig.securityDeposit = { ...(db.calculatorConfig.securityDeposit || {}), ...data.securityDeposit };
      }
      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, calculatorConfig: db.calculatorConfig }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 19. POST /api/admin/calculator-locations - Manage Locations
  if (pathname === '/api/admin/calculator-locations' && req.method === 'POST') {
    try {
      const { action, location } = await parseJsonBody(req);
      const db = readDatabase();
      db.calculatorConfig = db.calculatorConfig || {};
      db.calculatorConfig.locations = db.calculatorConfig.locations || [];

      if (action === 'add') {
        location.id = 'loc-' + Date.now();
        if (location.active === undefined) location.active = true;
        db.calculatorConfig.locations.push(location);
      } else if (action === 'edit') {
        const idx = db.calculatorConfig.locations.findIndex(l => l.id === location.id);
        if (idx !== -1) {
          db.calculatorConfig.locations[idx] = { ...db.calculatorConfig.locations[idx], ...location };
        }
      } else if (action === 'delete') {
        db.calculatorConfig.locations = db.calculatorConfig.locations.filter(l => l.id !== location.id);
      } else if (action === 'toggle') {
        const item = db.calculatorConfig.locations.find(l => l.id === location.id);
        if (item) item.active = !item.active;
      }

      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, locations: db.calculatorConfig.locations }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 20. POST /api/admin/calculator-addons - Manage Add-ons
  if (pathname === '/api/admin/calculator-addons' && req.method === 'POST') {
    try {
      const { action, addon } = await parseJsonBody(req);
      const db = readDatabase();
      db.calculatorConfig = db.calculatorConfig || {};
      db.calculatorConfig.addons = db.calculatorConfig.addons || [];

      if (action === 'add') {
        addon.id = 'addon-' + Date.now();
        if (addon.active === undefined) addon.active = true;
        if (addon.price !== undefined) addon.price = Number(addon.price) || 0;
        db.calculatorConfig.addons.push(addon);
      } else if (action === 'edit') {
        const idx = db.calculatorConfig.addons.findIndex(a => a.id === addon.id);
        if (idx !== -1) {
          if (addon.price !== undefined) addon.price = Number(addon.price) || 0;
          db.calculatorConfig.addons[idx] = { ...db.calculatorConfig.addons[idx], ...addon };
        }
      } else if (action === 'delete') {
        db.calculatorConfig.addons = db.calculatorConfig.addons.filter(a => a.id !== addon.id);
      } else if (action === 'toggle') {
        const item = db.calculatorConfig.addons.find(a => a.id === addon.id);
        if (item) item.active = !item.active;
      }

      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, addons: db.calculatorConfig.addons }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 21. POST /api/admin/calculator-slots - Manage Duration Slot Tiers & Discounts
  if (pathname === '/api/admin/calculator-slots' && req.method === 'POST') {
    try {
      const { action, slot } = await parseJsonBody(req);
      const db = readDatabase();
      db.calculatorConfig = db.calculatorConfig || {};
      db.calculatorConfig.slots = db.calculatorConfig.slots || [];

      if (action === 'add') {
        slot.id = 'slot-' + Date.now();
        slot.days = Number(slot.days) || 1;
        slot.discountValue = Number(slot.discountValue) || 0;
        if (slot.active === undefined) slot.active = true;
        db.calculatorConfig.slots.push(slot);
        db.calculatorConfig.slots.sort((a, b) => a.days - b.days);
      } else if (action === 'edit') {
        const idx = db.calculatorConfig.slots.findIndex(s => s.id === slot.id);
        if (idx !== -1) {
          slot.days = Number(slot.days) || 1;
          slot.discountValue = Number(slot.discountValue) || 0;
          db.calculatorConfig.slots[idx] = { ...db.calculatorConfig.slots[idx], ...slot };
          db.calculatorConfig.slots.sort((a, b) => a.days - b.days);
        }
      } else if (action === 'delete') {
        db.calculatorConfig.slots = db.calculatorConfig.slots.filter(s => s.id !== slot.id);
      } else if (action === 'toggle') {
        const item = db.calculatorConfig.slots.find(s => s.id === slot.id);
        if (item) item.active = !item.active;
      }

      writeDatabase(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, slots: db.calculatorConfig.slots }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // ====================================================
  // BRANDING HELPERS FOR SSR (Header & Footer Dynamic Brand)
  // ====================================================
  function getAssetUrlWithVersion(url) {
    if (!url || typeof url !== 'string' || url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) return url;
    try {
      const cleanPath = url.split('?')[0];
      const relPath = cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath;
      const fullPath = path.join(__dirname, relPath);
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        return `${cleanPath}?v=${Math.floor(stat.mtimeMs)}`;
      }
    } catch (e) {}
    return url;
  }

  function getHeaderBrandHtml(settings) {
    const s = settings || {};
    const siteName = escapeHtml(s.siteName || 'Car 4 Rent');
    const tagline = escapeHtml(s.tagline || 'Karachi, Pakistan');
    const logoText = escapeHtml((s.logoText || '').trim());
    const rawLogoUrl = (s.logoUrl || '').trim();
    const logoUrl = getAssetUrlWithVersion(rawLogoUrl);
    const mode = s.logoDisplayMode || (rawLogoUrl ? 'logo_only' : (logoText ? 'icon_and_text' : 'text_only'));

    if (mode === 'logo_only' && logoUrl) {
      return `<img src="${logoUrl}" alt="${siteName}" width="200" height="48" class="h-10 sm:h-12 w-auto max-w-[260px] object-contain group-hover:opacity-90 transition-opacity">`;
    } else if (mode === 'logo_and_text' && logoUrl) {
      return `
        <img src="${logoUrl}" alt="${siteName}" width="50" height="40" class="h-9 sm:h-10 w-auto max-w-[55px] object-contain rounded-lg">
        <div class="flex flex-col">
          <span class="text-xl font-bold font-heading text-black tracking-tight">${siteName}</span>
          <span class="block text-[10px] font-bold uppercase tracking-widest text-rose-600">${tagline}</span>
        </div>
      `;
    } else if (mode === 'icon_and_text' && logoText) {
      return `
        <div class="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center font-black text-xl shadow">${logoText}</div>
        <div class="flex flex-col">
          <span class="text-xl font-bold font-heading text-black tracking-tight">${siteName}</span>
          <span class="block text-[10px] font-bold uppercase tracking-widest text-rose-600">${tagline}</span>
        </div>
      `;
    } else {
      return `
        <div class="flex flex-col">
          <span class="text-2xl font-bold font-heading text-black tracking-tight">${siteName}</span>
          ${tagline ? `<span class="block text-[10px] font-bold uppercase tracking-widest text-rose-600">${tagline}</span>` : ''}
        </div>
      `;
    }
  }

  function getIndexFooterBrandHtml(settings) {
    const s = settings || {};
    const siteName = escapeHtml(s.siteName || 'Car 4 Rent');
    const tagline = escapeHtml(s.tagline || '');
    const logoText = escapeHtml((s.logoText || '').trim());
    const rawLogoUrl = (s.logoUrl || '').trim();
    const logoUrl = getAssetUrlWithVersion(rawLogoUrl);
    const mode = s.logoDisplayMode || (rawLogoUrl ? 'logo_only' : (logoText ? 'icon_and_text' : 'text_only'));

    if (mode === 'logo_only' && logoUrl) {
      return `<img src="${logoUrl}" alt="${siteName}" width="180" height="44" class="h-9 sm:h-11 w-auto max-w-[220px] object-contain rounded-lg">`;
    } else if (mode === 'logo_and_text' && logoUrl) {
      return `
        <img src="${logoUrl}" alt="${siteName}" width="45" height="32" class="h-8 w-auto max-w-[45px] object-contain rounded-lg">
        <div class="flex flex-col">
          <span class="text-2xl font-bold font-heading text-white">${siteName}</span>
          ${tagline ? `<span class="text-[9px] uppercase tracking-widest text-zinc-400 font-bold -mt-1">${tagline}</span>` : ''}
        </div>
      `;
    } else if (mode === 'icon_and_text' && logoText) {
      return `
        <div class="w-9 h-9 bg-white text-black rounded-lg flex items-center justify-center font-black">
          <span class="text-lg font-heading">${logoText}</span>
        </div>
        <span class="text-2xl font-bold font-heading text-white">${siteName}</span>
      `;
    } else {
      return `
        <div class="flex flex-col">
          <span class="text-2xl font-bold font-heading text-white">${siteName}</span>
          ${tagline ? `<span class="text-[9px] uppercase tracking-widest text-zinc-400 font-bold mt-0.5">${tagline}</span>` : ''}
        </div>
      `;
    }
  }

  function getLandingFooterBrandHtml(settings) {
    const s = settings || {};
    const siteName = escapeHtml(s.siteName || 'Car 4 Rent');
    const tagline = escapeHtml(s.tagline || 'Reliable Rent a Car Service in Karachi, Sindh, Pakistan.');
    const rawLogoUrl = (s.logoUrl || '').trim();
    const logoUrl = getAssetUrlWithVersion(rawLogoUrl);
    const mode = s.logoDisplayMode || (rawLogoUrl ? 'logo_only' : 'text_only');
    const copy = escapeHtml((s.footer && s.footer.copyright) ? s.footer.copyright : `© 2026 ${siteName}. All rights reserved.`);

    if (mode === 'logo_only' && logoUrl) {
      return `<div class="flex items-center gap-3"><img src="${logoUrl}" alt="${siteName}" class="h-8 w-auto max-w-[180px] object-contain rounded"><span class="text-zinc-400 text-xs">${copy}</span></div>`;
    } else {
      return `<strong class="text-white">${siteName}</strong> &mdash; ${tagline}`;
    }
  }

  // ====================================================
  // DYNAMIC CLEAN URL ROUTING & PRE-RENDERED SEO TAGS
  // ====================================================
  const dbInst = readDatabase() || {};
  const baseUrl = getBaseUrl(req, dbInst);

  // Check if pathname or query matches an active SEO landing page (e.g. /karachi-airport-rent-a-car or /landing.html?slug=...)
  const querySlug = (parsedUrl.searchParams.get('slug') || parsedUrl.searchParams.get('page') || '').replace(/^\/+|\/+$/g, '');
  const cleanPath = pathname.replace(/\.html$/i, '').replace(/^\/+|\/+$/g, '');
  const matchedLandingPage = (dbInst.seoLandingPages || []).find(p => {
    if (p.active === false) return false;
    const pageSlug = (p.slug || '').replace(/^\/+|\/+$/g, '');
    if (querySlug && (querySlug === pageSlug || ('p/' + pageSlug) === querySlug)) return true;
    return cleanPath === pageSlug || cleanPath === ('p/' + pageSlug) || cleanPath === ('services/' + pageSlug) || cleanPath === ('landing/' + pageSlug);
  });

  if (matchedLandingPage) {
    const landingHtmlPath = path.join(__dirname, 'landing.html');
    if (fs.existsSync(landingHtmlPath)) {
      let html = fs.readFileSync(landingHtmlPath, 'utf-8');

      const pageTitle = escapeHtml(matchedLandingPage.title || (matchedLandingPage.h1 + ' | Car 4 Rent Karachi'));
      const pageDesc = escapeHtml(matchedLandingPage.metaDescription || '');
      const pageKeywords = escapeHtml(matchedLandingPage.focusKeywords || '');
      const canonical = baseUrl + '/' + matchedLandingPage.slug;
      const ogImg = dbInst.seoSettings?.ogImage || dbInst.settings?.heroCarImage || '/uploads/seo-car-1789727514573.jpg';

      const schemas = [];
      schemas.push({
        "@context": "https://schema.org",
        "@type": "AutoRental",
        "name": matchedLandingPage.title,
        "url": canonical,
        "telephone": dbInst.settings?.emergencyPhone || "+923023650000",
        "priceRange": dbInst.seoSettings?.priceRange || "₨₨",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": dbInst.seoSettings?.targetCity || "Karachi",
          "addressRegion": dbInst.seoSettings?.targetRegion || "Sindh",
          "addressCountry": "PK"
        },
        "geo": {
          "@type": "GeoCoordinates",
          "latitude": parseFloat(dbInst.seoSettings?.latitude || "24.8607"),
          "longitude": parseFloat(dbInst.seoSettings?.longitude || "67.0011")
        },
        "areaServed": "Karachi",
        "openingHours": "Mo-Su 00:00-23:59"
      });

      if (matchedLandingPage.faqs && matchedLandingPage.faqs.length > 0) {
        schemas.push({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": matchedLandingPage.faqs.map(f => ({
            "@type": "Question",
            "name": f.question,
            "acceptedAnswer": {
              "@type": "Answer",
              "text": f.answer
            }
          }))
        });
      }

      schemas.push({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": baseUrl + "/"
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": matchedLandingPage.navTitle || matchedLandingPage.h1,
            "item": canonical
          }
        ]
      });

      const schemaTags = schemas.map(s => '<script type="application/ld+json">\n' + JSON.stringify(s, null, 2) + '\n</script>').join('\n');

      const seoHeadInjection = `
  <title>${pageTitle}</title>
  <meta name="description" content="${pageDesc}">
  <meta name="keywords" content="${pageKeywords}">
  <link rel="canonical" href="${canonical}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  
  <meta name="geo.region" content="PK-SD">
  <meta name="geo.placename" content="Karachi">
  <meta name="geo.position" content="${dbInst.seoSettings?.latitude || '24.8607'};${dbInst.seoSettings?.longitude || '67.0011'}">
  <meta name="ICBM" content="${dbInst.seoSettings?.latitude || '24.8607'}, ${dbInst.seoSettings?.longitude || '67.0011'}">

  <meta property="og:type" content="article">
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${pageDesc}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ogImg}">
  <meta property="og:locale" content="en_PK">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${pageTitle}">
  <meta name="twitter:description" content="${pageDesc}">
  <meta name="twitter:image" content="${ogImg}">

  ${schemaTags}

  <script>
    window.__INITIAL_PAGE_DATA__ = ${JSON.stringify(matchedLandingPage)};
    window.__SEO_SETTINGS__ = ${JSON.stringify(dbInst.seoSettings || {})};
    window.__SETTINGS__ = ${JSON.stringify(dbInst.settings || {})};
  </script>
`;

      html = html.replace(/<title[\s\S]*?<\/title>/i, '');
      html = html.replace(/<meta name="description"[\s\S]*?>/i, '');
      html = html.replace('</head>', seoHeadInjection + '\n</head>');

      const landingHeaderBrand = getHeaderBrandHtml(dbInst.settings);
      const landingFooterBrand = getLandingFooterBrandHtml(dbInst.settings);
      html = html.replace(/(<a[^>]*id="landingBrandLink"[^>]*>)[\s\S]*?(<\/a>)/i, `$1${landingHeaderBrand}$2`);
      html = html.replace(/(<div[^>]*id="landingFooterBrand"[^>]*>)[\s\S]*?(<\/div>)/i, `$1${landingFooterBrand}$2`);
      html = html.replace(/\/uploads\/logo\.jpg/g, getAssetUrlWithVersion('/uploads/logo.jpg'));

      res.writeHead(200, HTML_HEADERS);
      return res.end(html);
    }
  }

  // ====================================================
  // CLIENT PROPOSAL & COMMERCIAL VALUATION (/proposal, /pricing)
  // ====================================================
  if (cleanPath === 'proposal' || cleanPath === 'pricing' || cleanPath === 'quotation' || pathname === '/proposal' || pathname === '/proposal.html' || pathname === '/pricing') {
    const proposalHtmlPath = path.join(__dirname, 'proposal.html');
    if (fs.existsSync(proposalHtmlPath)) {
      const html = fs.readFileSync(proposalHtmlPath, 'utf-8');
      res.writeHead(200, HTML_HEADERS);
      return res.end(html);
    }
  }

function getBlogMediaHtml(mediaUrl, title, isDetail = false, posterUrl = '') {
  const trimmed = (mediaUrl || '').trim();
  const poster = (posterUrl || '').trim();

  // 1. YouTube
  const ytMatch = trimmed.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  const coverImage = poster || (ytMatch ? `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg` : '');

  if (!isDetail && coverImage) {
    return `
      <div class="relative w-full h-full bg-black group-hover:scale-105 transition-transform duration-300">
        <img src="${escapeHtml(coverImage)}" alt="${escapeHtml(title)}" class="w-full h-full object-cover">
        <div class="absolute inset-0 bg-black/30 flex items-center justify-center">
          <div class="w-11 h-11 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-xl backdrop-blur-sm"><svg class="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>
        </div>
      </div>`;
  }

  if (!trimmed) {
    return `<img src="/uploads/seo-car-1789727514573.webp" alt="${escapeHtml(title)}" class="w-full h-full object-cover">`;
  }

  if (ytMatch && ytMatch[1]) {
    if (!isDetail) {
      return `
        <div class="relative w-full h-full bg-black group-hover:scale-105 transition-transform duration-300">
          <img src="https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg" alt="${escapeHtml(title)}" class="w-full h-full object-cover">
          <div class="absolute inset-0 bg-black/30 flex items-center justify-center">
            <div class="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg"><svg class="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>
          </div>
        </div>`;
    }
    return `<iframe src="https://www.youtube-nocookie.com/embed/${ytMatch[1]}?rel=0&modestbranding=1" class="w-full h-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }

  // 2. Facebook
  if (trimmed.includes('facebook.com') || trimmed.includes('fb.watch')) {
    if (!isDetail) {
      return `
        <div class="relative w-full h-full bg-[#1877F2]/10 flex flex-col items-center justify-center text-sky-400 p-4 text-center">
          <div class="w-10 h-10 rounded-full bg-[#1877F2] text-white flex items-center justify-center shadow-lg mb-1"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg></div>
          <span class="text-[11px] font-bold text-zinc-900">Facebook Video</span>
        </div>`;
    }
    return `<iframe src="https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(trimmed)}&show_text=0&autoplay=0" class="w-full h-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
  }

  // 3. Instagram (Clean Pure Video - Header & Footer clipped)
  const igMatch = trimmed.match(/(?:instagram\.com|instagr\.am)\/(?:[^/]+\/)?(?:reel|reels|p|tv|share\/[rp])\/([a-zA-Z0-9_-]+)/i)
               || trimmed.match(/(?:reel|reels|p|tv)\/([a-zA-Z0-9_-]+)/i);
  if ((igMatch && igMatch[1]) || trimmed.includes('instagram.com') || trimmed.includes('instagr.am')) {
    const embedUrl = (igMatch && igMatch[1])
      ? `https://www.instagram.com/reel/${igMatch[1]}/embed/`
      : `${trimmed.split('?')[0].replace(/\/+$/, '')}/embed/`;

    if (!isDetail) {
      return `
        <div class="relative w-full h-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex flex-col items-center justify-center text-white p-4 text-center">
          <div class="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center shadow-lg mb-1"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg></div>
          <span class="text-[11px] font-bold text-white tracking-wide">Instagram Reel</span>
        </div>`;
    }
    return `
      <div class="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
        <iframe src="${embedUrl}" scrolling="no" class="border-0 pointer-events-auto w-full" style="position: absolute; top: -62px; left: 0; width: 100%; height: calc(100% + 160px); clip-path: inset(0 0 130px 0); -webkit-clip-path: inset(0 0 130px 0);" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
      </div>`;
  }

  // 4. TikTok
  const ttIdMatch = trimmed.match(/(?:video\/|v\/|player\/v1\/|embed\/v2\/)(\d+)/i) || trimmed.match(/\/(\d{15,22})/);
  if ((ttIdMatch && ttIdMatch[1]) || trimmed.includes('tiktok.com')) {
    const embedUrl = (ttIdMatch && ttIdMatch[1])
      ? `https://www.tiktok.com/player/v1/${ttIdMatch[1]}?autoplay=0`
      : `https://www.tiktok.com/embed?url=${encodeURIComponent(trimmed)}`;

    if (!isDetail) {
      return `
        <div class="relative w-full h-full bg-zinc-950 flex flex-col items-center justify-center text-white p-4 text-center border border-white/10">
          <div class="w-10 h-10 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center justify-center shadow-lg mb-1"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="18" r="4"></circle><path d="M12 18V2l7 4"></path></svg></div>
          <span class="text-[11px] font-bold text-white">TikTok Video</span>
        </div>`;
    }
    return `
      <div class="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
        <div class="relative overflow-hidden" style="width: 320px; max-width: 100%; height: 100%; border-radius: 12px;">
          <iframe src="${embedUrl}" class="w-full h-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>
      </div>`;
  }

  // 5. HTML5 Video
  if (/\.(mp4|webm|mov|ogg|ogv)(\?.*)?$/i.test(trimmed) || trimmed.startsWith('data:video/')) {
    if (!isDetail) {
      return `
        <div class="relative w-full h-full bg-zinc-900 flex flex-col items-center justify-center text-white p-4 text-center">
          <div class="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center shadow-lg mb-1"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>
          <span class="text-[11px] font-bold text-white">Video</span>
        </div>`;
    }
    return `<video src="${escapeHtml(trimmed)}" ${poster ? `poster="${escapeHtml(poster)}"` : ''} controls playsinline preload="metadata" class="w-full h-full object-contain bg-black"></video>`;
  }

  // 6. Normal Image
  return `<img src="${escapeHtml(trimmed)}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.src='/uploads/seo-car-1789727514573.webp'" class="w-full h-full object-cover card-zoom-img">`;
}

  // ====================================================
  // DYNAMIC BLOG PORTAL & DEDICATED ARTICLES (/blog, /blog/:slug)
  // ====================================================
  if (cleanPath === 'blog' || pathname === '/blog' || pathname === '/blog.html') {
    const blogHtmlPath = path.join(__dirname, 'blog.html');
    if (fs.existsSync(blogHtmlPath)) {
      let html = fs.readFileSync(blogHtmlPath, 'utf-8');
      const published = (dbInst.blogs || []).filter(b => b.published !== false);
      const preCards = published.map(b => `
        <article class="group bg-white rounded-3xl overflow-hidden border border-zinc-200/90 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between">
          <div>
            <a href="/blog/${b.slug}" class="block relative aspect-[16/10] overflow-hidden bg-zinc-100">
              ${getBlogMediaHtml(b.image, b.title, false, b.poster)}
              <div class="absolute top-3 left-3 bg-black/80 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border border-white/10 z-10">
                ${escapeHtml(b.category || 'Rental Guide')}
              </div>
              <div class="absolute bottom-3 right-3 bg-white/90 backdrop-blur-md text-zinc-900 text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow z-10">
                ${escapeHtml(b.readTime || '4 min read')}
              </div>
            </a>
            <div class="p-6">
              <div class="flex items-center gap-2 text-xs text-zinc-400 mb-2">
                <span>${escapeHtml(b.date || '2026-09-23')}</span>
                <span>&bull;</span>
                <span>By ${escapeHtml(b.author || 'Car4Rent Team')}</span>
              </div>
              <h2 class="text-lg font-bold font-heading text-zinc-900 group-hover:text-rose-600 transition-colors line-clamp-2 leading-snug">
                <a href="/blog/${b.slug}">${escapeHtml(b.title)}</a>
              </h2>
              <p class="text-xs text-zinc-600 mt-2.5 line-clamp-3 leading-relaxed">
                ${escapeHtml(b.excerpt || '')}
              </p>
            </div>
          </div>
          <div class="p-6 pt-0 border-t border-zinc-100 flex items-center justify-between text-xs mt-4">
            <a href="/blog/${b.slug}" class="font-bold text-rose-600 hover:text-black transition-colors flex items-center gap-1">
              <span>Read Full Guide</span>
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
            <a href="https://wa.me/923023650000?text=Hi%20Car4Rent%2C%20I%20have%20a%20question%20about%20your%20article%3A%20${encodeURIComponent(b.title)}" target="_blank" class="text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1">
              Ask Concierge
            </a>
          </div>
        </article>
      `).join('');

      html = html.replace(/(<div[^>]*id="blogsGrid"[^>]*>)[\s\S]*?(<\/div>)/i, `$1${preCards}$2`);
      html = html.replace(/\/uploads\/logo\.jpg/g, getAssetUrlWithVersion('/uploads/logo.jpg'));
      html = html.replace('</head>', `<script>window.__INITIAL_BLOGS__ = ${JSON.stringify(published)};</script>\n</head>`);
      res.writeHead(200, HTML_HEADERS);
      return res.end(html);
    }
  }

  // DEDICATED INDIVIDUAL ARTICLE (/blog/:slug, /blog-detail.html)
  let blogSlug = '';
  if (cleanPath.startsWith('blog/')) {
    blogSlug = cleanPath.slice(5).replace(/\.html$/i, '').replace(/^\/+|\/+$/g, '');
  } else if (pathname === '/blog-detail.html' || pathname === '/blog-detail') {
    blogSlug = (parsedUrl.searchParams.get('slug') || parsedUrl.searchParams.get('id') || '').trim();
  }

  if (blogSlug) {
    const matchedBlog = (dbInst.blogs || []).find(b => b.slug === blogSlug || b.id === blogSlug);
    if (matchedBlog && matchedBlog.published !== false) {
      const blogDetailPath = path.join(__dirname, 'blog-detail.html');
      if (fs.existsSync(blogDetailPath)) {
        let html = fs.readFileSync(blogDetailPath, 'utf-8');

        const pageTitle = escapeHtml(matchedBlog.metaTitle || (matchedBlog.title + ' | Car4Rent Karachi'));
        const pageDesc = escapeHtml(matchedBlog.metaDescription || matchedBlog.excerpt || '');
        const pageKeywords = escapeHtml(matchedBlog.metaKeywords || (matchedBlog.tags ? matchedBlog.tags.join(', ') : ''));
        const canonical = baseUrl + '/blog/' + matchedBlog.slug;
        let ogImg = matchedBlog.image || dbInst.seoSettings?.ogImage || '/uploads/seo-car-1789727514573.jpg';
        if (ogImg && !ogImg.startsWith('http')) {
          ogImg = baseUrl + (ogImg.startsWith('/') ? '' : '/') + ogImg;
        }

        const blogSchema = {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          "headline": matchedBlog.title,
          "description": matchedBlog.excerpt || pageDesc,
          "image": [ogImg],
          "datePublished": matchedBlog.date || "2026-09-23",
          "dateModified": matchedBlog.date || "2026-09-23",
          "author": {
            "@type": "Organization",
            "name": matchedBlog.author || "Car4Rent Editorial Team",
            "url": baseUrl + "/"
          },
          "publisher": {
            "@type": "Organization",
            "name": "Car4Rent (Pvt.) Ltd. Self Drive",
            "logo": {
              "@type": "ImageObject",
              "url": baseUrl + "/uploads/logo.jpg"
            }
          },
          "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": canonical
          }
        };

        const seoHeadInjection = `
  <title>${pageTitle}</title>
  <meta name="description" content="${pageDesc}">
  <meta name="keywords" content="${pageKeywords}">
  <link rel="canonical" href="${canonical}">
  <meta name="robots" content="index, follow, max-image-preview:large">

  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Car4Rent">
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${pageDesc}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ogImg}">
  <meta property="og:locale" content="en_PK">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${pageTitle}">
  <meta name="twitter:description" content="${pageDesc}">
  <meta name="twitter:image" content="${ogImg}">

  <script type="application/ld+json">
${JSON.stringify(blogSchema, null, 2)}
  </script>
`;

        html = html.replace(/<title[\s\S]*?<\/title>/i, '');
        html = html.replace(/<meta id="seoPageMetaDesc"[\s\S]*?>/i, '');
        html = html.replace(/<link id="canonicalLink"[\s\S]*?>/i, '');
        html = html.replace('</head>', seoHeadInjection + '\n</head>');

        // SSR Pre-fill Content
        html = html.replace(/(<h1[^>]*id="articleMainTitle"[^>]*>)[\s\S]*?(<\/h1>)/i, `$1${escapeHtml(matchedBlog.title)}$2`);
        html = html.replace(/(<p[^>]*id="articleExcerptText"[^>]*>)[\s\S]*?(<\/p>)/i, `$1${escapeHtml(matchedBlog.excerpt || '')}$2`);
        html = html.replace(/(<span[^>]*id="articleCategoryBadge"[^>]*>)[\s\S]*?(<\/span>)/i, `$1${escapeHtml(matchedBlog.category || 'Rental Guide')}$2`);
        html = html.replace(/(<span[^>]*id="articleDate"[^>]*>)[\s\S]*?(<\/span>)/i, `$1${escapeHtml(matchedBlog.date || '2026-09-23')}$2`);
        html = html.replace(/(<span[^>]*id="articleReadTime"[^>]*>)[\s\S]*?(<\/span>)/i, `$1${escapeHtml(matchedBlog.readTime || '4 min read')}$2`);
        html = html.replace(/(<span[^>]*id="articleAuthorName"[^>]*>)[\s\S]*?(<\/span>)/i, `$1${escapeHtml(matchedBlog.author || 'Car4Rent Team')}$2`);
        const mediaHtml = getBlogMediaHtml(matchedBlog.image, matchedBlog.title, true, matchedBlog.poster);
        html = html.replace(/(<div[^>]*id="articleMediaContainer"[^>]*>)[\s\S]*?(<\/div>\s*<!-- Article Rich Body)/i, `$1\n        ${mediaHtml}\n      </div>\n\n      $2`);
        html = html.replace(/(<div[^>]*id="articleBodyContent"[^>]*>)[\s\S]*?(<\/div>)/i, `$1${matchedBlog.content || ''}$2`);

        const waText = encodeURIComponent(`Hi Car4Rent, I read your article "${matchedBlog.title}" and want to inquire about renting a car.`);
        html = html.replace(/href="https:\/\/wa\.me\/923023650000"/g, `href="https://wa.me/923023650000?text=${waText}"`);
        html = html.replace(/\/uploads\/logo\.jpg/g, getAssetUrlWithVersion('/uploads/logo.jpg'));

        res.writeHead(200, HTML_HEADERS);
        return res.end(html);
      }
    } else if (cleanPath.startsWith('blog/')) {
      return sendErrorPage(req, res, 404, 'Article Not Found', 'The requested blog article or guide does not exist or has been moved.');
    }
  }

  // ====================================================
  // DYNAMIC DEDICATED INDIVIDUAL CAR PAGES (/cars/:slug, /car/:slug, /car.html)
  // ====================================================
  let carSlug = '';
  if (cleanPath.startsWith('cars/')) {
    carSlug = cleanPath.slice(5).replace(/\.html$/i, '').replace(/^\/+|\/+$/g, '');
  } else if (cleanPath.startsWith('car/')) {
    carSlug = cleanPath.slice(4).replace(/\.html$/i, '').replace(/^\/+|\/+$/g, '');
  } else if (pathname === '/car.html' || pathname === '/car') {
    carSlug = (parsedUrl.searchParams.get('slug') || parsedUrl.searchParams.get('car') || parsedUrl.searchParams.get('id') || '').trim();
  }

  if (carSlug) {
    const matchedCar = (dbInst.cars || []).find(c => {
      const s = getCarSlug(c);
      return s === carSlug || c.id === carSlug || ('car-' + s) === carSlug;
    });

    if (matchedCar) {
      const carHtmlPath = path.join(__dirname, 'car.html');
      if (fs.existsSync(carHtmlPath)) {
        let html = fs.readFileSync(carHtmlPath, 'utf-8');

        const carPriceFmt = 'Rs. ' + Math.round(matchedCar.dailyPrice || 0).toLocaleString();
        const pageTitle = escapeHtml(`${matchedCar.name} on Rent in Karachi (${carPriceFmt}/Day) | Car 4 Rent`);
        const pageDesc = escapeHtml(`Rent ${matchedCar.name} in Karachi at ${carPriceFmt}/day. Available on self-drive or with professional driver. 24/7 doorstep delivery in DHA, Clifton & Karachi Airport.`);
        const pageKeywords = escapeHtml(`${matchedCar.name} rent karachi, rent ${matchedCar.name} in karachi, ${matchedCar.brand} car rental karachi, ${matchedCar.name} price karachi`);
        const canonical = baseUrl + '/cars/' + getCarSlug(matchedCar);
        let ogImg = matchedCar.image || dbInst.seoSettings?.ogImage || dbInst.settings?.heroCarImage || '/uploads/seo-car-1789727514573.jpg';
        if (ogImg && !ogImg.startsWith('http')) {
          ogImg = baseUrl + (ogImg.startsWith('/') ? '' : '/') + ogImg;
        }

        const schemas = [];

        // 1. Car & Product Rich Snippet Schema (Google Shopping & Product Search Ready)
        schemas.push({
          "@context": "https://schema.org",
          "@type": "Car",
          "additionalType": "https://schema.org/Product",
          "name": matchedCar.name,
          "brand": {
            "@type": "Brand",
            "name": matchedCar.brand || "Automobile"
          },
          "image": [ogImg],
          "description": matchedCar.description || `Rent ${matchedCar.name} in Karachi with Car 4 Rent at ${carPriceFmt}/day. Available on self-drive with zero security deposit.`,
          "vehicleConfiguration": matchedCar.categoryName || matchedCar.category,
          "vehicleSeatingCapacity": matchedCar.seats || 5,
          "offers": {
            "@type": "Offer",
            "price": matchedCar.dailyPrice,
            "priceCurrency": "PKR",
            "availability": "https://schema.org/InStock",
            "itemCondition": "https://schema.org/NewCondition",
            "url": canonical,
            "priceValidUntil": "2027-12-31",
            "seller": {
              "@type": "AutoRental",
              "name": dbInst.settings?.siteName || "Car 4 Rent",
              "telephone": dbInst.settings?.emergencyPhone || "+923023650000"
            }
          },
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "4.9",
            "reviewCount": "128",
            "bestRating": "5",
            "worstRating": "1"
          }
        });

        // 2. AutoRental Schema
        schemas.push({
          "@context": "https://schema.org",
          "@type": "AutoRental",
          "name": dbInst.settings?.siteName || "Car 4 Rent Karachi",
          "url": canonical,
          "telephone": dbInst.settings?.emergencyPhone || "+923023650000",
          "priceRange": "₨₨",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": "Karachi",
            "addressRegion": "Sindh",
            "addressCountry": "PK"
          },
          "geo": {
            "@type": "GeoCoordinates",
            "latitude": parseFloat(dbInst.seoSettings?.latitude || "24.8607"),
            "longitude": parseFloat(dbInst.seoSettings?.longitude || "67.0011")
          },
          "areaServed": "Karachi",
          "openingHours": "Mo-Su 00:00-23:59"
        });

        // 3. Breadcrumbs
        schemas.push({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            {
              "@type": "ListItem",
              "position": 1,
              "name": "Home",
              "item": baseUrl + "/"
            },
            {
              "@type": "ListItem",
              "position": 2,
              "name": "Fleet",
              "item": baseUrl + "/#fleet"
            },
            {
              "@type": "ListItem",
              "position": 3,
              "name": matchedCar.name,
              "item": canonical
            }
          ]
        });

        // 4. Car FAQs Schema
        schemas.push({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": `What is the daily rental rate for ${matchedCar.name} in Karachi?`,
              "acceptedAnswer": {
                "@type": "Answer",
                "text": `The standard daily rental rate for ${matchedCar.name} in Karachi is ${carPriceFmt} per 24 hours. Discounted rates are available for weekly and monthly rentals.`
              }
            },
            {
              "@type": "Question",
              "name": `Can I rent ${matchedCar.name} on self-drive in Karachi?`,
              "acceptedAnswer": {
                "@type": "Answer",
                "text": `Yes, ${matchedCar.name} is available on self-drive with original CNIC/Passport, valid driving license, and refundable security deposit.`
              }
            },
            {
              "@type": "Question",
              "name": `Do you deliver ${matchedCar.name} to Karachi Airport or DHA?`,
              "acceptedAnswer": {
                "@type": "Answer",
                "text": `Yes, we provide 24/7 doorstep delivery for ${matchedCar.name} across DHA, Clifton, Jinnah International Airport, and all Karachi locations.`
              }
            }
          ]
        });

        const schemaTags = schemas.map(s => '<script type="application/ld+json">\n' + JSON.stringify(s, null, 2) + '\n</script>').join('\n');

        const seoHeadInjection = `
  <title>${pageTitle}</title>
  <meta name="description" content="${pageDesc}">
  <meta name="keywords" content="${pageKeywords}">
  <link rel="canonical" href="${canonical}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  
  <meta name="geo.region" content="PK-SD">
  <meta name="geo.placename" content="Karachi">
  <meta name="geo.position" content="${dbInst.seoSettings?.latitude || '24.8607'};${dbInst.seoSettings?.longitude || '67.0011'}">
  <meta name="ICBM" content="${dbInst.seoSettings?.latitude || '24.8607'}, ${dbInst.seoSettings?.longitude || '67.0011'}">

  <meta property="og:type" content="product">
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${pageDesc}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ogImg}">
  <meta property="og:locale" content="en_PK">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${pageTitle}">
  <meta name="twitter:description" content="${pageDesc}">
  <meta name="twitter:image" content="${ogImg}">

  ${schemaTags}

  <script>
    window.__INITIAL_CAR_DATA__ = ${JSON.stringify(matchedCar)};
    window.__ALL_CARS__ = ${JSON.stringify(dbInst.cars || [])};
    window.__SETTINGS__ = ${JSON.stringify(dbInst.settings || {})};
    window.__CALC_CONFIG__ = ${JSON.stringify(dbInst.calculatorConfig || {})};
    window.__TYPOGRAPHY__ = ${JSON.stringify(dbInst.typography || {})};
    window.__SEO_SETTINGS__ = ${JSON.stringify(dbInst.seoSettings || {})};
  </script>
`;

        let carHeadPreload = '';
        if (matchedCar.image) {
          carHeadPreload = `  <link rel="preload" as="image" href="${escapeHtml(matchedCar.image)}" fetchpriority="high">\n`;
        }

        html = html.replace(/<title[\s\S]*?<\/title>/i, '');
        html = html.replace(/<meta name="description"[\s\S]*?>/i, '');
        html = html.replace('</head>', carHeadPreload + seoHeadInjection + '\n</head>');

        const carHeaderBrand = getHeaderBrandHtml(dbInst.settings);
        const carFooterBrand = getLandingFooterBrandHtml(dbInst.settings);
        html = html.replace(/(<a[^>]*id="carHeaderBrandLink"[^>]*>)[\s\S]*?(<\/a>)/i, `$1${carHeaderBrand}$2`);
        html = html.replace(/(<div[^>]*id="carFooterBrand"[^>]*>)[\s\S]*?(<\/div>)/i, `$1${carFooterBrand}$2`);

        // SSR Pre-fill Car Elements to maximize PageSpeed LCP and SEO crawlability
        if (matchedCar.image) {
          html = html.replace(/(<img[^>]*id="carMainImage"[^>]*src=")[^"]*(")/i, `$1${escapeHtml(matchedCar.image)}$2`);
          html = html.replace(/(<img[^>]*id="carMainImage"[^>]*alt=")[^"]*(")/i, `$1${escapeHtml(matchedCar.name)} on Rent in Karachi$2`);
        }
        if (matchedCar.name) {
          html = html.replace(/(<h1[^>]*id="carMainH1"[^>]*>)[\s\S]*?(<\/h1>)/i, `$1${escapeHtml(matchedCar.name)} on Rent in Karachi$2`);
          html = html.replace(/(<span[^>]*id="breadcrumbCarName"[^>]*>)[\s\S]*?(<\/span>)/i, `$1${escapeHtml(matchedCar.name)}$2`);
        }
        if (matchedCar.dailyPrice) {
          html = html.replace(/(<span[^>]*id="cardPriceDisplay"[^>]*>)[\s\S]*?(<\/span>)/i, `$1${carPriceFmt}$2`);
        }
        if (matchedCar.brand) {
          html = html.replace(/(<span[^>]*id="carBrandBadge"[^>]*>)[\s\S]*?(<\/span>)/i, `$1${escapeHtml(matchedCar.brand)}$2`);
        }
        if (matchedCar.categoryName || matchedCar.category) {
          html = html.replace(/(<span[^>]*id="carCategoryBadge"[^>]*>)[\s\S]*?(<\/span>)/i, `$1${escapeHtml(matchedCar.categoryName || matchedCar.category)}$2`);
        }

        html = html.replace(/\/uploads\/logo\.jpg/g, getAssetUrlWithVersion('/uploads/logo.jpg'));
        res.writeHead(200, HTML_HEADERS);
        return res.end(html);
      }
    }
  }

  // Pre-rendered SEO for Homepage
  if (pathname === '/' || pathname === '/index.html') {
    const indexPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(indexPath)) {
      let html = fs.readFileSync(indexPath, 'utf-8');
      const seo = dbInst.seoSettings || {};

      const siteTitle = escapeHtml(seo.siteTitle || 'Rent a Car in Karachi | Car 4 Rent');
      const metaDesc = escapeHtml(seo.metaDescription || 'Car 4 Rent provides reliable rent a car in Karachi.');
      const metaKeywords = escapeHtml(seo.metaKeywords || 'rent a car Karachi, car rental Karachi');
      const canonical = baseUrl + '/';
      let ogImg = seo.ogImage || dbInst.settings?.heroCarImage || '/uploads/seo-car-1789727514573.jpg';
      if (ogImg && !ogImg.startsWith('http')) {
        ogImg = baseUrl + (ogImg.startsWith('/') ? '' : '/') + ogImg;
      }
      const logoImg = baseUrl + (dbInst.settings?.logoUrl || '/uploads/logo.jpg');

      const schemas = [
        {
          "@context": "https://schema.org",
          "@type": "AutoRental",
          "name": seo.businessName || dbInst.settings?.siteName || "Car 4 Rent",
          "url": canonical,
          "image": ogImg,
          "logo": logoImg,
          "telephone": dbInst.settings?.emergencyPhone || "+923023650000",
          "priceRange": seo.priceRange || "₨₨",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": seo.targetCity || "Karachi",
            "addressRegion": seo.targetRegion || "Sindh",
            "addressCountry": "PK"
          },
          "geo": {
            "@type": "GeoCoordinates",
            "latitude": parseFloat(seo.latitude || "24.8607"),
            "longitude": parseFloat(seo.longitude || "67.0011")
          },
          "areaServed": "Karachi",
          "openingHours": "Mo-Su 00:00-23:59",
          "sameAs": [
            seo.googleBusinessUrl || "https://www.google.com/maps",
            "https://www.facebook.com/car4rent.pk",
            "https://www.instagram.com/car4rent.pk"
          ]
        }
      ];

      // Inlined BlogPosting schemas on homepage for lightning-fast Google indexing (Rently strategy)
      const topBlogs = (dbInst.blogs || []).filter(b => b.active !== false).slice(0, 4);
      topBlogs.forEach(b => {
        schemas.push({
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": `${baseUrl}/blog/${b.slug}`
          },
          "headline": b.title,
          "description": b.excerpt || b.metaDesc || b.title,
          "image": b.image ? (b.image.startsWith('http') ? b.image : baseUrl + (b.image.startsWith('/') ? '' : '/') + b.image) : ogImg,
          "author": {
            "@type": "Organization",
            "name": seo.businessName || "Car 4 Rent",
            "url": canonical
          },
          "publisher": {
            "@type": "Organization",
            "name": seo.businessName || "Car 4 Rent",
            "logo": {
              "@type": "ImageObject",
              "url": logoImg
            }
          },
          "datePublished": b.date || "2026-09-20",
          "dateModified": b.updatedAt || b.date || "2026-09-28"
        });
      });

      if (dbInst.seoFaqs && dbInst.seoFaqs.length > 0) {
        schemas.push({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": dbInst.seoFaqs.map(f => ({
            "@type": "Question",
            "name": f.question,
            "acceptedAnswer": {
              "@type": "Answer",
              "text": f.answer
            }
          }))
        });
      }

      const schemaTags = schemas.map(s => '<script type="application/ld+json">\n' + JSON.stringify(s, null, 2) + '\n</script>').join('\n');

      let verificationTags = '';
      if (seo.googleVerification) {
        let cleanGoogle = String(seo.googleVerification).trim();
        let mg = cleanGoogle.match(/content=["']?([^"'>\s]+)["']?/i);
        cleanGoogle = mg ? mg[1] : cleanGoogle.replace(/[<>'"]/g, '').trim();
        if (cleanGoogle) {
          verificationTags += '<meta name="google-site-verification" content="' + escapeHtml(cleanGoogle) + '">\n';
        }
      }
      if (seo.bingVerification) {
        let cleanBing = String(seo.bingVerification).trim();
        let mb = cleanBing.match(/content=["']?([a-fA-F0-9]{20,40})["']?/i);
        if (!mb) mb = cleanBing.match(/([a-fA-F0-9]{20,40})/i);
        cleanBing = mb ? mb[1].toUpperCase() : cleanBing.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (cleanBing) {
          verificationTags += '<meta name="msvalidate.01" content="' + escapeHtml(cleanBing) + '">\n';
        }
      }

      let trackingScripts = '';
      if (seo.ga4MeasurementId) {
        trackingScripts += '<!-- Google Analytics GA4 -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=' + escapeHtml(seo.ga4MeasurementId) + '"></script>\n<script>\nwindow.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag(\'js\', new Date());\ngtag(\'config\', \'' + escapeHtml(seo.ga4MeasurementId) + '\');\n</script>\n';
      }

      const seoHeadInjection = `
  <title>${siteTitle}</title>
  <meta name="description" content="${metaDesc}">
  <meta name="keywords" content="${metaKeywords}">
  <link rel="canonical" href="${canonical}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  
  <meta name="geo.region" content="PK-SD">
  <meta name="geo.placename" content="Karachi">
  <meta name="geo.position" content="${seo.latitude || '24.8607'};${seo.longitude || '67.0011'}">
  <meta name="ICBM" content="${seo.latitude || '24.8607'}, ${seo.longitude || '67.0011'}">

  <meta property="og:type" content="website">
  <meta property="og:title" content="${siteTitle}">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ogImg}">
  <meta property="og:locale" content="en_PK">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${siteTitle}">
  <meta name="twitter:description" content="${metaDesc}">
  <meta name="twitter:image" content="${ogImg}">

  ${verificationTags}
  ${trackingScripts}
  ${schemaTags}
`;

      html = html.replace(/<title[\s\S]*?<\/title>/i, '');
      html = html.replace(/<meta name="description"[\s\S]*?>/i, '');
      html = html.replace('</head>', seoHeadInjection + '\n</head>');

      const indexHeaderBrand = getHeaderBrandHtml(dbInst.settings);
      const indexFooterBrand = getIndexFooterBrandHtml(dbInst.settings);
      html = html.replace(/(<a[^>]*id="navbarBrandLink"[^>]*>)[\s\S]*?(<\/a>)/i, `$1${indexHeaderBrand}$2`);
      html = html.replace(/(<div[^>]*id="footerBrandLink"[^>]*>)[\s\S]*?(<\/div>)/i, `$1${indexFooterBrand}$2`);

      // SSR Pre-render Navigation Links (Instantly visible on refresh)
      const defaultNavMenus = [
        { id: "menu-1", label: "Home", url: "#hero", isHighlight: false },
        { id: "menu-2", label: "About Us", url: "#about", isHighlight: false },
        { id: "menu-3", label: "Our Fleet", url: "#fleet", isHighlight: false },
        { id: "menu-4", label: "Our Services", url: "#services", isHighlight: false },
        { id: "menu-blog", label: "Rental Guides", url: "/blog", isHighlight: false },
        { id: "menu-5", label: "Why Choose Us", url: "#why-choose-us", isHighlight: false },
        { id: "menu-10", label: "Get Quote", url: "#calculator", isHighlight: true },
        { id: "menu-11", label: "Reviews", url: "#testimonials", isHighlight: false }
      ];
      const navList = (dbInst.navMenus && dbInst.navMenus.length > 0) ? dbInst.navMenus : defaultNavMenus;
      const desktopNavHtml = navList.map(m => {
        if (m.isHighlight) {
          return `<a href="${m.url || '#'}" class="text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 transition-colors px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200"><i data-lucide="calculator" class="w-3.5 h-3.5"></i> ${escapeHtml(m.label)}</a>`;
        }
        return `<a href="${m.url || '#'}" class="hover:text-black transition-colors whitespace-nowrap">${escapeHtml(m.label)}</a>`;
      }).join('');

      const mobileNavHtml = navList.map(m => {
        if (m.isHighlight) {
          return `<a href="${m.url || '#'}" onclick="toggleMobileMenu()" class="block text-base font-bold text-rose-600 py-1">${escapeHtml(m.label)}</a>`;
        }
        return `<a href="${m.url || '#'}" onclick="toggleMobileMenu()" class="block text-base font-semibold text-zinc-800 hover:text-black py-1">${escapeHtml(m.label)}</a>`;
      }).join('');

      html = html.replace(/(<nav[^>]*id="desktopNavMenu"[^>]*>)[\s\S]*?(<\/nav>)/i, `$1${desktopNavHtml}$2`);
      html = html.replace(/(<div[^>]*id="mobileNavMenu"[^>]*>)[\s\S]*?(<\/div>)/i, `$1${mobileNavHtml}$2`);

      // Inlined public data for instant zero-latency client hydration
      const publicData = {
        settings: dbInst.settings || {},
        categories: dbInst.categories || [],
        brands: dbInst.brands || [],
        cars: dbInst.cars || [],
        reviews: (dbInst.reviews || []).filter(r => r.active !== false),
        navMenus: navList,
        servicesSection: dbInst.servicesSection || {},
        whyChooseUsSection: dbInst.whyChooseUsSection || {},
        calculatorConfig: dbInst.calculatorConfig || {},
        typography: dbInst.typography || {},
        seoFaqs: dbInst.seoFaqs || []
      };
      html = html.replace('</head>', `<script>window.__INITIAL_DATA__ = ${JSON.stringify(publicData)};</script>\n</head>`);

      if (seo.ogImage || dbInst.settings?.heroCarImage) {
        const customHero = escapeHtml(seo.ogImage || dbInst.settings?.heroCarImage);
        html = html.replace(/(<img[^>]*id="heroCarImg"[^>]*src=")[^"]*(")/i, `$1${customHero}$2`);
        html = html.replace(/(<link[^>]*rel="preload"[^>]*as="image"[^>]*href=")[^"]*(")/i, `$1${customHero}$2`);
        html = html.replace(/src="https:\/\/images\.unsplash\.com\/photo-1614162692292-7ac56d7f7f1e[^"]*"/ig, `src="${customHero}"`);
        html = html.replace(/href="https:\/\/images\.unsplash\.com\/photo-1614162692292-7ac56d7f7f1e[^"]*"/ig, `href="${customHero}"`);
      }

      // Dynamic Typography & Content SSR Injection
      const typo = dbInst.typography || {};
      const headingFont = typo.headingFont || 'Syne';
      const bodyFont = typo.bodyFont || 'Plus Jakarta Sans';
      const textTransform = typo.textTransform || 'uppercase';
      const h1Desktop = typo.h1Desktop || 56;
      const h1Mobile = typo.h1Mobile || 32;
      const h2Desktop = typo.h2Desktop || 40;
      const h2Mobile = typo.h2Mobile || 24;
      const bodyDesktop = typo.bodyDesktop || 17;
      const bodyMobile = typo.bodyMobile || 14;

      const typoStyles = `
<style id="dynamicTypographyStyles">
  :root {
    --font-heading: '${headingFont}', sans-serif;
    --font-body: '${bodyFont}', sans-serif;
    --heading-transform: ${textTransform};
    --h1-desktop: ${h1Desktop}px;
    --h1-mobile: ${h1Mobile}px;
    --h2-desktop: ${h2Desktop}px;
    --h2-mobile: ${h2Mobile}px;
    --body-desktop: ${bodyDesktop}px;
    --body-mobile: ${bodyMobile}px;
  }
  body {
    font-family: var(--font-body) !important;
    font-size: var(--body-desktop) !important;
  }
  h1, h2, h3, .font-heading {
    font-family: var(--font-heading) !important;
    text-transform: var(--heading-transform) !important;
  }
  #heroH1Heading, h1 {
    font-size: var(--h1-desktop) !important;
    line-height: 1.15 !important;
    text-transform: var(--heading-transform) !important;
  }
  h2 {
    font-size: var(--h2-desktop) !important;
  }
  @media (max-width: 640px) {
    #heroH1Heading, h1 {
      font-size: var(--h1-mobile) !important;
      line-height: 1.22 !important;
    }
    h2 {
      font-size: var(--h2-mobile) !important;
      line-height: 1.25 !important;
    }
    #heroSubtitleText, #aboutDescText, #fleetDescText, p {
      font-size: var(--body-mobile) !important;
    }
  }
</style>
`;
      html = html.replace('</head>', typoStyles + '\n</head>');

      if (dbInst.aboutSection) {
        if (dbInst.aboutSection.badge) html = html.replace(/(<span[^>]*id="aboutBadgeText"[^>]*>)[\s\S]*?(<\/span>)/i, `$1${escapeHtml(dbInst.aboutSection.badge)}$2`);
        if (dbInst.aboutSection.headline) html = html.replace(/(<h2[^>]*id="aboutHeadlineText"[^>]*>)[\s\S]*?(<\/h2>)/i, `$1${escapeHtml(dbInst.aboutSection.headline)}$2`);
        if (dbInst.aboutSection.description) html = html.replace(/(<p[^>]*id="aboutDescText"[^>]*>)[\s\S]*?(<\/p>)/i, `$1${escapeHtml(dbInst.aboutSection.description)}$2`);
      }
      if (dbInst.fleetSection) {
        if (dbInst.fleetSection.badge) html = html.replace(/(<span[^>]*id="fleetBadgeText"[^>]*>)[\s\S]*?(<\/span>)/i, `$1${escapeHtml(dbInst.fleetSection.badge)}$2`);
        if (dbInst.fleetSection.headline) html = html.replace(/(<h2[^>]*id="fleetHeadlineText"[^>]*>)[\s\S]*?(<\/h2>)/i, `$1${escapeHtml(dbInst.fleetSection.headline)}$2`);
        if (dbInst.fleetSection.description) html = html.replace(/(<p[^>]*id="fleetDescText"[^>]*>)[\s\S]*?(<\/p>)/i, `$1${escapeHtml(dbInst.fleetSection.description)}$2`);
      }
      if (dbInst.heroButtons) {
        if (dbInst.heroButtons.btn1Text) html = html.replace(/(<span[^>]*id="heroBtn1Text"[^>]*>)[\s\S]*?(<\/span>)/i, `$1${escapeHtml(dbInst.heroButtons.btn1Text)}$2`);
        if (dbInst.heroButtons.btn2Text) html = html.replace(/(<span[^>]*id="heroBtn2Text"[^>]*>)[\s\S]*?(<\/span>)/i, `$1${escapeHtml(dbInst.heroButtons.btn2Text)}$2`);
      }

      // SSR Offer Bar (Hide or Render dynamically based on admin settings)
      const offer = dbInst.settings?.offer || {};
      if (offer.active === false) {
        html = html.replace(/(<div[^>]*id="offerContainer"[^>]*>)/i, '<div id="offerContainer" style="display: none;" class="hidden flex items-center gap-2 overflow-hidden text-center md:text-left">');
      } else {
        html = html.replace(/(<div[^>]*id="offerContainer"[^>]*>)/i, '<div id="offerContainer" style="display: flex;" class="flex items-center gap-2 overflow-hidden text-center md:text-left">');
        if (offer.badge) {
          html = html.replace(/(<span[^>]*id="offerBadge"[^>]*>)[\s\S]*?(<\/span>)/i, `$1<i data-lucide="sparkles" class="w-3 h-3"></i> ${escapeHtml(offer.badge)}$2`);
        }
        if (offer.text) {
          html = html.replace(/(<span[^>]*id="offerText"[^>]*>)[\s\S]*?(<\/span>)/i, `$1${escapeHtml(offer.text)}$2`);
        }
        if (offer.promoCode) {
          html = html.replace(/(<span[^>]*id="offerCodeTag"[^>]*>)[\s\S]*?(<\/span>)/i, `$1${escapeHtml(offer.promoCode)}$2`);
        }
      }

      // SSR Emergency Phone & WhatsApp Concierge
      const emPhone = dbInst.settings?.emergencyPhone || '+92 302 3650000';
      const emDisplay = dbInst.settings?.emergencyDisplay || emPhone;
      const waNum = dbInst.settings?.whatsappNumber || '923023650000';
      const waMsg = encodeURIComponent(dbInst.settings?.whatsappHelpText || 'Hi CAR 4 RENT, I would like to check vehicle availability.');
      const waUrl = `https://wa.me/${waNum}?text=${waMsg}`;

      html = html.replace(/(<a[^>]*id="emergencyCallLink"[^>]*href=")[^"]*(")/i, `$1tel:${emPhone.replace(/\s+/g, '')}$2`);
      html = html.replace(/(<strong[^>]*id="emergencyPhoneDisplay"[^>]*>)[\s\S]*?(<\/strong>)/i, `$1${escapeHtml(emDisplay)}$2`);
      html = html.replace(/(<a[^>]*id="topWhatsappLink"[^>]*href=")[^"]*(")/i, `$1${waUrl}$2`);
      html = html.replace(/(<a[^>]*id="heroBtn1Link"[^>]*href=")[^"]*(")/i, `$1${waUrl}$2`);

      // SSR Footer Content & Contacts
      const footerSettings = dbInst.settings?.footer || {};
      if (footerSettings.aboutText) {
        html = html.replace(/(<p[^>]*id="footerAboutText"[^>]*>)[\s\S]*?(<\/p>)/i, `$1${escapeHtml(footerSettings.aboutText)}$2`);
      }
      if (footerSettings.phone) {
        html = html.replace(/(<li[^>]*id="footerEmergencyPhone"[^>]*>)[\s\S]*?(<\/li>)/i, `$1<i data-lucide="phone-call" class="w-4 h-4" aria-hidden="true"></i> ${escapeHtml(footerSettings.phone)}$2`);
        html = html.replace(/(<a[^>]*id="footerCallLink"[^>]*href=")[^"]*(")/i, `$1tel:${footerSettings.phone.replace(/\s+/g, '')}$2`);
      }
      if (footerSettings.email) {
        html = html.replace(/(<li[^>]*id="footerEmail"[^>]*>)[\s\S]*?(<\/li>)/i, `$1${escapeHtml(footerSettings.email)}$2`);
      }
      if (footerSettings.address) {
        html = html.replace(/(<li[^>]*id="footerAddress"[^>]*>)[\s\S]*?(<\/li>)/i, `$1${escapeHtml(footerSettings.address)}$2`);
      }
      if (footerSettings.copyright) {
        html = html.replace(/(<p[^>]*id="footerCopyright"[^>]*>)[\s\S]*?(<\/p>)/i, `$1${escapeHtml(footerSettings.copyright)}$2`);
      }
      html = html.replace(/(<a[^>]*id="footerWhatsappLink"[^>]*href=")[^"]*(")/i, `$1${waUrl}$2`);

      // Dynamic cache busting for scripts on normal browser refresh
      const dbVersion = dbInst.settings?.updated_at || Date.now();
      html = html.replace(/src="js\/data\.js\?v=[^"]*"/g, `src="js/data.js?v=${dbVersion}"`);
      html = html.replace(/src="js\/app\.js\?v=[^"]*"/g, `src="js/app.js?v=${dbVersion}"`);

      html = html.replace(/\/uploads\/logo\.jpg/g, getAssetUrlWithVersion('/uploads/logo.jpg'));
      res.writeHead(200, HTML_HEADERS);
      return res.end(html);
    }
  }

  // ====================================================
  // 14. DEDICATED ROUTE FOR USER UPLOADED IMAGES
  // ====================================================
  if (pathname.startsWith('/uploads/') && req.method === 'GET') {
    const subPath = pathname.replace(/^\/uploads\//, '');
    const safeSubPath = path.normalize(subPath).replace(/^(\.\.[\/\\])+/, '');
    let imgPath = path.join(__dirname, 'uploads', safeSubPath);
    if (!fs.existsSync(imgPath)) {
      imgPath = path.join(__dirname, 'database', 'uploads', safeSubPath);
    }
    if (!fs.existsSync(imgPath)) {
      const baseName = path.basename(safeSubPath);
      imgPath = path.join(__dirname, 'uploads', baseName);
      if (!fs.existsSync(imgPath)) {
        imgPath = path.join(__dirname, 'uploads', 'cars', baseName);
      }
    }
    if (fs.existsSync(imgPath) && fs.statSync(imgPath).isFile()) {
      const ext = path.extname(imgPath).toLowerCase();
      const cType = MIME_TYPES[ext] || 'application/octet-stream';
      const stat = fs.statSync(imgPath);

      // Fast streaming & range requests for video playback / fast buffering
      if (req.headers.range && (ext === '.mp4' || ext === '.webm' || ext === '.mov' || ext === '.ogg' || ext === '.ogv')) {
        const range = req.headers.range;
        const total = stat.size;
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
        const chunksize = (end - start) + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': cType
        });
        return fs.createReadStream(imgPath, { start, end }).pipe(res);
      }

      const isDynamicUpload = imgPath.includes('logo.') || imgPath.includes('banner') || imgPath.includes('seo-car') || imgPath.includes('hero');
      const cacheVal = isDynamicUpload 
        ? 'no-cache, must-revalidate' 
        : 'public, max-age=86400, must-revalidate';
      res.writeHead(200, {
        'Content-Type': cType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': cacheVal,
        'ETag': `"${stat.size}-${Math.floor(stat.mtimeMs)}"`,
        'Last-Modified': stat.mtime.toUTCString()
      });
      return fs.createReadStream(imgPath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Image Not Found');
    }
  }

  // ====================================================
  // STATIC FILE SERVING
  // ====================================================
  let reqUrl = pathname;
  if (reqUrl === '/' || reqUrl === '') {
    reqUrl = '/index.html';
  }

  if (reqUrl === '/index.html') {
    let indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const db = readDatabase();
    if (db && db.typography) {
      const typo = db.typography;
      const hFont = typo.headingFont || 'Syne';
      const bFont = typo.bodyFont || 'Plus Jakarta Sans';
      const tTrans = typo.textTransform || 'uppercase';
      const h1D = typo.h1Desktop || 42;
      const h1M = typo.h1Mobile || 23;
      const h2D = typo.h2Desktop || 40;
      const h2M = typo.h2Mobile || 24;
      const bD = typo.bodyDesktop || 17;
      const bM = typo.bodyMobile || 14;
      const typoCss = `
    :root {
      --font-heading: '${hFont}', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --font-body: '${bFont}', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --heading-transform: ${tTrans};
    }
    body, p, input, select, textarea, button, .font-body {
      font-family: var(--font-body);
      font-size: ${bD}px;
    }
    h1, h2, h3, h4, .font-heading {
      font-family: var(--font-heading) !important;
      text-transform: var(--heading-transform) !important;
    }
    #heroH1Heading {
      font-size: ${h1D}px !important;
      line-height: 1.15 !important;
      text-transform: var(--heading-transform) !important;
    }
    h2, .section-title {
      font-size: ${h2D}px !important;
    }
    @media (max-width: 768px) {
      #heroH1Heading {
        font-size: ${h1M}px !important;
      }
      h2, .section-title {
        font-size: ${h2M}px !important;
      }
      body, p, input, select, textarea, button, .font-body {
        font-size: ${bM}px;
      }
    }`;
      indexHtml = indexHtml.replace(/<style id="dynamicTypographyStyles">[\s\S]*?<\/style>/, `<style id="dynamicTypographyStyles">${typoCss}</style>`);
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    return res.end(indexHtml);
  }

  let filePath = path.join(__dirname, reqUrl);
  if (!fs.existsSync(filePath)) {
    // Clean URL Resolution: If clean path has matching .html file, serve it seamlessly
    if (fs.existsSync(filePath + '.html') && fs.statSync(filePath + '.html').isFile()) {
      filePath = filePath + '.html';
    } else {
      const filename = path.basename(reqUrl);
      const subfolder = path.basename(path.dirname(reqUrl));
      const fallbackPath = path.join(__dirname, subfolder, filename);
      if (fs.existsSync(fallbackPath)) {
        filePath = fallbackPath;
      } else if (fs.existsSync(fallbackPath + '.html') && fs.statSync(fallbackPath + '.html').isFile()) {
        filePath = fallbackPath + '.html';
      } else {
        const rootFallback = path.join(__dirname, filename);
        if (fs.existsSync(rootFallback)) {
          filePath = rootFallback;
        } else if (fs.existsSync(rootFallback + '.html') && fs.statSync(rootFallback + '.html').isFile()) {
          filePath = rootFallback + '.html';
        }
      }
    }
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  // Defensive check: Ensure resolved disk path is not a protected resource
  const normalizedDisk = path.normalize(filePath).toLowerCase().replace(/\\/g, '/');
  if (
    normalizedDisk.includes('/database') ||
    normalizedDisk.includes('db.json') ||
    normalizedDisk.endsWith('.json') ||
    normalizedDisk.endsWith('.bat') ||
    normalizedDisk.endsWith('.env') ||
    normalizedDisk.endsWith('.md') ||
    normalizedDisk.endsWith('.lock') ||
    normalizedDisk.includes('keygen') ||
    normalizedDisk.includes('build_') ||
    normalizedDisk.includes('node_modules')
  ) {
    return sendErrorPage(req, res, 403, 'Access Restricted', 'You do not have permission to access this protected system resource.');
  }

  // Explicit route for custom error page preview / testing
  if (pathname === '/error' || pathname === '/404' || pathname === '/error.html' || pathname === '/404.html') {
    const code = parsedUrl.searchParams.get('code') || '404';
    const reason = parsedUrl.searchParams.get('reason') || '';
    const statusNum = parseInt(code, 10) || 404;
    return sendErrorPage(req, res, statusNum, statusNum === 403 ? 'Access Restricted' : 'Page or Vehicle Not Found', reason);
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return sendErrorPage(req, res, 404, 'Page or Vehicle Not Found', 'The requested page, link or vehicle does not exist, has been moved, or you do not have permission to view it.');
      } else {
        return sendErrorPage(req, res, 500, 'Internal Server Error', 'An unexpected server error occurred (' + err.code + '). Our technical team has been alerted.');
      }
    } else {
      let cacheHeader = 'public, max-age=3600';
      if (ext === '.html') {
        cacheHeader = 'no-cache, no-store, must-revalidate';
      } else if (filePath.includes(path.sep + 'uploads' + path.sep) || filePath.includes('logo.')) {
        cacheHeader = 'no-cache, must-revalidate';
      } else if (['.woff', '.woff2', '.ttf'].includes(ext)) {
        cacheHeader = 'public, max-age=31536000, immutable';
      } else if (['.jpg', '.jpeg', '.png', '.webp', '.svg', '.ico'].includes(ext)) {
        cacheHeader = 'public, max-age=86400, must-revalidate';
      } else if (['.css', '.js'].includes(ext)) {
        cacheHeader = 'public, max-age=3600, must-revalidate';
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheHeader
      });
      res.end(content);
    }
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
  } else {
    console.error('Server error:', err);
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` Car4Rent (Pakistan Luxury Car Rental)`);
  console.log(` Running Live at: http://localhost:${PORT}`);
  console.log(` Admin Portal:   http://localhost:${PORT}/admin`);
  console.log(` Central DB:      ${DB_FILE}`);
  console.log(`======================================================\n`);
});
