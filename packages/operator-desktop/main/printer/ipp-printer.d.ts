declare module 'ipp-printer' {
  export interface PrinterOptions {
    copies?: number;
    duplex?: boolean;
    color?: boolean;
    media?: string;
  }

  export class Printer {
    constructor(address: string);
    print(data: Buffer, options?: PrinterOptions): Promise<void>;
  }
}