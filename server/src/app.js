// src/app.js — Express application setup
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (null origin) or any localhost/127.0.0.1 port
    if (!origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || (process.env.CLIENT_URL && origin === process.env.CLIENT_URL)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// ── Routes ──────────────────────────────────────────────────────────────────
// Health check (before analytics catch-all to avoid auth requirement)
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use('/api/auth',              require('./routes/auth'));
app.use('/api/quotations',        require('./routes/quotations'));
app.use('/api/approvals',         require('./routes/approvals'));
app.use('/api/fulfillment',       require('./routes/fulfillment'));
// billing.js internally defines /subscriptions, /invoices — mount at /api and /api/billing
app.use('/api',                   require('./routes/billing'));
app.use('/api/billing',           require('./routes/billing'));
app.use('/api/portal',            require('./routes/portal'));
// Admin routes (mounted before analytics catch-all)
app.use('/api/admin/categories',         require('./routes/admin/categories'));
app.use('/api/admin/customer-tiers',     require('./routes/admin/customer_tiers'));
app.use('/api/admin/approval-rules',     require('./routes/admin/approval_rules'));
app.use('/api/admin/warehouses',         require('./routes/admin/warehouses'));
app.use('/api/admin/subscription-plans', require('./routes/admin/subscription_plans'));
app.use('/api/admin/products',           require('./routes/admin/products'));
app.use('/api/admin/price-lists',        require('./routes/admin/price_lists'));
app.use('/api/admin/upsell-rules',       require('./routes/admin/upsell_rules'));
app.use('/api/admin/customers',          require('./routes/admin/customers'));
app.use('/api/admin/platform-settings',  require('./routes/admin/platform_settings'));

// Analytics & Reports
app.use('/api',                   require('./routes/analytics'));

// (Health check moved to top of route section above analytics catch-all)

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
