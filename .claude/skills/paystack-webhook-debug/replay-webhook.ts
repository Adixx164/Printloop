import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import crypto from 'node:crypto';

interface LogEntry {
  time: string;
  msg: string;
  requestId: string;
  method: string;
  path: string;
  status: number;
  body?: any;
}

async function replayWebhookFromLogs() {
  const logPath = path.join(process.cwd(), '01-backend', 'backend.log');
  
  if (!fs.existsSync(logPath)) {
    console.error('❌ Log file not found at:', logPath);
    console.log('Run the backend with logging to generate backend.log');
    return;
  }

  const logContent = fs.readFileSync(logPath, 'utf-8');
  const lines = logContent.trim().split('\n');
  
  const webhookEntries: LogEntry[] = [];
  
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.path === '/api/webhooks/paystack' || entry.path === '/api/payments/webhook') {
        webhookEntries.push(entry);
      }
    } catch {
      // Not JSON, skip
    }
  }
  
  if (webhookEntries.length === 0) {
    console.log('No webhook entries found in logs');
    return;
  }
  
  console.log(`Found ${webhookEntries.length} webhook entries:`);
  webhookEntries.forEach((entry, i) => {
    console.log(`${i + 1}. [${entry.time}] ${entry.method} ${entry.path} - Status: ${entry.status}`);
    console.log(`   Request ID: ${entry.requestId}`);
    if (entry.body) {
      console.log(`   Event: ${entry.body?.event}`);
      console.log(`   Reference: ${entry.body?.data?.reference}`);
    }
  });
  
  const idx = parseInt(process.argv[2] || '1') - 1;
  if (idx < 0 || idx >= webhookEntries.length) {
    console.error('Invalid selection');
    return;
  }
  
  const selected = webhookEntries[idx];
  console.log(`\nReplaying entry ${idx + 1}...`);
  
  // Reconstruct the raw body for signature
  const rawBody = JSON.stringify(selected.body);
  const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY;
  
  if (!webhookSecret) {
    console.error('❌ PAYSTACK_WEBHOOK_SECRET not set');
    return;
  }
  
  const signature = crypto.createHmac('sha512', webhookSecret).update(rawBody).digest('hex');
  
  try {
    const response = await axios.post('http://localhost:4000/api/webhooks/paystack', selected.body, {
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': signature,
      },
      transformRequest: [(data) => JSON.stringify(data)],
    });
    console.log('✅ Replay successful!');
    console.log('Response:', response.data);
  } catch (error: any) {
    console.error('❌ Replay failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

replayWebhookFromLogs();