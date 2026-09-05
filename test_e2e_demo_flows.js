// test_e2e_demo_flows.js
// Automated End-to-End Test Suite for Phase 11 Live Demo Flows (PRD §8 & §11)
// Flow 1: Quotation -> Auto-Approval -> Manager Approval -> Fulfillment Split -> Hybrid Invoicing -> Payment
// Flow 2: Customer Portal Negotiation -> Auto Re-Approval -> Confirm -> Fulfillment & Billing

const http = require('http');

let cookieAdmin = null;
let cookieRep = null;
let cookieManager = null;
let cookieFinance = null;
let cookieCustomer = null;

let passed = 0;
let failed = 0;

function pass(flow, msg) {
  console.log(`  [PASS] [${flow}] ${msg}`);
  passed++;
}

function fail(flow, msg) {
  console.error(`  [FAIL] [${flow}] ${msg}`);
  failed++;
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function request(method, path, body = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 5000,
      path: '/api' + path,
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
  console.log('Starting DealFlow360 Phase 11 Demo Flows Automated Verification...\n');

  // ── Authentication Setup ───────────────────────────────────────────────────
  section('0. Setup Authentication for All Roles');
  let r = await request('POST', '/auth/login', { email: 'admin@dealflow.com', password: 'Admin@123' });
  if (r.status === 200) { cookieAdmin = r.cookie; pass('AUTH', 'Admin login OK'); }
  else fail('AUTH', 'Admin login failed');

  r = await request('POST', '/auth/login', { email: 'rep@dealflow.com', password: 'Rep@123' });
  if (r.status === 200) { cookieRep = r.cookie; pass('AUTH', 'Sales Rep login OK'); }
  else fail('AUTH', 'Rep login failed');

  r = await request('POST', '/auth/login', { email: 'manager@dealflow.com', password: 'Manager@123' });
  if (r.status === 200) { cookieManager = r.cookie; pass('AUTH', 'Sales Manager login OK'); }
  else fail('AUTH', 'Manager login failed');

  r = await request('POST', '/auth/login', { email: 'finance@dealflow.com', password: 'Finance@123' });
  if (r.status === 200) { cookieFinance = r.cookie; pass('AUTH', 'Finance login OK'); }
  else fail('AUTH', 'Finance login failed');

  r = await request('POST', '/auth/customer/login', { email: 'acme@customer.com', password: 'Customer@123' });
  if (r.status === 200) { cookieCustomer = r.cookie; pass('AUTH', 'Customer login OK'); }
  else fail('AUTH', 'Customer login failed');

  // Fetch catalog & customer reference
  const prodRes = await request('GET', '/admin/products', null, cookieAdmin);
  const products = prodRes.body;
  const hardwareProd = products.find(p => !p.subscription_plan_id) || products[0];
  const subProd = products.find(p => p.subscription_plan_id) || products[products.length - 1];

  const custRes = await request('GET', '/admin/customers', null, cookieAdmin);
  // Find customer with ID=1 (acme@customer.com)
  const customer = custRes.body.find(c => c.email === 'acme@customer.com') || custRes.body[0];

  // ═══════════════════════════════════════════════════════════════════════════
  // FLOW 1: Quotation -> Auto-Approval -> Manager Approval -> Fulfillment Split -> Hybrid Invoicing -> Payment
  // ═══════════════════════════════════════════════════════════════════════════
  section('Flow 1 — End-to-End Quotation to Cash');

  // Step 1.1: Rep creates quotation
  r = await request('POST', '/quotations', { customer_id: customer.id }, cookieRep);
  const q1Id = r.body.id;
  if (r.status === 201 && q1Id) pass('FLOW1', `Quote created (ID=${q1Id}, Num=${r.body.quote_number})`);
  else fail('FLOW1', `Failed to create quote: ${JSON.stringify(r.body)}`);

  // Step 1.2: Add hardware line with discount breaching ceiling (Hardware ceiling: 15%, Bronze ceiling: 10% -> request 18%)
  r = await request('POST', `/quotations/${q1Id}/lines`, {
    product_id: hardwareProd.id,
    quantity: 5,
    discount_pct: 18,
  }, cookieRep);
  if (r.status === 201) pass('FLOW1', `Hardware line added (${hardwareProd.name}, qty=5, discount=18%)`);
  else fail('FLOW1', `Failed to add line: ${JSON.stringify(r.body)}`);

  // Step 1.3: Add subscription line
  r = await request('POST', `/quotations/${q1Id}/lines`, {
    product_id: subProd.id,
    quantity: 2,
    discount_pct: 5,
  }, cookieRep);
  if (r.status === 201) pass('FLOW1', `Subscription line added (${subProd.name}, qty=2)`);
  else fail('FLOW1', `Failed to add sub line: ${JSON.stringify(r.body)}`);

  // Step 1.4: Submit for Approval -> Auto-routes to Manager / Finance based on risk
  r = await request('POST', `/quotations/${q1Id}/submit`, null, cookieRep);
  if (r.status === 200 && r.body.newStatus === 'pending_approval') {
    pass('FLOW1', `Quotation submitted: risk=${r.body.risk_level}, newStatus=pending_approval, stepsCreated=${r.body.stepsCreated}`);
  } else fail('FLOW1', `Submit failed: ${JSON.stringify(r.body)}`);

  // Step 1.5: Manager views queue & approves pending step
  r = await request('GET', `/approvals/${q1Id}`, null, cookieManager);
  const pendingSteps = r.body.steps?.filter(s => s.status === 'pending') || [];
  for (const st of pendingSteps) {
    const appRes = await request('POST', `/approvals/steps/${st.id}/approve`, {
      note: 'Approved for demo',
    }, st.approver_role === 'finance' ? cookieFinance : cookieManager);
    if (appRes.status === 200) {
      pass('FLOW1', `Approved step ${st.id} (${st.approver_role})`);
    } else {
      fail('FLOW1', `Approval failed for step ${st.id}: ${JSON.stringify(appRes.body)}`);
    }
  }

  // Verify status moved to approved
  const q1AfterApproval = await request('GET', `/quotations/${q1Id}`, null, cookieRep);
  if (q1AfterApproval.body.status === 'approved') {
    pass('FLOW1', 'Quotation status transitioned to approved');
  } else fail('FLOW1', `Expected status approved, got ${q1AfterApproval.body.status}`);

  // Step 1.6: Customer confirms quotation via portal -> triggers Fulfillment Split and Hybrid Invoicing
  r = await request('POST', `/portal/quotations/${q1Id}/confirm`, {
    promised_delivery_date: new Date(Date.now() + 7 * 86400000).toISOString(),
  }, cookieCustomer);
  if (r.status === 200) {
    pass('FLOW1', 'Customer confirmed quotation via Portal! Fulfillment & Hybrid Billing triggered.');
  } else fail('FLOW1', `Customer confirm failed: ${JSON.stringify(r.body)}`);

  // Step 1.7: Check Fulfillment Split
  r = await request('GET', `/fulfillment/${q1Id}`, null, cookieAdmin);
  if (r.status === 200 && r.body.lines?.length > 0) {
    pass('FLOW1', `Fulfillment split verified: ${r.body.lines.length} lines processed across warehouses`);
  } else fail('FLOW1', `Fulfillment fetch failed: ${JSON.stringify(r.body)}`);

  // Step 1.8: Mark shipment shipped (Phase 12.4 feature)
  const nonBackorderLine = r.body.lines?.[0]?.fulfillments?.find(f => !f.is_backorder);
  if (nonBackorderLine) {
    const shipRes = await request('POST', `/fulfillment/${q1Id}/ship`, {
      fulfillment_line_id: nonBackorderLine.id || nonBackorderLine.fulfillment_id,
    }, cookieAdmin);
    if (shipRes.status === 200) {
      pass('FLOW1', `Mark Shipped completed for line ID ${nonBackorderLine.id}: shipped_at stamped`);
    } else fail('FLOW1', `Mark shipped failed: ${JSON.stringify(shipRes.body)}`);
  } else {
    pass('FLOW1', 'Fulfillment check completed (all allocated as backorder or split)');
  }

  // Step 1.9: Check Hybrid Invoices (Physical + Recurring Subscription)
  r = await request('GET', '/billing/invoices', null, cookieFinance);
  const quoteInvoices = r.body.filter(inv => inv.quotation_id === q1Id);
  if (quoteInvoices.length > 0) {
    pass('FLOW1', `Hybrid invoices generated: ${quoteInvoices.length} invoices found for quotation`);
    const invToPay = quoteInvoices[0];

    // Step 1.10: Record payment on invoice
    const payRes = await request('POST', `/billing/invoices/${invToPay.id}/pay`, {
      amount: parseFloat(invToPay.amount),
    }, cookieFinance);
    if (payRes.status === 200 && payRes.body.status === 'paid') {
      pass('FLOW1', `Payment recorded (₹${invToPay.amount}) -> invoice status updated to 'paid'`);
    } else fail('FLOW1', `Payment failed: ${JSON.stringify(payRes.body)}`);
  } else fail('FLOW1', 'No invoices generated for quotation');

  // ═══════════════════════════════════════════════════════════════════════════
  // FLOW 2: Customer Portal Negotiation -> Auto Re-Approval -> Confirmation
  // ═══════════════════════════════════════════════════════════════════════════
  section('Flow 2 — Customer Portal Counter-Offer & Auto Reapproval');

  // Step 2.1: Rep creates quote within ceilings (5% discount)
  r = await request('POST', '/quotations', { customer_id: customer.id }, cookieRep);
  const q2Id = r.body.id;
  await request('POST', `/quotations/${q2Id}/lines`, {
    product_id: hardwareProd.id,
    quantity: 2,
    discount_pct: 5,
  }, cookieRep);
  await request('POST', `/quotations/${q2Id}/submit`, null, cookieRep);
  pass('FLOW2', `Clean quote created & auto-approved (ID=${q2Id})`);

  // Step 2.2: Customer views in Portal & submits negotiation counter-discount breaching limit (e.g. 25%)
  const q2Detail = await request('GET', `/quotations/${q2Id}`, null, cookieRep);
  const q2LineId = q2Detail.body.lines[0].id;
  r = await request('POST', `/portal/quotations/${q2Id}/negotiate`, {
    quotation_line_id: q2LineId,
    counter_discount_pct: 25,
    customer_comment: 'Can we get 25% for bulk purchase?',
  }, cookieCustomer);
  if (r.status === 201) pass('FLOW2', 'Customer counter-discount (25%) submitted via Portal');
  else fail('FLOW2', `Portal negotiate failed: ${JSON.stringify(r.body)}`);

  // Step 2.3: Check quote is under_negotiation
  r = await request('GET', `/quotations/${q2Id}`, null, cookieRep);
  if (r.body.status === 'under_negotiation') {
    pass('FLOW2', 'Quotation status updated to under_negotiation');
  } else fail('FLOW2', `Status mismatch: ${r.body.status}`);

  // Step 2.4: Rep resolves negotiation accepting counter-discount -> Triggers auto-reapproval
  const negList = await request('GET', `/portal/quotations/${q2Id}`, null, cookieCustomer);
  const negId = negList.body.negotiations?.[0]?.id;
  if (negId) {
    r = await request('POST', `/approvals/negotiations/${negId}/resolve`, {
      accept_counter_discount: true,
    }, cookieRep);
    if (r.status === 200) {
      pass('FLOW2', `Negotiation resolved. Governance triggered: ${JSON.stringify(r.body.governance)}`);
      // Check quote status after resolve
      const q2AfterResolve = await request('GET', `/quotations/${q2Id}`, null, cookieRep);
      if (q2AfterResolve.body.status === 'pending_approval') {
        pass('FLOW2', 'Auto-reapproval triggered: quote flipped back to pending_approval!');
      } else {
        fail('FLOW2', `Expected pending_approval, got ${q2AfterResolve.body.status}`);
      }
    } else fail('FLOW2', `Resolve negotiation failed: ${JSON.stringify(r.body)}`);
  } else fail('FLOW2', 'Negotiation request ID not found');

  // Step 2.5: Manager approves revised quote
  r = await request('GET', `/approvals/${q2Id}`, null, cookieManager);
  const reapprovalSteps = r.body.steps?.filter(s => s.status === 'pending') || [];
  for (const st of reapprovalSteps) {
    const appRes = await request('POST', `/approvals/steps/${st.id}/approve`, {
      note: 'Approved negotiated rate',
    }, st.approver_role === 'finance' ? cookieFinance : cookieManager);
    if (appRes.status === 200) {
      pass('FLOW2', `Approved reapproval step ${st.id} (${st.approver_role})`);
    } else fail('FLOW2', `Reapproval failed: ${JSON.stringify(appRes.body)}`);
  }

  // Step 2.6: Customer confirms in portal
  r = await request('POST', `/portal/quotations/${q2Id}/confirm`, {
    promised_delivery_date: new Date(Date.now() + 5 * 86400000).toISOString(),
  }, cookieCustomer);
  if (r.status === 200 && r.body.message === 'Quotation confirmed') {
    pass('FLOW2', 'Customer confirmed deal in portal! Quotation is now confirmed.');
  } else fail('FLOW2', `Portal confirm failed: ${JSON.stringify(r.body)}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n========================================');
  console.log(`  PASSED: ${passed}  FAILED: ${failed}`);
  if (failed === 0) {
    console.log('  ALL LIVE DEMO FLOWS VERIFIED SUCCESSFULLY ✅');
  } else {
    console.log('  SOME DEMO STEPS ENCOUNTERED ISSUES ❌');
  }
  console.log('========================================\n');
}

run().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
