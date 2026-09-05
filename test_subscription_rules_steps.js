// test_subscription_rules_steps.js
// Automated verification for Subscription_Rules_Implementation_Steps.md

const http = require('http');

const BASE = 'http://localhost:5000/api';
let cookieAdmin = '';
let cookieCustomer = '';

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

function pass(msg) {
  console.log(`  \x1b[32m[PASS]\x1b[0m ${msg}`);
}

function fail(msg) {
  console.error(`  \x1b[31m[FAIL]\x1b[0m ${msg}`);
  process.exit(1);
}

async function run() {
  console.log('\n\x1b[36m=== Testing Subscription Plan Rules (§4 Verification Checklist) ===\x1b[0m\n');

  // 1. Admin login
  const loginRes = await request('POST', '/auth/login', { email: 'admin@dealflow.com', password: 'Admin@123' });
  if (loginRes.status !== 200 || loginRes.body.user?.role !== 'admin') {
    fail(`Admin login failed: ${JSON.stringify(loginRes.body)}`);
  }
  cookieAdmin = loginRes.cookie;
  pass('Step 1: Admin login OK');

  // Customer login for later quotation confirmation
  const custRes = await request('POST', '/auth/customer/login', { email: 'acme@customer.com', password: 'Customer@123' });
  if (custRes.status !== 200) fail('Customer login failed');
  cookieCustomer = custRes.cookie;
  pass('Customer login OK');

  // 2. Create a plan with:
  //    - Proration Rule: 'prorated'
  //    - Cancellation Rule: 'end_of_cycle'
  //    - Refund Rule: 'prorated'
  const planName = `Enterprise Plan ${Date.now()}`;
  const planRes = await request('POST', '/admin/subscription-plans', {
    name: planName,
    billing_cycle: 'monthly',
    proration_rule: 'prorated',
    cancellation_rule: 'end_of_cycle',
    refund_rule: 'prorated',
  }, cookieAdmin);

  if (planRes.status !== 201) fail(`Step 2: Failed to create plan: ${JSON.stringify(planRes.body)}`);
  const createdPlan = planRes.body;
  pass(`Step 2: Created subscription plan ID=${createdPlan.id} (${createdPlan.name})`);

  // 3. Confirm all three rules are persisted & retrieved
  const allPlansRes = await request('GET', '/admin/subscription-plans', null, cookieAdmin);
  const foundPlan = allPlansRes.body.find(p => p.id === createdPlan.id);
  if (!foundPlan) fail('Step 3: Created plan not found in GET /admin/subscription-plans');
  if (foundPlan.proration_rule !== 'prorated' || foundPlan.cancellation_rule !== 'end_of_cycle' || foundPlan.refund_rule !== 'prorated') {
    fail(`Step 3: Plan rules do not match: ${JSON.stringify(foundPlan)}`);
  }
  pass(`Step 3: Plan rules verified: proration=${foundPlan.proration_rule}, cancellation=${foundPlan.cancellation_rule}, refund=${foundPlan.refund_rule}`);

  // 4. Attach plan to a subscription product, create quotation, confirm it
  const prodRes = await request('POST', '/admin/products', {
    name: `SaaS License ${Date.now()}`,
    category_id: 1,
    unit: 'Seat',
    price: 100.00,
    cost_price: 20.00,
    tax_pct: 18,
    subscription_plan_id: createdPlan.id,
  }, cookieAdmin);
  if (prodRes.status !== 201) fail(`Step 4: Failed to create recurring product: ${JSON.stringify(prodRes.body)}`);
  const product = prodRes.body;
  pass(`Step 4a: Created recurring product ID=${product.id} attached to plan ID=${createdPlan.id}`);

  // Create quotation
  const quoteRes = await request('POST', '/quotations', { customer_id: 1 }, cookieAdmin);
  if (quoteRes.status !== 201) fail(`Step 4: Failed to create quotation: ${JSON.stringify(quoteRes.body)}`);
  const quoteId = quoteRes.body.id;

  // Add line item
  const lineRes = await request('POST', `/quotations/${quoteId}/lines`, {
    product_id: product.id,
    quantity: 2,
    discount_pct: 0,
  }, cookieAdmin);
  if (lineRes.status !== 201) fail(`Step 4: Failed to add quotation line: ${JSON.stringify(lineRes.body)}`);

  // Submit and approve quotation
  const submitRes = await request('POST', `/quotations/${quoteId}/submit`, {}, cookieAdmin);
  if (submitRes.status !== 200) fail(`Step 4: Failed to submit quotation: ${JSON.stringify(submitRes.body)}`);

  // Confirm quotation via Portal to create subscription
  const confirmRes = await request('POST', `/portal/quotations/${quoteId}/confirm`, {}, cookieCustomer);
  if (confirmRes.status !== 200) fail(`Step 4: Failed to confirm quotation: ${JSON.stringify(confirmRes.body)}`);

  // Fetch created subscription
  const subsRes = await request('GET', '/billing/subscriptions', null, cookieAdmin);
  const mySub = subsRes.body.find(s => s.product_name === product.name || s.quotation_id === quoteId);
  if (!mySub) fail('Step 4: Subscription record was not created on quotation confirmation');
  pass(`Step 4b: Quotation confirmed & Subscription created: ID=${mySub.id}, quantity=${mySub.quantity}`);

  // 5. Test proration: PATCH /api/billing/subscriptions/:id with quantity_override
  const newQty = (mySub.quantity || 2) + 3; // upgrade by 3 seats
  const patchRes = await request('PATCH', `/billing/subscriptions/${mySub.id}`, {
    quantity_override: newQty,
    reason: 'Upgrading team seats mid-cycle',
  }, cookieAdmin);

  if (patchRes.status !== 200) fail(`Step 5: Proration PATCH failed: ${JSON.stringify(patchRes.body)}`);
  if (!patchRes.body.proration_applied || patchRes.body.rule_used !== 'prorated') {
    fail(`Step 5: Response missing proration_applied or rule_used: ${JSON.stringify(patchRes.body)}`);
  }
  pass(`Step 5: Proration applied! rule_used="${patchRes.body.rule_used}", proration_amount=₹${patchRes.body.prorated_amount}`);

  // 6. Test refund on cancel: POST /api/billing/subscriptions/:id/cancel
  const cancelRes = await request('POST', `/billing/subscriptions/${mySub.id}/cancel`, {
    reason: 'Customer downsizing division',
  }, cookieAdmin);

  if (cancelRes.status !== 200) fail(`Step 6: Cancel failed: ${JSON.stringify(cancelRes.body)}`);
  if (!cancelRes.body.refund_issued || cancelRes.body.rule_used !== 'prorated') {
    fail(`Step 6: Cancel response missing refund_issued or rule_used: ${JSON.stringify(cancelRes.body)}`);
  }
  pass(`Step 6: Refund issued on cancel! rule_used="${cancelRes.body.rule_used}", refund_amount=₹${cancelRes.body.refund_amount}, credit_note=${JSON.stringify(cancelRes.body.credit_note)}`);

  console.log('\n===========================================================');
  console.log('  \x1b[32mALL SUBSCRIPTION RULES STEPS VERIFIED SUCCESSFULLY ✅\x1b[0m');
  console.log('===========================================================\n');
}

run();
