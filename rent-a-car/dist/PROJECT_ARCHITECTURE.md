# Car 4 Rent Web - Master Project Architecture & Fast-Lookup Cheatsheet

> **PURPOSE:** This document contains the complete pre-mapped blueprint of `rent_a_car_web`.
> When performing any task, DO NOT waste time doing wide scans, ripgrep explorations, or deep file reading.
> Refer to this instant map for exact line numbers, endpoints, functions, and state objects.

---

## ⚡ TURBO EXECUTION PROTOCOL (MAX 1-2 MINUTES)
1. **Target Directly:** Identify target file and line range from this cheat sheet.
2. **Execute Single Clean Edit:** Use `replace_file_content` directly without multiple exploratory reads.
3. **Validate Instantly:** Run `node test_all.js` (takes <1 sec).
4. **Deploy Build:** Run `node build_release.js` to update `dist/`.
5. **Report in Roman Urdu:** Give a crisp 2-3 line explanation of what was fixed and why.

---

## 📁 Core File Map & Key Locations

| File | Purpose | Key Line Areas |
| :--- | :--- | :--- |
| **`server.js`** | Node.js Backend Server, SSR, APIs, Security | - L8: `DB_FILE = database/db.json`<br>- L206: `readDatabase()`, `writeDatabase()`<br>- L400-800: SSR for `/cars/:slug`, `/blog`, `/blog/:slug`, `/sitemap.xml`<br>- L1219-1280: `/api/admin/users` (CRUD & `update_permissions`)<br>- L1320+: Other admin CRUD APIs (cars, blogs, seo, settings) |
| **`admin.html`** | Admin Dashboard Single Page Layout | - L1-200: Sidebar navigation & `tabBtn-*`<br>- L200-2400: Tab content panels `tabContent-*`<br>- L2420-2525: `userPermissionsModal` (Page Access Matrix)<br>- L2930: Script tags (`js/admin.js?v=...`) |
| **`js/admin.js`** | Admin Panel Complete Application Logic | - L1-100: `adminState` global store & syncing<br>- L389: `postAdminMutation(endpoint, payload)`<br>- L1200-1300: `renderUsersTable()`<br>- L3950-4000: `getAllAdminSections()`<br>- L4000-4150: `openUserPermissionsModal()`, `updateHeaderCheckboxesState()`, `toggleColumnPermissions()`, `toggleMasterSelectAll()`<br>- L4150-4210: `saveUserPermissions()`, `getCurrentUserTabPermission()`<br>- L4210-4270: `applyCurrentUserPermissions()`, `applyTabActionRestrictions()` |
| **`database/db.json`** | Central Flat JSON Database | Collections: `users`, `cars`, `categories`, `brands`, `blogs`, `settings`, `seo`, `quotes`, `reviews` |
| **`test_all.js`** | Automated Regression & Integrity Tests | 41+ automated tests covering licenses, DB, syntax, calculator math, car SEO, blogs, permissions |
| **`build_release.js`** | Protected Client Release Compiler | Encrypts JS, injects `.htaccess` firewalls, outputs to `dist/` |
| **`index.html`** | Public Home & Fleet Listing Page | Hero, filter tabs, vehicle cards, fare calculator, booking modal |
| **`car.html`** | Dynamic Car View Template | SSR rendered with real-time estimator, WhatsApp CTA |
| **`blog.html`** | Public Blogs & Guides Directory | SSR card grid, live client-side search, category filter pills |
| **`blog-detail.html`** | Public Article Reader Template | SSR rich article content, schema JSON-LD, booking CTA banner |
| **`js/app.js`** | Public Frontend Interaction Logic | Dynamic search, vehicle filtering, fare calculation, WhatsApp URL builder |
| **`js/data.js`** | Static Seed / Fallback Catalog | Fallback cars, categories, default configurations |

---

## 🛡️ User Roles & Permissions Matrix Architecture

### 1. Data Structure in `database/db.json`:
```json
{
  "users": [
    {
      "id": "user-1789368107260",
      "username": "hassan_raza",
      "name": "Hassan Raza",
      "role": "Super Admin",
      "active": true,
      "permissions": {
        "dashboard": { "view": true, "edit": true, "delete": true },
        "cars": { "view": true, "edit": false, "delete": false },
        "blogs": { "view": false, "edit": false, "delete": false }
      }
    }
  ]
}
```

### 2. Permissions Behavior Rules:
- **Priority Rule:** If `user.permissions` has saved settings, they **ALWAYS** take precedence over the role.
- **Root Admin Safe Fallback:** Only `super_admin` without custom permissions gets full master bypass.
- **3 Levels per Section:**
  - `view`: Hides tab button and redirects if attempted.
  - `edit`: Hides Add/Save/Update buttons.
  - `delete`: Hides Delete/Clear buttons.
- **Header Checkboxes:**
  - `permMasterSelectAll`: Toggles all 3 checkboxes for all pages.
  - `permColumnViewAll`: Toggles view for all rows.
  - `permColumnEditAll`: Toggles edit for all rows (enables view if off).
  - `permColumnDeleteAll`: Toggles delete for all rows (enables view if off).

---

## 🚀 Key Commands Reference
```bash
# 1. Run all regression & integrity tests (<1 sec)
node test_all.js

# 2. Validate JS syntax instantly
node -c js/admin.js
node -c server.js

# 3. Compile protected production build to dist/
node build_release.js
```
