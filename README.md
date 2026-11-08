# 🚀 RewardZone — Modern "Watch & Task to Earn" Crypto Rewards Platform

A complete, production-ready full-stack **"Watch & Task to Earn"** web application inspired by modern crypto platforms (AdSelect) and cinema streaming portals (Stremio).

---

## ⚡ Tech Stack
- **Backend:** Node.js + Express.js
- **Database:** SQLite with `better-sqlite3` (WAL mode enabled, zero external DB configuration required, clean standard SQL schema portable to MySQL/Postgres)
- **Authentication:** JWT stored in HTTP-Only Cookies and `Authorization: Bearer` headers + `bcryptjs` password hashing
- **Frontend:** HTML5, TailwindCSS (CDN), Vanilla JavaScript, FontAwesome 6, custom cyber-themed glassmorphism CSS (`#0f172a` deep slate, `#10b981` emerald, `#8b5cf6` violet)

---

## 📁 Project Structure

```
watch-to-earn-app/
├── database.js          # SQLite schema, indices, sample seed data & transactions
├── server.js            # Express REST API, Anti-Cheat engine, S2S Webhook, Auth
├── package.json         # NPM scripts and dependencies
├── .env                 # Environment configuration (secrets, ports)
├── .env.example         # Template configuration
└── public/
    ├── index.html       # User Portal (Watch to Earn, Offerwall, Daily, Cashout, Referrals)
    ├── admin.html       # Admin Command Center (KPIs, Withdrawals Queue, Audit, Video CRUD)
    ├── css/
    │   └── custom.css   # Cyber glassmorphism styling, glows, animations
    └── js/
        ├── app.js       # User SPA logic, Anti-cheat active-tab timer, modals
        └── admin.js     # Admin dashboard management & S2S postback tester
```

---

## 🎯 Quick Start & Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
A default `.env` file is already created:
```env
PORT=3000
NODE_ENV=production
ADMIN_PASSWORD=your_secure_admin_password_here
JWT_SECRET=your_long_64_char_random_jwt_secret
POSTBACK_SECRET=your_random_postback_secret
ADMIN_KEY=your_random_admin_api_key
DB_PATH=rewardzone.db
```

### 3. Start the Server
```bash
npm start
# or for live watch mode:
npm run dev
```

The app will be live at:
- **User Portal:** `http://localhost:3000`
- **Admin Dashboard:** `http://localhost:3000/admin`
- **S2S Postback Webhook:** `http://localhost:3000/api/postback`

---

## 🔑 Administrator Authentication

The platform administrator account is secured by your environment configuration:

- **Username / Email:** `admin` or `admin@rewardzone.local`
- **Password:** Defined in `.env` via `ADMIN_PASSWORD` (e.g. `Adm!WQHtCHWcmlOdaPa1#9xZ`)
- **Admin Key Header (Optional API Access):** `x-admin-key` header with the value of `ADMIN_KEY` from `.env`.

---

## 🎬 Where to Paste Ad Network Scripts & Banners

The watch modal features dedicated HTML container slots with clear comments:

### 1. Top Banner (728x90 or Responsive)
Open `public/index.html` and locate line `~380`:
```html
<!-- ======================================================== -->
<!-- ADSTERRA / A-ADS / HILLTOPADS TOP BANNER (728x90) SLOT   -->
<!-- ======================================================== -->
<div id="ad-banner-top" class="w-full mb-4 rounded-xl overflow-hidden text-center">
  <!-- Paste your 728x90 or responsive top banner ad script tag below -->
  <script type="text/javascript">
    atOptions = {
      'key' : 'YOUR_ADSTERRA_KEY_HERE',
      'format' : 'iframe',
      'height' : 90,
      'width' : 728,
      'params' : {}
    };
  </script>
</div>
```

### 2. Sidebar Banner (300x250 or 160x600)
Open `public/index.html` and locate line `~430`:
```html
<!-- ======================================================== -->
<!-- ADSTERRA / A-ADS / HILLTOPADS SIDEBAR BANNER (300x250)   -->
<!-- ======================================================== -->
<div id="ad-banner-sidebar" class="w-full rounded-xl overflow-hidden">
  <!-- Paste your 300x250 sidebar banner ad script tag below -->
</div>
```

---

## ⚡ Where to Drop Offerwall Iframe URLs

Open `public/index.html` and locate the Offerwall section (`#tab-offerwalls`):
```html
<!-- ======================================================== -->
<!-- DROP YOUR CPALEAD / TIMEWALL / LOOTABLY IFRAME URL HERE  -->
<!-- ======================================================== -->
<iframe 
  src="https://fasttrack.cpalead.com/offers.php?id=YOUR_ID&subid=[USER_ID]" 
  width="100%" 
  height="800px" 
  frameborder="0">
</iframe>
```
In `public/js/app.js`, the user's ID is automatically bound to the iframe or can be injected using `state.user.id`.

---

## 🛡️ Anti-Cheat "Watch to Earn" Engine

1. **Client-Side Verification:**
   - The countdown timer **strictly ticks down only when the tab is actively focused and visible**:
     `document.hasFocus() && document.visibilityState === 'visible'`
   - If the user changes tabs, switches windows, or minimizes the browser, the timer **immediately pauses** and displays an animated warning banner:
     `⚠️ Tab inactive - Timer paused! Stay on this tab to earn coins.`
2. **Server-Side Verification:**
   - Starting a task calls `POST /api/tasks/start-video`, recording `start_time = Date.now()` on the backend and issuing a cryptographic `session_token`.
   - When claiming reward via `POST /api/tasks/claim-video`, the server validates:
     `Date.now() - session.start_time >= (task.duration_seconds * 1000) - 1000`
   - If a user sends a fake claim via Postman or script before the required duration has elapsed, the server **rejects with HTTP 403 (Cheat Detected)**.
   - Tasks enforce a **24-hour cooldown** per user per task.

---

## 🌐 Universal S2S Postback Webhook (`GET /api/postback`)

Configure your CPA network with:
```
http://YOUR_DOMAIN/api/postback?userid={subid}&payout={payout}&txid={tx_id}&sig={signature}
```

### Features:
- **Signature Verification:** Supports HMAC-SHA256, MD5 hash (`userid + payout + txid + secret`), or direct secret matching against `POSTBACK_SECRET`.
- **Deduplication:** Verifies `txid` does not already exist in `completed_tasks`. Duplicate callbacks return `200 OK` (body: `"1"`) without duplicate crediting.
- **Tiered 10% Referral Commission:** If the user has an inviter (`referred_by`), the inviter is **automatically credited with 10% of the payout** in the same transaction!
- **Response:** Returns `200 OK` (body `"1"`) matching CPA network postback specifications.

---

## 👥 Tiered Referral System (`?ref=CODE`)

- Visiting `/?ref=CODE` or `/register?ref=CODE`:
  - Automatically extracts `ref` code from the URL.
  - Displays a persistent top invitation banner: *"You were invited by Ambassador: [CODE]!"*
  - Stores code in `localStorage.setItem('rewardzone_ref', code)`.
  - Automatically pre-populates the registration form.
- Upon registration:
  - Links user's `referred_by` to the inviter's ID.
- **Commission Engine:**
  - Whenever a user earns coins from a Video Task or an Offerwall S2S Postback, 10% of that reward is credited to their referrer.
  - Referral Hub tab includes 1-click **Copy Referral Link**, direct **WhatsApp Share**, **X (Twitter) Share**, and network stats.

---

## 💸 Crypto Cashout & Admin Panel

- **User Cashout:**
  - Networks: `USDT-BEP20`, `USDT-TRC20`, `LTC`, `SOL`
  - Min Threshold: **5,000 Coins ($5.00 USD)**. 1,000 Coins = $1.00 USD.
  - Submitting immediately deducts coins from balance and sets status to `pending`.
- **Admin Dashboard (`/admin`):**
  - **KPIs:** Total Users, Coins in Circulation, Pending Cashout $, Total Paid Out.
  - **Withdrawals Queue:** Approve payouts or **Reject & Refund** (instantly returns coins to user).
  - **User Anti-Cheat Audit Modal:** Click "Audit" on any user or withdrawal to inspect their exact task history, IP addresses, session elapsed times, and video verifications to catch bots before paying.
  - **Video Tasks CRUD:** Add new videos (auto-converts YouTube watch URLs to embeds), delete videos, adjust durations and coin rewards.
  - **Live Postback Simulator:** Fire test postbacks on the fly to verify affiliate integration.
