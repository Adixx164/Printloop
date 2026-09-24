import crypto from 'node:crypto';

function verifyPaystackSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature) return false;
  if (!secret) return false;
  
  const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  
  // Constant-time compare to avoid timing side-channels
  const a = Buffer.from(hash, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Test with known values
function testVerification() {
  const secret = 'whsec_test_change_this_to_a_random_secret';
  const payload = {
    event: 'charge.success',
    data: {
      id: 12345,
      reference: 'JOB_test_123',
      amount: 28000,
    }
  };
  
  const rawBody = JSON.stringify(payload);
  const signature = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  
  console.log('Test payload:', rawBody);
  console.log('Expected signature:', signature);
  console.log('Verification result:', verifyPaystackSignature(rawBody, signature, secret));
  
  // Test with wrong signature
  console.log('Wrong signature test:', verifyPaystackSignature(rawBody, 'wrong_signature', secret));
  
  // Test with modified body
  const modifiedBody = rawBody.replace('28000', '28001');
  console.log('Modified body test:', verifyPaystackSignature(modifiedBody, signature, secret));
}

if (require.main === module) {
  testVerification();
}

export { verifyPaystackSignature };