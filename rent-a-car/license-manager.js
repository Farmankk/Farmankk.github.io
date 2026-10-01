const crypto = require('crypto');

// Master Secret Salt for License Cryptography
const MASTER_SECRET = 'c4r_ent_sec_9971a8e83f2bc10495d48271fbc0214a';

function normalizeDomain(host) {
  if (!host) return 'localhost';
  let d = host.trim().toLowerCase();
  // Strip port
  d = d.split(':')[0];
  // Strip www.
  d = d.replace(/^www\./, '');
  // Strip protocol if mistakenly passed
  d = d.replace(/^https?:\/\//, '');
  // Strip trailing slashes
  d = d.replace(/\/.*$/, '');
  return d;
}

function calculateExpiry(durationType, fromDate = new Date()) {
  const d = new Date(fromDate);
  if (durationType === '3_months') {
    d.setDate(d.getDate() + 90);
    return d.toISOString().split('T')[0];
  } else if (durationType === '6_months') {
    d.setDate(d.getDate() + 180);
    return d.toISOString().split('T')[0];
  } else if (durationType === '1_year') {
    d.setDate(d.getDate() + 365);
    return d.toISOString().split('T')[0];
  } else if (durationType === 'lifetime') {
    return '2099-12-31';
  }
  return d.toISOString().split('T')[0];
}

function generateLicenseKey(domain, durationType = '1_year', customExpiry = null) {
  const normDomain = normalizeDomain(domain);
  const exp = customExpiry || calculateExpiry(durationType);
  const payloadObj = {
    d: normDomain,
    t: durationType,
    exp: exp,
    gen: Date.now()
  };

  const payloadStr = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const signature = crypto.createHmac('sha256', MASTER_SECRET).update(payloadStr).digest('hex').substring(0, 24);

  return `C4R_${payloadStr}_${signature}`;
}

function verifyLicenseKey(key, requestHost) {
  const currentDomain = normalizeDomain(requestHost);
  const isLocalDev = currentDomain === 'localhost' || currentDomain === '127.0.0.1';

  // Allow local machine for risk-free development & testing
  if (isLocalDev) {
    return {
      valid: true,
      domain: 'localhost (Development Mode)',
      type: 'lifetime',
      expiresAt: '2099-12-31',
      daysLeft: 99999,
      licensedDomain: 'localhost'
    };
  }

  if (!key || typeof key !== 'string' || !key.startsWith('C4R_')) {
    return { valid: false, reason: 'Invalid license key format.' };
  }

  const parts = key.split('_');
  if (parts.length !== 3) {
    return { valid: false, reason: 'Corrupted license key structure.' };
  }

  const [prefix, payloadStr, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', MASTER_SECRET).update(payloadStr).digest('hex').substring(0, 24);

  if (sig !== expectedSig) {
    return { valid: false, reason: 'Tampered or counterfeit license key.' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf-8'));
  } catch (e) {
    return { valid: false, reason: 'Unable to decode license payload.' };
  }

  // Check Domain Match
  const licensedDomain = payload.d;

  const isDomainMatched = licensedDomain === '*' ||
    licensedDomain === currentDomain ||
    currentDomain.endsWith('.' + licensedDomain) ||
    (licensedDomain === 'localhost' && (currentDomain === '127.0.0.1' || currentDomain === 'localhost'));

  if (!isDomainMatched) {
    return {
      valid: false,
      reason: `Domain Mismatch! This license is for [${licensedDomain}], but current domain is [${currentDomain}].`,
      licensedDomain,
      currentDomain
    };
  }

  const now = new Date();

  // Check System Clock Rollback Tampering
  if (payload.gen && now.getTime() < (payload.gen - 86400000)) {
    return {
      valid: false,
      reason: 'System clock anomaly detected. Current server time is behind license issue date.',
      tampered: true
    };
  }

  // Check Expiration
  if (payload.t !== 'lifetime') {
    const expDate = new Date(payload.exp + 'T23:59:59Z');
    if (now.getTime() > expDate.getTime()) {
      return {
        valid: false,
        reason: `License expired on ${payload.exp}. Please renew your license key.`,
        expired: true,
        expiresAt: payload.exp,
        licensedDomain
      };
    }
  }

  // Calculate Days Remaining
  let daysLeft = 'Lifetime';
  if (payload.t !== 'lifetime') {
    const diffMs = new Date(payload.exp + 'T23:59:59Z').getTime() - Date.now();
    daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  return {
    valid: true,
    domain: payload.d,
    type: payload.t,
    expiresAt: payload.exp,
    daysLeft,
    generatedAt: payload.gen
  };
}

module.exports = {
  normalizeDomain,
  calculateExpiry,
  generateLicenseKey,
  verifyLicenseKey
};
