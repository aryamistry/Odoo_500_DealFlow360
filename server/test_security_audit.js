const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(body); } catch(e) { json = body; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function run() {
  console.log('====================================================');
  console.log(' DEALFLOW360 BACKEND AUTH & AUTHORIZATION AUDIT');
  console.log('====================================================\n');

  // --- 1. ADMIN ---
  console.log('--- 1. ADMIN (admin@dealflow.com) ---');
  const adminRes = await request({
    hostname: 'localhost', port: 5000, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'admin@dealflow.com', password: 'Admin@123' });
  console.log('Admin Login status:', adminRes.status, '| Role:', adminRes.body.user?.role);
  const adminCookie = adminRes.headers['set-cookie'] ? adminRes.headers['set-cookie'][0].split(';')[0] : '';
  console.log('Admin Cookie set:', !!adminCookie);

  const adminMe = await request({
    hostname: 'localhost', port: 5000, path: '/api/auth/me', method: 'GET',
    headers: { Cookie: adminCookie }
  });
  console.log('Admin GET /api/auth/me:', adminMe.status, '| User:', adminMe.body.user?.email, 'Role:', adminMe.body.user?.role);

  const adminAccess = await request({
    hostname: 'localhost', port: 5000, path: '/api/admin/approval-rules', method: 'GET',
    headers: { Cookie: adminCookie }
  });
  console.log('Admin access /api/admin/approval-rules (expect 200):', adminAccess.status);

  // --- 2. SALES MANAGER ---
  console.log('\n--- 2. SALES MANAGER (manager@dealflow.com) ---');
  const mgrRes = await request({
    hostname: 'localhost', port: 5000, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'manager@dealflow.com', password: 'Manager@123' });
  console.log('Manager Login status:', mgrRes.status, '| Role:', mgrRes.body.user?.role);
  const mgrCookie = mgrRes.headers['set-cookie'] ? mgrRes.headers['set-cookie'][0].split(';')[0] : '';

  const mgrMe = await request({
    hostname: 'localhost', port: 5000, path: '/api/auth/me', method: 'GET',
    headers: { Cookie: mgrCookie }
  });
  console.log('Manager GET /api/auth/me:', mgrMe.status, '| Role:', mgrMe.body.user?.role);

  const mgrApprovals = await request({
    hostname: 'localhost', port: 5000, path: '/api/approvals', method: 'GET',
    headers: { Cookie: mgrCookie }
  });
  console.log('Manager access /api/approvals (expect 200):', mgrApprovals.status);

  const mgrAdminAttempt = await request({
    hostname: 'localhost', port: 5000, path: '/api/admin/approval-rules', method: 'GET',
    headers: { Cookie: mgrCookie }
  });
  console.log('Manager attempt /api/admin/approval-rules (expect 403):', mgrAdminAttempt.status);

  // --- 3. SALES REP ---
  console.log('\n--- 3. SALES REP (rep@dealflow.com) ---');
  const repRes = await request({
    hostname: 'localhost', port: 5000, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'rep@dealflow.com', password: 'Rep@123' });
  console.log('Rep Login status:', repRes.status, '| Role:', repRes.body.user?.role);
  const repCookie = repRes.headers['set-cookie'] ? repRes.headers['set-cookie'][0].split(';')[0] : '';

  const repQuotes = await request({
    hostname: 'localhost', port: 5000, path: '/api/quotations', method: 'GET',
    headers: { Cookie: repCookie }
  });
  console.log('Rep access /api/quotations (expect 200):', repQuotes.status);

  const repAdminAttempt = await request({
    hostname: 'localhost', port: 5000, path: '/api/admin/approval-rules', method: 'GET',
    headers: { Cookie: repCookie }
  });
  console.log('Rep attempt /api/admin/approval-rules (expect 403):', repAdminAttempt.status);

  const repApprovalsAttempt = await request({
    hostname: 'localhost', port: 5000, path: '/api/approvals', method: 'GET',
    headers: { Cookie: repCookie }
  });
  console.log('Rep attempt /api/approvals (expect 403):', repApprovalsAttempt.status);

  // --- 4. FINANCE ---
  console.log('\n--- 4. FINANCE (finance@dealflow.com) ---');
  const finRes = await request({
    hostname: 'localhost', port: 5000, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'finance@dealflow.com', password: 'Finance@123' });
  console.log('Finance Login status:', finRes.status, '| Role:', finRes.body.user?.role);
  const finCookie = finRes.headers['set-cookie'] ? finRes.headers['set-cookie'][0].split(';')[0] : '';

  const finInvoices = await request({
    hostname: 'localhost', port: 5000, path: '/api/invoices', method: 'GET',
    headers: { Cookie: finCookie }
  });
  console.log('Finance access /api/invoices (expect 200):', finInvoices.status);

  const finAdminAttempt = await request({
    hostname: 'localhost', port: 5000, path: '/api/admin/approval-rules', method: 'GET',
    headers: { Cookie: finCookie }
  });
  console.log('Finance attempt /api/admin/approval-rules (expect 403):', finAdminAttempt.status);

  // --- 5. CUSTOMER ---
  console.log('\n--- 5. CUSTOMER (acme@customer.com) ---');
  const custRes = await request({
    hostname: 'localhost', port: 5000, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'acme@customer.com', password: 'Customer@123' });
  console.log('Customer Login status:', custRes.status, '| Role:', custRes.body.user?.role, '| customerId:', custRes.body.user?.customerId);
  const custCookie = custRes.headers['set-cookie'] ? custRes.headers['set-cookie'][0].split(';')[0] : '';

  const custMe = await request({
    hostname: 'localhost', port: 5000, path: '/api/auth/me', method: 'GET',
    headers: { Cookie: custCookie }
  });
  console.log('Customer GET /api/auth/me:', custMe.status, '| Role:', custMe.body.user?.role, '| Tier:', custMe.body.user?.tier);

  const custPortal = await request({
    hostname: 'localhost', port: 5000, path: '/api/portal/quotations', method: 'GET',
    headers: { Cookie: custCookie }
  });
  console.log('Customer access /api/portal/quotations (expect 200):', custPortal.status);

  const custInternalQuotes = await request({
    hostname: 'localhost', port: 5000, path: '/api/quotations', method: 'GET',
    headers: { Cookie: custCookie }
  });
  console.log('Customer attempt /api/quotations (expect 403):', custInternalQuotes.status);

  const custBillingAttempt = await request({
    hostname: 'localhost', port: 5000, path: '/api/subscriptions', method: 'GET',
    headers: { Cookie: custCookie }
  });
  console.log('Customer attempt /api/subscriptions (expect 403):', custBillingAttempt.status);

  const custAdminAttempt = await request({
    hostname: 'localhost', port: 5000, path: '/api/admin/approval-rules', method: 'GET',
    headers: { Cookie: custCookie }
  });
  console.log('Customer attempt /api/admin/approval-rules (expect 403):', custAdminAttempt.status);

  // --- 6. INVALID CREDENTIALS ---
  console.log('\n--- 6. INVALID CREDENTIALS ---');
  const nonExistent = await request({
    hostname: 'localhost', port: 5000, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'unknown@user.com', password: 'SomePassword123' });
  console.log('Unknown user login status:', nonExistent.status, '| Error:', nonExistent.body.error);

  const wrongPassword = await request({
    hostname: 'localhost', port: 5000, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'admin@dealflow.com', password: 'WrongPassword999' });
  console.log('Wrong password login status:', wrongPassword.status, '| Error:', wrongPassword.body.error);

  // --- 7. LOGOUT ---
  console.log('\n--- 7. LOGOUT ---');
  const logoutRes = await request({
    hostname: 'localhost', port: 5000, path: '/api/auth/logout', method: 'POST',
    headers: { Cookie: adminCookie }
  });
  console.log('Logout status:', logoutRes.status, '| Cookie cleared:', logoutRes.headers['set-cookie']?.[0]);
}

run().catch(console.error);
