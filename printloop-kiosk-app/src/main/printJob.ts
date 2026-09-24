import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';
import { getSettings } from './settings';
import { downloadFromS3 } from '../utils/s3';
import { printPwgToIpp } from './ipp';

const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, '../../../tmp');

export interface PrintJobData {
  id: string;
  code: string;
  artifactKey: string;
  pageCount: number;
  colorPages: number;
  monoPages: number;
  cost: number;
  customerName: string;
  fileName: string;
}

export async function fetchPrintJob(
  apiUrl: string,
  apiKey: string,
  code: string
): Promise<PrintJobData> {
  const response = await axios.get(`${apiUrl}/api/kiosk/jobs/${code}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    timeout: 10000,
  });
  
  return response.data;
}

export async function printJob(printerUri: string, artifactKey: string): Promise<{ success: boolean; jobId: string; error?: string }> {
  const settings = getSettings();
  
  if (!settings.apiUrl || !settings.apiKey) {
    throw new Error('Kiosk not configured');
  }
  
  const pwgBuffer = await downloadFromS3(artifactKey);
  logger.info({ size: pwgBuffer.length, artifactKey }, 'Downloaded PWG artifact from S3');
  
  const tempDir = path.join(__dirname, '../../../tmp');
  await fs.mkdir(tempDir, { recursive: true });
  const tempFile = path.join(tempDir, `${Date.now()}.pwg`);
  await fs.writeFile(tempFile, pwgBuffer);
  
  try {
    const result = await printPwgToIpp(printerUri, tempFile);
    logger.info({ jobId: result.jobId }, 'Print job submitted to IPP printer');
    return result;
  } finally {
    await fs.unlink(tempFile).catch(() => {});
  }
}