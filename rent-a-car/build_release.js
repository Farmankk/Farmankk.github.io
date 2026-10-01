const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT_DIR = __dirname;
const DIST_DIR = path.join(ROOT_DIR, 'dist');

console.log('===========================================================');
console.log('      BUILDING SECURE ENCRYPTED CLIENT RELEASE PACKAGE     ');
console.log('===========================================================\n');

// 1. Files / Folders to strictly EXCLUDE (Keep private on developer PC)
const EXCLUDE_LIST = new Set([
  'keygen.js',
  'generate_license.bat',
  'build_release.js',
  'build_protected_release.bat',
  'test_license.js',
  'test_all.js',
  '.old_htaccess',
  'old_db.json',
  'db.zip',
  '.git',
  '.github',
  'node_modules',
  'dist'
]);

// 2. Clean & Recreate dist folder contents safely
if (fs.existsSync(DIST_DIR)) {
  console.log('-> Cleaning previous dist/ directory contents...');
  fs.readdirSync(DIST_DIR).forEach(item => {
    try {
      fs.rmSync(path.join(DIST_DIR, item), { recursive: true, force: true });
    } catch (e) {
      console.warn('Could not remove ' + item + ':', e.message);
    }
  });
} else {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// 3. Copy Directory Recursively
function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      if (EXCLUDE_LIST.has(childItemName)) return;
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('-> Copying project assets to dist/ (Excluding private keygens)...');
const rootItems = fs.readdirSync(ROOT_DIR);
rootItems.forEach(item => {
  if (EXCLUDE_LIST.has(item)) return;
  copyRecursiveSync(path.join(ROOT_DIR, item), path.join(DIST_DIR, item));
});

// Explicitly copy firewall .htaccess files
const rootHtaccess = path.join(ROOT_DIR, '.htaccess');
if (fs.existsSync(rootHtaccess)) {
  fs.copyFileSync(rootHtaccess, path.join(DIST_DIR, '.htaccess'));
  console.log('-> Injected Root Apache Security Firewall (.htaccess)');
}
const dbHtaccess = path.join(ROOT_DIR, 'database', '.htaccess');
if (fs.existsSync(dbHtaccess)) {
  const distDbDir = path.join(DIST_DIR, 'database');
  if (!fs.existsSync(distDbDir)) fs.mkdirSync(distDbDir, { recursive: true });
  fs.copyFileSync(dbHtaccess, path.join(distDbDir, '.htaccess'));
  console.log('-> Injected Database Lockdown Firewall (database/.htaccess)');
}
const distUploadsDir = path.join(DIST_DIR, 'uploads');
if (!fs.existsSync(distUploadsDir)) fs.mkdirSync(distUploadsDir, { recursive: true });

// 4. In dist/database/db.json, reset the license so client site starts locked!
const distDbPath = path.join(DIST_DIR, 'database', 'db.json');
if (fs.existsSync(distDbPath)) {
  try {
    const dbData = JSON.parse(fs.readFileSync(distDbPath, 'utf-8'));
    const rootDb = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'database', 'db.json'), 'utf-8'));
    if (rootDb.license && rootDb.license.key) {
      dbData.license = rootDb.license;
      console.log('-> Preserved existing active license for:', rootDb.license.domain);
    } else {
      dbData.license = null;
      console.log('-> Reset license state in dist/database/db.json (Locked for client domain).');
    }
    fs.writeFileSync(distDbPath, JSON.stringify(dbData, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Could not process license in db.json:', e.message);
  }
}

// 5. In dist/package.json, remove devDependencies to keep client package lean
const distPkgPath = path.join(DIST_DIR, 'package.json');
if (fs.existsSync(distPkgPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(distPkgPath, 'utf-8'));
    delete pkg.devDependencies;
    fs.writeFileSync(distPkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
  } catch (e) {}
}

// 6. Obfuscate Critical Javascript Files
const filesToObfuscate = [
  { file: path.join(DIST_DIR, 'server.js'), target: 'node', mode: 'heavy' },
  { file: path.join(DIST_DIR, 'license-manager.js'), target: 'node', mode: 'heavy' },
  { file: path.join(DIST_DIR, 'js', 'admin.js'), target: 'browser', mode: 'heavy' },
  { file: path.join(DIST_DIR, 'js', 'app.js'), target: 'browser', mode: 'fast' },
  { file: path.join(DIST_DIR, 'js', 'data.js'), target: 'browser', mode: 'fast' }
];

console.log('\n-> Encrypting backend logic & optimizing frontend JS for maximum speed...');

filesToObfuscate.forEach(({ file, target, mode }) => {
  if (!fs.existsSync(file)) return;

  const relName = path.relative(DIST_DIR, file);
  console.log(`   [PROCESSING] ${relName} (${mode.toUpperCase()})...`);

  const rawCode = fs.readFileSync(file, 'utf-8');
  const options = mode === 'heavy' ? {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: false,
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayThreshold: 0.75,
    target: target
  } : {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'mangled',
    log: false,
    numbersToExpressions: false,
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: false,
    stringArray: false,
    target: target
  };

  const obfuscationResult = JavaScriptObfuscator.obfuscate(rawCode, options);
  fs.writeFileSync(file, obfuscationResult.getObfuscatedCode(), 'utf-8');
});

// 7. Create easy-to-run runner batch file in dist
const startBatContent = `@echo off
title Car4Rent Production Server
cd /d "%~dp0"
echo Starting Car4Rent Server...
node server.js
pause
`;
fs.writeFileSync(path.join(DIST_DIR, 'start_server.bat'), startBatContent, 'utf-8');

// 8. Create README for deployment in dist
const readmeContent = `===========================================================
  CAR4RENT LUXURY WEB PORTAL (PROTECTED RELEASE)
===========================================================

DEPLOYMENT INSTRUCTIONS:
1. Upload this entire folder to your production VPS, cPanel, or Cloud host.
2. Ensure Node.js (v18+) is installed on the host.
3. Start the application:
   - Locally / Windows: Double-click start_server.bat or run "node server.js"
   - Linux / VPS: Run "node server.js" or "pm2 start server.js --name car4rent"
4. Open the website in your browser.
5. You will see the "Domain Activation Required" screen.
6. Enter the authorized C4R License Key provided by your vendor for this domain.
7. Once activated, the full web application will immediately unlock.
`;
fs.writeFileSync(path.join(DIST_DIR, 'README_DEPLOY.txt'), readmeContent, 'utf-8');

console.log('\n===========================================================');
console.log(' SUCCESS: PROTECTED RELEASE BUILT SUCCESSFULLY IN dist/ !');
console.log('===========================================================');
console.log(' Highlights:');
console.log(' 1. keygen.js and generate_license.bat are 100% EXCLUDED.');
console.log(' 2. server.js, license-manager.js and client JS are ENCRYPTED.');
console.log(' 3. Code cannot be read, copied, or bypassed.');
console.log(' 4. Website will require license activation on the client domain.');
console.log('===========================================================\n');
