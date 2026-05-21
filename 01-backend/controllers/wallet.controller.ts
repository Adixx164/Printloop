import { Request, Response } from 'express';
import { PaystackService } from '../services/paystack.service';

const paystackService = new PaystackService();

export const initializeTopUp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { amount } = req.body;
    const userId = (req as any).user.id;
    const email = (req as any).user.email;

    if (!amount || amount <= 0) {
      res.status(400).json({ success: false, message: 'Invalid amount' });
      return;
    }

    const data = await paystackService.initializeTopUp(userId, amount, email);
    
    res.json({
      success: true,
      data: {
        authorizationUrl: data.authorization_url,
        reference: data.reference,
      }
    });
  } catch (error) {
    console.error('Topup error:', error);
    res.status(500).json({ success: false, message: 'Failed to initialize top-up' });
  }
};

export const paystackWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    // Paystack sends a POST request with the event details
    const event = req.body;
    
    // In production, we should verify the X-Paystack-Signature header here
    const processed = await paystackService.handleWebhook(event);

    if (processed) {
      res.status(200).send('Webhook processed');
    } else {
      res.status(400).send('Webhook ignored');
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Webhook processing failed');
  }
};
