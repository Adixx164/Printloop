/**
 * Editor Types — shared between backend, frontend, and kiosk app
 * V2-XX — Collaborative document editing for print shops
 */

// ─────────────────────────────────────────────────────────────────────────────
// Core Document Types
// ─────────────────────────────────────────────────────────────────────────────

export type EditorRole = 'shop' | 'customer';

export type EditorPermission = 'rw' | 'r' | 'none';

export interface EditorPermissions {
  shop: EditorPermission;
  customer: EditorPermission;
}

export interface UniverDocument {
  id: string;
  type: 'doc' | 'sheet' | 'slide';
  data: any; // Univer snapshot format
  version: number;
  name?: string;
  lastModified: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session Types
// ─────────────────────────────────────────────────────────────────────────────

export type EditorSessionStatus = 'active' | 'expired' | 'completed' | 'abandoned';

export type ConversionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface WebRTCSignalingData {
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  iceCandidates?: RTCIceCandidateInit[];
}

export interface EditorSession {
  id: string;
  documentEditId: string;
  shopUserId: string | null;
  customerUserId: string | null;
  univerDocument: UniverDocument;
  permissions: EditorPermissions;
  tokenHash: string;
  status: EditorSessionStatus;
  webrtcSignaling: WebRTCSignalingData;
  conversionStatus: ConversionStatus;
  conversionError: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
}

export interface CreateSessionRequest {
  documentEditId: string;
  sourceDocumentUrl: string;
  mimeType: string;
  shopUserId: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  token: string; // JWT for client auth
  editorUrl: string; // Frontend URL with token param
  univerDocument: UniverDocument;
  permissions: EditorPermissions;
  expiresAt: Date;
  iceServers: RTCIceServer[]; // STUN/TURN servers for WebRTC
}

export interface GetSessionResponse {
  session: EditorSession;
  univerDocument: UniverDocument;
  permissions: EditorPermissions;
  role: EditorRole;
  iceServers: RTCIceServer[];
}

export interface SaveSnapshotRequest {
  snapshot: any; // Univer snapshot
  version: number;
}

export interface ExportRequest {
  format: 'pdf' | 'pwg';
}

export interface ExportResponse {
  documentUrl: string;
  pageCount: number;
  fileSize: number;
  format: 'pdf' | 'pwg';
}

export interface ApproveEditRequest {
  // No body needed - uses session auth
}

export interface ApproveEditResponse {
  paymentUrl: string; // Paystack checkout URL
  amount: number; // Amount in kobo
  reference: string;
}

export interface RejectEditRequest {
  reason: string;
}

export interface ConversionStatusResponse {
  status: ConversionStatus;
  progress?: number; // 0-100
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// WebRTC / Collaboration Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'join' | 'leave' | 'awareness';
  sessionId: string;
  fromRole: EditorRole;
  toRole?: EditorRole;
  payload: any;
}

export interface AwarenessState {
  userId: string;
  role: EditorRole;
  userName: string;
  color: string;
  cursor?: { x: number; y: number; page: number };
  selection?: { start: number; end: number; page: number };
  presence: 'editing' | 'viewing' | 'idle';
  lastActive: number;
}

export interface Participant {
  userId: string;
  role: EditorRole;
  userName: string;
  color: string;
  connected: boolean;
  lastSeen: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Comment / Annotation Types (Inline Comments)
// ─────────────────────────────────────────────────────────────────────────────

export interface CommentThread {
  id: string;
  sessionId: string;
  documentId: string;
  pageId: string;
  anchor: {
    // Position in document (Univer-specific)
    startOffset: number;
    endOffset: number;
    segmentId: string;
  };
  comments: Comment[];
  status: 'open' | 'resolved';
  createdBy: string; // userId
  createdAt: Date;
  updatedAt: Date;
}

export interface Comment {
  id: string;
  threadId: string;
  userId: string;
  userName: string;
  role: EditorRole;
  content: string;
  createdAt: Date;
  updatedAt?: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Version History Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DocumentVersion {
  id: string;
  sessionId: string;
  version: number;
  snapshot: any; // Univer snapshot
  label?: string; // e.g., "Before customer review", "v1.0"
  createdBy: string;
  createdAt: Date;
  size: number; // snapshot size in bytes
}

// ─────────────────────────────────────────────────────────────────────────────
// Fee Calculation Types
// ─────────────────────────────────────────────────────────────────────────────

export type EditComplexityTier = 'simple' | 'moderate' | 'complex';

export interface EditFeeCalculation {
  baseFee: number;
  perPageFee: number;
  pagesEdited: number;
  complexityTier: EditComplexityTier;
  complexityFee: number;
  shopAdjustment: number;
  shopAdjustmentPct: number;
  total: number; // in kobo (NGN)
  currency: 'NGN';
}

// ─────────────────────────────────────────────────────────────────────────────
// API Error Types
// ─────────────────────────────────────────────────────────────────────────────

export type EditorErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_EXPIRED'
  | 'SESSION_INACTIVE'
  | 'UNAUTHORIZED_ROLE'
  | 'DOCUMENT_CONVERSION_FAILED'
  | 'EXPORT_FAILED'
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_FAILED'
  | 'WEBRTC_CONNECTION_FAILED'
  | 'SNAPSHOT_TOO_LARGE'
  | 'VERSION_CONFLICT'
  | 'INVALID_SNAPSHOT';

export interface EditorError {
  code: EditorErrorCode;
  message: string;
  details?: any;
}