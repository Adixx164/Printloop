/**
 * Editor Types
 * Extracted from printloop-new-frontend/src/types/editor.ts
 */

export type EditorRole = 'shop' | 'customer';
export type EditorPermission = 'rw' | 'r' | 'none';

export interface EditorPermissions {
  shop: EditorPermission;
  customer: EditorPermission;
}

export interface UniverDocument {
  id: string;
  type: 'doc' | 'sheet' | 'slide';
  data: any;
  version: number;
  name?: string;
  lastModified: number;
}

export type EditorSessionStatus = 'active' | 'expired' | 'completed' | 'abandoned' | 'in_progress' | 'pending_customer' | 'approved' | 'awaiting_payment';
export type ConversionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface WebRTCSignalingData {
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  iceCandidates?: RTCIceCandidateInit[];
}

export interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface RTCSessionDescriptionInit {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

export interface RTCIceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
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
  documentEdit?: {
    printJob?: {
      code: string;
      totalPages: number;
      printConfiguration?: {
        paper: string;
        color: string;
        qualityDpi: number;
      };
      editingInstructions: string;
    };
  };
  shopNotes?: string;
}

export interface CreateSessionRequest {
  documentEditId: string;
  sourceDocumentUrl: string;
  mimeType: string;
  shopUserId: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  token: string;
  editorUrl: string;
  univerDocument: UniverDocument;
  permissions: EditorPermissions;
  expiresAt: Date;
  iceServers: RTCIceServer[];
}

export interface GetSessionResponse {
  session: EditorSession;
  univerDocument: UniverDocument;
  permissions: EditorPermissions;
  role: EditorRole;
  iceServers: RTCIceServer[];
}

export interface SaveSnapshotRequest {
  snapshot: any;
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

export interface ApproveEditRequest {}
export interface ApproveEditResponse {
  paymentUrl: string;
  amount: number;
  reference: string;
}
export interface RejectEditRequest {
  reason: string;
}
export interface ConversionStatusResponse {
  status: ConversionStatus;
  progress?: number;
  error?: string;
}

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

export interface CommentThread {
  id: string;
  sessionId: string;
  documentId: string;
  pageId: string;
  anchor: {
    startOffset: number;
    endOffset: number;
    segmentId: string;
  };
  comments: Comment[];
  status: 'open' | 'resolved';
  createdBy: string;
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

export interface DocumentVersion {
  id: string;
  sessionId: string;
  version: number;
  snapshot: any;
  label?: string;
  createdBy: string;
  createdAt: Date;
  size: number;
}

export type EditComplexityTier = 'simple' | 'moderate' | 'complex';

export interface EditFeeCalculation {
  baseFee: number;
  perPageFee: number;
  pagesEdited: number;
  complexityTier: EditComplexityTier;
  complexityFee: number;
  shopAdjustment: number;
  shopAdjustmentPct: number;
  total: number;
  currency: 'NGN';
}

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