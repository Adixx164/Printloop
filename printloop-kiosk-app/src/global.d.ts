declare module 'ipp' {
  interface PrinterAttributes {
    uri: string;
    name?: string;
    'printer-make-and-model'?: string;
    'printer-state'?: number;
    'printer-is-default'?: boolean;
    [key: string]: unknown;
  }

  interface Printer {
    execute(operation: string, options: any): Promise<any>;
  }

  function Printer(uri: string): Printer;

  function getPrinters(): Promise<PrinterAttributes[]>;

  export { Printer, getPrinters };
  export default { Printer, getPrinters };
}