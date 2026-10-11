# Runbook: Paystack Webhook Failures

## Alert: PrintLoopPaystackWebhookFailures
**Severity:** Critical  
**Service:** printloop-api  
**Component:** paystack-webhook  
**Team:** Platform

## Symptoms
- Paystack webhook failures detected in last minute
- `rate(paystack_webhook_failures_total[5m]) > 0`
- Payments not being marked as paid
- Customers not receiving release codes

## Diagnosis Steps

### 1. Check Webhook Endpoint Health
```bash
# Test webhook endpoint
curl -X POST https://api.printloop.app/api/payments/webhook \
  -H "Content-Type: application/json" \
  -H "x-paystack-signature: test" \
  -d '{"event":"charge.success","data":{"reference":"test"}}'

# Check webhook endpoint accessibility
curl -v https://api.printloop.app/api/payments/webhook
```

### 2. Check Paystack Dashboard
1. Log into Paystack Dashboard
2. Go to Settings → Webhooks
3. Check webhook URL: `https://api.printloop.app/api/payments/webhook`
3. Check recent delivery attempts
4. Look for failed deliveries (non-2xx responses)

### 3. Check Backend Logs
```bash
# Check webhook handler logs
kubectl logs -n printloop -l app=printloop-api --tail=200 | grep -i "webhook\|paystack"

# Check specific webhook errors
kubectl logs -n printloop -l app=printloop-api --tail=200 | grep -i "webhook\|paystack\|signature"
```

### 3. Verify Webhook Signature Verification
```bash
# Test signature verification
curl -X POST https://api.printloop.app/api/payments/webhook \
  -H "Content-Type: application/json" \
  -H "x-paystack-signature: $(echo -n '{"event":"charge.success"}' | openssl dgst -sha512 -hmac "$PAYSTACK_WEBHOOK_SECRET" | cut -d' ' -f2)" \
  -d '{"event":"charge.success","data":{"reference":"test"}}'
```

## Common Causes & Fixes

### 1. Incorrect Webhook Secret
**Symptoms:** 401 Unauthorized, "Invalid signature"
**Fix:** Verify `PAYSTACK_WEBHOOK_SECRET` matches Paystack dashboard
```bash
# Check env var
kubectl exec -n printloop <api-pod> -- printenv PAYSTACK_WEBHOOK_SECRET

# Update in Paystack Dashboard:
# Settings > Webhooks > Update secret
```

### 2. Webhook URL Changed/Incorrect
**Symptoms:** 404 Not Found, connection refused
**Fix:** Verify webhook URL in Paystack Dashboard matches:
```
https://api.printloop.app/api/payments/webhook
```
Or if using alias:
```
https://api.printloop.app/api/webhooks/paystack
```

### 3. Signature Verification Failing
**Symptoms:** 401 "Invalid signature"
**Causes:**
- Raw body not captured (Express json() parses before verification)
- Secret mismatch
- Double encoding

**Fix:** Ensure raw body capture in Express:
```typescript
// In app.ts - MUST be before express.json()
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  });
```

### 3. Webhook Timeout
**Symptoms:** Paystack shows timeout, retries
**Fix:** Ensure webhook responds within 10s
```typescript
// In webhook handler - respond immediately, process async
router.post('/webhook', async (req, res) => {
  // Respond immediately
  res.status(200).json({ received: true });
  
  // Process async
  processWebhookAsync(req.body).catch(err => {
    logger.error({ err }, 'Webhook processing failed');
  });
}
```

### 4. Paystack IP Whitelist
**Symptoms:** Intermittent failures
**Fix:** Whitelist Paystack IPs in firewall
```bash
# Paystack webhook IPs (check Paystack docs for current)
# Add to firewall/security group
```

### 5. Duplicate Webhook Processing
**Symptoms:** Duplicate payments, double charges
**Fix:** Implement idempotency
```typescript
// In webhook handler
const processed = await redis.set(`webhook:${event.id}`, '1', 'EX', 3600, 'NX');
if (!processed) {
  return res.status(200).json({ received: true }); // Already processed
}
```

### 6. Network/Firewall Issues
**Symptoms:** Intermittent failures, timeouts
**Fixes:**
- Check firewall/security groups allow Paystack IPs
- Verify load balancer timeout > 30s
- Check DNS resolution for api.printloop.app

## Verification Steps

### 1. Test Webhook Endpoint
```bash
# Test with Paystack test webhook
curl -X POST https://api.printloop.app/api/payments/webhook \
  -H "Content-Type: application/json" \
  -H "x-paystack-signature: $(echo -n '{"event":"charge.success"}' | openssl dgst -sha512 -hmac "$PAYSTACK_WEBHOOK_SECRET" | cut -d' ' -f2)" \
  -d '{"event":"charge.success","data":{"reference":"test_123"}}'
```

### 2. Check Recent Deliveries in Paystack Dashboard
1. Go to Paystack Dashboard → Settings → Webhooks
2. Click on webhook URL
3. Check "Recent Deliveries" tab
3. Look for failed deliveries (red)

### 3. Monitor for 15 Minutes
```bash
# Watch for new failures
kubectl logs -n printloop -l app=printloop-api -f | grep -i "webhook\|paystack"
```

## Escalation
If unresolved in 15 minutes:
1. Page on-call engineer
2. Temporarily disable webhook in Paystack (prevent retries)
3. Post in #incidents Slack channel
4. Create incident in PagerDuty
5. Consider manual payment verification for affected orders