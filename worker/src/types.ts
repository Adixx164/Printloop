export type S3Config = {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
};

export type RenderManifest = {
  printJobId: string;
  tenantId: string | null;
  sourceFileKey: string;
  sourceFileUrl?: string | null;
  fileName: string;
  printConfiguration: Record<string, unknown> | null;
  printerProfileId: string | null;
  watermarkId?: string | null;
};

/**
 * Unified result shape returned by BOTH the real pipeline (run) and
 * the dev simulation (mock). The extra fields (renderedPdfUrl,
 * previewImageUrls) are what the API callback needs — keeping them on
 * one type stops the executor and the pipeline drifting (V2-41 dedup).
 */
export type RenderResult = {
  renderedKey: string;
  renderedPdfUrl?: string;
  previewImageUrls?: string[];
  pageCount: number;
  bytes: number;
  durationMs: number;
};
