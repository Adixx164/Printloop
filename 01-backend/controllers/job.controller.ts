import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { Wallet } from '../entities/wallet.entity';
import { Transaction, TransactionType } from '../entities/transaction.entity';

const jobRepository = AppDataSource.getRepository(PrintJob);
const walletRepository = AppDataSource.getRepository(Wallet);

function generateReleaseCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const createJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId, printConfiguration, cost } = req.body;
    const userId = (req as any).user.id;

    // Use a transaction to deduct from wallet and create job securely
    await AppDataSource.transaction(async (manager) => {
      const wallet = await manager.findOne(Wallet, { where: { userId } });
      
      if (!wallet || wallet.balance < cost) {
        throw new Error('Insufficient wallet balance');
      }

      // 1. Deduct cost
      const balanceAfter = Number(wallet.balance) - cost;
      wallet.balance = balanceAfter;
      await manager.save(Wallet, wallet);

      // 2. Log transaction
      const transaction = manager.create(Transaction, {
        walletId: wallet.id,
        type: TransactionType.PRINT,
        amount: -cost,
        description: 'Document Print Job',
        balanceAfter
      });
      await manager.save(Transaction, transaction);

      // 3. Create job
      const job = manager.create(PrintJob, {
        userId,
        fileId,
        cost,
        code: generateReleaseCode(),
        printConfiguration,
        status: PrintJobStatus.READY,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours expiry
      });
      await manager.save(PrintJob, job);

      res.status(201).json({
        success: true,
        data: {
          jobCode: job.code,
          walletBalance: wallet.balance
        }
      });
    });
  } catch (error: any) {
    console.error('Create job error:', error);
    if (error.message === 'Insufficient wallet balance') {
      res.status(402).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Failed to create job' });
    }
  }
};
