<div align="center">

# 🚀 DealFlow360

### Next-Gen B2B CPQ, Fulfillment & Billing Engine

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?logo=postgresql&logoColor=white)](https://postgresql.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An enterprise-grade **Configure, Price, Quote (CPQ)** platform that unifies dynamic pricing, autonomous approval workflows, greedy multi-warehouse fulfillment, and hybrid one-time/recurring billing — all in a single, cohesive system.

[Getting Started](#-getting-started) · [Architecture](#-architecture) · [Features](#-features) · [Demo Credentials](#-demo-credentials) · [Roadmap](#-roadmap)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Architecture](#-architecture)
- [Data Model](#-data-model)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Demo Credentials](#-demo-credentials)
- [Core Workflows](#-core-workflows)
- [API Routes](#-api-routes)
- [Running Tests](#-running-tests)
- [Roadmap](#-roadmap)
- [License](#-license)

---

## 🌟 Overview

DealFlow360 is built for complex B2B sales operations where a single deal can involve multiple product lines, multi-warehouse inventory, tiered customer pricing, approval chains, and mixed recurring/one-time billing. It replaces a patchwork of spreadsheets, email threads, and siloed ERP modules with a single source of truth.

**Key differentiators:**
- Real-time margin visibility at every step of the quote lifecycle
- Risk-adaptive approval routing — no rules hardcoded, fully configurable
- Greedy fulfillment algorithm that minimises shipments across warehouses
- Customer-facing portal with live negotiation and auto-reapproval triggers
- Executive deal-health radar with actionable escalation workflows

---

## ✨ Features

| Module | Capability |
|:---|:---|
| **CPQ Engine** | Multi-tier price lists, real-time margin engine, category-ceiling breach alerts |
| **Upsell / Cross-sell** | Contextual line-item recommendations with instant margin-delta projection |
| **Governance & Approvals** | Risk scoring (`low` / `medium` / `high`), multi-step approval chains, immutable audit trail |
| **Customer Portal** | Counter-offer submission, quote review, 1-click order confirmation, invoice viewing & payments |
| **Fulfillment** | Greedy multi-warehouse allocation, automatic backorder flagging, shipment tracking |
| **Hybrid Billing** | Split invoicing for hardware vs. subscriptions, proration, mid-cycle upgrades/downgrades |
| **Payments & Ledger** | Partial / full payments, credit notes, automated refund computation |
| **Deal Health Radar** | Stalled-deal detection, discount anomaly surfacing, delivery-slippage monitoring |
| **Executive Reports** | Recharts dashboards, date-range filtering, XLSX export, rep-level analytics |
| **Admin Suite** | 8-tab configuration for tiers, price lists, approval rules, warehouses, plans, and more |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DEALFLOW360 — SYSTEM ARCHITECTURE                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Browser Clients                                                            │
│   ┌──────────────────────┐   ┌─────────────────────────────────────────┐   │
│   │  Internal Dashboard  │   │         Customer Portal (/portal)        │   │
│   │  (Admin / Sales Rep  │   │  (Quote review · Counter-offer ·        │   │
│   │   Manager / Finance) │   │   Invoice view & pay · Confirm order)   │   │
│   └──────────┬───────────┘   └────────────────────┬────────────────────┘   │
│              │   React 18 + Vite + React Router    │                        │
│              └────────────────┬────────────────────┘                        │
│                               │  Axios (JWT HttpOnly Cookie)                │
│   ┌───────────────────────────▼─────────────────────────────────────────┐  │
│   │                    Express.js REST API  (:5000)                      │  │
│   │                                                                      │  │
│   │  /auth     /quotations   /approvals   /fulfillment                  │  │
│   │  /billing  /portal       /analytics   /admin/*                      │  │
│   │                                                                      │  │
│   │  ┌─────────────────────────────────────────────────────────────┐   │  │
│   │  │               Core Domain Services                           │   │  │
│   │  │                                                               │   │  │
│   │  │  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐ │   │  │
│   │  │  │  Governance  │  │  Fulfillment  │  │  Billing Engine  │ │   │  │
│   │  │  │   Service    │  │   Service     │  │                  │ │   │  │
│   │  │  │              │  │               │  │  • Proration     │ │   │  │
│   │  │  │ • Risk score │  │ • Greedy      │  │  • Credit notes  │ │   │  │
│   │  │  │ • Step gen   │  │   warehouse   │  │  • Idempotency   │ │   │  │
│   │  │  │ • Reapproval │  │   allocation  │  │  • Split invoic. │ │   │  │
│   │  │  └──────────────┘  └───────────────┘  └──────────────────┘ │   │  │
│   │  └─────────────────────────────────────────────────────────────┘   │  │
│   └───────────────────────────┬─────────────────────────────────────────┘  │
│                               │  pg pool (ACID transactions)                │
│   ┌───────────────────────────▼─────────────────────────────────────────┐  │
│   │                       PostgreSQL 14+                                 │  │
│   │   users · customers · products · quotations · quotation_lines        │  │
│   │   approval_steps · fulfillment_lines · subscriptions · invoices      │  │
│   │   payment_transactions · price_lists · warehouses · inventory        │  │
│   │   customer_tiers · subscription_plans · platform_settings            │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🗃 Data Model

```
customers ──────────────────┐
  id, company_name,         │  1:many
  email, tier               │
                            ▼
price_lists ◄──── customer_tiers     quotations ──────────────── users (sales_rep)
  id, name, tier               id, customer_id, ────────►  id, role,
  (Bronze/Silver/Gold)         sales_rep_id,               email, password_hash
                               status, risk_level
        ▲                            │ 1:many
        │                            ▼
products ◄──── price_list_items  quotation_lines ──────► products
  id, name,      base_price        id, product_id,         id, category_id,
  category_id,                     quantity, discount_pct  subscription_plan_id,
  subscription_plan_id             line_total, variant_id  price, cost_price
        │                            │
        │                            │ triggers on confirm
        ▼                            ▼
subscription_plans          ┌───────────────────────────────────────┐
  id, billing_cycle,        │   approval_steps   fulfillment_lines  │
  proration_rule,           │   id, quote_id     id, quote_id       │
  cancellation_rule,        │   role, status     warehouse_id       │
  refund_rule               │   decided_at       status, qty        │
        │                   └───────────────────────────────────────┘
        ▼                            │
subscriptions               invoices ◄──────────────── payment_transactions
  id, customer_id,            id, subscription_id       id, type (payment /
  product_id, status,         or quotation_id            credit_note)
  next_bill_date,             amount, status             amount, reason
  quantity_override           (draft/sent/paid)
```

---

## 🛠 Tech Stack

| Layer | Technology |
|:---|:---|
| **Frontend** | React 18, Vite 5, React Router v6, Axios |
| **UI / Styling** | Tailwind CSS v4, Lucide React icons, Recharts |
| **Backend** | Node.js 18+, Express.js 4 |
| **Database** | PostgreSQL 14+, `pg` connection pool |
| **Auth** | JWT stored in `httpOnly` cookies, bcryptjs |
| **Notifications** | React Hot Toast |
| **Exports** | SheetJS (XLSX) |
| **Dev Tools** | Vite HMR, nodemon, dotenvx |

---

## 📁 Project Structure

```
DealFlow/
├── client/                        # React + Vite frontend
│   ├── src/
│   │   ├── api/                   # Axios client with auth interceptors
│   │   ├── components/            # Layout, Sidebar, Pagination, StatusBadge
│   │   ├── context/               # AuthContext, RefDataContext (tiers cache)
│   │   └── pages/
│   │       ├── Dashboard.jsx
│   │       ├── QuotationsList.jsx # Quote builder + search
│   │       ├── QuotationDetail.jsx
│   │       ├── ApprovalsList.jsx
│   │       ├── FulfillmentList.jsx
│   │       ├── InvoicesList.jsx
│   │       ├── SubscriptionsList.jsx
│   │       ├── SubscriptionDetail.jsx
│   │       ├── Portal.jsx         # Customer portal (tabbed SPA)
│   │       ├── DealHealth.jsx
│   │       ├── Reports.jsx        # Recharts + XLSX export
│   │       └── admin/
│   │           └── AdminSettings.jsx  # 8-tab config suite
│   ├── App.jsx                    # Route guards (internal vs. portal)
│   └── index.css                  # Tailwind v4 design tokens
│
├── server/
│   ├── src/
│   │   ├── middleware/            # requireAuth, requireRole
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── quotations.js      # CPQ core + ILIKE search
│   │   │   ├── approvals.js       # Multi-step approval queue
│   │   │   ├── fulfillment.js     # Warehouse allocation
│   │   │   ├── billing.js         # Subscriptions, invoices, payments
│   │   │   ├── portal.js          # Customer-facing endpoints
│   │   │   ├── analytics.js       # Reports + deal health
│   │   │   └── admin/             # 8 admin config endpoints
│   │   ├── services/
│   │   │   ├── governance.js      # Risk scoring & approval step generation
│   │   │   ├── fulfillment.js     # Greedy warehouse allocation engine
│   │   │   └── billing.js         # Subscription + invoice provisioning
│   │   ├── db.js                  # pg pool (max 20, statement_timeout 10 s)
│   │   └── app.js
│   ├── scripts/seed.js            # Reference data + demo user seeding
│   └── .env.example
│
├── dealflow360_schema_v2.sql      # Full DDL — run this first
├── migrate.js                     # Incremental migration runner
├── test_all_phases.js             # Phase 1-10 regression suite
├── test_e2e_demo_flows.js         # End-to-end flow tests
├── test_customer_lifecycle.js     # Customer CRUD + portal isolation
├── test_subscription_rules_steps.js
├── test_remaining_gaps.js
└── test_customer_portal_payment.js
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18 or higher
- **PostgreSQL** v14 or higher

### 1 — Clone & install

```bash
git clone https://github.com/aryamistry/Odoo_500_DealFlow360.git
cd Odoo_500_DealFlow360
```

### 2 — Database setup

```bash
psql -U postgres -c "CREATE DATABASE dealflow360;"
psql -U postgres -d dealflow360 -f dealflow360_schema_v2.sql
```

### 3 — Server

```bash
cd server
cp .env.example .env
# Edit DATABASE_URL and JWT_SECRET in .env
npm install
node ../migrate.js   # applies incremental schema patches
npm run seed         # seeds reference data and demo users
npm run dev          # API server on http://localhost:5000
```

### 4 — Client

```bash
cd client
npm install
npm run dev          # Vite dev server on http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🔐 Demo Credentials

| Role | Email | Password | What you can do |
|:---|:---|:---|:---|
| **Admin** | `admin@dealflow.com` | `Admin@123` | Full system access, 8-tab admin config |
| **Sales Rep** | `rep@dealflow.com` | `Rep@123` | Create quotes, add lines, view upsells |
| **Sales Manager** | `manager@dealflow.com` | `Manager@123` | Approve / reject medium-risk quotes |
| **Finance** | `finance@dealflow.com` | `Finance@123` | Approve high-risk quotes, manage invoices |
| **Bronze Customer** | `acme@customer.com` | `Customer@123` | Portal: view quotes, negotiate, pay invoices |
| **Silver Customer** | `globex@customer.com` | `Customer@123` | Portal: mid-tier pricing and features |
| **Gold Customer** | `initech@customer.com` | `Customer@123` | Portal: premium tier, max discount ceiling |

---

## 🔄 Core Workflows

### 1 — Quote to Cash

```
Sales Rep creates quote
  → Products auto-priced from customer tier price list
  → Real-time margin % and ceiling-breach warnings
  → Rep adds upsell suggestions (1-click)
  → Submit triggers risk engine
       ├── low risk  → auto-approved instantly
       ├── medium    → Sales Manager approval required
       └── high      → Sales Manager + Finance approval required
  → Customer receives quote in Portal
  → Customer confirms (or counter-offers)
  → System splits into fulfillment lines + hybrid invoices
  → Payments recorded → invoice status updated
```

### 2 — Customer Counter-Offer & Auto-Reapproval

```
Customer submits counter-discount via Portal
  → Quote status: under_negotiation
  → Sales Rep resolves (accept / reject counter)
       ├── within ceiling → auto-approved, customer confirms
       └── above ceiling  → reapproval cycle inserted automatically
```

### 3 — Greedy Multi-Warehouse Fulfillment

```
On quote confirmation:
  For each line item:
    → Rank warehouses by shipping cost (ascending)
    → Allocate from cheapest warehouse first
    → If insufficient stock → backorder flag set
    → Split lines across warehouses when needed
```

---

## 📡 API Routes

| Method | Path | Description |
|:---|:---|:---|
| `POST` | `/api/auth/login` | Authenticate (returns httpOnly JWT cookie) |
| `GET` | `/api/quotations` | List quotes (search, status, rep, pagination) |
| `POST` | `/api/quotations` | Create new quotation |
| `POST` | `/api/quotations/:id/submit` | Trigger risk engine & route for approval |
| `GET` | `/api/approvals` | Approval queue for current user's role |
| `POST` | `/api/approvals/:id/decide` | Approve or reject a step |
| `GET` | `/api/fulfillment` | Fulfillment line list with warehouse info |
| `POST` | `/api/fulfillment/:id/ship` | Mark line as shipped |
| `GET` | `/api/billing/subscriptions` | Active subscription list |
| `PATCH` | `/api/billing/subscriptions/:id` | Mid-cycle upgrade / reschedule |
| `GET` | `/api/billing/invoices` | Invoice ledger |
| `POST` | `/api/billing/invoices/:id/pay` | Record payment |
| `GET` | `/api/portal/quotations` | Customer's own quotes |
| `POST` | `/api/portal/quotations/:id/confirm` | Customer order confirmation |
| `POST` | `/api/portal/quotations/:id/negotiate` | Customer counter-offer |
| `GET` | `/api/portal/invoices` | Customer's invoices |
| `POST` | `/api/portal/invoices/:id/pay` | Customer-side payment |
| `GET` | `/api/analytics/reports` | Filtered sales report |
| `GET` | `/api/deal-health/stalled` | Stalled deal detection |
| `GET` | `/api/deal-health/discount-anomalies` | Outlier discount detection |
| `GET` | `/api/admin/platform-settings` | Configurable thresholds |

---

## 🧪 Running Tests

All suites run against the live dev server (port 5000):

```bash
# Full regression — all 34 phase checks
node test_all_phases.js

# End-to-end demo flows (quote → approval → fulfillment → payment)
node test_e2e_demo_flows.js

# Customer lifecycle + portal data isolation
node test_customer_lifecycle.js

# Subscription proration, cancellation, refund rules
node test_subscription_rules_steps.js

# Requirement gap coverage (stalled threshold, XLSX, proration)
node test_remaining_gaps.js

# Customer portal invoice & payment endpoints
node test_customer_portal_payment.js
```

> **Expected:** All suites pass with 0 failures after `node migrate.js` has been run.

---

## 🗺 Roadmap

> *What the team would build next with more time*

### Near-Term (next sprint)

- [ ] **Real Payment Gateway** — Stripe / Razorpay integration replacing the manual payment-recording flow, with webhook-driven invoice status updates
- [ ] **Email Notifications** — Transactional emails on quote submission, approval decisions, customer confirmations, and upcoming billing via SendGrid / Postmark
- [ ] **Revision Diff Viewer** — Side-by-side visual diff of quote versions so approvers can see exactly what changed between submissions
- [ ] **PDF Quote Export** — One-click PDF generation of customer-facing quote documents with company branding via Puppeteer or React-PDF

### Medium-Term

- [ ] **Product Variant / SKU Configurator** — Guided multi-attribute configuration (RAM, storage, support tier) with price cascading and constraint validation
- [ ] **Multi-Currency Support** — Real-time FX rates with locked exchange rate on quote creation and reporting in home currency
- [ ] **Role-Based Dashboard** — Personalised homepage KPIs per role (rep: win rate + pipeline; manager: approval SLA; finance: cash collection; customer: active subscriptions)
- [ ] **Bulk Import / API Integration** — REST API for CRM sync (HubSpot / Salesforce) and bulk product/customer CSV upload

### Long-Term

- [ ] **AI-Powered Deal Scoring** — ML model trained on historical won/lost deals to surface a live "win probability" score on each quote, factoring in discount depth, product mix, and customer segment
- [ ] **Contract Lifecycle Management (CLM)** — E-signature integration (DocuSign / HelloSign), auto-generated MSA/SOW drafts from quote data, and contract expiry reminders
- [ ] **Inventory Forecasting** — Demand forecasting per SKU per warehouse using seasonal decomposition to auto-generate purchase orders before stockouts
- [ ] **Mobile-Responsive Progressive Web App** — Offline-capable PWA allowing sales reps to build and submit quotes from the field without connectivity

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

Built with ❤️ for enterprise B2B sales operations.

</div>
