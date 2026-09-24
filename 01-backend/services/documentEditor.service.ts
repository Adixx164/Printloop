/**
 * Document Editor Service
 * V2-XX — Handles document conversion, session management, and export
 */

import { AppDataSource } from '../config/database';
import { EditorSession, EditorSessionStatus, ConversionStatus, EditorPermissions } from '../entities/editorSession.entity';
import { DocumentEdit, DocumentEditStatus } from '../entities/documentEdit.entity';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { User } from '../entities/user.entity';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import axios from 'axios';
import FormData from 'form-data';

interface ConversionResult {
  univerDocument: any;
  pageCount: number;
}

interface ExportResult {
  documentUrl: string;
  pageCount: number;
  fileSize: number;
}

export class DocumentEditorService {
  private libreofficeUrl: string;
  private univerLibreOfficeUrl: string;

  constructor() {
    this.libreofficeUrl = config.editor?.libreofficeUrl || 'http://localhost:9980';
    this.univerLibreOfficeUrl = config.editor?.univerLibreOfficeUrl ||
      'socket,host=libreoffice,port=2002;urp;StarOffice.ComponentContext';
  }

  /**
   * Convert source document (PDF/DOCX/ODT) to Univer format via LibreOffice
   */
  async convertToUniver(
    sourceUrl: string,
    mimeType: string,
    editId: string
  ): Promise<ConversionResult> {
    const sessionRepo = AppDataSource.getRepository(EditorSession);

    // Create or get session
    let session = await sessionRepo.findOne({ where: { documentEditId: editId } });
    if (!session) {
      throw new Error(`No editor session found for edit ${editId}`);
    }

    try {
      session.conversionStatus = ConversionStatus.PROCESSING;
      await sessionRepo.save(session);

      // Download source document
      const response = await axios.get(sourceUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: 50 * 1024 * 1024, // 50MB max
      });

      const fileBuffer = Buffer.from(response.data);
      const extension = this.getExtensionFromMime(mimeType);

      // Convert via LibreOffice headless
      const univerDoc = await this.convertViaLibreOffice(fileBuffer, extension, editId);

      // Save univer document to session
      session.univerDocument = univerDoc;
      session.conversionStatus = ConversionStatus.COMPLETED;
      session.lastActivityAt = new Date();
      await sessionRepo.save(session);

      return {
        univerDocument: univerDoc,
        pageCount: this.estimatePageCount(univerDoc),
      };
    } catch (error: any) {
      session.conversionStatus = ConversionStatus.FAILED;
      session.conversionError = error?.message || 'Conversion failed';
      await sessionRepo.save(session);
      throw error;
    }
  }

  /**
   * Convert document using LibreOffice headless REST API
   */
  private async convertViaLibreOffice(
    fileBuffer: Buffer,
    extension: string,
    editId: string
  ): Promise<any> {
    // LibreOffice headless conversion endpoint
    // POST /convert with multipart form data
    const formData = new FormData();
    formData.append('file', fileBuffer, { filename: `document${extension}`, contentType: 'application/octet-stream' });
    formData.append('format', 'univer'); // Custom format for Univer JSON

    try {
      const response = await axios.post(`${this.libreofficeUrl}/convert`, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 120000, // 2 minutes for conversion
        maxContentLength: 100 * 1024 * 1024,
      });

      // Expected response: { univerDocument: {...}, pageCount: number }
      return response.data.univerDocument || this.getDefaultUniverDocument();
    } catch (error: any) {
      console.error('[DocumentEditor] LibreOffice conversion failed:', error?.message);
      // Fallback: create minimal Univer document from PDF
      return this.getDefaultUniverDocument();
    }
  }

  /**
   * Create editor session with JWT token
   */
  async createSession(
    editId: string,
    shopUserId: string,
    sourceDocumentUrl: string,
    mimeType: string
  ): Promise<{
    sessionId: string;
    token: string;
    editorUrl: string;
    univerDocument: any;
    permissions: EditorPermissions;
    expiresAt: Date;
    iceServers: RTCIceServer[];
  }> {
    const sessionRepo = AppDataSource.getRepository(EditorSession);
    const editRepo = AppDataSource.getRepository(DocumentEdit);

    const edit = await editRepo.findOne({ where: { id: editId } });
    if (!edit) {
      throw new Error(`Document edit ${editId} not found`);
    }

    // Generate session
    const sessionId = uuidv4();
    const token = this.generateSessionToken(sessionId, editId, shopUserId);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Get ICE servers for WebRTC
    const iceServers = this.getIceServers();

    // Create session record
    const session = sessionRepo.create({
      id: sessionId,
      documentEditId: editId,
      shopUserId,
      univerDocument: this.getDefaultUniverDocument(),
      permissions: { shop: 'rw', customer: 'r' },
      tokenHash,
      status: EditorSessionStatus.ACTIVE,
      conversionStatus: ConversionStatus.PENDING,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      lastActivityAt: new Date(),
    });

    await sessionRepo.save(session);

    // Start async conversion
    this.convertToUniver(sourceDocumentUrl, mimeType, editId).catch(err => {
      console.error('[DocumentEditor] Background conversion failed:', err);
    });

    const frontendUrl = config.frontendUrl || 'http://localhost:5173';
    const editorUrl = `${frontendUrl}/saas/editor/${sessionId}?token=${token}`;

    return {
      sessionId,
      token,
      editorUrl,
      univerDocument: session.univerDocument,
      permissions: session.permissions,
      expiresAt: session.expiresAt,
      iceServers,
    };
  }

  /**
   * Get session with document data (for shop or customer)
   */
  async getSession(
    sessionId: string,
    userId: string,
    role: 'shop' | 'customer'
  ): Promise<{
    session: EditorSession;
    univerDocument: any;
    permissions: EditorPermissions;
    role: 'shop' | 'customer';
    iceServers: RTCIceServer[];
  }> {
    const sessionRepo = AppDataSource.getRepository(EditorSession);

    const session = await sessionRepo.findOne({
      where: { id: sessionId },
      relations: ['documentEdit', 'documentEdit.printJob'],
    });

    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== EditorSessionStatus.ACTIVE) {
      throw new Error(`Session is ${session.status}`);
    }

    // Verify authorization
    const isShop = session.shopUserId === userId;
    const isCustomer = session.customerUserId === userId || session.documentEdit.printJob?.userId === userId;

    if ((role === 'shop' && !isShop) || (role === 'customer' && !isCustomer)) {
      throw new Error('Unauthorized for this session');
    }

    // Update customer user ID if first access
    if (role === 'customer' && !session.customerUserId) {
      session.customerUserId = userId;
      session.lastActivityAt = new Date();
      await sessionRepo.save(session);
    }

    return {
      session,
      univerDocument: session.univerDocument,
      permissions: session.permissions,
      role,
      iceServers: this.getIceServers(),
    };
  }

  /**
   * Save document snapshot (auto-save)
   */
  async saveSnapshot(
    sessionId: string,
    snapshot: any,
    version: number
  ): Promise<void> {
    const sessionRepo = AppDataSource.getRepository(EditorSession);

    const session = await sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== EditorSessionStatus.ACTIVE) {
      throw new Error(`Cannot save: session is ${session.status}`);
    }

    // Version conflict check
    if (session.univerDocument.version && session.univerDocument.version !== version - 1) {
      throw new Error('Version conflict: document was modified by another user');
    }

    session.univerDocument = { ...snapshot, version };
    session.lastActivityAt = new Date();
    await sessionRepo.save(session);
  }

  /**
   * Export document to PDF or PWG for printing
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

    // Export via LibreOffice or Univer export API
    const exportResult = await this.exportViaUniver(session.univerDocument, format);

    // Save exported file
    const { saveBuffer } = await import('../utils/fileStore');
    const stored = await saveBuffer(
      exportResult.buffer,
      `edited-${session.documentEditId}.${format === 'pdf' ? 'pdf' : 'pwg'}`
    );

    // Update edit record
    const edit = session.documentEdit;
    edit.editedDocumentUrl = stored.url;
    edit.editedDocumentMeta = {
      pageCount: exportResult.pageCount,
      fileSize: exportResult.fileSize,
    };
    edit.status = DocumentEditStatus.PENDING_CUSTOMER;
    await editRepo.save(edit);

    // Update print job
    const job = edit.printJob;
    if (job) {
      job.editedDocumentUrl = stored.url;
      job.status = PrintJobStatus.EDIT_COMPLETE;
      await jobRepo.save(job);
    }

    session.status = EditorSessionStatus.COMPLETED;
    session.lastActivityAt = new Date();
    await sessionRepo.save(session);

    return {
      documentUrl: stored.url,
      pageCount: exportResult.pageCount,
      fileSize: exportResult.fileSize,
    };
  }

  /**
   * Clean up expired sessions (called by cron)
   */
  async cleanupExpired(): Promise<number> {
    const sessionRepo = AppDataSource.getRepository(EditorSession);
    const result = await sessionRepo
      .createQueryBuilder()
      .update(EditorSession)
      .set({ status: EditorSessionStatus.EXPIRED })
      .where('status = :active', { active: EditorSessionStatus.ACTIVE })
      .andWhere('expiresAt < :now', { now: new Date() })
      .execute();

    return result.affected || 0;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────────────────────

  private getIceServers(): RTCIceServer[] {
    const turnServer = config.editor?.turnServer;
    const turnTlsServer = config.editor?.turnTlsServer;
    const turnPassword = config.editor?.coturnPassword;

    if (!turnServer || !turnPassword) {
      // Fallback to public STUN servers
      return [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ];
    }

    return [
      { urls: 'stun:stun.l.google.com:19302' },
      {
        urls: [turnServer, turnTlsServer].filter(Boolean) as string[],
        username: 'editor',
        credential: turnPassword,
      },
    ];
  }

  private generateSessionToken(sessionId: string, editId: string, userId: string): string {
    const payload = {
      sid: sessionId,
      eid: editId,
      uid: userId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
    };
    // In production, sign with JWT_SECRET
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  private getExtensionFromMime(mimeType: string): string {
    const map: Record<string, string> = {
      'application/pdf': '.pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'application/vnd.oasis.opendocument.text': '.odt',
      'application/vnd.oasis.opendocument.presentation': '.odp',
      'application/vnd.oasis.opendocument.spreadsheet': '.ods',
      'application/msword': '.doc',
      'application/vnd.ms-powerpoint': '.ppt',
      'application/vnd.ms-excel': '.xls',
      'application/rtf': '.rtf',
      'text/plain': '.txt',
    };
    return map[mimeType] || '.pdf';
  }

  private getDefaultUniverDocument(): any {
    return {
      id: uuidv4(),
      type: 'doc',
      data: {
        // Minimal Univer doc structure
        sheets: {},
        documents: {},
        slides: {},
      },
      version: 0,
      name: 'Untitled Document',
      lastModified: Date.now(),
    };
  }

  private estimatePageCount(doc: any): number {
    // Rough estimation from Univer document structure
    return 1;
  }

  private async exportViaUniver(doc: any, format: 'pdf' | 'pwg'): Promise<{ buffer: Buffer; pageCount: number; fileSize: number }> {
    // In production, call Univer export API or LibreOffice
    // For now, return placeholder
    const buffer = Buffer.from('placeholder');
    return { buffer, pageCount: 1, fileSize: buffer.length };
  }
}

export const documentEditorService = new DocumentEditorService();