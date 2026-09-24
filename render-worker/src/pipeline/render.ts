import { logger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

const VENDOR_ROOT = process.env.VENDOR_ROOT || path.resolve(__dirname, '../../../vendor/openprinting');

export interface RenderOptions {
  dpi: number;
  color: boolean;
  pageSize: string;
  duplex: boolean;
}

export interface RenderResult {
  pwgBuffer: Buffer;
  pageCount: number;
  colorPages: number;
  monoPages: number;
  mediaSize: string;
}

async function getBinaryPath(binaryName: string): Promise<string> {
  const candidates = [
    path.join(VENDOR_ROOT, 'cups-filters', 'src', binaryName),
    path.join(VENDOR_ROOT, 'cups-filters', 'utils', binaryName),
    path.join(VENDOR_ROOT, 'libcupsfilters', 'src', binaryName),
    path.join(VENDOR_ROOT, 'cups-filters', binaryName),
    path.join(VENDOR_ROOT, 'cups-filters', 'build', binaryName),
    `/usr/bin/${binaryName}`,
    `/usr/local/bin/${binaryName}`,
  ];
  for (const c of candidates) {
    try {
      await fs.access(c);
      return c;
    } catch {
      // continue
    }
  }
  throw new Error(`Binary ${binaryName} not found in vendor or system PATH`);
}

export async function pdfToPwgRaster(
  inputPdfPath: string,
  options: RenderOptions
): Promise<RenderResult> {
  const outputPwgPath = inputPdfPath.replace(/\.pdf$/i, '.pwg');
  
  const pdftopwg = await getBinaryPath('pdftopwg');
  
  const args = [
    '-d', `${options.dpi}`,
    '-p', options.pageSize,
    options.color ? '-c' : '-g',
    options.duplex ? '-D' : '',
    inputPdfPath,
    outputPwgPath,
  ].filter(Boolean);

  logger.info({ args: [pdftopwg, ...args] }, 'Running pdftopwg');
  
  const { stdout, stderr } = await runCommand(pdftopwg, args);
  
  if (stderr) {
    logger.warn({ stderr }, 'pdftopwg stderr');
  }

  const pwgBuffer = await fs.readFile(outputPwgPath);
  const meta = await parsePwgMeta(outputPwgPath);
  
  await fs.unlink(outputPwgPath).catch(() => {});
  
  return {
    pwgBuffer,
    pageCount: meta.pages,
    colorPages: meta.colorPages,
    monoPages: meta.monoPages,
    mediaSize: options.pageSize,
  };
}

export async function normalizeToPdfA(inputPdfPath: string): Promise<string> {
  const outputPdfPath = inputPdfPath.replace(/\.pdf$/i, '_normalized.pdf');
  
  const gs = await getBinaryPath('gs');
  
  const args = [
    '-dPDFA=2',
    '-dBATCH',
    '-dNOPAUSE',
    '-dNOOUTERSAVE',
    '-sProcessColorModel=DeviceRGB',
    '-sDEVICE=pdfwrite',
    '-sOutputFile=' + outputPdfPath,
    '-f', inputPdfPath,
  ];

  logger.info({ args: [gs, ...args] }, 'Running Ghostscript for PDF/A normalization');
  
  const { stderr } = await runCommand(gs, args);
  
  if (stderr) {
    logger.warn({ stderr }, 'Ghostscript stderr');
  }

  return outputPdfPath;
}

export async function parsePwgMeta(pwgPath: string): Promise<{
  pages: number;
  colorPages: number;
  monoPages: number;
}> {
  const pwgHeader = await fs.readFile(pwgPath, { encoding: 'utf8' });
  
  let pages = 0;
  let colorPages = 0;
  let monoPages = 0;
  
  const pageMatches = pwgHeader.match(/PWG-Raster-Page-Count:\s*(\d+)/i);
  if (pageMatches) {
    pages = parseInt(pageMatches[1], 10);
  }
  
  const colorMatches = pwgHeader.match(/PWG-Raster-Color-Pages:\s*(\d+)/i);
  if (colorMatches) {
    colorPages = parseInt(colorMatches[1], 10);
  }
  
  const monoMatches = pwgHeader.match(/PWG-Raster-Mono-Pages:\s*(\d+)/i);
  if (monoMatches) {
    monoPages = parseInt(monoMatches[1], 10);
  }
  
  if (pages === 0 && (colorPages > 0 || monoPages > 0)) {
    pages = colorPages + monoPages;
  }
  
  return { pages, colorPages, monoPages };
}

export async function generatePreviewImages(inputPdfPath: string, maxPages: number = 3): Promise<string[]> {
  const outputDir = path.dirname(inputPdfPath);
  const baseName = path.basename(inputPdfPath, '.pdf');
  const outputPattern = path.join(outputDir, `${baseName}-preview-%d.jpg`);
  
  const gs = await getBinaryPath('gs');
  
  const args = [
    '-dNOPAUSE',
    '-dBATCH',
    '-dSAFER',
    '-sDEVICE=jpeg',
    '-dJPEGQ=85',
    '-r150',
    `-dFirstPage=1`,
    `-dLastPage=${maxPages}`,
    '-sOutputFile=' + outputPattern,
    inputPdfPath,
  ];

  logger.info({ args: [gs, ...args] }, 'Generating preview images');
  
  const { stderr } = await runCommand(gs, args);
  
  if (stderr) {
    logger.warn({ stderr }, 'Ghostscript preview stderr');
  }

  // Collect generated preview files
  const previews: string[] = [];
  for (let i = 1; i <= maxPages; i++) {
    const previewPath = path.join(outputDir, `${baseName}-preview-${i}.jpg`);
    try {
      await fs.access(previewPath);
      previews.push(previewPath);
    } catch {
      break;
    }
  }
  
  return previews;
}

async function runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
    
    proc.on('close', (code: number) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command "${command}" exited with code ${code}: ${stderr}`));
      }
    });
    
    proc.on('error', (err: Error) => {
      reject(new Error(`Failed to spawn "${command}": ${err.message}`));
    });
  });
}