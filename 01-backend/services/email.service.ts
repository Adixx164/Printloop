import nodemailer, { Transporter } from 'nodemailer';
import { AppDataSource } from '../config/database';
import { TenantBranding } from '../entities/tenantBranding.entity';

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
  private transporter: Transporter | null;
  private fromAddress: string;
  private enabled: boolean;

  constructor() {
    // SMTP_HOST is the canonical signal — without a server to talk to,
    // there's no transport to build. Dev runs unconfigured by default
    // (V2-29), so the service no-ops + logs the email body to stdout
    // instead of failing. Production sets SMTP_HOST and gets real
    // delivery. The E2E password-reset test scrapes the logged token
    // from the dev log line.
    this.enabled = Boolean(process.env.SMTP_HOST);
    this.transporter = this.enabled
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          },
        })
      : null;

    this.fromAddress = process.env.SMTP_FROM || 'PrintLoop <noreply@printloop.ng>';
  }

  private async getBranding(tenantId: string | undefined): Promise<Partial<TenantBranding> | null> {
    if (!tenantId) return null;
    try {
      const repo = AppDataSource.getRepository(TenantBranding);
      return await repo.findOne({ where: { tenantId } });
    } catch {
      return null;
    }
  }

  private buildBrandStyles(branding: Partial<TenantBranding> | null): { primary: string; secondary: string; accent: string; wordmark: string; logoUrl: string | null } {
    const primary = branding?.primaryColor || '#1A1410';
    const secondary = branding?.secondaryColor || '#D14B2C';
    const accent = branding?.accentColor || '#C7944A';
    const wordmark = branding?.wordmark || 'PrintLoop';
    const logoUrl = branding?.logoUrl || null;
    return { primary, secondary, accent, wordmark, logoUrl };
  }

  private async buildEmailHtml(tenantId: string | undefined, content: string): Promise<string> {
    const branding = await this.getBranding(tenantId);
    const { primary, secondary, accent, wordmark, logoUrl } = this.buildBrandStyles(branding);
    const supportEmail = branding?.supportEmail || 'support@printloop.ng';
    const supportPhone = branding?.supportPhone || null;
    const logo = logoUrl ? `<img src="${logoUrl}" alt="${wordmark}" style="max-height: 60px; margin-bottom: 16px;" />` : `<h1 style="margin: 0; color: white; font-family: Georgia, serif; font-size: 28px;">${wordmark}</h1>`;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f3ef;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <tr>
      <td style="background: ${primary}; border-radius: 12px 12px 0 0; padding: 32px 24px; text-align: center;">
        ${logo}
        <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Your print job is ready</p>
      </td>
    </tr>
    <tr>
      <td style="background: #fdfcf8; padding: 32px 24px; border-radius: 0 0 12px 12px;">
        ${content}
      </td>
    </tr>
    <tr>
      <td style="text-align: center; padding: 24px; color: #888; font-size: 12px;">
        <p style="margin: 0 0 8px;">${wordmark} — Self-service printing for Nigerian universities</p>
        <p style="margin: 0;">If you didn't request this, please contact <a href="mailto:${supportEmail}" style="color: ${accent};">${supportEmail}</a>${supportPhone ? ` or call ${supportPhone}` : ''}</p>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  /**
   * Send email. Returns false if SMTP is unconfigured (dev mode) — the
   * caller treats this as best-effort; we never reject a downstream
   * request because email failed.
   */
  async send(options: EmailOptions): Promise<boolean> {
    if (!this.enabled || !this.transporter) {
      // Dev / unconfigured path. Log a compact representation that
      // tests can scrape for the verification or reset token.
      console.log(
        `[email:disabled] to=${options.to} subject=${JSON.stringify(
          options.subject,
        )}`,
      );
      return false;
    }
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
    tenantId?: string;
  }): Promise<boolean> {
    const content = `
      <p style="margin: 0 0 16px; font-size: 16px; color: #1A1410;">Hi ${data.customerName},</p>
      <p style="margin: 0 0 24px; font-size: 16px; color: #444;">Thank you for using ${data.tenantId ? 'your print shop' : 'PrintLoop'}! Your print job has been paid and is ready to be released at any kiosk.</p>
      
      <div style="background: white; border: 2px dashed ${data.tenantId ? 'currentColor' : '#1A1410'}; padding: 24px; text-align: center; margin: 24px 0; border-radius: 8px;">
        <p style="margin: 0 0 8px; color: #666; font-size: 14px;">Your print code:</p>
        <div style="font-size: 36px; font-weight: bold; color: ${data.tenantId ? 'currentColor' : '#1A1410'}; letter-spacing: 4px; font-family: 'Courier New', monospace;">${data.jobCode}</div>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <p style="margin: 0 0 12px; color: #666; font-size: 14px;">Or scan this QR code at the kiosk:</p>
        <img src="${data.qrCodeDataUrl}" alt="QR Code" style="max-width: 240px;" />
      </div>

      <div style="background: white; padding: 20px; border-radius: 8px; margin: 24px 0;">
        <h3 style="margin: 0 0 16px; font-size: 18px; color: #1A1410;">Order Details</h3>
        <div style="padding: 8px 0; border-bottom: 1px solid #eee; display: flex; justify-content: space-between;">
          <span style="color: #666;">File:</span>
          <span style="font-weight: bold; color: #1A1410;">${data.fileName}</span>
        </div>
        <div style="padding: 8px 0; border-bottom: 1px solid #eee; display: flex; justify-content: space-between;">
          <span style="color: #666;">Pages:</span>
          <span style="font-weight: bold; color: #1A1410;">${data.pageCount}</span>
        </div>
        <div style="padding: 8px 0; display: flex; justify-content: space-between;">
          <span style="color: #666;">Total paid:</span>
          <span style="font-weight: bold; color: #1A1410;">${data.currency} ${data.cost.toLocaleString()}</span>
        </div>
        ${data.kioskLocation ? `
        <div style="padding: 8px 0; display: flex; justify-content: space-between; border-top: 1px solid #eee; margin-top: 8px;">
          <span style="color: #666;">Suggested kiosk:</span>
          <span style="font-weight: bold; color: #1A1410;">${data.kioskLocation}</span>
        </div>
        ` : ''}
      </div>

      <p style="font-size: 13px; color: #666; margin-top: 24px;">
        <strong>Privacy:</strong> Your file will be automatically deleted from our servers 24 hours after printing.
      </p>
    `;

    const html = await this.buildEmailHtml(data.tenantId, content);

    return this.send({
      to: data.to,
      subject: `Receipt — Code: ${data.jobCode}`,
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
    tenantId?: string;
  }): Promise<boolean> {
    const content = `
      <p style="margin: 0 0 16px; font-size: 16px; color: #1A1410;">Hi there,</p>
      <p style="margin: 0 0 24px; font-size: 16px; color: #444;">${data.hostName} has invited you to join the group print session:</p>
      <h2 style="margin: 0 0 16px; font-size: 22px; color: #1A1410;">${data.groupName}</h2>
      <p style="margin: 0 0 24px; font-size: 16px; color: #444;"><strong>Deadline:</strong> ${data.deadline.toLocaleString()}</p>
      <p style="margin: 0 0 24px; font-size: 16px; color: #444;">Upload your document before the deadline. You'll only pay for your own pages.</p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${data.joinUrl}" style="background: #1A1410; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Join Group Print</a>
      </p>
    `;

    const html = await this.buildEmailHtml(data.tenantId, content);

    return this.send({
      to: data.to,
      subject: `${data.hostName} invited you to ${data.groupName}`,
      html,
    });
  }

  /**
   * Send a tenant-owner email verification message. The token is a
   * 6-digit code that ALSO doubles as a URL parameter for one-click
   * verification — the link is `${baseUrl}/verify-email?token=XXXXXX`.
   */
  async sendTenantOwnerVerification(data: {
    to: string;
    firstName: string;
    businessName: string;
    token: string;
    verifyUrl: string;
    tenantId?: string;
  }): Promise<boolean> {
    const content = `
      <p style="margin: 0 0 16px; font-size: 16px; color: #1A1410;">Hi ${data.firstName},</p>
      <p style="margin: 0 0 24px; font-size: 16px; color: #444;">Thanks for signing up your printing business with PrintLoop. To finish setup, confirm your email address — either by clicking the button below or by entering this code on the verification page:</p>
      <div style="background: white; border: 2px dashed #1A1410; padding: 24px; text-align: center; margin: 16px 0; border-radius: 8px;">
        <div style="font-size: 32px; font-weight: bold; color: #1A1410; letter-spacing: 6px; font-family: 'Courier New', monospace;">${data.token}</div>
      </div>
      <p style="text-align: center; margin: 24px 0;">
        <a href="${data.verifyUrl}" style="background: #1A1410; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Verify Email</a>
      </p>
      <p style="font-size: 12px; color: #666; margin-top: 24px;">If you didn't sign up, you can ignore this email — no account was created.</p>
    `;

    const html = await this.buildEmailHtml(data.tenantId, content);

    return this.send({
      to: data.to,
      subject: `Verify your email — code ${data.token}`,
      html,
    });
  }

  /**
   * Send password-reset link (V2-29). The token encodes its own
   * expiry server-side (see routes/passwordReset.routes.ts); the
   * link the user clicks is opaque from their perspective.
   */
  async sendPasswordReset(data: {
    to: string;
    firstName: string;
    resetUrl: string;
    token: string;
    tenantId?: string;
  }): Promise<boolean> {
    const content = `
      <p style="margin: 0 0 16px; font-size: 16px; color: #1A1410;">Hi ${data.firstName || 'there'},</p>
      <p style="margin: 0 0 24px; font-size: 16px; color: #444;">We received a request to reset your PrintLoop password. Click the button below to choose a new one — the link expires in <strong>60 minutes</strong>.</p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${data.resetUrl}" style="background: #1A1410; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Reset Password</a>
      </p>
      <p style="font-size: 13px; color: #666;">If the button doesn't work, paste this into your browser:</p>
      <p style="font-size: 13px; word-break: break-all; background: white; padding: 12px; border-radius: 6px;">${data.resetUrl}</p>
      <p style="font-size: 12px; color: #666; margin-top: 24px;">
        Didn't ask for this? You can safely ignore this email — your password won't change unless you click the link above.
      </p>
    `;

    const html = await this.buildEmailHtml(data.tenantId, content);

    return this.send({
      to: data.to,
      subject: 'Reset your PrintLoop password',
      html,
    });
  }
}
