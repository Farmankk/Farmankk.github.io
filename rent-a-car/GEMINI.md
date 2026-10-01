# Car 4 Rent Web - Antigravity Agent Rules

## ⚡ 1-2 MINUTE SPEED & DIRECT EXECUTION (NON-NEGOTIABLE)
- **STRICT TOOL CALL LIMIT (MAX 1-2 CALLS PER TURN):** Ek turn me 1 se zyada exploratory ya multi-step tool calls bilkul banned hain. Seedha exact file target karo aur 1 step me edit karo.
- **NEVER RUN `build_release.js` AUTOMATICALLY:** `build_release.js` heavy obfuscation karta hai jo 40-60 second leta hai. Yeh sirf tab chalana hai jab user khud explicitly bole "build release" ya "package banao". Normal conversation ya bug fixes me yeh KABHI nahi chalana.
- **NO ANALYSIS / EXPLORATION:** Poora project pre-memorized hai aur `PROJECT_ARCHITECTURE.md` me line-by-line documented hai. Wide search, grep, aur multiple views bilkul mat chalao.
- **DIRECT TARGETING:** `PROJECT_ARCHITECTURE.md` se exact file aur line number dekh kar seedha `replace_file_content` chalao.
- **STRICT FIREWALL & IP PROTECTION (NEVER LOOP FTP):** Agar FTP connection fail ya timeout ho to automated loop/retry BILKUL MANA HAI. Repeated attempts hosting firewall (CSF/LFD) ko trigger karti hain jo user ki IP block kar deta hai. Sirf 1 single attempt karo, agar na ho to foran user ko inform karo.

## 📁 MASTER ARCHITECTURE
- Hamesha `PROJECT_ARCHITECTURE.md` ko as master reference use karo:
  - `server.js`: Node.js server, SSR routes, `/api/admin/users`, `/api/admin/cars`, etc.
  - `admin.html`: Sidebar, tabs, `userPermissionsModal`, modals.
  - `js/admin.js`: `adminState`, Permissions Matrix, CRUD actions, sync.
  - `database/db.json`: JSON Database.

## 🛡️ WORKFLOW STANDARDS
1. **Target Edit (Step 1):** Ek clean targeted edit karo (`replace_file_content`).
2. **Instant Response (Step 2):** Foran user ko Roman Urdu me 2-3 lines me batao kya fix hua. Koi lambi report ya time waste nahi.

## 🗣️ LANGUAGE & RESPONSE STYLE
- Hamesha **Roman Urdu** me seedhi aur to-the-point baat karo.
- 2-3 lines me to-the-point reply do.
