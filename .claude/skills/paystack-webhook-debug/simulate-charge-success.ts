import crypto from 'node:crypto';
import axios from 'axios';

interface WebhookPayload {
  event: string;
  data: any;
}

function generateChargeSuccessPayload(jobId: string, reference: string, amount: number, email: string): WebhookPayload {
  return {
    event: 'charge.success',
    data: {
      id: Date.now(),
      domain: 'test',
      status: 'success',
      reference,
      amount: amount * 100, // kobo
      message: null,
      gateway_response: 'Successful',
      paid_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      channel: 'card',
      currency: 'NGN',
      ip_address: '127.0.0.1',
      metadata: {
        userId: 'test-user-id',
        jobId,
        type: 'print_job_payment',
        tenantId: '7f0301b8-8f68-4b6d-ae12-728ba41a7f90',
        commissionAmount: Math.round(amount * 0.1),
        rateUsed: 0.1,
      },
      log: {
        start_time: new Date(Date.now() - 5000).toISOString(),
        time_spent: 5,
        attempts: 1,
        authentication: 'pin',
        authentication_type: 'card',
      },
      fees: 100,
      fees_split: null,
      authorization: {
        authorization_code: 'AUTH_' + Math.random().toString(36).substring(7),
        bin: '408408',
        last4: '4081',
        exp_month: '12',
        exp_year: '2028',
        channel: 'card',
        card_type: 'visa',
        bank: 'TEST BANK',
        country_code: 'NG',
        brand: 'visa',
        reusable: true,
        signature: 'SIG_' + Math.random().toString(36).substring(7),
        account_name: null,
      },
      customer: {
        id: 12345,
        first_name: 'Test',
        last_name: 'User',
        email,
        customer_code: 'CUS_' + Math.random().toString(36).substring(7),
        phone: null,
        metadata: null,
        risk_action: 'default',
        international_format_phone: null,
      },
      plan: null,
      split: {},
      order_id: null,
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      requested_amount: amount * 100,
      pos_transaction_data: null,
      source: null,
      fees_breakdown: null,
      connect: null,
    },
  };
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha512', secret).update(payload).digest('hex');
}

async function main() {
  const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY;
  if (!webhookSecret) {
    console.error('❌ PAYSTACK_WEBHOOK_SECRET or PAYSTACK_SECRET_KEY not set in environment');
    process.exit(1);
  }

  const jobId = process.argv[2] || 'test-job-' + Date.now();
  const reference = `JOB_${jobId}_${Date.now()}`;
  const amount = parseInt(process.argv[3]) || 280; // ₦280 default
  const email = process.argv[4] || 'test@printloop.ng';

  const payload = generateChargeSuccessPayload(jobId, reference, amount, email);
  const rawBody = JSON.stringify(payload);
  const signature = signPayload(rawBody, webhookSecret);

  console.log('📦 Generated charge.success webhook payload:');
  console.log(`   Job ID: ${jobId}`);
  console.log(`   Reference: ${reference}`);
  console.log(`   Amount: ₦${amount}`);
  console.log(`   Email: ${email}`);
  console.log(`   Signature: ${signature}`);
  console.log('');

  try {
    const response = await axios.post('http://localhost:4000/api/webhooks/paystack', payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': signature,
      },
      // Critical: axios must not transform the body
      transformRequest: [(data) => JSON.stringify(data)],
    });
    console.log('✅ Webhook sent successfully!');
    console.log('Response:', response.data);
  } catch (error: any) {
    console.error('❌ Failed to send webhook:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

main();