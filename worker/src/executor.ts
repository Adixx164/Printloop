import type { RenderManifest, RenderResult } from './types';
import { renderToPwgRaster, type RenderInput } from './pipeline/render.js';

/**
 * RenderPipeline — the orchestration layer the BullMQ worker calls.
 *
 *   run(manifest)  → the REAL pipeline. Delegates to renderToPwgRaster
 *                    (pipeline/render.ts: LibreOffice/image normalise →
 *                    pdf-lib config apply → cups-filters PWG-Raster →
 *                    S3 upload). One source of truth (V2-41 dedup — the
 *                    executor no longer re-implements rendering).
 *   mock(manifest) → no-S3, no-Ghostscript simulation for dev / the
 *                    callback-wiring e2e. Returns the SAME RenderResult
 *                    shape so downstream (the API callback) is identical.
 */
export class RenderPipeline {
  constructor(private config: {
    bucket: string;
    region?: string;
    endpoint?: string;
    awsAccessKeyId?: string;
    awsSecretAccessKey?: string;
    forcePathStyle?: boolean;
    layerKey: (tenantId: string, jobId: string) => string;
  }) {}

  async run(manifest: RenderManifest): Promise<RenderResult> {
    const input: RenderInput = {
      printJobId: manifest.printJobId,
      tenantId: manifest.tenantId || 'public',
      sourceFileKey: manifest.sourceFileKey,
      sourceFileUrl: manifest.sourceFileUrl ?? null,
      fileName: manifest.fileName,
      printConfiguration: manifest.printConfiguration as RenderInput['printConfiguration'],
      watermarkId: manifest.watermarkId ?? null,
      printerProfileId: manifest.printerProfileId,
    };
    const r = await renderToPwgRaster(input);
    return {
      renderedKey: r.renderedKey,
      renderedPdfUrl: r.renderedPdfUrl,
      previewImageUrls: r.previewImageUrls,
      pageCount: r.pageCount,
      bytes: r.bytes,
      durationMs: r.durationMs,
    };
  }

  async mock(manifest: RenderManifest): Promise<RenderResult> {
    const started = Date.now();
    const pageCount = this.estimatePages(manifest);
    const bytes = 400_000 + pageCount * 40_000;
    const tenant = this.safeTenantId(manifest);
    const renderedKey = this.config.layerKey(tenant, manifest.printJobId);
    await new Promise((r) => setTimeout(r, 250));
    return {
      renderedKey,
      renderedPdfUrl: `mock://${renderedKey}`,
      previewImageUrls: [],
      pageCount,
      bytes,
      durationMs: Date.now() - started,
    };
  }

  private safeTenantId(manifest: RenderManifest): string {
    return this.slug(manifest.tenantId || 'public');
  }

  private slug(input: string): string {
    return input.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80) || 'public';
  }

  private estimatePages(_manifest: RenderManifest): number {
    const printConfiguration = _manifest.printConfiguration || {};
    const base = (printConfiguration as any).pages || 1;
    return base || 5;
  }
}
