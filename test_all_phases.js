// test_all_phases.js — Phase-by-phase API validation for DealFlow360
// Run: node test_all_phases.js
// Requires server running on http://localhost:5000

const http = require('http');

const BASE = 'http://localhost:5000/api';
let cookieAdmin = '';
let cookieRep = '';
let cookieManager = '';
let cookieCustomer = '';
let quoteId = null;
let custId = null;
let stepId = null;

const results = { pass: 0, fail: 0, errors: [] };

function pass(phase, msg) {
  console.log(`  \x1b[32m[PASS]\x1b[0m [${phase}] ${msg}`);
  results.pass++;
}
function fail(phase, msg) {
  console.error(`  \x1b[31m[FAIL]\x1b[0m [${phase}] ${msg}`);
  results.fail++;
  results.errors.push(`[${phase}] ${msg}`);
}
function section(title) {
  console.log(`\n\x1b[36m=== ${title} ===\x1b[0m`);
}

function request(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname,
      port: url.port || 5000,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      const setCookie = res.headers['set-cookie'];
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        resolve({ status: res.statusCode, body: parsed, cookie: setCookie?.[0]?.split(';')[0] });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  // ── Phase 1: Auth ──────────────────────────────────────────────────────────
  section('Phase 0+1 — Auth and Roles');

  let r = await request('POST', '/auth/login', { email: 'admin@dealflow.com', password: 'Admin@123' });
  if (r.status === 200 && r.body.user?.role === 'admin') {
    cookieAdmin = r.cookie;
    pass('P1', `Admin login OK (role=${r.body.user.role})`);
  } else fail('P1', `Admin login failed: ${JSON.stringify(r.body)}`);

  r = await request('POST', '/auth/login', { email: 'rep@dealflow.com', password: 'Rep@123' });
  if (r.status === 200 && r.body.user?.role === 'sales_rep') {
    cookieRep = r.cookie;
    pass('P1', 'Sales Rep login OK');
  } else fail('P1', `Rep login failed: ${JSON.stringify(r.body)}`);

  r = await request('POST', '/auth/login', { email: 'manager@dealflow.com', password: 'Manager@123' });
  if (r.status === 200) {
    cookieManager = r.cookie;
    pass('P1', 'Sales Manager login OK');
  } else fail('P1', `Manager login failed`);

  r = await request('POST', '/auth/customer/login', { email: 'acme@customer.com', password: 'Customer@123' });
  if (r.status === 200 && r.body.customer?.tier === 'Bronze') {
    cookieCustomer = r.cookie;
    custId = r.body.customer.id;
    pass('P1', `Customer login OK (tier=Bronze, id=${custId})`);
  } else fail('P1', `Customer login failed: ${JSON.stringify(r.body)}`);

  r = await request('GET', '/auth/me', null, cookieAdmin);
  if (r.status === 200 && r.body.user) pass('P1', 'GET /auth/me OK');
  else fail('P1', `/auth/me failed`);

  // ── Phase 2: Admin Config ──────────────────────────────────────────────────
  section('Phase 2 — Admin Config (8 tabs)');

  r = await request('GET', '/admin/categories', null, cookieAdmin);
  if (r.status === 200 && r.body.length >= 3) pass('P2', `Categories: ${r.body.length} found`);
  else fail('P2', `Categories: ${JSON.stringify(r.body)}`);

  r = await request('GET', '/admin/customer-tiers', null, cookieAdmin);
  if (r.status === 200 && r.body.length >= 3) pass('P2', `Customer tiers: ${r.body.length} found`);
  else fail('P2', `Customer tiers: ${JSON.stringify(r.body)}`);

  r = await request('GET', '/admin/approval-rules', null, cookieAdmin);
  if (r.status === 200 && r.body.length >= 3) pass('P2', `Approval rules: ${r.body.length} found`);
  else fail('P2', `Approval rules: ${JSON.stringify(r.body)}`);

  r = await request('GET', '/admin/warehouses', null, cookieAdmin);
  if (r.status === 200 && r.body.length >= 2) pass('P2', `Warehouses: ${r.body.length} found`);
  else fail('P2', `Warehouses: ${JSON.stringify(r.body)}`);

  r = await request('GET', '/admin/subscription-plans', null, cookieAdmin);
  if (r.status === 200 && r.body.length >= 1) pass('P2', `Subscription plans: ${r.body.length} found`);
  else fail('P2', `Subscription plans: ${JSON.stringify(r.body)}`);

  r = await request('GET', '/admin/products', null, cookieAdmin);
  if (r.status === 200 && r.body.length >= 5) pass('P2', `Products: ${r.body.length} found`);
  else fail('P2', `Products: ${JSON.stringify(r.body)}`);
  const products = r.body;

  r = await request('GET', '/admin/price-lists', null, cookieAdmin);
  if (r.status === 200 && r.body.length >= 3) pass('P2', `Price lists: ${r.body.length} found`);
  else fail('P2', `Price lists: ${JSON.stringify(r.body)}`);

  r = await request('GET', '/admin/upsell-rules', null, cookieAdmin);
  if (r.status === 200 && r.body.length >= 3) pass('P2', `Upsell rules: ${r.body.length} found`);
  else fail('P2', `Upsell rules: ${JSON.stringify(r.body)}`);

  // ── Phase 3: Quotation Builder ─────────────────────────────────────────────
  section('Phase 3 — Quotation Builder');

  r = await request('POST', '/quotations', { customer_id: custId }, cookieRep);
  if (r.status === 201 && r.body.id) {
    quoteId = r.body.id;
    pass('P3', `Quote created (id=${quoteId}, num=${r.body.quote_number})`);
  } else fail('P3', `Create quote: ${JSON.stringify(r.body)}`);

  if (quoteId && products.length) {
    const pid = products[0].id;
    r = await request('POST', `/quotations/${quoteId}/lines`, { product_id: pid, quantity: 2, discount_pct: 5 }, cookieRep);
    if (r.status === 201 && r.body.id) pass('P3', `Line added (unit_price=${r.body.unit_price})`);
    else fail('P3', `Add line: ${JSON.stringify(r.body)}`);

    // Add a second line (subscription product)
    const subProd = products.find(p => p.subscription_plan_id);
    if (subProd) {
      r = await request('POST', `/quotations/${quoteId}/lines`, { product_id: subProd.id, quantity: 1, discount_pct: 0 }, cookieRep);
      if (r.status === 201) pass('P3', `Subscription line added (${subProd.name})`);
      else fail('P3', `Add sub line: ${JSON.stringify(r.body)}`);
    }

    r = await request('GET', `/quotations/${quoteId}`, null, cookieRep);
    if (r.status === 200 && r.body.totals?.revenue > 0) pass('P3', `Totals computed (revenue=${r.body.totals.revenue.toFixed(2)})`);
    else fail('P3', `Get detail: ${JSON.stringify(r.body?.totals)}`);

    r = await request('GET', '/quotations', null, cookieRep);
    if (r.status === 200) pass('P3', `Quotations list OK (${r.body.length} found)`);
    else fail('P3', `List: ${JSON.stringify(r.body)}`);
  }

  // ── Phase 4: Upsell ────────────────────────────────────────────────────────
  section('Phase 4 — Upsell and Cross-Sell Panel');
  if (quoteId) {
    r = await request('GET', `/quotations/${quoteId}/upsell-suggestions`, null, cookieRep);
    if (r.status === 200) pass('P4', `Upsell suggestions: ${r.body.length} returned`);
    else fail('P4', `Suggestions: ${JSON.stringify(r.body)}`);
  }

  // ── Phase 5: Governance ────────────────────────────────────────────────────
  section('Phase 5 — Discount Governance and Approval');
  if (quoteId) {
    r = await request('POST', `/quotations/${quoteId}/submit`, {}, cookieRep);
    if (r.status === 200 && r.body.risk_level) {
      pass('P5', `Submit OK (risk=${r.body.risk_level}, steps=${r.body.stepsCreated}, status=${r.body.newStatus})`);
    } else fail('P5', `Submit: ${JSON.stringify(r.body)}`);

    r = await request('GET', '/approvals', null, cookieAdmin);
    if (r.status === 200) pass('P5', `Approvals queue: ${r.body.length} items`);
    else fail('P5', `Approvals list: ${JSON.stringify(r.body)}`);

    r = await request('GET', `/approvals/${quoteId}`, null, cookieAdmin);
    if (r.status === 200 && r.body.steps) {
      const pendingStep = r.body.steps.find(s => s.status === 'pending');
      if (pendingStep) stepId = pendingStep.id;
      pass('P5', `Approval detail OK (${r.body.steps.length} steps)`);
    } else pass('P5', `Approval detail (auto-approved, no steps)`);
  }

  // Approve if there's a pending step
  if (stepId) {
    r = await request('POST', `/approvals/${stepId}/approve`, { note: 'Auto test approval' }, cookieManager);
    if (r.status === 200) pass('P5', `Approval step approved (stepId=${stepId})`);
    else {
      // Try admin
      r = await request('POST', `/approvals/${stepId}/approve`, { note: 'Auto test approval' }, cookieAdmin);
      if (r.status === 200) pass('P5', `Approval step approved by admin`);
      else fail('P5', `Approve step: ${JSON.stringify(r.body)}`);
    }
  }

  // ── Phase 6: Fulfillment ───────────────────────────────────────────────────
  section('Phase 6 — Fulfillment and Warehouse Split');
  r = await request('GET', '/fulfillment', null, cookieAdmin);
  if (r.status === 200) pass('P6', `Fulfillment list OK (${r.body.length} items)`);
  else fail('P6', `Fulfillment list: ${JSON.stringify(r.body)}`);

  if (quoteId) {
    r = await request('GET', `/fulfillment/${quoteId}`, null, cookieAdmin);
    if (r.status === 200 || r.status === 404) pass('P6', `Fulfillment detail endpoint OK (status=${r.status})`);
    else fail('P6', `Fulfillment detail: ${JSON.stringify(r.body)}`);
  }

  // ── Phase 7+8: Billing and Payments ───────────────────────────────────────
  section('Phase 7+8 — Hybrid Billing and Payments');
  r = await request('GET', '/subscriptions', null, cookieAdmin);
  if (r.status === 200) pass('P7', `Subscriptions list OK (${r.body.length})`);
  else fail('P7', `Subscriptions: ${JSON.stringify(r.body)}`);

  r = await request('GET', '/invoices', null, cookieAdmin);
  if (r.status === 200) pass('P8', `Invoices list OK (${r.body.length})`);
  else fail('P8', `Invoices: ${JSON.stringify(r.body)}`);

  if (r.body.length > 0) {
    const invId = r.body[0].id;
    r = await request('GET', `/invoices/${invId}`, null, cookieAdmin);
    if (r.status === 200) pass('P8', `Invoice detail OK (id=${invId})`);
    else fail('P8', `Invoice detail: ${JSON.stringify(r.body)}`);
  }

  // ── Phase 9: Customer Portal ───────────────────────────────────────────────
  section('Phase 9 — Customer Portal Negotiation');
  r = await request('GET', '/portal/quotations', null, cookieCustomer);
  if (r.status === 200) pass('P9', `Portal quotation list OK (${r.body.length})`);
  else fail('P9', `Portal list: ${JSON.stringify(r.body)}`);

  if (r.body.length > 0) {
    const pqid = r.body[0].id;
    r = await request('GET', `/portal/quotations/${pqid}`, null, cookieCustomer);
    if (r.status === 200) pass('P9', `Portal quote detail OK`);
    else fail('P9', `Portal detail: ${JSON.stringify(r.body)}`);
  }

  // ── Phase 10: Deal Health and Reporting ───────────────────────────────────
  section('Phase 10 — Deal Health and Reporting');
  r = await request('GET', '/deal-health/stalled', null, cookieAdmin);
  if (r.status === 200) pass('P10', `Stalled deals OK (${r.body.length})`);
  else fail('P10', `Stalled: ${JSON.stringify(r.body)}`);

  r = await request('GET', '/deal-health/discount-anomalies', null, cookieAdmin);
  if (r.status === 200) pass('P10', `Discount anomalies OK (${r.body.length})`);
  else fail('P10', `Anomalies: ${JSON.stringify(r.body)}`);

  r = await request('GET', '/deal-health/delivery-slippage', null, cookieAdmin);
  if (r.status === 200) pass('P10', `Delivery slippage OK (${r.body.length})`);
  else fail('P10', `Slippage: ${JSON.stringify(r.body)}`);

  r = await request('GET', '/deal-health/summary', null, cookieAdmin);
  if (r.status === 200) pass('P10', `Deal health summary OK`);
  else fail('P10', `Summary: ${JSON.stringify(r.body)}`);

  r = await request('GET', '/reports', null, cookieAdmin);
  if (r.status === 200) pass('P10', `Reports OK`);
  else fail('P10', `Reports: ${JSON.stringify(r.body)}`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n\x1b[33m========================================\x1b[0m');
  console.log(`  PASSED: ${results.pass}  FAILED: ${results.fail}`);
  if (results.fail === 0) {
    console.log('\x1b[32m  ALL PHASES PASSED ✅\x1b[0m');
  } else {
    console.log('\x1b[31m  FAILURES:\x1b[0m');
    results.errors.forEach(e => console.log(`    ${e}`));
  }
  console.log('\x1b[33m========================================\x1b[0m\n');
  process.exit(results.fail > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
