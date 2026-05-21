import { Worker, Job } from 'bullmq';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';
import { AppDataSource } from '../config/database';
import { File } from '../entities/file.entity';

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

interface WatermarkJobData {
  fileId: string;
  participantId: string;
  watermarkId: string;
  participantName: string;
}

/**
 * PDF Watermarking Worker
 * 
 * Process:
 * 1. Fetch PDF from Cloudinary
 * 2. Open with pdf-lib
 * 3. Stamp watermarkId at bottom-right of every page
 * 4. Re-upload to Cloudinary as new file
 * 5. Update File entity with watermarkedUrl
 */
export const watermarkWorker = new Worker<WatermarkJobData>(
  'watermark-pdf',
  async (job: Job<WatermarkJobData>) => {
    const { fileId, watermarkId, participantName } = job.data;

    console.log(`[Watermark] Starting for file ${fileId}, ID: ${watermarkId}`);

    const fileRepo = AppDataSource.getRepository(File);
    const file = await fileRepo.findOne({ where: { id: fileId } });

    if (!file) {
      throw new Error(`File ${fileId} not found`);
    }

    // Step 1: Download PDF
    const response = await axios.get(file.fileURL, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });
    const pdfBytes = Buffer.from(response.data);

    // Step 2: Load PDF with pdf-lib
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Step 3: Stamp watermark on every page
    const watermarkText = watermarkId;
    const fontSize = 10;
    const padding = 20;

    for (const page of pages) {
      const { width, height } = page.getSize();
      const textWidth = helveticaFont.widthOfTextAtSize(watermarkText, fontSize);

      // Bottom-right corner
      page.drawText(watermarkText, {
        x: width - textWidth - padding,
        y: padding,
        size: fontSize,
        font: helveticaFont,
        color: rgb(0.4, 0.4, 0.4), // Grey
        opacity: 0.6,
      });
    }

    const watermarkedBytes = await pdfDoc.save();

    // Step 4: Upload watermarked version to Cloudinary
    const uploadResult = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: 'raw',
            folder: 'printloop/watermarked',
            public_id: `${file.id}-watermarked-${Date.now()}`,
            format: 'pdf',
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        )
        .end(Buffer.from(watermarkedBytes));
    });

    // Step 5: Update File entity with watermarked URL
    await fileRepo.update(file.id, {
      // Store original in case we need it; new field would need to be added
      // For now, we add watermarkedUrl as a new column
      ...(({ watermarkedUrl: uploadResult.secure_url } as any)),
    });

    console.log(`[Watermark] Completed for file ${fileId} → ${uploadResult.secure_url}`);

    return {
      fileId,
      watermarkedUrl: uploadResult.secure_url,
      watermarkId,
    };
  },
  { connection: redisConnection, concurrency: 5 }
);

watermarkWorker.on('completed', (job) => {
  console.log(`[Watermark] Job ${job.id} completed`);
});

watermarkWorker.on('failed', (job, err) => {
  console.error(`[Watermark] Job ${job?.id} failed:`, err);
});
