---
name: paystack-webhook-debug
description: Simulate, verify, and replay Paystack webhooks locally for debugging payment integration
disable-model-invocation: true
---

# Paystack Webhook Debug Skill

Debug Paystack webhook integration locally without needing ngrok or live Paystack callbacks.

## What this skill does

- Simulates `charge.success` and `transfer.*` webhook payloads
- Verifies HMAC-SHA512 signatures against your `PAYSTACK_WEBHOOK_SECRET`
- Replays failed webhook events from logs
- Tests idempotency handling
- Validates raw body capture (critical for signature verification)

## Usage

```
/paystack-webhook-debug
```

Then select an action:
1. **Simulate charge.success** - Generate a test webhook for a completed payment
2. **Simulate transfer.success** - Generate a test webhook for tenant payout
3. **Verify signature** - Test HMAC verification with a raw payload
4. **Replay from logs** - Re-send a failed webhook from backend logs
5. **Check raw body capture** - Verify Express captures raw body correctly

## Prerequisites

- Backend running on `http://localhost:4000`
- `PAYSTACK_SECRET_KEY` and `PAYSTACK_WEBHOOK_SECRET` in `01-backend/.env`
- Test user with valid email in database

## Files

- `simulate-charge-success.ts` - Creates realistic charge.success payload
- `simulate-transfer-success.ts` - Creates realistic transfer.success payload
- `verify-signature.ts` - HMAC-SHA512 verification utility
- `replay-webhook.ts` - Reads from backend logs and re-sends