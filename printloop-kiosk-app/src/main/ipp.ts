import ipp from 'ipp';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';

export interface PrinterInfo {
  uri: string;
  name: string;
  makeAndModel: string;
  state: string;
  isDefault: boolean;
}

export interface TestPrintResult {
  success: boolean;
  error?: string;
}

export async function listPrinters(): Promise<PrinterInfo[]> {
  try {
    const printers = await ipp.getPrinters();
    return printers.map((p: any) => ({
      uri: p.uri,
      name: p.name || p.uri,
      makeAndModel: p['printer-make-and-model'] || 'Unknown',
      state: p['printer-state'] || 'unknown',
      isDefault: p['printer-is-default'] || false,
    }));
  } catch (error) {
    logger.error({ err: error }, 'Failed to list printers');
    return [];
  }
}

export async function printPwgToIpp(printerUri: string, pwgFilePath: string): Promise<{ success: boolean; jobId: string; error?: string }> {
  const pwgBuffer = await fs.readFile(pwgFilePath);
  
  const printer = ipp.Printer(printerUri);
  
  const job = await printer.execute('Print-Job', {
    'operation-attributes-tag': {
      'requesting-user-name': 'printloop-kiosk',
      'job-name': `PrintLoop-${Date.now()}`,
      'document-format': 'application/vnd.pwg-raster',
    },
    data: pwgBuffer,
  });
  
  const jobId = job['job-id'] || job['job-uri'] || 'unknown';
  
  if (job['job-state'] && job['job-state'] >= 7) {
    return {
      success: false,
      jobId: String(jobId),
      error: `Printer error: ${job['job-state-reasons'] || 'Unknown'}`,
    };
  }
  
  return {
    success: true,
    jobId: String(jobId),
  };
}

export async function testPrinter(printerUri: string): Promise<TestPrintResult> {
  try {
    const printer = ipp.Printer(printerUri);
    const attrs = await printer.execute('Get-Printer-Attributes', {
      'operation-attributes-tag': {
        'requested-attributes': [
          'printer-name',
          'printer-make-and-model',
          'printer-state',
          'printer-state-reasons',
        ],
      },
    });
    
    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getPrinterCapabilities(printerUri: string): Promise<Record<string, unknown>> {
  try {
    const printer = ipp.Printer(printerUri);
    const attrs = await printer.execute('Get-Printer-Attributes', {
      'operation-attributes-tag': {
        'requested-attributes': [
          'printer-name',
          'printer-make-and-model',
          'printer-state',
          'printer-state-reasons',
          'printer-resolution-supported',
          'print-color-mode-supported',
          'media-supported',
          'media-col-database',
          'sides-supported',
          'finishings-supported',
        ],
      },
    });
    
    return attrs;
  } catch (error) {
    logger.error({ err: error, printerUri }, 'Failed to get printer capabilities');
    return {};
  }
}