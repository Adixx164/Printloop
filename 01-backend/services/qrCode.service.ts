import * as QRCode from 'qrcode';

export interface QRCodeOptions {
  width?: number;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  darkColor?: string;
  lightColor?: string;
}

export class QRCodeService {
  /**
   * Generate QR code as base64 data URL (for embedding in HTML/email)
   */
  async generateDataUrl(
    text: string,
    options: QRCodeOptions = {}
  ): Promise<string> {
    return QRCode.toDataURL(text, {
      width: options.width || 400,
      margin: options.margin || 2,
      errorCorrectionLevel: options.errorCorrectionLevel || 'M',
      color: {
        dark: options.darkColor || '#000000',
        light: options.lightColor || '#FFFFFF',
      },
    });
  }

  /**
   * Generate QR code as SVG string (scalable, smaller file size)
   */
  async generateSvg(text: string, options: QRCodeOptions = {}): Promise<string> {
    return QRCode.toString(text, {
      type: 'svg',
      width: options.width || 400,
      margin: options.margin || 2,
      errorCorrectionLevel: options.errorCorrectionLevel || 'M',
      color: {
        dark: options.darkColor || '#000000',
        light: options.lightColor || '#FFFFFF',
      },
    });
  }

  /**
   * Generate QR code as Buffer (for saving to file or uploading to Cloudinary)
   */
  async generateBuffer(
    text: string,
    options: QRCodeOptions = {}
  ): Promise<Buffer> {
    return QRCode.toBuffer(text, {
      width: options.width || 400,
      margin: options.margin || 2,
      errorCorrectionLevel: options.errorCorrectionLevel || 'M',
      color: {
        dark: options.darkColor || '#000000',
        light: options.lightColor || '#FFFFFF',
      },
    });
  }

  /**
   * Generate QR code for a print job code
   * Returns both data URL and the encoded payload
   */
  async generatePrintJobQR(jobCode: string): Promise<{
    dataUrl: string;
    svg: string;
    payload: string;
  }> {
    // The kiosk scans this and POSTs the code to /printer/validate-code
    const payload = JSON.stringify({
      type: 'print_job',
      code: jobCode,
      v: 1,
    });

    const [dataUrl, svg] = await Promise.all([
      this.generateDataUrl(payload),
      this.generateSvg(payload),
    ]);

    return { dataUrl, svg, payload };
  }

  /**
   * Generate QR code for a group batch token
   */
  async generateGroupBatchQR(batchToken: string): Promise<{
    dataUrl: string;
    svg: string;
    payload: string;
  }> {
    const payload = JSON.stringify({
      type: 'group_batch',
      token: batchToken,
      v: 1,
    });

    const [dataUrl, svg] = await Promise.all([
      this.generateDataUrl(payload),
      this.generateSvg(payload),
    ]);

    return { dataUrl, svg, payload };
  }
}
