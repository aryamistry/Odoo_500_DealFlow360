# DealFlow360 — Next-Gen B2B CPQ, Fulfillment & Billing Engine

DealFlow360 is an enterprise-grade CPQ (Configure, Price, Quote), Governance, Fulfillment, and Billing platform designed for complex B2B sales cycles. It unifies dynamic multi-tiered pricing, cross-sell recommendations, autonomous approval routing, greedy multi-warehouse fulfillment, and hybrid one-time/recurring billing.

---

## Key Highlights

- **Dynamic Tiered Pricing & Margin Engine:** Real-time calculation of subtotal, discount, margin, and ceiling breach warnings against category and customer tier thresholds.
- **Intelligent Upsell & Cross-Sell Suggestions:** Contextual line-item recommendations with instant margin delta projection and one-click quote addition.
- **Automated Multi-Tier Governance & Approvals:** Autonomous risk evaluation (`low`, `medium`, `high`) routing quotes to Sales Managers and Finance with complete revision and audit history.
- **Greedy Multi-Warehouse Fulfillment:** Optimal inventory routing prioritizing lowest shipping cost, minimizing shipments, and automatically flagging backorders.
- **Hybrid Invoicing & Billing:** Intelligent split of one-time physical deliverables and recurring subscription plans into separate ledger entries and recurring schedules.
- **Payments & Ledger Management:** Record partial or full payments with real-time invoice status updates.
- **Customer Negotiation Portal:** Dedicated two-panel client portal for reviewing quotes, requesting counter-discounts, and executing 1-click confirmation with automatic reapproval triggers.
- **Deal Health Radar & Reporting:** Real-time monitoring for stalled deals (>7 days), rep discount anomalies, delivery slippage, with built-in Escalate & Nudge workflows and Recharts visual analytics.

---

## Tech Stack

- **Backend:** Node.js, Express.js, PostgreSQL (`pg` pool), JWT in `httpOnly` cookies, bcryptjs
- **Frontend:** React 18, Vite, Tailwind CSS v4, Axios, React Router v6, Recharts, Lucide React, React Hot Toast
- **Database:** PostgreSQL with relational schema supporting ACID transactions and immutable audit logging

---

## Project Structure

```
DealFlow/
├── client/                     # Frontend Vite + React application
│   ├── src/
│   │   ├── api/                # Axios API client with interceptors
│   │   ├── components/         # Shared components (Layout, Sidebar, Modals)
│   │   ├── context/            # AuthContext (Internal & Customer sessions)
│   │   ├── pages/              # 14 Application Screens (Dashboard, Quotations, Approvals, Fulfillment, Billing, Portal, Health, Reports)
│   │   │   └── admin/          # 8-Tab Admin Configuration Suite
│   │   ├── App.jsx             # Route definitions & guards
│   │   ├── index.css           # Tailwind v4 theme & design system
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── server/                     # Backend Express API
│   ├── scripts/
│   │   └── seed.js             # Comprehensive database seed script
│   ├── src/
│   │   ├── middleware/         # Auth & role-based access control
│   │   ├── routes/             # REST endpoints (auth, quotations, approvals, fulfillment, billing, portal, analytics)
│   │   │   └── admin/          # 8 Admin configuration routes
│   │   ├── services/           # Core domain engines (governance, fulfillment, billing)
│   │   ├── app.js              # Express app setup & route mounting
│   │   ├── db.js               # PostgreSQL connection pool
│   │   └── server.js           # Server entry point
│   ├── .env.example
│   └── package.json
├── dealflow360_schema_v2.sql   # PostgreSQL database schema DDL
├── dealflow360_prd.md          # Complete Product Requirements Document
├── dealflow360_schema_design_v2.md
└── README.md
```

---

## Getting Started

### 1. Prerequisites
- Node.js (v18+)
- PostgreSQL (v14+)

### 2. Database Setup
Ensure PostgreSQL is running, then create the database and load the schema:
```bash
psql -U postgres -c "CREATE DATABASE dealflow360;"
psql -U postgres -d dealflow360 -f dealflow360_schema_v2.sql
```

### 3. Server Configuration & Seed
Navigate to `server/`:
```bash
cd server
cp .env.example .env
# Update DATABASE_URL and JWT_SECRET in .env if needed
npm install
npm run seed     # Seeds users, warehouses, categories, products, price lists, tiers
npm run dev      # Starts API server on port 5000
```

### 4. Client Setup
Navigate to `client/`:
```bash
cd client
npm install
npm run dev      # Starts Vite dev server on port 5173
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Demo Test Credentials

| Role | Email | Password | Access / Features |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@dealflow.com` | `Admin@123` | Master control over 8 Admin config tabs |
| **Sales Rep** | `rep@dealflow.com` | `Rep@123` | Quote builder, live margin calculation, upsell drawer |
| **Sales Manager** | `manager@dealflow.com` | `Manager@123` | Approval queue, discount ceiling override decisions |
| **Finance** | `finance@dealflow.com` | `Finance@123` | High-value approvals, invoice payments, subscriptions |
| **Bronze Customer** | `acme@customer.com` | `Customer@123` | Customer Portal (Standard tier pricing & counter-offer) |
| **Silver Customer** | `globex@customer.com` | `Customer@123` | Customer Portal (Intermediate tier pricing) |
| **Gold Customer** | `initech@customer.com` | `Customer@123` | Customer Portal (Premium tier pricing) |

---

## Core Workflows

1. **Quote Creation & Real-Time Margin:** Rep creates a quote for a customer. Product base prices auto-resolve from the customer's tier price list. Real-time indicators warn if requested discount breaches category or tier limits.
2. **Upsell Recommendations:** The panel suggests complementary items. Clicking "Add to Quote" automatically recalculates blended margins.
3. **Approval Routing:** Breaching discount thresholds flags the quote as `medium` or `high` risk, automatically inserting approval steps for the Sales Manager and Finance.
4. **Customer Counter-Offer & Auto-Reapproval:** Customers can submit counter-discounts via the portal. Resolving a discount above ceiling limits automatically kicks off a reapproval cycle.
5. **Greedy Fulfillment:** Approved quotes split lines across available warehouses to minimize shipments and log backorders where inventory is insufficient.
6. **Hybrid Split Invoicing:** System provisions subscriptions for recurring items and generates separate invoices for physical hardware and ongoing services.
7. **Deal Health & Executive Reports:** Visual radar highlights stalled opportunities, anomaly discounts, and shipping slippages with 1-click Escalation and Nudge actions.

---

## License
MIT
