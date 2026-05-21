import axios from 'axios';
import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Payment } from '../entities/payment.entity';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { Wallet } from '../entities/wallet.entity';
import { EmailService } from './email.service';

export interface RefundInput {
  paymentId: string;
  amount?: number; // If null, refund full amount
  reason: string;
  refundType: 'BANK' | 'WALLET'; // BANK = via Paystack, WALLET = credit user wallet
  adminId: string;
}

export class RefundService {
  private paymentRepo: Repository<Payment>;
  private jobRepo: Repository<PrintJob>;
  private walletRepo: Repository<Wallet>;
  private emailService: EmailService;

  constructor() {
    this.paymentRepo = AppDataSource.getRepository(Payment);
    this.jobRepo = AppDataSource.getRepository(PrintJob);
    this.walletRepo = AppDataSource.getRepository(Wallet);
    this.emailService = new EmailService();
  }

  /**
   * Issue a refund (full or partial)
   */
  async issueRefund(input: RefundInput): Promise<{
    success: boolean;
    message: string;
    data?: any;
  }> {
    const payment = await this.paymentRepo.findOne({
      where: { id: input.paymentId },
      relations: ['user'],
    });
    if (!payment) {
      return { success: false, message: 'Payment not found' };
    }

    if (payment.status !== 'SUCCESS') {
      return { success: false, message: 'Can only refund successful payments' };
    }

    const refundAmount = input.amount || Number(payment.amount);
    if (refundAmount > Number(payment.amount)) {
      return { success: false, message: 'Refund amount exceeds original payment' };
    }

    // Check if already refunded
    if ((payment as any).refundedAt) {
      return { success: false, message: 'Payment already refunded' };
    }

    if (input.refundType === 'WALLET') {
      // Credit user's wallet
      const wallet = await this.walletRepo.findOne({
        where: { userId: payment.userId },
      });
      if (!wallet) {
        return { success: false, message: 'User wallet not found' };
      }

      wallet.balance = Number(wallet.balance) + refundAmount;
      await this.walletRepo.save(wallet);

      // Mark payment as refunded
      (payment as any).refundedAt = new Date();
      (payment as any).refundReason = input.reason;
      (payment as any).refundAmount = refundAmount;
      (payment as any).refundType = 'WALLET';
      (payment as any).refundedBy = input.adminId;
      await this.paymentRepo.save(payment);

      // Send notification
      if ((payment as any).user?.email) {
        await this.emailService.sendRefundNotification({
          to: (payment as any).user.email,
          customerName: (payment as any).user.fullName || 'Customer',
          amount: refundAmount,
          currency: 'NGN',
          reason: input.reason,
          originalJobCode: (payment as any).reference,
        });
      }

      return {
        success: true,
        message: 'Wallet refund issued successfully',
        data: { refundAmount, newBalance: wallet.balance, type: 'WALLET' },
      };
    }

    // BANK refund via Paystack
    try {
      const paystackResponse = await axios.post(
        'https://api.paystack.co/refund',
        {
          transaction: (payment as any).reference,
          amount: Math.round(refundAmount * 100), // Paystack uses kobo
          currency: 'NGN',
          customer_note: 'PrintLoop refund',
          merchant_note: input.reason,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const refundData = paystackResponse.data.data;

      (payment as any).refundedAt = new Date();
      (payment as any).refundReason = input.reason;
      (payment as any).refundAmount = refundAmount;
      (payment as any).refundType = 'BANK';
      (payment as any).refundReference = refundData.id;
      (payment as any).refundedBy = input.adminId;
      await this.paymentRepo.save(payment);

      if ((payment as any).user?.email) {
        await this.emailService.sendRefundNotification({
          to: (payment as any).user.email,
          customerName: (payment as any).user.fullName || 'Customer',
          amount: refundAmount,
          currency: 'NGN',
          reason: input.reason,
          originalJobCode: (payment as any).reference,
        });
      }

      return {
        success: true,
        message: 'Bank refund initiated. Funds will arrive in 3-5 business days.',
        data: {
          refundAmount,
          refundId: refundData.id,
          type: 'BANK',
          status: refundData.status,
        },
      };
    } catch (error: any) {
      console.error('Paystack refund error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to process bank refund',
      };
    }
  }

  /**
   * Requeue a failed print job for retry
   */
  async requeueFailedJob(jobId: string, adminId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) return { success: false, message: 'Job not found' };

    if (job.status !== PrintJobStatus.FAILED) {
      return { success: false, message: `Cannot requeue job with status: ${job.status}` };
    }

    job.status = PrintJobStatus.PENDING;
    (job as any).failureReason = null;
    (job as any).requeuedBy = adminId;
    (job as any).requeuedAt = new Date();
    await this.jobRepo.save(job);

    return { success: true, message: 'Job requeued successfully' };
  }
}
