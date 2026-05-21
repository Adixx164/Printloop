import nodemailer, { Transporter } from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content?: Buffer | string;
    path?: string;
    contentType?: string;
  }>;
}

export class EmailService {
  private transporter: Transporter;
  private fromAddress: string;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    this.fromAddress = process.env.SMTP_FROM || 'PrintLoop <noreply@printloop.ng>';
  }

  /**
   * Send email
   */
  async send(options: EmailOptions): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
      });
      return true;
    } catch (error) {
      console.error('Email send error:', error);
      return false;
    }
  }

  /**
   * Send print job receipt with QR code
   */
  async sendPrintJobReceipt(data: {
    to: string;
    customerName: string;
    jobCode: string;
    fileName: string;
    pageCount: number;
    cost: number;
    currency: string;
    qrCodeDataUrl: string;
    kioskLocation?: string;
  }): Promise<boolean> {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #225275; color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px; }
    .code-box { background: white; border: 2px dashed #225275; padding: 24px; text-align: center; margin: 16px 0; border-radius: 8px; }
    .code { font-size: 36px; font-weight: bold; color: #225275; letter-spacing: 4px; font-family: 'Courier New', monospace; }
    .qr { text-align: center; margin: 16px 0; }
    .qr img { max-width: 240px; }
    .details { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .detail-row { padding: 8px 0; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; }
    .detail-row:last-child { border-bottom: none; }
    .label { color: #555; }
    .value { font-weight: bold; color: #0a0f1e; }
    .footer { text-align: center; padding: 16px; color: #666; font-size: 12px; }
    .button { background: #225275; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0;">PrintLoop</h1>
    <p style="margin: 8px 0 0;">Your print job is ready</p>
  </div>
  <div class="content">
    <p>Hi ${data.customerName},</p>
    <p>Thank you for using PrintLoop! Your print job has been paid and is ready to be released at any kiosk.</p>
    
    <div class="code-box">
      <p style="margin: 0 0 8px; color: #555;">Your print code:</p>
      <div class="code">${data.jobCode}</div>
    </div>

    <div class="qr">
      <p style="margin: 0 0 12px; color: #555;">Or scan this QR code at the kiosk:</p>
      <img src="${data.qrCodeDataUrl}" alt="QR Code" />
    </div>

    <div class="details">
      <h3 style="margin-top: 0;">Order Details</h3>
      <div class="detail-row">
        <span class="label">File:</span>
        <span class="value">${data.fileName}</span>
      </div>
      <div class="detail-row">
        <span class="label">Pages:</span>
        <span class="value">${data.pageCount}</span>
      </div>
      <div class="detail-row">
        <span class="label">Total paid:</span>
        <span class="value">${data.currency} ${data.cost.toLocaleString()}</span>
      </div>
      ${data.kioskLocation ? `
      <div class="detail-row">
        <span class="label">Suggested kiosk:</span>
        <span class="value">${data.kioskLocation}</span>
      </div>
      ` : ''}
    </div>

    <p style="font-size: 13px; color: #666;">
      <strong>Privacy:</strong> Your file will be automatically deleted from our servers 24 hours after printing.
    </p>
  </div>
  <div class="footer">
    <p>PrintLoop — Self-service printing for Nigerian universities</p>
    <p>If you didn't request this, please contact support@printloop.ng</p>
  </div>
</body>
</html>
    `;

    return this.send({
      to: data.to,
      subject: `PrintLoop receipt — Code: ${data.jobCode}`,
      html,
    });
  }

  /**
   * Send group session invitation
   */
  async sendGroupInvitation(data: {
    to: string;
    hostName: string;
    groupName: string;
    deadline: Date;
    joinUrl: string;
  }): Promise<boolean> {
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #225275; color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0;">You're invited to a group print!</h1>
  </div>
  <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px;">
    <p>${data.hostName} has invited you to join the group print session:</p>
    <h2 style="color: #225275;">${data.groupName}</h2>
    <p><strong>Deadline:</strong> ${data.deadline.toLocaleString()}</p>
    <p>Upload your document before the deadline. You'll only pay for your own pages.</p>
    <p style="text-align: center; margin: 32px 0;">
      <a href="${data.joinUrl}" style="background: #225275; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Join Group Print</a>
    </p>
  </div>
</body>
</html>
    `;

    return this.send({
      to: data.to,
      subject: `${data.hostName} invited you to ${data.groupName}`,
      html,
    });
  }

  /**
   * Send refund notification
   */
  async sendRefundNotification(data: {
    to: string;
    customerName: string;
    amount: number;
    currency: string;
    reason: string;
    originalJobCode: string;
  }): Promise<boolean> {
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #145C30; color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0;">Refund Processed</h1>
  </div>
  <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px;">
    <p>Hi ${data.customerName},</p>
    <p>We've processed a refund for your print job <strong>${data.originalJobCode}</strong>.</p>
    <div style="background: white; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <p style="margin: 0;"><strong>Amount refunded:</strong> ${data.currency} ${data.amount.toLocaleString()}</p>
      <p style="margin: 8px 0 0;"><strong>Reason:</strong> ${data.reason}</p>
    </div>
    <p>The refund will appear in your wallet immediately, or in your bank account within 3–5 business days.</p>
  </div>
</body>
</html>
    `;

    return this.send({
      to: data.to,
      subject: `Refund processed for ${data.originalJobCode}`,
      html,
    });
  }
}
