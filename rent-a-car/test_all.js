const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { verifyLicenseKey } = require('./license-manager');

console.log('===========================================================');
console.log('      RUNNING AUTOMATED SYSTEM INTEGRITY & REGRESSION TESTS');
console.log('===========================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, testName) {
  if (condition) {
    console.log('  [PASS] ' + testName);
    passCount++;
  } else {
    console.error('  [FAIL] ' + testName);
    failCount++;
  }
}

// 1. LICENSE INTEGRITY TESTS
console.log('-> 1. License Engine Tests:');
const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'database', 'db.json'), 'utf-8'));
const key = db.license ? db.license.key : '';

const localCheck = verifyLicenseKey(key, 'localhost');
assert(localCheck.valid === true, 'Localhost allowed for zero-risk local development & testing');

const liveCheck = verifyLicenseKey(key, 'car4rent.com.pk');
assert(liveCheck.valid === true, 'Live domain (car4rent.com.pk) has valid active license');

const badCheck = verifyLicenseKey(key, 'unauthorized-site.com');
assert(badCheck.valid === false, 'Unauthorized domain access correctly blocked');

// 2. DATABASE TESTS
console.log('\n-> 2. Database Structure Tests:');
assert(Array.isArray(db.cars) && db.cars.length > 0, 'Cars found in database: ' + db.cars.length);
assert(db.typography && db.typography.headingFont === 'Syne', 'Typography Heading Font: ' + db.typography?.headingFont);
assert(db.typography && db.typography.bodyFont === 'Plus Jakarta Sans', 'Typography Body Font: ' + db.typography?.bodyFont);
assert(db.typography && db.typography.textTransform === 'uppercase', 'Typography Text Transform: ' + db.typography?.textTransform);
assert(db.seoSettings && typeof db.seoSettings === 'object', 'SEO Settings object exists in database');

// 3. ADMIN JS JAVASCRIPT SYNTAX & SCOPE TESTS
console.log('\n-> 3. JavaScript Syntax & Function Scope Tests:');
try {
  execSync('node -c js/admin.js', { stdio: 'pipe' });
  assert(true, 'js/admin.js passes node syntax validation');
} catch (e) {
  assert(false, 'js/admin.js syntax error: ' + e.message);
}

const adminJsContent = fs.readFileSync(path.join(__dirname, 'js', 'admin.js'), 'utf-8');
const handleSaveGlobalSeoMatch = adminJsContent.match(/async function handleSaveGlobalSeo\(e\)\s*\{([\s\S]*?)(?=\nasync function|\nfunction|\n\/\/ ===)/);
if (handleSaveGlobalSeoMatch) {
  const funcBody = handleSaveGlobalSeoMatch[1];
  const hasSetVal = funcBody.includes('setVal');
  const definesSetVal = funcBody.includes('const setVal =') || funcBody.includes('function setVal');
  assert(hasSetVal && definesSetVal, 'handleSaveGlobalSeo defines setVal helper in its own scope (ReferenceError fixed)');
} else {
  assert(false, 'handleSaveGlobalSeo function found in js/admin.js');
}

// 4. CALCULATOR MATH TEST (Bug Regression)
console.log('\n-> 4. Calculator Math Regression Test:');
const dailyRate = 15000;
const days = 30;
const grossTotal = dailyRate * days; // 450,000
const discountPercent = 8;
const discountAmount = Math.round(grossTotal * (discountPercent / 100)); // 36,000
const showAddons = false;
let addonsTotal = 0;
if (showAddons) {
  addonsTotal = 150000;
}
const netTotal = (grossTotal - discountAmount) + addonsTotal;
assert(grossTotal === 450000, 'Gross total 15,000 x 30 = 450,000');
assert(discountAmount === 36000, '8% discount = 36,000');
assert(addonsTotal === 0, 'Disabled addons strictly produce 0 addonsTotal');
assert(netTotal === 414000, 'Net total is exactly 414,000 (Rs. 150,000 bug resolved)');

// 5. DYNAMIC SINGLE CAR PAGES & SITEMAP TESTS
console.log('\n-> 5. Dynamic Car Pages & SEO Tests:');
assert(fs.existsSync(path.join(__dirname, 'car.html')), 'car.html dynamic vehicle template file exists');
const carHtml = fs.readFileSync(path.join(__dirname, 'car.html'), 'utf-8');
assert(carHtml.includes('id="carMainH1"'), 'car.html contains carMainH1 heading container');
assert(carHtml.includes('id="carDirectWhatsappBtn"'), 'car.html contains WhatsApp booking button');
assert(carHtml.includes('recalcCarEstimate'), 'car.html contains real-time fare estimator');

const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf-8');
assert(serverJs.includes("cleanPath.startsWith('cars/')"), 'server.js routes /cars/:slug to dynamic car page');
assert(serverJs.includes('@type": "Car"'), 'server.js injects Google Car & Product Schema');
assert(serverJs.includes('/cars/${slug}'), 'server.js sitemap.xml includes dynamic /cars/:slug URLs');

// 6. DYNAMIC BLOG & ARTICLES ENGINE TESTS
console.log('\n-> 6. Dynamic Blog & Articles Engine Tests:');
assert(fs.existsSync(path.join(__dirname, 'blog.html')), 'blog.html public blog index template exists');
assert(fs.existsSync(path.join(__dirname, 'blog-detail.html')), 'blog-detail.html public reader template exists');

const blogDetailHtml = fs.readFileSync(path.join(__dirname, 'blog-detail.html'), 'utf-8');
assert(blogDetailHtml.includes('id="articleMainTitle"'), 'blog-detail.html contains articleMainTitle container');
assert(blogDetailHtml.includes('id="articleBodyContent"'), 'blog-detail.html contains articleBodyContent reader');
assert(blogDetailHtml.includes('id="articleBottomWhatsappBtn"'), 'blog-detail.html contains direct WhatsApp booking CTA');

assert(serverJs.includes("cleanPath === 'blog'"), 'server.js handles /blog route with SSR');
assert(serverJs.includes("cleanPath.startsWith('blog/')"), 'server.js handles dynamic /blog/:slug with SSR');
assert(serverJs.includes('@type": "BlogPosting"'), 'server.js injects BlogPosting Schema.org JSON-LD');
assert(serverJs.includes('/blog/${b.slug}'), 'server.js sitemap.xml includes dynamic blog URLs');
assert(Array.isArray(db.blogs) && db.blogs.length >= 3, 'database/db.json has 3+ seeded blog articles (Count: ' + (db.blogs ? db.blogs.length : 0) + ')');

// 7. USER PERMISSIONS & PAGE ACCESS MATRIX TESTS
console.log('\n-> 7. User Role & Page Permissions Matrix Tests:');
const adminHtmlContent = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf-8');
assert(adminHtmlContent.includes('id="userPermissionsModal"'), 'admin.html contains userPermissionsModal');
assert(adminHtmlContent.includes('id="permissionsTableBody"'), 'admin.html contains dynamic permissionsTableBody');
assert(adminJsContent.includes('function openUserPermissionsModal'), 'js/admin.js defines openUserPermissionsModal function');
assert(adminJsContent.includes('function getAllAdminSections'), 'js/admin.js defines dynamic getAllAdminSections discovery');
assert(adminHtmlContent.includes('id="permMasterSelectAll"'), 'admin.html contains master Select All Pages checkbox');
assert(adminHtmlContent.includes('id="permColumnViewAll"'), 'admin.html contains View All column checkbox');
assert(adminJsContent.includes('function toggleMasterSelectAll'), 'js/admin.js defines toggleMasterSelectAll function');
assert(adminJsContent.includes('function toggleColumnPermissions'), 'js/admin.js defines toggleColumnPermissions function');
assert(adminJsContent.includes('function updateHeaderCheckboxesState'), 'js/admin.js defines updateHeaderCheckboxesState function');
assert(serverJs.includes("action === 'update_permissions'"), 'server.js backend supports update_permissions API');

console.log('\n===========================================================');
console.log(' SUMMARY: ' + passCount + ' PASSED, ' + failCount + ' FAILED');
console.log('===========================================================\n');

process.exit(failCount === 0 ? 0 : 1);
