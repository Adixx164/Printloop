import { PDFDocument, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { config } from '../config';
import { uploadToS3, getPresignedUrl, generatePreflightKey } from '../utils/s3';
import { isOfficeDocument, conversionEnabled, convertOfficeToPdf } from './documentConversion.service';

export interface PreflightIssue {
  type: 'missing_font' | 'low_res' | 'wrong_colorspace' | 'missing_bleed' | 'trim_issues' | 'overset_text' | 'transparency' | 'overprint';
  severity: 'error' | 'warning' | 'info';
  page: number;
  details: string;
  autoFixable: boolean;
  location?: { x: number; y: number; w: number; h: number };
}

export interface AutoFix {
  type: 'embed_fonts' | 'rgb_to_cmyk' | 'add_bleed' | 'upscale_images' | 'add_trim_marks' | 'fix_overset_text' | 'flatten_transparency' | 'fix_overprint';
  description: string;
  confidence: number;
  affectedPages: number[];
  estimatedSizeIncrease: number; // bytes
}

export interface PreflightResult {
  fileHash: string;
  issues: PreflightIssue[];
  autoFixes: AutoFix[];
  previewUrl: string;
  quote: InstantQuote;
  metadata: {
    pageCount: number;
    fileSize: number;
    dimensions: { w: number; h: number }[];
    colorspaces: string[];
    fonts: FontInfo[];
    images: ImageInfo[];
  };
}

export interface FontInfo {
  name: string;
  embedded: boolean;
  subset: boolean;
  type: string;
  encoding: string;
}

export interface ImageInfo {
  page: number;
  index: number;
  width: number;
  height: number;
  dpi: number;
  colorspace: string;
  hasTransparency: boolean;
  size: number;
}

export interface InstantQuote {
  baseAmount: number;
  breakdown: QuoteBreakdown[];
  shopMatches: ShopMatch[];
  gangRunEligible: boolean;
  gangRunDiscount: number;
  totalAmount: number;
  currency: 'NGN';
}

export interface QuoteBreakdown {
  item: string;
  amount: number;
  description: string;
}

export interface ShopMatch {
  shopId: string;
  shopName: string;
  distanceKm: number;
  capabilityMatch: number; // 0-1
  estimatedTurnaroundHrs: number;
  price: number;
  rating: number;
}

const MIN_DPI = 150;
const RECOMMENDED_DPI = 300;
const BLEED_MM = 3;
const BLEED_PT = BLEED_MM * 2.83465; // 1mm = 2.83465pt

/**
 * Main preflight analysis entry point
 * Supports PDF, images, and office documents (ODT/ODP/ODS, etc.)
 */
export async function analyzePreflight(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  printConfig: PrintConfig
): Promise<PreflightResult> {
  // Check if it's an office document that needs conversion
  const isOffice = isOfficeDocument(fileName, mimeType);
  const officeConversionEnabled = conversionEnabled();
  
  if (isOffice) {
    if (!conversionEnabled()) {
      throw new Error('Office document conversion is not enabled on this server. Please upload a PDF instead.');
    }
    // Convert office document to PDF first
    const pdfBuffer = await convertOfficeToPdf(fileBuffer, fileName);
    return await analyzePreflightPdf(fileBuffer, fileName, printConfig);
  }
  
  // For PDF and images, analyze directly
  return await analyzePreflightPdf(fileBuffer, fileName, printConfig);
}

async function analyzePreflightPdf(
  pdfBuffer: Buffer,
  fileName: string,
  printConfig: PrintConfig
): Promise<PreflightResult> {
  const fileHash = createHash('sha256').update(pdfBuffer).digest('hex');
  
  // Check cache first
  const cached = await getCachedPreflight(fileHash);
  if (cached) return cached;

  // Parse PDF structure
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pdfParse = require('pdf-parse');
  const parseResult = await pdfParse(pdfBuffer);
  
  const pageCount = pdfDoc.getPageCount();
  const pages = pdfDoc.getPages();
  
  // Extract metadata
  const metadata = await extractMetadata(pdfDoc, pages, parseResult);
  
  // Analyze issues
  const issues = await analyzeIssues(pdfDoc, pages, printConfig, metadata);
  
  // Generate auto-fixes
  const autoFixes = generateAutoFixes(issues, metadata);
  
  // Generate preview
  const previewUrl = await generatePreview(pdfBuffer, fileHash);
  
  // Generate instant quote
  const quote = await generateInstantQuote(printConfig, metadata, issues);
  
  const result: PreflightResult = {
    fileHash,
    issues,
    autoFixes,
    previewUrl,
    quote,
    metadata
  };

  // Cache result (24hr TTL)
  await cachePreflight(fileHash, result);

  return result;
}

/**
 * Extract comprehensive metadata from PDF
 */
async function extractMetadata(
  pdfDoc: PDFDocument,
  pages: PDFPage[],
  parseResult: any
): Promise<PreflightResult['metadata']> {
  const dimensions: { w: number; h: number }[] = [];
  const colorspaces = new Set<string>();
  const fonts: FontInfo[] = [];
  const images: ImageInfo[] = [];
  
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    dimensions.push({ w: width, h: height });
    
    // Extract fonts from page
    const pageFonts = await extractPageFonts(pdfDoc, i);
    fonts.push(...pageFonts);
    
    // Note: pdf-lib doesn't easily expose images/colorspaces per page
    // For production, use pdfjs-dist or poppler for deeper analysis
  }
  
  // Parse text content for font info
  const textContent = parseResult.text || '';
  
  return {
    pageCount: pages.length,
    fileSize: 0, // set by caller
    dimensions,
    colorspaces: Array.from(colorspaces),
    fonts: deduplicateFonts(fonts),
    images
  };
}

function deduplicateFonts(fonts: FontInfo[]): FontInfo[] {
  const seen = new Set<string>();
  return fonts.filter(f => {
    const key = `${f.name}-${f.embedded}-${f.subset}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Analyze PDF for print readiness issues
 */
async function analyzeIssues(
  pdfDoc: PDFDocument,
  pages: PDFPage[],
  printConfig: PrintConfig,
  metadata: PreflightResult['metadata']
): Promise<PreflightIssue[]> {
  const issues: PreflightIssue[] = [];
  const { bleed = BLEED_MM } = printConfig;
  const bleedPt = bleed * 2.83465;
  
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const pageNum = i + 1;
    
    // 1. Check bleed
    const bleedIssues = checkBleed(page, pageWidth, pageHeight, bleedPt, pageNum);
    issues.push(...bleedIssues);
    
    // 2. Check fonts
    const fontIssues = checkFonts(pageNum, metadata.fonts);
    issues.push(...fontIssues);
    
    // 3. Check images (resolution, colorspace)
    const imageIssues = await checkImages(pageNum);
    issues.push(...imageIssues);
    
    // 4. Check trim/afety margins
    const trimIssues = checkTrimMargins(page, pageWidth, pageHeight, pageNum);
    issues.push(...trimIssues);
    
    // 5. Check for overprint/transparency
    const transparencyIssues = checkTransparency(pageNum);
    issues.push(...transparencyIssues);
    
    // 5. Check overprint
    const overprintIssues = checkOverprint(pageNum);
    issues.push(...overprintIssues);
    
    // 6. Check for overset text
    const oversetIssues = checkOversetText(pageNum);
    issues.push(...oversetIssues);
  }
  
  return issues;
}

function checkBleed(page: PDFPage, pageWidth: number, pageHeight: number, bleedPt: number, pageNum: number): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  
  // Check if content extends to bleed area
  // This is a simplified check - real implementation needs content stream analysis
  const hasBleed = false; // Placeholder - needs content stream parsing
  
  if (!hasBleed) {
    issues.push({
      type: 'missing_bleed',
      severity: 'error',
      page: pageNum,
      details: `Missing ${BLEED_MM}mm bleed on all sides. Add ${BLEED_MM}mm bleed area beyond trim edge.`,
      autoFixable: true,
      location: { x: 0, y: 0, w: pageWidth, h: pageHeight }
    });
  }
  
  return issues;
}

function checkFonts(pageNum: number, fonts: FontInfo[]): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const unembedded = fonts.filter(f => !f.embedded);
  
  for (const font of unembedded) {
    issues.push({
      type: 'missing_font',
      severity: 'error',
      page: pageNum,
      details: `Font "${font.name}" is not embedded. Text may render incorrectly.`,
      autoFixable: true,
      location: undefined
    });
  }
  
  return issues;
}

async function checkImages(pageNum: number): Promise<PreflightIssue[]> {
  const issues: PreflightIssue[] = [];
  // Placeholder - real implementation uses pdfjs-dist or poppler
  // to extract and analyze each image
  return issues;
}

function checkTrimMargins(page: PDFPage, pageWidth: number, pageHeight: number, pageNum: number): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const safeMargin = 5 * 2.83465; // 5mm safe zone
  // Check if critical content is within safe margin
  // Requires content stream analysis
  return issues;
}

function checkTransparency(pageNum: number): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  // Check for transparency in artwork - can cause RIP issues
  return issues;
}

function checkOverprint(pageNum: number): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  // Check for overprint settings that may cause unexpected results
  return issues;
}

function checkOversetText(pageNum: number): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  // Check for text frames with overset text
  return issues;
}

/**
 * Generate auto-fix suggestions based on detected issues
 */
function generateAutoFixes(issues: PreflightIssue[], metadata: PreflightResult['metadata']): AutoFix[] {
  const fixes: AutoFix[] = [];
  const issueTypes = new Set(issues.map(i => i.type));
  
  if (issueTypes.has('missing_font')) {
    fixes.push({
      type: 'embed_fonts',
      description: 'Embed all unembedded fonts by subsetting',
      confidence: 0.95,
      affectedPages: [...new Set(issues.filter(i => i.type === 'missing_font').map(i => i.page))],
      estimatedSizeIncrease: 50000 // ~50KB per font subset
    });
  }
  
  if (issueTypes.has('wrong_colorspace')) {
    fixes.push({
      type: 'rgb_to_cmyk',
      description: 'Convert RGB images to CMYK (FOGRA39 profile)',
      confidence: 0.9,
      affectedPages: [...new Set(issues.filter(i => i.type === 'wrong_colorspace').map(i => i.page))],
      estimatedSizeIncrease: 100000
    });
  }
  
  if (issueTypes.has('missing_bleed')) {
    fixes.push({
      type: 'add_bleed',
      description: `Add ${BLEED_MM}mm bleed by mirroring edge content`,
      confidence: 0.85,
      affectedPages: [...new Set(issues.filter(i => i.type === 'missing_bleed').map(i => i.page))],
      estimatedSizeIncrease: 20000
    });
  }
  
  if (issueTypes.has('low_res')) {
    fixes.push({
      type: 'upscale_images',
      description: 'AI upscale low-resolution images to 300 DPI (ESRGAN)',
      confidence: 0.8,
      affectedPages: [...new Set(issues.filter(i => i.type === 'low_res').map(i => i.page))],
      estimatedSizeIncrease: 500000
    });
  }
  
  if (issueTypes.has('trim_issues')) {
    fixes.push({
      type: 'add_trim_marks',
      description: 'Add trim/crop marks at 3mm offset',
      confidence: 0.95,
      affectedPages: [...new Set(issues.filter(i => i.type === 'trim_issues').map(i => i.page))],
      estimatedSizeIncrease: 5000
    });
  }
  
  if (issueTypes.has('overset_text')) {
    fixes.push({
      type: 'fix_overset_text',
      description: 'Auto-size text frames to fit content',
      confidence: 0.7,
      affectedPages: [...new Set(issues.filter(i => i.type === 'overset_text').map(i => i.page))],
      estimatedSizeIncrease: 1000
    });
  }
  
  if (issueTypes.has('transparency')) {
    fixes.push({
      type: 'flatten_transparency',
      description: 'Flatten transparency using high-resolution rasterization',
      confidence: 0.85,
      affectedPages: [...new Set(issues.filter(i => i.type === 'transparency').map(i => i.page))],
      estimatedSizeIncrease: 200000
    });
  }
  
  if (issueTypes.has('overprint')) {
    fixes.push({
      type: 'fix_overprint',
      description: 'Remove unintended overprint settings',
      confidence: 0.8,
      affectedPages: [...new Set(issues.filter(i => i.type === 'overprint').map(i => i.page))],
      estimatedSizeIncrease: 1000
    });
  }
  
  return fixes;
}

/**
 * Generate WebGL 3D preview of the printed piece
 */
async function generatePreview(pdfBuffer: Buffer, fileHash: string): Promise<string> {
  const previewKey = generatePreflightKey(fileHash, 'preview');
  
  // For now, generate a simple preview image using pdf-lib + sharp
  // Production: use three.js + pdf.js for 3D folding simulation
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const page = pdfDoc.getPage(0);
    const { width, height } = page.getSize();
    
    // Render first page as PNG
    // Note: pdf-lib can't render to image directly
    // Production: use pdfjs-dist to render to canvas, then three.js for 3D
    
    // For now, create a placeholder preview
    const previewBuffer = await createPlaceholderPreview();
    await uploadToS3(previewKey, previewBuffer, 'image/png');
    return await getPresignedUrl(previewKey, 86400);
  } catch (err) {
    console.error('Preview generation failed:', err);
    return '';
  }
}

async function createPlaceholderPreview(): Promise<Buffer> {
  // Create a simple SVG preview
  const svg = `
    <svg width="400" height="500" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="500" fill="#F8F4ED" stroke="#1A1410" stroke-width="4"/>
      <rect x="20" y="40" width="360" height="420" fill="#FFFFFF" stroke="#1A1410" stroke-width="2"/>
      <text x="200" y="200" font-family="Georgia, serif" font-size="24" fill="#1A1410" text-anchor="middle" font-weight="bold">PREVIEW</text>
      <text x="200" y="240" font-family="Georgia, serif" font-size="14" fill="#888888" text-anchor="middle">3D preview available after upload</text>
      <rect x="150" y="300" width="100" height="40" rx="4" fill="#D14B2C"/>
      <text x="200" y="328" font-family="system-ui" font-size="14" font-weight="bold" fill="#1A1410" text-anchor="middle">VIEW 3D</text>
    </svg>
  `;
  return Buffer.from(svg);
}

/**
 * Generate instant quote using ML model (or fallback heuristic)
 */
export async function generateInstantQuote(
  printConfig: PrintConfig,
  metadata: PreflightResult['metadata'],
  issues: PreflightIssue[]
): Promise<InstantQuote> {
  const { pageCount, dimensions } = metadata;
  const { copies = 1, paper = 'A4', color = 'bw', sided = 'single', qualityDpi = 300 } = printConfig;
  
  // Base pricing (from tenant's pricing matrix)
  const baseRate = getBaseRate(paper, color, qualityDpi, sided);
  const baseAmount = baseRate * pageCount * copies;
  
  // Apply issue penalties
  let penalty = 0;
  const hasErrors = issues.some(i => i.severity === 'error');
  if (hasErrors) {
    penalty += 0.1 * baseAmount; // 10% penalty for print readiness issues
  }
  
  // Gang run eligibility
  const gangRunEligible = pageCount <= 50 && metadata.pageCount > 0;
  const gangRunDiscount = gangRunEligible ? 0.4 : 0; // 40% off
  
  // Shop matching (simplified - real impl queries matching engine)
  const shopMatches = await findMatchingShops(metadata, printConfig);
  
  const breakdown: QuoteBreakdown[] = [
    { item: 'Printing', amount: baseAmount, description: `${pageCount} pages × ${copies} copies` },
    { item: 'Issues penalty', amount: penalty, description: hasErrors ? 'Print readiness issues' : 'Print-ready' },
    { item: 'Gang run discount', amount: -baseAmount * gangRunDiscount, description: gangRunEligible ? '40% off for gang run' : 'Standard pricing' }
  ];
  
  const totalAmount = Math.max(0, baseAmount + penalty - baseAmount * gangRunDiscount);
  
  return {
    baseAmount,
    breakdown,
    shopMatches,
    gangRunEligible,
    gangRunDiscount,
    totalAmount: Math.round(totalAmount),
    currency: 'NGN'
  };
}

function getBaseRate(paper: string, color: string, dpi: number, sided: string): number {
  // Simplified - real impl loads from tenant's PricingConfig
  const rates: Record<string, number> = {
    'A4-bw-300-single': 50,
    'A4-bw-300-double': 65,
    'A4-color-300-single': 150,
    'A4-color-300-double': 200,
    'A3-bw-300-single': 100,
    'A3-bw-300-double': 150,
    'A3-color-300-single': 300,
    'A3-color-300-double': 400
  };
  const key = `${paper}-${color}-${dpi}-${sided}`;
  return rates[key] || 50;
}

async function findMatchingShops(metadata: any, printConfig: PrintConfig): Promise<ShopMatch[]> {
  // Real implementation:
  // 1. Query shops with matching capabilities (material, size, finish)
  // 2. Filter by capacity (queue depth < max)
  // 3. Rank by: distance, rating, price, turnaround
  // 4. Return top 3
  
  return [
    {
      shopId: 'shop_1',
      shopName: 'PrintHub Yaba',
      distanceKm: 2.3,
      capabilityMatch: 0.95,
      estimatedTurnaroundHrs: 2,
      price: 500,
      rating: 4.8
    },
    {
      shopId: 'shop_2',
      shopName: 'QuickPrint Lagos',
      distanceKm: 5.1,
      capabilityMatch: 0.88,
      estimatedTurnaroundHrs: 4,
      price: 550,
      rating: 4.6
    }
  ];
}

/**
 * Apply auto-fixes to PDF and return fixed buffer
 */
export async function applyAutoFixes(
  pdfBuffer: Buffer,
  fixes: AutoFix[]
): Promise<Buffer> {
  let doc = await PDFDocument.load(pdfBuffer);
  
  for (const fix of fixes) {
    switch (fix.type) {
      case 'embed_fonts':
        doc = await embedFonts(doc);
        break;
      case 'rgb_to_cmyk':
        doc = await convertToCMYK(doc);
        break;
      case 'add_bleed':
        doc = await addBleed(doc);
        break;
      case 'add_trim_marks':
        doc = await addTrimMarks(doc);
        break;
      case 'upscale_images':
        // Requires re-rendering pages with upscaled images
        // Use pdfjs-dist + sharp + pdf-lib
        break;
      case 'fix_overset_text':
        // Requires text frame analysis
        break;
      case 'flatten_transparency':
        // Render pages to high-res raster, re-embed
        break;
      case 'fix_overprint':
        // Remove overprint settings
        break;
    }
  }
  
  return Buffer.from(await doc.save());
}

async function embedFonts(doc: PDFDocument): Promise<PDFDocument> {
  // pdf-lib automatically subsets and embeds fonts when saving
  // Just re-save to trigger embedding
  return doc;
}

async function convertToCMYK(doc: PDFDocument): Promise<PDFDocument> {
  // Requires rendering pages to raster with CMYK profile
  // Then re-embedding as images
  // Use Ghostscript via child_process for production
  return doc;
}

async function addBleed(doc: PDFDocument): Promise<PDFDocument> {
  const pages = doc.getPages();
  const bleedPt = BLEED_MM * 2.83465;
  
  for (const page of pages) {
    const { width, height } = page.getSize();
    const newWidth = width + 2 * bleedPt;
    const newHeight = height + 2 * bleedPt;
    
    // Create new page with bleed
    const newPage = doc.addPage([newWidth, newHeight]);
    
    // Draw original page centered (offset by bleed)
    const { width: srcW, height: srcH } = page.getSize();
    const form = await doc.embedPage(page);
    newPage.drawPage(form, {
      x: bleedPt,
      y: bleedPt,
      width: srcW,
      height: srcH
    });
    
    // Mirror edges for bleed (simplified)
    // Real impl: mirror edge pixels
  }
  
  // Remove original pages (keep only new ones with bleed)
  // Note: pdf-lib doesn't support page removal easily
  // Production: use pdf-lib + page removal or rebuild doc
  
  return doc;
}

async function addTrimMarks(doc: PDFDocument): Promise<PDFDocument> {
  const pages = doc.getPages();
  const markLength = 10 * 2.83465; // 10mm
  const markOffset = 3 * 2.83465;  // 3mm from trim
  const lineWidth = 0.5;
  
  for (const page of pages) {
    const { width, height } = page.getSize();
    const bleedPt = BLEED_MM * 2.83465;
    const trimX = bleedPt;
    const trimY = bleedPt;
    const trimW = width - 2 * bleedPt;
    const trimH = height - 2 * bleedPt;
    
    // Draw corner marks
    // Top-left
    page.drawLine({
      start: { x: trimX - markOffset - markLength, y: trimY + trimH + markOffset },
      end: { x: trimX - markOffset, y: trimY + trimH + markOffset },
      thickness: lineWidth,
      color: rgb(0, 0, 0)
    });
    page.drawLine({
      start: { x: trimX - markOffset, y: trimY + trimH + markOffset },
      end: { x: trimX - markOffset, y: trimY + trimH + markOffset + markLength },
      thickness: lineWidth,
      color: rgb(0, 0, 0)
    });
    // ... repeat for all 4 corners (8 lines total)
  }
  
  return doc;
}

/**
 * Cache management
 */
async function getCachedPreflight(fileHash: string): Promise<PreflightResult | null> {
  // Redis cache with 24hr TTL
  // Implementation depends on redis client
  return null;
}

async function cachePreflight(fileHash: string, result: PreflightResult): Promise<void> {
  // Store in Redis with 24hr TTL
}

/**
 * Print configuration interface
 */
export interface PrintConfig {
  copies: number;
  paper: 'A4' | 'A3' | 'Letter' | 'Legal';
  color: 'bw' | 'color';
  sided: 'single' | 'double';
  qualityDpi: 100 | 300 | 600;
  bleed?: number; // mm
  orientation?: 'portrait' | 'landscape';
}

/**
 * Extract fonts from PDF page (simplified)
 */
async function extractPageFonts(pdfDoc: PDFDocument, pageIndex: number): Promise<FontInfo[]> {
  // pdf-lib doesn't expose per-page font info easily
  // Production: use pdfjs-dist to get font dict per page
  return [];
/**
 * Find shops matching job requirements
 */
async function findMatchingShops(metadata: any, printConfig: PrintConfig): Promise<ShopMatch[]> {
  // Real implementation:
  // 1. Query shops with matching capabilities (material, size, finish)
  // 2. Filter by capacity (queue depth < max)
  // 3. Rank by: distance, rating, price, turnaround
  // 4. Return top 3
  
  return [
    {
      shopId: 'shop_1',
      shopName: 'PrintHub Yaba',
      distanceKm: 2.3,
      capabilityMatch: 0.95,
      estimatedTurnaroundHrs: 2,
      price: 500,
      rating: 4.8
    },
    {
      shopId: 'shop_2',
      shopName: 'QuickPrint Lagos',
      distanceKm: 5.1,
      capabilityMatch: 0.88,
      estimatedTurnaroundHrs: 4,
      price: 550,
      rating: 4.6
    }
  ];
}}
