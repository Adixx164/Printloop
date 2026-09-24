/**
 * E2E Payment & Kiosk Redemption Test (V2-12).
 * 
 * Self-contained:
 * 1. Spawns its own backend server.
 * 2. Onboards a tenant shop and activates it.
 * 3. Registers a customer and submits a job with paymentMethod: 'paystack'.
 * 4. Verifies job is PENDING and code is null.
 * 5. Initializes job payment to get Paystack reference.
 * 6. Simulates Paystack webhook with HMAC-SHA512 signature.
 * 7. Verifies code is generated and status becomes READY.
 * 8. Kiosk validates code and gets job details (ensuring fileURL is hidden).
 * 9. Tests brute-force lockout.
 * 10. Kiosk releases print and marks job DONE.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const PORT = 6000 + Math.floor(Math.random() * 3000);
const B = `http://localhost:${PORT}/api`;
const DB_FILE = path.resolve(
  __dirname,
  '..',
  'data',
  `redemption-e2e-${process.pid}.sqlite`,
);
const SERVER = path.resolve(__dirname, '..', 'server.ts');
const WEBHOOK_SECRET = 'redemption-e2e-webhook-secret-32chars!';

let serverLog = '';

function ok(msg) {
  process.stdout.write(`ok   ${msg}\n`);
}
function fail(msg, details) {
  process.stdout.write(`FAIL: ${msg}\n`);
  if (details) {
    process.stdout.write(`Details: ${JSON.stringify(details, null, 2)}\n`);
  }
  process.stdout.write('\n--- server log ---\n' + serverLog + '\n');
  process.exit(1);
}
function assert(cond, msg, details) {
  if (cond) ok(msg);
  else fail(msg, details);
}

async function jr(method, url, body, headers) {
  const r = await fetch(B + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let d = null;
  try {
    d = await r.json();
  } catch {
    /* ignore */
  }
  return { status: r.status, data: d };
}

async function postMultipart(url, formData, headers) {
  const r = await fetch(B + url, {
    method: 'POST',
    headers: headers || {},
    body: formData,
  });
  let d = null;
  try {
    d = await r.json();
  } catch {
    /* ignore */
  }
  return { status: r.status, data: d };
}

async function waitFor(url, timeoutMs = 25_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  try {
    fs.unlinkSync(DB_FILE);
  } catch {
    /* ok */
  }

  const env = {
    ...process.env,
    DATABASE_FILE: DB_FILE,
    PORT: String(PORT),
    SEED_DEMO: '1',
    DISABLE_RATE_LIMIT: '1',
    GEOCODER: 'fixture',
    SMTP_HOST: '',
    PAYSTACK_SECRET_KEY: '',
    JWT_SECRET: 'redemption-e2e-signing-secret-32chars!',
    PAYSTACK_WEBHOOK_SECRET: WEBHOOK_SECRET,
  };

  const server = spawn('npx', ['tsx', SERVER], {
    env,
    cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  serverLog = '';
  server.stdout.on('data', (c) => (serverLog += c.toString()));
  server.stderr.on('data', (c) => (serverLog += c.toString()));

  // Spawn virtual printer
  const vprinter = spawn('node', [path.resolve(__dirname, 'virtualPrinter.cjs')], {
    env: { ...process.env, IPP_VPRINTER_PORT: '6310' },
    cwd: __dirname,
    stdio: 'ignore',
    shell: true,
  });

  const cleanup = () => {
    try {
      server.kill('SIGKILL');
    } catch {
      /* ignore */
    }
    try {
      vprinter.kill('SIGKILL');
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      try {
        fs.unlinkSync(DB_FILE);
      } catch {
        /* ignore */
      }
    }, 500);
  };

  try {
    const up = await waitFor(`http://localhost:${PORT}/health`);
    if (!up) {
      process.stdout.write(serverLog);
      fail(`server failed to come up on :${PORT}`);
    }
    ok('server up on test port');

    // 1. Sign up a tenant
    const signup = await jr('POST', '/saas/signup', {
      businessName: 'Redemption Shop',
      slug: 'redemption-shop',
      ownerFirstName: 'Redemption',
      ownerLastName: 'Owner',
      ownerEmail: 'redemption-owner@example.test',
      ownerPhone: '+2348011111112',
      ownerPassword: 'TenantOwner2026!',
      address: 'Yaba, Lagos',
    });
    assert(signup.status === 201, '1. Tenant signup → 201');
    const tenantId = signup.data.data.tenantId;

    // Scrape verify token, verify email
    await new Promise((r) => setTimeout(r, 400));
    let m = serverLog.match(/\[email:disabled\] to=redemption-owner@example\.test subject="?Verify your email — code (\d{6})"?/);
    assert(m && m[1], '2. Tenant verify token logged');
    const verifyOwner = await jr('POST', '/saas/verify-email', {
      email: 'redemption-owner@example.test',
      token: m[1],
    });
    assert(verifyOwner.status === 200, '3. Tenant owner verified');

    // Tenant owner login
    const ownerLogin = await jr('POST', '/admin/auth/login', {
      email: 'redemption-owner@example.test',
      password: 'TenantOwner2026!',
    });
    assert(ownerLogin.status === 200, '4. Tenant owner login → 200');
    const tenantAuth = {
      Authorization: `Bearer ${ownerLogin.data.data.tokens.accessToken}`,
      'X-Tenant-Slug': 'redemption-shop',
    };

    // Activate the tenant via platform super admin
    const adminLogin = await jr('POST', '/admin/auth/login', {
      email: 'admin@printloop.test',
      password: 'Admin1234!',
    });
    assert(adminLogin.status === 200, '5. Platform admin login → 200');
    const platformAuth = {
      Authorization: `Bearer ${adminLogin.data.data.tokens.accessToken}`,
    };
    const reactivate = await jr(
      'POST',
      `/platform/tenants/${tenantId}/reactivate`,
      {},
      platformAuth,
    );
    assert(reactivate.status === 200, '6. Tenant activated');

    // Set settings to direct to virtual printer
    const setIppPort = await jr('PATCH', '/admin/settings/ippPort', { value: '6310' }, platformAuth);
    assert(setIppPort.status === 200, '6.1. ippPort set to 6310', setIppPort);
    const setIppSecure = await jr('PATCH', '/admin/settings/ippSecure', { value: 'false' }, platformAuth);
    assert(setIppSecure.status === 200, '6.2. ippSecure set to false', setIppSecure);

    // Create a kiosk for this tenant
    const adminAsTenant = {
      ...platformAuth,
      'X-Tenant-Slug': 'redemption-shop',
    };
    const newKiosk = await jr(
      'POST',
      '/admin/kiosks',
      {
        name: 'Redemption Kiosk #1',
        location: 'Yaba',
        printerName: 'LaserJet Pro',
      },
      adminAsTenant,
    );
    assert(newKiosk.status === 201 || newKiosk.status === 200, '7. Kiosk created', newKiosk);
    const kioskId =
      newKiosk.data?.data?.kiosk?.id ||
      newKiosk.data?.kiosk?.id ||
      newKiosk.data?.data?.id ||
      newKiosk.data?.id;

    // PATCH kiosk to set IP address
    const patchKiosk = await jr(
      'PATCH',
      `/admin/kiosks/${kioskId}`,
      { ipAddress: '127.0.0.1' },
      adminAsTenant
    );
    assert(patchKiosk.status === 200, '7.5 Kiosk IP address set', patchKiosk);

    // Satisfy discovery live gate: test print pass + heartbeat
    const testPrintPass = await jr(
      'POST',
      `/admin/kiosks/${kioskId}/test-print-pass`,
      {},
      adminAsTenant,
    );
    assert(testPrintPass.status === 200, '8. Kiosk test print pass marked', testPrintPass);

    // Regenerate key & heartbeat
    const rk = await jr('POST', `/admin/kiosks/${kioskId}/regenerate-key`, {}, adminAsTenant);
    const kioskKey = rk.data?.data?.kiosk?.apiKey || rk.data?.kiosk?.apiKey;
    assert(!!kioskKey, '9. Kiosk key generated');

    const hb = await jr('GET', '/printer/heartbeat', null, { 'X-Kiosk-Key': kioskKey });
    assert(hb.status === 200, '10. Kiosk heartbeat registered (kiosk ONLINE)');

    // 2. Register a customer
    const custSignup = await jr('POST', '/customer/auth/register', {
      firstName: 'Cust',
      lastName: 'omer',
      email: 'customer-redemption@example.test',
      phoneNumber: '+2348000000888',
      password: 'CustomerPassword2026!',
    }, {
      'X-Tenant-Slug': 'redemption-shop'
    });
    assert(custSignup.status === 201, '11. Customer registered', custSignup);
    const customerId = custSignup.data?.data?.user?.id;
    const custAccessToken = custSignup.data?.data?.tokens?.accessToken;
    const customerAuth = {
      Authorization: `Bearer ${custAccessToken}`,
      'X-Tenant-Slug': 'redemption-shop',
    };

    // 3. Create a PrintJob with paymentMethod: 'paystack'
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText('E2E Payment & Redemption Test PDF', { x: 50, y: 750, size: 14, font });
    const pdfBytes = await pdfDoc.save();

    const fd = new FormData();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    fd.append('file', blob, 'e2e-paystack.pdf');
    fd.append('fileName', 'e2e-paystack.pdf');
    fd.append('paymentMethod', 'paystack');
    fd.append('jobType', 'single');
    fd.append('printConfiguration', JSON.stringify({
      copies: 1,
      paper: 'A4',
      color: 'bw',
      sided: 'single',
      qualityDpi: 300,
      orientation: 'portrait'
    }));

    const jobCreate = await postMultipart('/customer/print-jobs', fd, {
      Authorization: `Bearer ${custAccessToken}`,
      'X-Tenant-Slug': 'redemption-shop',
    });
    assert(jobCreate.status === 201, '15. Print job created with paymentMethod: paystack', jobCreate);
    const job = jobCreate.data?.data?.job || jobCreate.data?.job;
    const jobId = job?.id;
    assert(jobId && job.status === 'pending' && job.code === null, '16. Job in pending status, code is null', job);

    // 4. Initialize job payment
    const initPay = await jr('POST', '/payments/initialize-job-payment', { jobId }, customerAuth);
    assert(initPay.status === 200, '17. Payment initialized successfully');
    const ref = initPay.data?.data?.reference || initPay.data?.reference;
    assert(!!ref, '18. Received checkout reference');

    // 5. Simulate Paystack charge.success webhook with signature
    const webhookPayload = {
      event: 'charge.success',
      data: {
        reference: ref,
        amount: Math.round(Number(job.cost) * 100),
        metadata: {
          userId: customerId,
          jobId,
          type: 'print_job_payment',
          tenantId
        }
      }
    };
    const rawBody = Buffer.from(JSON.stringify(webhookPayload));
    const sig = crypto.createHmac('sha512', WEBHOOK_SECRET).update(rawBody).digest('hex');

    const webhookPost = await postMultipart('/payments/webhook', rawBody, {
      'Content-Type': 'application/json',
      'x-paystack-signature': sig
    });
    assert(webhookPost.status === 200, '19. Webhook mock processed with 200');

    // 6. Verify job code and status updated
    const jobList = await jr('GET', '/customer/print-jobs', null, customerAuth);
    const updatedJob = (jobList.data?.data?.jobs || []).find(j => j.id === jobId);
    assert(updatedJob && updatedJob.status === 'ready', '20. Print job status updated to ready');
    const releaseCode = updatedJob.code;
    assert(typeof releaseCode === 'string' && releaseCode.length === 6, '21. Print job received a 6-digit release code');

    // 7. Kiosk validate-code
    const kioskVal = await jr('POST', '/printer/validate-code', { code: releaseCode }, { 'X-Kiosk-Key': kioskKey });
    assert(kioskVal.status === 200 && kioskVal.data?.success === true, '22. Kiosk validate-code successful');

    // 8. Kiosk get-job (verify fileURL is hidden)
    const kioskJob = await jr('POST', '/printer/get-job', { code: releaseCode }, { 'X-Kiosk-Key': kioskKey });
    assert(kioskJob.status === 200 && kioskJob.data?.success === true, '23. Kiosk get-job successful');
    assert(kioskJob.data?.data?.fileURL === null, '24. fileURL is null in kiosk get-job response (hidden)');

    // 9. Kiosk validate-code brute force protection
    let blocked = false;
    for (let i = 0; i < 6; i++) {
      const wrongVal = await jr('POST', '/printer/validate-code', { code: 'WRONG1' }, { 'X-Kiosk-Key': kioskKey });
      if (wrongVal.status === 429 && wrongVal.data?.code === 'BRUTE_FORCE_LOCKOUT') {
        blocked = true;
        break;
      }
    }
    assert(blocked, '25. Brute-force protection locked out kiosk validation after failures');

    // 10. Kiosk release job
    const kioskComplete = await jr('POST', '/printer/complete', {
      code: releaseCode,
      cost: updatedJob.cost,
      totalPages: updatedJob.pageCount
    }, { 'X-Kiosk-Key': kioskKey });
    assert(kioskComplete.status === 200 && kioskComplete.data?.success === true, '26. Kiosk completed job release', kioskComplete);

    // 11. Verify job is DONE
    const jobListFinal = await jr('GET', '/customer/print-jobs', null, customerAuth);
    const finalJob = (jobListFinal.data?.data?.jobs || []).find(j => j.id === jobId);
    assert(finalJob && finalJob.status === 'done', '27. Print job status finalized to done');

    process.stdout.write('\nALL PAYMENT & REDEMPTION E2E TESTS PASSED\n');
    cleanup();
    process.exit(0);
  } catch (err) {
    process.stdout.write(`uncaught: ${err && err.stack ? err.stack : err}\n`);
    process.stdout.write('\n--- server log (tail) ---\n' + serverLog.slice(-4000) + '\n');
    cleanup();
    process.exit(1);
  }
}

main();
