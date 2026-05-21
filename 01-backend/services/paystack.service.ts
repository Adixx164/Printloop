import axios from 'axios';
import crypto from 'node:crypto';
import { AppDataSource } from '../config/database';
import { Wallet } from '../entities/wallet.entity';
import { Transaction, TransactionType } from '../entities/transaction.entity';
import { User } from '../entities/user.entity';

export class PaystackService {
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.paystack.co';

  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY || '';
  }

  /**
   * Initialize a new transaction with Paystack to top-up a wallet
   */
  async initializeTopUp(userId: string, amountNaira: number, email: string): Promise<any> {
    if (!this.secretKey) throw new Error('Paystack secret key is missing');
    
    // Paystack expects amount in Kobo (1 Naira = 100 Kobo)
    const amountKobo = amountNaira * 100;
    
    // Create a unique reference for tracking
    const reference = `TOPUP_${userId}_${Date.now()}`;

    const response = await axios.post(
      `${this.baseUrl}/transaction/initialize`,
      {
        email,
        amount: amountKobo,
        reference,
        metadata: {
          userId,
          type: 'wallet_topup'
        }
      },
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.data;
  }

  /**
   * Paystack signs webhook bodies with HMAC-SHA512 using your secret key
   * (or a dedicated PAYSTACK_WEBHOOK_SECRET if you set one). Always verify
   * against the RAW request body — JSON re-serialisation would change bytes.
   */
  verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
    if (!signature) return false;
    const secret = process.env.PAYSTACK_WEBHOOK_SECRET || this.secretKey;
    if (!secret) return false;
    const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
    // Constant-time compare to avoid timing side-channels.
    const a = Buffer.from(hash, 'utf8');
    const b = Buffer.from(String(signature), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /**
   * Process an incoming Paystack webhook. Handles:
   *   - charge.success → credit the user's wallet (idempotent on reference)
   *   - charge.failed / charge.dispute → if we already credited this
   *     reference, reverse it (debit + reversal Transaction)
   * All other events return { handled: false } so the caller can 200 them.
   */
  async handleWebhook(event: any): Promise<{ handled: boolean; action?: string }> {
    const type = event?.event;
    const data = event?.data || {};
    const reference: string | undefined = data.reference;
    const metadata = data.metadata || {};
    if (!reference || metadata.type !== 'wallet_topup') return { handled: false };
    const userId = metadata.userId;
    const amountNaira = Number(data.amount || 0) / 100;

    if (type === 'charge.success') {
      return AppDataSource.transaction(async (em) => {
        if (await em.findOne(Transaction, { where: { reference } })) {
          return { handled: true, action: 'duplicate-ignored' };
        }
        const wallet = await em.findOne(Wallet, { where: { userId } });
        if (!wallet) {
          console.error(`[paystack] charge.success: wallet not found for user ${userId}`);
          return { handled: false };
        }
        const balanceAfter = Number(wallet.balance) + amountNaira;
        wallet.balance = balanceAfter;
        await em.save(Wallet, wallet);
        await em.save(
          Transaction,
          em.create(Transaction, {
            walletId: wallet.id,
            type: TransactionType.TOPUP,
            amount: amountNaira,
            description: 'Paystack Top-up',
            balanceAfter,
            reference,
          })
        );
        return { handled: true, action: 'credited' };
      });
    }

    if (type === 'charge.failed' || type === 'charge.dispute') {
      return AppDataSource.transaction(async (em) => {
        const original = await em.findOne(Transaction, { where: { reference } });
        if (!original) return { handled: true, action: 'noop-no-prior-credit' };
        // Don't reverse twice.
        const reversal = await em.findOne(Transaction, {
          where: { reference: `${reference}:reversal` },
        });
        if (reversal) return { handled: true, action: 'reversal-already-applied' };
        const wallet = await em.findOne(Wallet, { where: { id: original.walletId } });
        if (!wallet) return { handled: false };
        const balanceAfter = Number(wallet.balance) - Number(original.amount);
        wallet.balance = balanceAfter;
        await em.save(Wallet, wallet);
        await em.save(
          Transaction,
          em.create(Transaction, {
            walletId: wallet.id,
            type: TransactionType.REFUND,
            amount: -Number(original.amount),
            description: `Reversal — Paystack ${type}`,
            balanceAfter,
            reference: `${reference}:reversal`,
          })
        );
        return { handled: true, action: 'reversed' };
      });
    }

    return { handled: false };
  }
}
