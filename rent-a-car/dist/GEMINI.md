# Car 4 Rent Web - Antigravity Agent Rules

## ⚡ 1-2 MINUTE SPEED & DIRECT EXECUTION (NON-NEGOTIABLE)
- **NO REPEATING ANALYSIS / EXPLORATION:** Poora project pre-memorized hai aur `PROJECT_ARCHITECTURE.md` me line-by-line documented hai. Bar-bar exploratory grep, wide scans, ya multiple read calls bilkul mat chalao.
- **DIRECT TARGETING:** `PROJECT_ARCHITECTURE.md` se exact file aur line number daikh kar direct targeted edit (`replace_file_content`) karo.
- **ZERO DELAY:** Har chota ya bara fix maximum 1 se 2 minute ke andar complete ho kar deliver hona chahiye.

## 📁 ARCHITECTURE REFERENCE
- Hamesha `PROJECT_ARCHITECTURE.md` ko as master reference use karo:
  - `server.js`: Node.js server, SSR routes, `/api/admin/users`, `/api/admin/cars`, etc.
  - `admin.html`: Sidebar, tabs, `userPermissionsModal`, modals.
  - `js/admin.js`: `adminState`, Permissions Matrix, CRUD actions, sync.
  - `database/db.json`: JSON Database.
  - `test_all.js`: Automated tests (`node test_all.js`).
  - `build_release.js`: Protected release compiler (`node build_release.js`).

## 🛡️ WORKFLOW STANDARDS
1. **Target Edit:** Ek clean step me targeted file edit karo.
2. **Instant Test:** Hamesha `node test_all.js` chala kar verify karo.
3. **Build Sync:** Hamesha `node build_release.js` run karke `dist/` update karo agar core files change hon.
4. **Cache Bump:** HTML me script tag ka `?v=` bump karo taake client browser instant new JS load kare.

## 🗣️ LANGUAGE & RESPONSE STYLE
- Hamesha **Roman Urdu** me seedhi aur to-the-point baat karo.
- Fuzool lambi tareefen ya analysis mat likho, seedha 2-3 lines me batao kya issue tha, kya fix kiya, aur result kya hai.
