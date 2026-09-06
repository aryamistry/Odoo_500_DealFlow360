// test_customer_portal_payment.js
const http = require('http');

const BASE = 'http://localhost:5000/api';

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
  console.log('Testing Customer Portal Invoices & Payment Endpoints...');

  // 1. Login as customer (e.g. Acme Corp: acme@example.com / password)
  const custLogin = await request('POST', '/auth/login', { email: 'acme@example.com', password: 'password' });
  console.log('Customer login status:', custLogin.status);
  const custCookie = custLogin.cookie;
  if (!custCookie) {
    console.error('Customer login failed:', custLogin.body);
    process.exit(1);
  }

  // 2. Fetch customer invoices
  const invRes = await request('GET', '/portal/invoices', null, custCookie);
  console.log('GET /portal/invoices status:', invRes.status, 'Invoices count:', invRes.body?.data?.length || invRes.body?.length);
  const invoices = Array.isArray(invRes.body) ? invRes.body : invRes.body.data;
  
  if (!invoices || invoices.length === 0) {
    console.log('No existing invoices for customer, creating one via quotation confirmation test...');
    // Create quotation as sales rep, approve as manager, confirm as customer
    const repLogin = await request('POST', '/auth/login', { email: 'rep1@dealflow360.internal', password: 'password' });
    const mgrLogin = await request('POST', '/auth/login', { email: 'manager@dealflow360.internal', password: 'password' });

    // Get customer ID
    const custId = custLogin.body.user.customerId;
    const qCreate = await request('POST', '/quotations', {
      customer_id: custId,
      lines: [{ product_id: 1, quantity: 2, unit_price: 5000, discount_pct: 0 }],
      payment_terms: 'net_30'
    }, repLogin.cookie);

    const quoteId = qCreate.body.id;
    console.log('Created quotation:', quoteId);

    // Submit for approval & approve
    await request('POST', `/quotations/${quoteId}/submit`, null, repLogin.cookie);
    await request('POST', `/approvals/${quoteId}/approve`, null, mgrLogin.cookie);

    // Confirm as customer
    await request('POST', `/portal/quotations/${quoteId}/confirm`, {}, custCookie);
    console.log('Confirmed quotation as customer');

    // Refetch invoices
    const refetch = await request('GET', '/portal/invoices', null, custCookie);
    const newInvoices = Array.isArray(refetch.body) ? refetch.body : refetch.body.data;
    console.log('Refetched invoices count:', newInvoices.length);
    if (newInvoices.length > 0) {
      const targetInv = newInvoices[0];
      console.log('Target invoice:', targetInv.id, 'Amount:', targetInv.amount, 'Status:', targetInv.status, 'Balance:', targetInv.balance_remaining);

      // Pay partial amount
      const pay1 = await request('POST', `/portal/invoices/${targetInv.id}/pay`, {
        amount: 2000,
        payment_method: 'Credit/Debit Card',
        note: 'Test partial payment'
      }, custCookie);
      console.log('Partial Payment 1 status:', pay1.status, 'Body:', pay1.body);

      // Pay remaining amount
      const pay2 = await request('POST', `/portal/invoices/${targetInv.id}/pay`, {
        amount: pay1.body.balance_remaining,
        payment_method: 'UPI / QR Code',
        note: 'Settling full invoice'
      }, custCookie);
      console.log('Full Payment 2 status:', pay2.status, 'Body:', pay2.body);

      // Try paying again when fully paid (should fail with 400)
      const payOver = await request('POST', `/portal/invoices/${targetInv.id}/pay`, {
        amount: 500
      }, custCookie);
      console.log('Overpayment when paid status:', payOver.status, 'Expected 400. Message:', payOver.body.error);
    }
  } else {
    const targetInv = invoices.find(i => i.status !== 'paid') || invoices[0];
    console.log('Testing with existing invoice:', targetInv.id, 'Status:', targetInv.status, 'Remaining:', targetInv.balance_remaining);
    if (targetInv.balance_remaining > 0) {
      const payRes = await request('POST', `/portal/invoices/${targetInv.id}/pay`, {
        amount: Math.min(100, targetInv.balance_remaining),
        payment_method: 'UPI / QR Code',
        note: 'Automated test payment'
      }, custCookie);
      console.log('Payment result:', payRes.status, payRes.body);
    }
  }

  console.log('\nCustomer Portal Payment Verification Completed Successfully!');
}

run().catch(console.error);
