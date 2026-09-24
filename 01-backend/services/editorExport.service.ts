/**
 * Editor Export Service
 * V2-XX — Export Univer documents to PDF/PWG for print pipeline
 */

import { AppDataSource } from '../config/database';
import { EditorSession, EditorSessionStatus } from '../entities/editorSession.entity';
import { DocumentEdit, DocumentEditStatus } from '../entities/documentEdit.entity';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { config } from '../config';
import axios from 'axios';
import FormData from 'form-data';

export interface ExportResult {
  documentUrl: string;
  pageCount: number;
  fileSize: number;
  format: 'pdf' | 'pwg';
}

export interface UniverExportPayload {
  document: any; // Univer document snapshot
  format: 'pdf' | 'pwg';
  options?: {
    dpi?: number;
    color?: boolean;
    pageSize?: string;
    margins?: { top: number; bottom: number; left: number; right: number };
  };
}

export class EditorExportService {
  private univerExportUrl: string;
  private libreofficeUrl: string;

  constructor() {
    this.univerExportUrl = config.editor?.univerExportUrl || 'http://localhost:3001/export';
    this.libreofficeUrl = config.editor?.libreofficeUrl || 'http://localhost:9980';
  }

  /**
   * Export Univer document to PDF or PWG
   */
  async exportDocument(
    sessionId: string,
    format: 'pdf' | 'pwg',
    shopUserId: string
  ): Promise<ExportResult> {
    const sessionRepo = AppDataSource.getRepository(EditorSession);
    const editRepo = AppDataSource.getRepository(DocumentEdit);
    const jobRepo = AppDataSource.getRepository(PrintJob);

    const session = await sessionRepo.findOne({
      where: { id: sessionId },
      relations: ['documentEdit', 'documentEdit.printJob'],
    });

    if (!session) {
      throw new Error('Session not found');
    }

    if (session.shopUserId !== shopUserId) {
      throw new Error('Only shop operator can export');
    }

    if (session.status !== EditorSessionStatus.ACTIVE && session.status !== EditorSessionStatus.COMPLETED) {
      throw new Error(`Cannot export: session is ${session.status}`);
    }

    // Try Univer export first (better fidelity)
    let exportResult: ExportResult;
    try {
      exportResult = await this.exportViaUniver(session.univerDocument, format);
    } catch (univerError) {
      console.warn('[EditorExport] Univer export failed, falling back to LibreOffice:', univerError);
      exportResult = await this.exportViaLibreOffice(session.univerDocument, format);
    }

    // Update edit record
    const edit = session.documentEdit;
    edit.editedDocumentUrl = exportResult.documentUrl;
    edit.editedDocumentMeta = {
      pageCount: exportResult.pageCount,
      fileSize: exportResult.fileSize,
    };
    edit.status = DocumentEditStatus.PENDING_CUSTOMER;
    edit.editOperations = [
      ...(edit.editOperations || []),
      {
        type: 'exported',
        format,
        exportedAt: new Date().toISOString(),
        pageCount: exportResult.pageCount,
        fileSize: exportResult.fileSize,
      },
    ];
    await editRepo.save(edit);

    // Update print job
    const job = edit.printJob;
    if (job) {
      job.editedDocumentUrl = exportResult.documentUrl;
      job.status = PrintJobStatus.EDIT_COMPLETE;
      job.totalPages = exportResult.pageCount;
      await jobRepo.save(job);
    }

    // Mark session as completed
    session.status = EditorSessionStatus.COMPLETED;
    session.lastActivityAt = new Date();
    await sessionRepo.save(session);

    return {
      documentUrl: exportResult.documentUrl,
      pageCount: exportResult.pageCount,
      fileSize: exportResult.fileSize,
      format: exportResult.format,
    };
  }

  /**
   * Export via Univer export service (best fidelity)
   */
  private async exportViaUniver(
    univerDocument: any,
    format: 'pdf' | 'pwg'
  ): Promise<ExportResult> {
    const payload: UniverExportPayload = {
      document: univerDocument,
      format,
      options: {
        dpi: 300,
        color: true,
        pageSize: 'A4',
        margins: { top: 20, bottom: 20, left: 20, right: 20 },
      },
    };

    try {
      const response = await axios.post(`${this.univerExportUrl}`, payload, {
        responseType: 'arraybuffer',
        timeout: 120000, // 2 minutes
        maxContentLength: 100 * 1024 * 1024,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const buffer = Buffer.from(response.data);
      const pageCount = this.estimatePageCount(buffer, format);

      // Save buffer and upload
      const { saveBuffer } = await import('../utils/fileStore');
      const extension = format === 'pdf' ? 'pdf' : 'pwg';
      const stored = await saveBuffer(buffer, `temp-export-${Date.now()}.${extension}`);

      return {
        documentUrl: stored.url,
        pageCount,
        fileSize: buffer.length,
        format,
      };
    } catch (error: any) {
      console.error('[EditorExport] Univer export failed:', error?.message);
      throw error;
    }
  }

  /**
   * Fallback export via LibreOffice headless
   */
  private async exportViaLibreOffice(
    univerDocument: any,
    format: 'pdf' | 'pwg'
  ): Promise<ExportResult> {
    // Convert Univer doc to a format LibreOffice can handle
    // This is a simplified fallback - in production you'd have a proper converter
    const htmlContent = this.univerToHtml(univerDocument);

    const formData = new FormData();
    formData.append('html', htmlContent);
    formData.append('format', format);

    try {
      const response = await axios.post(`${this.libreofficeUrl}/export`, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        responseType: 'arraybuffer',
        timeout: 120000,
        maxContentLength: 100 * 1024 * 1024,
      });

      const buffer = Buffer.from(response.data);
      const pageCount = this.estimatePageCount(buffer, format);

      // Save buffer temporarily and upload
      const { saveBuffer } = await import('../utils/fileStore');
      const extension = format === 'pdf' ? 'pdf' : 'pwg';
      const stored = await saveBuffer(buffer, `temp-export-${Date.now()}.${extension}`);

      return {
        documentUrl: stored.url,
        pageCount,
        fileSize: buffer.length,
        format,
      };
    } catch (error: any) {
      console.error('[EditorExport] LibreOffice export failed:', error?.message);
      throw error;
    }
  }

  /**
   * Convert Univer document to HTML for LibreOffice
   */
  private univerToHtml(doc: any): string {
    // Simplified conversion - in production use proper Univer-to-HTML converter
    const bodyContent = doc.data?.documents?.[Object.keys(doc.data.documents || {})[0]]?.body?.dataStream
      ?.map((segment: any) => segment.text || '')
      .join('') || 'Untitled Document';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 2cm; }
            @page { size: A4; margin: 2cm; }
          </style>
        </head>
        <body>${bodyContent}</body>
      </html>
    `;
  }

  /**
   * Estimate page count from exported buffer
   */
  private estimatePageCount(buffer: Buffer, format: 'pdf' | 'pwg'): number {
    if (format === 'pwg') {
      // PWG raster has page count in header
      const header = buffer.toString('ascii', 0, Math.min(1024, buffer.length));
      const match = header.match(/PWG-Raster-Page-Count:\s*(\d+)/i);
      if (match) return parseInt(match[1], 10);
    } else {
      // PDF - count /Page occurrences (rough)
      const content = buffer.toString('ascii', 0, Math.min(50000, buffer.length));
      const matches = content.match(/\/Page\b/g);
      if (matches) return matches.length;
    }
    // Fallback: estimate by file size (~50KB per page for text PDF)
    return Math.max(1, Math.ceil(buffer.length / 50000));
  }

  /**
   * Get available export formats
   */
  getAvailableFormats(): Array<{ format: 'pdf' | 'pwg'; name: string; description: string }> {
    return [
      {
        format: 'pdf',
        name: 'PDF',
        description: 'Standard PDF for review and archival',
      },
      {
        format: 'pwg',
        name: 'PWG Raster',
        description: 'Print-ready raster format for direct printing',
      },
    ];
  }
}

export const editorExportService = new EditorExportService();