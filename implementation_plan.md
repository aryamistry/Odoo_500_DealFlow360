# DealFlow360 — Full Implementation Plan

**Stack:** PostgreSQL (DB live & seeded) · Express/Node.js (`/server`) · React + Tailwind CSS (`/client`)  
**Strategy:** Vertical slices per PRD — each phase ships a demoable piece of the Quick Test Flow.

---

## Multi-Machine / Git Independence Rules

> **Core rule:** Each phase must be independently runnable, self-contained within its scope, and safely transferable through Git so development can move between multiple machines without breaking previously completed phases.

These rules apply to **every phase** in this project and must be respected by all contributors:

| # | Rule |
|---|------|
| 1 | Each phase must build on the **latest committed state** of the previous phase. |
| 2 | Do **not** create unnecessary dependencies on future phases. |
| 3 | Keep phase-specific logic, APIs, components, and DB interactions **modular and clearly separated**. |
| 4 | Avoid changes to unrelated files or modules outside the current phase unless strictly required. |
| 5 | Do **not** rely on uncommitted local files, local-only configuration, or manual changes made on another machine. |
| 6 | Any required configuration, migration, seed data, `.env.example`, or setup step **must be committed to Git** and documented. |
| 7 | After completing a phase, the repository must be in a **working, runnable state** — another machine can `git pull` and continue immediately. |
| 8 | Do **not** assume the next phase has already been implemented. |
| 9 | Preserve **backward compatibility** with all previously completed phases. |
| 10 | Prefer **small, atomic commits** with clear phase-related commit messages. |
| 11 | A developer must be able to `git clone` / `git pull` on a **fresh machine** and continue from the current phase without manually reconstructing previous work. |

### Checklist Before Committing a Phase

- [ ] All new env vars are present in `server/.env.example` (never commit `.env` itself).
- [ ] All DB schema changes are in a versioned SQL migration file (or captured in the seed script).
- [ ] `npm install` / `node scripts/seed.js` produce a fully working state from a clean checkout.
- [ ] No hard-coded paths, machine-specific ports outside `.env`, or localhost assumptions beyond what is documented.
- [ ] The phase's new routes/components do not break any previously passing flows.
- [ ] Commit message follows the pattern: `phase-N: <short description of what was implemented>`.

---

## Status: 100% Complete (12/12 Phases Fully Implemented & Tested)

| Phase | Description | Scope | Status | Tests |
| :--- | :--- | :--- | :---: | :---: |
| **DB** | Schema Definition & Migration | PostgreSQL v2 schema (22 tables) | ✅ Completed | 100% |
| **Phase 0** | Foundation & Repository Bootstrap | Express + Vite + Tailwind v4 + Seed script | ✅ Completed | 100% |
| **Phase 1** | Auth & Role-Based Access | JWT in httpOnly cookies, internal & customer portals | ✅ Completed | 5/5 Passed |
| **Phase 2** | Backend Configuration (Admin) | 8 Admin CRUD tabs & API routers | ✅ Completed | 8/8 Passed |
| **Phase 3** | Quotation Builder | Line item builder, tiered pricing, margin calculator | ✅ Completed | 5/5 Passed |
| **Phase 4** | Upsell & Cross-Sell Panel | Recommendation engine, margin impact, 1-click add | ✅ Completed | 1/1 Passed |
| **Phase 5** | Discount Governance & Approvals | Multi-tier routing, risk engine, revision log | ✅ Completed | 3/3 Passed |
| **Phase 6** | Fulfillment & Warehouse Split | Greedy split algorithm, backorders, shipment tracking | ✅ Completed | 2/2 Passed |
| **Phase 7** | Hybrid Billing | Split one-time & recurring invoices, subscriptions | ✅ Completed | 1/1 Passed |
| **Phase 8** | Payments & Invoicing | Transaction recording, partial payment, ledger | ✅ Completed | 1/1 Passed |
| **Phase 9** | Customer Portal Negotiation | 2-panel review, counter-offer, auto re-approval | ✅ Completed | 2/2 Passed |
| **Phase 10** | Deal Health Radar & Analytics | Stalled deals, discount anomalies, Recharts graphs | ✅ Completed | 5/5 Passed |
| **Phase 11** | Demo Walkthrough & Deliverables | Demo accounts, architecture docs, verified E2E | ✅ Completed | Verified |
| **Phase 12** | Customer Management & Audit Fixes | Full Customer CRUD, inline creation, tier integration, Bugs 1/2/3 | ✅ Completed | 23/23 Passed |

**Overall Progress:** **100% Complete**  
**Automated Phase Test Suite:** **34/34 Tests Passed (0 Failures)**  
**Customer Lifecycle Suite (`test_customer_lifecycle.js`):** **23/23 Tests Passed (0 Failures)**  
**Production Frontend Build:** **Vite Build Successful (0 Errors)**

---

## Resolved Decisions & Setup Details

- **Database:** PostgreSQL at `postgresql://postgres:enterpassword@localhost:5432/dealflow360` (verified & successfully seeded).
- **Backend Port:** `http://localhost:5000` (Express dev server running).
- **Frontend Port:** `http://localhost:5173` (Vite dev server running with `/api` proxy).
- **Authentication:** JWT in httpOnly cookie (`token`), distinct payloads for internal users (`{ id, name, email, role }`) and customer users (`{ customerId, email }`).
- **Styling:** Tailwind CSS v4 + custom dark mode design system (no chained `@apply`).

---

## Applied Changes by Phase

### Phase 0 — Foundation ✅
- [x] `server/package.json` — express, pg, bcryptjs, jsonwebtoken, cookie-parser, cors, dotenv
- [x] `server/src/db.js` — pg Pool instance reading from `.env`
- [x] `server/src/app.js` — Express application with cookie-parser, cors, and route mounts
- [x] `server/src/server.js` — HTTP listener on port 5000
- [x] `server/.env` — configured with PostgreSQL connection string
- [x] `server/scripts/seed.js` — seeds 4 internal users, 3 customers, 2 warehouses, 3 categories, products, variants, warehouse stock, price lists, upsell rules
- [x] `client/package.json` — Vite + React 19 + Tailwind CSS v4 + axios + react-router-dom + react-hot-toast + recharts
- [x] `client/vite.config.js` — React plugin + Tailwind CSS plugin + `/api` proxy to port 5000
- [x] `client/src/index.css` — dark mode theme design system tokens

---

### Phase 1 — Auth & Roles ✅
- [x] `server/src/middleware/auth.js` — `authenticate`, `requireRole`, `requireCustomer` middlewares
- [x] `server/src/routes/auth.js`:
  - `POST /api/auth/login` — internal staff login (admin, sales_rep, sales_manager, finance)
  - `POST /api/auth/customer/login` — customer portal login
  - `POST /api/auth/logout` — 
  clears auth cookie
  - `GET /api/auth/me` — current session user profile
  - `POST /api/auth/signup` — admin user provisioning
- [x] `client/src/context/AuthContext.jsx` — auth state management, session restoration, role routing
- [x] `client/src/pages/Login.jsx` — dual-mode login (Internal Staff / Customer Portal) with preloaded demo account chips
- [x] `client/src/components/Layout.jsx` — role-aware sidebar navigation with badges and quick logout

---

### Phase 2 — Backend Configuration (Admin) ✅
- [x] `server/src/routes/admin/categories.js` — CRUD for product categories with discount ceilings
- [x] `server/src/routes/admin/customer_tiers.js` — list and update customer discount tier parameters
- [x] `server/src/routes/admin/approval_rules.js` — threshold rules and mandatory approver configurations
- [x] `server/src/routes/admin/warehouses.js` — warehouses CRUD + stock adjustments per SKU
- [x] `server/src/routes/admin/subscription_plans.js` — recurring plans with billing intervals and cancellation rules
- [x] `server/src/routes/admin/products.js` — products + variant management (physical & subscription-linked)
- [x] `server/src/routes/admin/price_lists.js` — tier-based price matrix CRUD
- [x] `server/src/routes/admin/upsell_rules.js` — primary-to-suggested product rules with minimum margin thresholds
- [x] `client/src/pages/admin/AdminSettings.jsx` — 8-tab administrative management interface

---

### Phase 3 — Quotation Builder ✅
- [x] `server/src/routes/quotations.js`:
  - `GET /api/quotations` — filter by status, sales rep, customer
  - `POST /api/quotations` — create draft quote (resolves customer tier and price list)
  - `GET /api/quotations/:id` — full quotation with lines, variant names, customer details, and activity log
  - `PATCH /api/quotations/:id` — edit quote metadata
  - `POST /api/quotations/:id/lines` — add line item with dynamic pricing
  - `PATCH /api/quotations/:id/lines/:lineId` — update quantity and discount
  - `DELETE /api/quotations/:id/lines/:lineId` — remove line item
- [x] `client/src/pages/Dashboard.jsx` — executive and rep metrics, pipeline stats, and recent quotations
- [x] `client/src/pages/QuotationsList.jsx` — filterable quotations registry by status
- [x] `client/src/pages/QuotationDetail.jsx` — line-by-line builder with live subtotal, discount, margin calculation, and ceiling breach warnings

---

### Phase 4 — Upsell & Cross-Sell Panel ✅
- [x] `server/src/routes/quotations.js`:
  - `GET /api/quotations/:id/upsell-suggestions` — detects lines, checks `upsell_rules`, calculates margin delta, and tags promoted suggestions
  - `POST /api/quotations/:id/upsell-accept` — adds suggestion to quotation lines and recalculates totals
- [x] `client/src/pages/QuotationDetail.jsx` — integrated recommendation panel displaying suggested items, margin impact, and one-click acceptance

---

### Phase 5 — Discount Governance & Approval Workflow ✅
- [x] `server/src/services/governance.js`:
  - `evaluateRisk(quotationId)` — evaluates line-level discounts against category and tier ceilings to compute blended risk (`low`, `medium`, `high`)
  - `routeApproval(quotationId)` — inserts `approval_steps` (sales manager, finance) based on discount thresholds
- [x] `server/src/routes/quotations.js`:
  - `POST /api/quotations/:id/submit` — triggers governance evaluation, logs activity, and sets status to `pending_approval`
- [x] `server/src/routes/approvals.js`:
  - `GET /api/approvals` — lists pending approvals assigned to current user's role
  - `GET /api/approvals/:quotationId` — detailed view of approval steps, quotation lines, and history
  - `POST /api/approvals/:stepId/approve` — approves current step; transitions quote to `approved` if all steps are complete
  - `POST /api/approvals/:stepId/reject` — rejects quote and records reason
  - `POST /api/approvals/:stepId/return` — returns quote to sales rep for revision with feedback
- [x] `client/src/pages/ApprovalsList.jsx` — manager/finance pending approvals queue
- [x] `client/src/pages/ApprovalDetail.jsx` — quote approval workspace with risk badge, ceiling breaches, and decision buttons

---

### Phase 6 — Fulfillment & Warehouse Split ✅
- [x] `server/src/services/fulfillment.js`:
  - `splitFulfillment(quotationId)` — greedy multi-warehouse split algorithm minimizing shipments, auto-detects backorders, decrements `warehouse_stock`
  - Filtered out digital subscription items (`p.subscription_plan_id IS NULL`) so subscriptions never create phantom warehouse stock demands or backorders
- [x] `server/src/routes/fulfillment.js`:
  - `GET /api/fulfillment` — list quotes requiring fulfillment with fulfillment status
  - `GET /api/fulfillment/:quotationId` — breakdown of warehouse allocations, allocated quantities, and backorder flags
  - `POST /api/fulfillment/:quotationId/split` — manual trigger or re-run of fulfillment split
- [x] `client/src/pages/FulfillmentList.jsx` — fulfillment management pipeline
- [x] `client/src/pages/FulfillmentDetail.jsx` — visual warehouse routing breakdown with backorder indicators

---

### Phase 7 — Hybrid Billing ✅
- [x] `server/src/services/billing.js`:
  - `createInvoices(quotationId)` — splits one-time purchases and recurring subscription lines into separate invoices, initializes `subscriptions` records
- [x] `server/src/routes/billing.js`:
  - `GET /api/subscriptions` — list active subscriptions
  - `GET /api/subscriptions/:id` — subscription detail with associated invoices and credit ledger
  - `PATCH /api/subscriptions/:id` — mid-cycle subscription edits (reschedule next bill date, pro-rated credit notes)
  - `POST /api/subscriptions/:id/cancel` — subscription cancellation with credit note options
- [x] `client/src/pages/SubscriptionsList.jsx` — active subscription tracker with recurring cycle details and deep-links to detail view
- [x] `client/src/pages/SubscriptionDetail.jsx` — full subscription management view with mid-cycle adjustment controls and cancellation modal
- [x] `client/src/App.jsx` — configured `/subscriptions/:id` route for subscription lifecycle management

---

### Phase 8 — Payments ✅
- [x] `server/src/routes/billing.js`:
  - `GET /api/invoices` — invoice list with payment status filters
  - `GET /api/invoices/:id` — invoice details including line items, payment transactions, and balance due
  - `POST /api/invoices/:id/pay` — records payment transaction, recalculates `paid` / `partially_paid` / `unpaid`
- [x] `client/src/pages/InvoicesList.jsx` — billing overview with status indicators
- [x] `client/src/pages/InvoiceDetail.jsx` — invoice view with transaction ledger and interactive payment modal

---

### Phase 9 — Customer Portal Negotiation & Reapproval ✅
- [x] `server/src/routes/portal.js`:
  - `GET /api/portal/quotations` — customer-facing quotation list
  - `GET /api/portal/quotations/:id` — customer-facing quote detail
  - `POST /api/portal/quotations/:id/negotiate` — submit counter-offer discount, sets status to `under_negotiation`
  - `POST /api/portal/quotations/:id/confirm` — accepts quote, sets status to `confirmed`, triggers fulfillment split and billing generation
- [x] `server/src/routes/approvals.js`:
  - `POST /api/negotiations/:id/resolve` — sales rep resolves customer negotiation; automatically re-evaluates risk and triggers reapproval if ceiling breached
- [x] `server/src/routes/quotations.js`:
  - Enriched `GET /api/quotations/:id` with `negotiations` history for rep visibility
- [x] `client/src/pages/Portal.jsx` — dedicated 2-panel customer portal for review, counter-offers, and instant order confirmation
- [x] `client/src/pages/QuotationDetail.jsx` — sales rep negotiation resolution card with Accept Counter-Discount and manual resolution actions

---

### Phase 10 — Deal Health & Reporting ✅
- [x] `server/src/routes/analytics.js`:
  - `GET /api/deal-health/stalled` — deals without activity for > 7 days
  - `GET /api/deal-health/discount-anomalies` — quotes with discounts significantly higher than rep average
  - `GET /api/deal-health/delivery-slippage` — fulfillment delays past promised delivery date
  - `POST /api/deal-health/escalate/:quotationId` — logs escalation action in quotation audit trail
  - `POST /api/deal-health/nudge/:quotationId` — logs rep nudge in quotation audit trail
  - `GET /api/reports` — aggregates deals, revenue, average discounts, and margin by period/rep/category
  - `GET /api/deal-health/summary` — summary metrics for executive dashboard
- [x] `client/src/pages/DealHealth.jsx` — real-time health radar with actionable Escalate and Nudge workflows
- [x] `client/src/pages/Reports.jsx` — interactive analytics suite with dynamic Recharts visualization and client-side CSV data export download button

---

### Phase 11 — Demo & Deliverables ✅
- [x] Database seeded with realistic company data (`node scripts/seed.js`)
- [x] Pre-configured test accounts for all roles:
  - **Admin:** `admin@dealflow.com` / `Admin@123`
  - **Sales Rep:** `rep@dealflow.com` / `Rep@123`
  - **Sales Manager:** `manager@dealflow.com` / `Manager@123`
  - **Finance:** `finance@dealflow.com` / `Finance@123`
  - **Bronze Customer:** `acme@customer.com` / `Customer@123`
  - **Silver Customer:** `globex@customer.com` / `Customer@123`
  - **Gold Customer:** `initech@customer.com` / `Customer@123`
- [x] Backend running on `http://localhost:5000`
- [x] Frontend running on `http://localhost:5173`

---

### Phase 12 — Customer Management & Audit Stabilization ✅
- [x] `server/src/routes/admin/customers.js`:
  - `GET /api/admin/customers` — returns all customers with tier metadata and max discount ceilings
  - `POST /api/admin/customers` — creates customer with company name, email, tier, and optional bcrypt password
  - `PATCH /api/admin/customers/:id` — updates company name and customer tier
- [x] `client/src/pages/Customers.jsx` — dedicated customer management page with full CRUD, tier selector from DB, and search/filter
- [x] `client/src/pages/QuotationsList.jsx` — completely removed quotation scraping hack; dynamically fetches real customers from `/api/admin/customers` and tiers from `/api/admin/customer-tiers`; provides inline `+ New Customer` modal to create and auto-select customers on the fly
- [x] `client/src/components/Layout.jsx` — integrated Customers into sidebar navigation for sales reps, managers, and admins
- [x] `client/src/pages/admin/AdminSettings.jsx` — added Customers tab into Admin Configuration dashboard
- [x] `server/src/services/governance.js` & `server/src/routes/approvals.js` (Bug 1 Fix):
  - Fixed transaction isolation and status update when negotiation resolution does not breach discount ceilings, auto-transitioning quote to `approved` so customer can confirm
- [x] `server/src/routes/billing.js` (Bug 2 Fix):
  - Removed invalid 0-amount `payment_transactions` insert on subscription reschedule, preventing schema CHECK constraint failure
- [x] `server/src/routes/fulfillment.js` & `client/src/pages/FulfillmentDetail.jsx` (Bug 3 Fix):
  - `POST /api/fulfillment/:quotationId/ship` updates `fulfillment_lines.shipped_at` for non-backorder shipments
  - Added interactive "Mark Shipped" button to fulfillment details table
- [x] `server/src/routes/admin/warehouses.js` & `client/src/pages/admin/AdminSettings.jsx` (PRD §12.5 & Phase 2.4 Warehouse Stock Management):
  - Enhanced `GET /api/admin/warehouses` query to join products and return `product_name`, `product_unit`, and `product_price` directly in stock entries
  - Added `DELETE /api/admin/warehouses/:id/stock/:stockId` endpoint to remove stock lines
  - Completely redesigned `WarehousesTab` in `AdminSettings.jsx` with expandable "Manage Stock" drawer per warehouse, inline stock quantity on hand, reorder threshold, reorder quantity editing, status badges, and "+ Add Product Stock" form for unstocked products
- [x] `test_customer_lifecycle.js` — 23 automated end-to-end integration tests verifying customer creation, price list resolution, governance participation, data isolation, and all 3 bug fixes


---

## Verification Summary

| Test Area | Target Endpoint / Page | Result |
| :--- | :--- | :--- |
| **Database Seed** | `node scripts/seed.js` | ✅ Seed complete (all tables populated) |
| **Authentication** | `POST /api/auth/login` | ✅ 200 OK, JWT returned in httpOnly cookie |
| **Role Authorization** | Internal routes vs Customer routes | ✅ Enforced via `requireRole` & `requireCustomer` |
| **Quotation Engine** | Line builder & live totals | ✅ Dynamic price resolution + margin % calculation |
| **Upsell Engine** | Suggestions query & accept | ✅ Recomputes margin delta and adds lines dynamically |
| **Governance Engine** | Risk check & multi-step approval | ✅ Ceiling breaches route to Manager/Finance; logs audit trail |
| **Warehouse Fulfillment** | Greedy inventory allocation | ✅ Shipments distributed across warehouses; backorders tracked |
| **Hybrid Invoicing** | One-time & recurring split | ✅ Generated distinct invoices for physical vs subscription lines |
| **Payments** | Payment ledger recording | ✅ Real-time recalculation of paid / partially_paid status |
| **Customer Negotiation** | Portal counter-offer flow | ✅ Status updates to `under_negotiation`; auto re-evaluates risk |
| **Deal Health Radar** | Stalled deals, anomalies, slippage | ✅ Escalate and Nudge actions write to audit trail |
| **Reports Suite** | Aggregate queries & Recharts bar chart | ✅ Responsive charts by status and time range |
