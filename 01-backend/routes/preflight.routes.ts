import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { analyzePreflight, applyAutoFixes, generateInstantQuote, type PreflightResult, type PrintConfig, type AutoFix } from '../services/preflight.service';
import { isOfficeDocument, acceptedDocsLabel, conversionEnabled, convertOfficeToPdf } from '../services/documentConversion.service';
import { optionalTenant } from '../middleware/tenant.middleware';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * POST /api/preflight/analyze
 * 
 * Analyze a document for print readiness issues.
 * Supports PDF, images, and office documents (ODT/ODP/ODS, etc.)
 * Returns issues, auto-fixes, 3D preview URL, and instant quote.
 * 
 * Body (multipart):
 * - file: PDF, image, or office document (ODT/ODP/ODS, etc.)
 * - printConfiguration: JSON string of PrintConfig
 */
router.post('/analyze', optionalTenant, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: 'Document file is required' });
      return;
    }

    // Accept PDF, images, and office documents
    const isPdf = file.mimetype.includes('pdf');
    const isImage = file.mimetype.startsWith('image/');
    const isOffice = isOfficeDocument(file.originalname || '', file.mimetype);
    
    if (!isPdf && !isImage && !isOffice) {
      res.status(400).json({ 
        success: false, 
        message: `Unsupported file type. PrintLoop accepts ${acceptedDocsLabel()} only.`,
        code: 'UNSUPPORTED_DOCUMENT'
      });
      return;
    }

    let printConfig: PrintConfig = {
      copies: 1,
      paper: 'A4',
      color: 'bw',
      sided: 'single',
      qualityDpi: 300
    };

    try {
      if (req.body.printConfiguration) {
        printConfig = { ...printConfig, ...JSON.parse(req.body.printConfiguration) };
      }
    } catch {
      res.status(400).json({ success: false, message: 'Invalid printConfiguration JSON' });
      return;
    }

    const result = await analyzePreflight(file.buffer, file.originalname || file.filename || 'document', file.mimetype, printConfig);

    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('Preflight analysis error:', err);
    res.status(500).json({ success: false, message: err?.message || 'Analysis failed' });
  }
});

/**
 * POST /api/preflight/fix
 * 
 * Apply selected auto-fixes to a document and return the fixed file.
 * Supports PDF and office documents (ODT/ODP/ODS, etc.)
 * 
 * Body (multipart):
 * - file: PDF or office document
 * - fixes: JSON array of fix types to apply
 */
router.post('/fix', optionalTenant, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: 'Document file is required' });
      return;
    }

    const isOffice = isOfficeDocument(file.originalname || '', file.mimetype);
    
    // If it's an office document, convert to PDF first
    let pdfBuffer: Buffer;
    if (isOffice) {
      if (!conversionEnabled()) {
        res.status(400).json({ success: false, message: 'Office document conversion is not enabled on this server' });
        return;
      }
      pdfBuffer = await convertOfficeToPdf(file.buffer, file.originalname || file.filename || 'document');
    } else if (file.mimetype.includes('pdf')) {
      pdfBuffer = file.buffer;
    } else {
      res.status(400).json({ success: false, message: 'File must be a PDF or office document' });
      return;
    }

    let fixes: string[] = [];
    try {
      fixes = req.body.fixes ? JSON.parse(req.body.fixes) : [];
    } catch {
      res.status(400).json({ success: false, message: 'Invalid fixes JSON' });
      return;
    }

    if (!fixes.length) {
      res.status(400).json({ success: false, message: 'At least one fix must be selected' });
      return;
    }

    // Map fix type strings to AutoFix objects with default values
    const { applyAutoFixes } = await import('../services/preflight.service');
    const autoFixes: AutoFix[] = fixes.map(t => ({
      type: t as AutoFix['type'],
      description: '',
      confidence: 0.9,
      affectedPages: [],
      estimatedSizeIncrease: 0
    }));
    const fixedBuffer = await applyAutoFixes(pdfBuffer, autoFixes);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="fixed-document.pdf"');
    res.send(fixedBuffer);
  } catch (err: any) {
    console.error('Auto-fix error:', err);
    res.status(500).json({ success: false, message: err?.message || 'Fix failed' });
  }
});

/**
 * POST /api/preflight/quote
 * 
 * Get instant quote without full preflight analysis.
 * Faster endpoint for pricing calculator.
 */
router.post('/quote', optionalTenant, async (req: Request, res: Response) => {
  try {
    const { printConfig, pageCount, metadata } = req.body;
    
    if (!printConfig || !pageCount) {
      res.status(400).json({ success: false, message: 'printConfig and pageCount required' });
      return;
    }

    const { generateInstantQuote } = await import('../services/preflight.service');
    
    const mockMetadata = {
      pageCount,
      fileSize: 0,
      dimensions: [],
      colorspaces: [],
      fonts: [],
      images: []
    };

    const issues: any[] = [];
    const quote = await generateInstantQuote(printConfig, mockMetadata, issues);

    res.json({ success: true, data: quote });
  } catch (err: any) {
    console.error('Quote error:', err);
    res.status(500).json({ success: false, message: err?.message || 'Quote failed' });
  }
});

/**
 * GET /api/preflight/capabilities
 * 
 * Returns supported fix types and their descriptions for UI.
 */
router.get('/capabilities', (req: Request, res: Response) => {
  const capabilities = [
    {
      type: 'embed_fonts',
      label: 'Embed Fonts',
      description: 'Embed all unembedded fonts by subsetting',
      icon: 'font',
      autoApplicable: true
    },
    {
      type: 'rgb_to_cmyk',
      label: 'Convert to CMYK',
      description: 'Convert RGB images to CMYK (FOGRA39 profile)',
      icon: 'palette',
      autoApplicable: true
    },
    {
      type: 'add_bleed',
      label: 'Add Bleed',
      description: 'Add 3mm bleed by mirroring edge content',
      icon: 'crop',
      autoApplicable: true
    },
    {
      type: 'upscale_images',
      label: 'Upscale Images',
      description: 'AI upscale low-resolution images to 300 DPI (ESRGAN)',
      icon: 'zoom-in',
      autoApplicable: true
    },
    {
      type: 'add_trim_marks',
      label: 'Add Trim Marks',
      description: 'Add trim/crop marks at 3mm offset',
      icon: 'scissors',
      autoApplicable: true
    },
    {
      type: 'fix_overset_text',
      label: 'Fix Overset Text',
      description: 'Auto-size text frames to fit content',
      icon: 'text',
      autoApplicable: false
    },
    {
      type: 'flatten_transparency',
      label: 'Flatten Transparency',
      description: 'Flatten transparency using high-res rasterization',
      icon: 'layers',
      autoApplicable: true
    },
    {
      type: 'fix_overprint',
      label: 'Fix Overprint',
      description: 'Remove unintended overprint settings',
      icon: 'eye-off',
      autoApplicable: false
    }
  ];

  res.json({ success: true, data: capabilities });
});

/**
 * POST /api/preflight/apply-fix
 * 
 * Apply a single fix and return the fixed PDF.
 * Used for "Preview Fix" functionality.
 * Supports PDF and office documents (ODT/ODP/ODS, etc.)
 */
router.post('/apply-fix', optionalTenant, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: 'Document file is required' });
      return;
    }

    const { fixType } = req.body;
    if (!fixType) {
      res.status(400).json({ success: false, message: 'fixType is required' });
      return;
    }

    const isOffice = isOfficeDocument(file.originalname || '', file.mimetype);
    
    // If it's an office document, convert to PDF first
    let pdfBuffer: Buffer;
    if (isOffice) {
      if (!conversionEnabled()) {
        res.status(400).json({ success: false, message: 'Office document conversion is not enabled on this server' });
        return;
      }
      pdfBuffer = await convertOfficeToPdf(file.buffer, file.originalname || file.filename || 'document');
    } else if (file.mimetype.includes('pdf')) {
      pdfBuffer = file.buffer;
    } else {
      res.status(400).json({ success: false, message: 'File must be a PDF or office document' });
      return;
    }

    const { applyAutoFixes } = await import('../services/preflight.service');
    const autoFix: AutoFix = {
      type: fixType as AutoFix['type'],
      description: '',
      confidence: 0.9,
      affectedPages: [],
      estimatedSizeIncrease: 0
    };
    const fixedBuffer = await applyAutoFixes(pdfBuffer, [autoFix]);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="fixed-document.pdf"');
    res.send(fixedBuffer);
  } catch (err: any) {
    console.error('Apply fix error:', err);
    res.status(500).json({ success: false, message: err?.message || 'Fix failed' });
  }
});

export default router;