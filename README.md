# StokKu — Inventory & POS for Small Shops

StokKu is a frontend for small retail inventory and point-of-sale, written in plain HTML, CSS and JavaScript (multi-page, no build step). There is no backend yet. All data comes from a seeded mock database stored in the browser's `localStorage`. Every page goes through one service layer (`js/api.js`), so you can swap in a real REST API later without touching the pages.

The interface, code and comments are in English. Prices are in Indonesian Rupiah, shown English-style (`Rp 10,000`), and dates use English (UK) formatting (`12 Nov 2026`, 24-hour time).

## Running it

You need any static file server, because the pages share `localStorage` and load files with relative paths.

```bash
# Option A — Python (already installed on most machines)
python -m http.server 5500
```

```bash
# Option B — Node
npx serve -l 5500
```

Then open <http://localhost:5500>. The VS Code **Live Server** extension also works.

On the first visit, 50 products, 5 suppliers and 60 days of sales history are generated relative to **today**, so the dashboard and restock recommendations always have data to show. To start over, the owner can pick **Reset demo data** from the user menu at the top right.

> Libraries are loaded from CDNs (Tailwind Play CDN, Chart.js, Lucide icons, Google Fonts), so you need an internet connection.

## Demo mode (no login)

The login page is currently **turned off**. Opening the app signs you in automatically as the **Owner** (Arsyad Rizantha) and takes you to the Dashboard. To see the app as another role, open the user menu at the top right (or the ⟳ button in the POS header) and choose **Switch role (demo)**.

To bring the login page back, set `DEMO_NO_LOGIN = false` at the top of `js/db.js`. `index.html` will then redirect to `login.html`, and the user menu shows **Log out** again.

If you change the seed data in `js/seed.js`, bump `DB_KEY` in `js/db.js` (e.g. `stokku.db.v3`) so browsers that already have the old data reseed automatically.

## Demo accounts

| Role | Username | Password | Lands on |
|---|---|---|---|
| Owner | `owner` | `owner123` | Dashboard |
| Cashier | `kasir` | `kasir123` | Point of Sale |
| Warehouse Staff | `gudang` | `gudang123` | Stock & Counts |

These accounts are used when the login page is on. On the login page you can click an account card to sign in straight away.

### Access per role

| Page | Owner | Cashier | Warehouse |
|---|:-:|:-:|:-:|
| Dashboard | ✅ | – | – |
| Point of Sale | ✅ | ✅ | – |
| Transactions | ✅ (+ void/refund) | ✅ (view, reprint) | – |
| Products | ✅ (CRUD, categories, suppliers) | view only | view only |
| Stock & Counts | ✅ | – | ✅ |
| Restock Advisor | ✅ | – | ✅ |

Access is enforced in two places. Menu items are hidden and routes are guarded by `Auth.guard()` in `js/layout.js`. Write actions are also checked again inside `js/api.js` (`requireRole`), the way a real backend would check them.

## Features

- **Login and roles**: mock sign-in with redirects per role.
- **Products**: search, filter by category and stock status, sort, pagination, and add/edit/delete with validation (unique SKU and barcode, margin hint). The detail drawer shows a stock-level chart and the full movement history.
- **Categories and suppliers**: CRUD. An item can't be deleted while products still use it.
- **Stock**:
  - **Stock in** (with supplier and delivery-note reference, and an optional new purchase price)
  - **Stock out** (damaged, expired, lost, adjustment)
  - **Stock opname**: enter the physical count, see the difference in quantity and in Rp, then save the adjustments
  - **History**: every stock change creates a movement record
- **POS** (full screen, tablet friendly):
  - Search by name or SKU, a barcode field, and detection of fast keyboard-wedge scanners even when no field is focused
  - Category chips
  - Cart with quantity editing, per-item discount, and transaction discount in Rp or %
  - Payment by cash (with change calculation and quick-amount buttons), QRIS or bank transfer
  - Receipt preview and thermal printing at **58 mm or 80 mm**
  - Keyboard shortcuts: `F2` search, `F4` barcode, `F9` pay
- **Transaction history**: filters, detail view, reprint, and **void/refund** (owner only, a reason is required, and stock is restored).
- **Dashboard**:
  - KPIs: today's sales, transaction count, gross profit, inventory value. Each is compared with yesterday up to the same time of day.
  - Sales trend chart (daily, weekly, monthly; revenue or profit)
  - Best sellers and slow movers
  - Out-of-stock and low-stock lists
  - Sales by category and by payment method
- **Restock recommendations**:
  - Status per product, 30-day sales sparklines, an editable order quantity, and adjustable parameters (period, Z value, coverage days, SMA or SES method)
  - **Printable purchase orders** (A4), grouped by supplier
- **Low-stock bell** in the top bar.
- **States and motion**: loading skeletons, empty and error states (with retry), toasts, confirm dialogs, and animations (count-up numbers, staggered entry, fly-to-cart, the receipt check mark, a sliding nav indicator).

## Restock algorithm (`js/restock.js`)

This is a pure JavaScript module with no DOM or app dependencies. It works as `window.Restock` in the browser and through `require()` in Node.

For each product:

| Step | Formula |
|---|---|
| Average daily sales | forecast of daily sales over the last *N* **complete** days (default 30; today is excluded) |
| Days of stock left | `stock ÷ avgDaily` |
| Safety stock | `Z × σ(daily sales) × √leadTime` (default Z = 1.65 ≈ 95% service level; σ = sample std. dev.) |
| Reorder point | `avgDaily × leadTime + safetyStock` |
| Suggested order | `max(0, avgDaily × targetCoverageDays + safetyStock − stock)` |

Statuses:

- **Restock Now**: `stock ≤ reorder point`
- **Restock Soon**: within 7 days of the reorder point
- **Overstock**: more than 2 × (target coverage + safety stock), or no sales at all while stock is on hand
- **Safe**: everything else

The forecast step is a pluggable strategy (`Restock.strategies`). `sma` (moving average) and `ses` (exponential smoothing) are included. To try another model, add `{ id, label, forecast(series, opts) }` and pass its id as `settings.method`.

Quick check in Node:

```bash
node -e "const R=require('./js/restock.js'); console.log(R.calculateForProduct({id:'a',stock:10,leadTimeDays:4},[2,4,4,4,5,5,7,9]))"
```

## Project structure

```
index.html            Entry point (auto sign-in in demo mode, otherwise → login.html)
login.html            Login (unused while DEMO_NO_LOGIN = true)
dashboard.html        Owner analytics
pos.html              Full-screen cashier
transactions.html     Transaction history / void / refund
products.html         Products, categories, suppliers
stock.html            Stock in / out / opname / history
restock.html          Restock recommendations + purchase orders
css/app.css           Components, animations, receipt & PO print styles
js/
  tailwind-config.js  Design tokens for the Tailwind CDN
  seed.js             Master data + deterministic 60-day history generator
  db.js               Mock database (the ONLY code that touches localStorage for data)
  api.js              Service layer — every page calls Api.*
  utils.js            Formatters (Rupiah, English dates), toast, modal, confirm, printing
  layout.js           Auth guard, role/menu config, top bar + sidebar shell
  restock.js          Restock algorithm (pure)
  pages/*.js          One script per page
```

## Connecting a real backend

1. Keep the method names in `js/api.js` and replace each body with a `fetch` call that returns the same JSON shape, for example:
   ```js
   list(q) {
     return fetch('/api/products?' + new URLSearchParams(q), { headers: authHeader() })
       .then(handle) // throw ApiError on !res.ok, with .fields for 422 validation errors
   }
   ```
2. Store the auth token the login endpoint returns in place of `DB.Session` (the pages only read `DB.Session.get()` for the current user's name and role).
3. Move the "server-side" rules in `api.js` to the backend: `requireRole`, stock validation, invoice numbering, and creating stock movements.
4. Delete `js/seed.js` and `js/db.js`.
5. `js/restock.js` can run on either side. For large catalogs, have the backend serve pre-aggregated daily sales (`Api.sales.records`) or the computed recommendations.

## Notes and limits

- The Tailwind **Play CDN** is fine for a demo. For production, compile the CSS with the Tailwind CLI.
- The QRIS screen shows a decorative pattern, not a real payment QR code.
- Data lives in one browser. A different browser, device or private window starts with fresh demo data.
- Out of scope for this version: PDF/Excel export, WhatsApp restock messages, user management UI, store-profile settings and automated unit tests.
