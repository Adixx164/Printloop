/**
 * SaaS Tenant Admin Types
 * Extracted from printloop-new-frontend/src/store/services/saasApi.ts
 */

export interface TenantMeResponse {
  id: string;
  name: string;
  slug: string;
  status: "trial" | "active" | "suspended" | "closed";
  commissionPct: number;
  customDomain: string | null;
  onboarding: {
    subaccountSet: boolean;
    bankAccountSet: boolean;
    brandingSet?: boolean;
    locationSet?: boolean;
  };
  isDiscoverable?: boolean;
  address?: string | null;
  availability: "open" | "busy" | "closed";
  payoutSchedule: {
    cadence: "daily" | "weekly" | "manual";
    dayOfWeek: number;
    minPayoutAmount: number;
    accountName: string | null;
    accountNumber: string | null;
    bankCode: string | null;
  } | null;
}

export interface TenantBalanceResponse {
  currency: string;
  availableBalance: number;
  pendingPayout: number;
  lifetimeCommissionPaidToPlatform: number;
  commissionPct: number;
}

export interface PayoutRow {
  id: string;
  amount: number;
  feeAmount: number;
  currency: string;
  status: "pending" | "processing" | "paid" | "failed" | "cancelled";
  trigger: "scheduled" | "instant" | "manual";
  reference: string | null;
  failureReason: string | null;
  requestedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface TransactionRow {
  id: string;
  type: "topup" | "print" | "refund" | "credit";
  amount: number;
  commissionAmount: number;
  description: string;
  balanceAfter: number;
  reference: string | null;
  createdAt: string;
}

interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface SignupPayload {
  businessName: string;
  slug: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPhone: string;
  ownerPassword: string;
}

export interface SignupResponse {
  tenantId: string;
  tenantSlug: string;
  ownerUserId: string;
  ownerEmail: string;
  loginUrl: string;
}

export interface TenantBranding {
  tenantId: string;
  wordmark: string | null;
  tagline: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  emailFromName: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
}

export type BrandingPatch = Partial<Omit<TenantBranding, "tenantId">>;

export type DomainStatus = "pending" | "verified" | "failed";

export interface TenantDomain {
  id: string;
  tenantId: string;
  domain: string;
  status: DomainStatus;
  verificationToken: string;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  lastCheckError: string | null;
  createdAt: string;
}

export interface DomainClaimResponse {
  id: string;
  domain: string;
  status: DomainStatus;
  dns: {
    txt: { name: string; value: string };
    cname: { name: string; value: string };
  };
}

export type WebhookEventName =
  | "job.completed"
  | "job.failed"
  | "customer.signed_up"
  | "payout.paid";

export type DocumentEditStatus =
  | "pending_shop"
  | "in_progress"
  | "pending_customer"
  | "approved"
  | "rejected"
  | "completed";

export interface EditPricingConfig {
  id: string;
  tenantId: string;
  baseFee: number;
  perPageFee: number;
  complexityTierFees: Record<string, number>;
  maxShopAdjustmentPct: number;
  editingEnabled: boolean;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankName: string | null;
  bankSortCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentEdit {
  id: string;
  printJobId: string;
  shopId: string;
  editedBy: string;
  editOperations: any[];
  originalDocumentMeta: {
    pageCount: number;
    fileSize: number;
    fileName: string;
  } | null;
  editedDocumentMeta: {
    pageCount: number;
    fileSize: number;
  } | null;
  baseEditFee: number;
  perPageFee: number;
  complexityFee: number;
  shopAdjustedFee: number;
  totalEditFee: number;
  status: DocumentEditStatus;
  shopNotes: string | null;
  customerRejectionReason: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  printJob: {
    id: string;
    code: string;
    status: string;
    documentUrl: string | null;
    editedDocumentUrl: string | null;
    editingInstructions: string | null;
    totalPages: number;
    printConfiguration: any;
  } | null;
  bankDetails?: {
    accountName: string | null;
    accountNumber: string | null;
    bankName: string | null;
    sortCode: string | null;
  };
}

export interface TenantWebhook {
  id: string;
  tenantId: string;
  name: string;
  url: string;
  secret: string;
  events: WebhookEventName[];
  isActive: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  createdAt: string;
}

export interface OperatorKiosk {
  id: string;
  name: string;
  location: string | null;
  printerName: string | null;
  status: string;
  online: boolean;
  lastSeenAt: string | null;
  testPrintPassedAt: string | null;
  totalJobsPrinted: number;
  capColor?: boolean | null;
  capDuplex?: boolean | null;
  capA3?: boolean | null;
  capUpdatedAt?: string | null;
}

export interface OpsSummary {
  kiosks: OperatorKiosk[];
  kioskCount: number;
  onlineCount: number;
  jobsToday: number;
  activeJobs: number;
  stuckRenders: number;
  revenueTodayGross: number;
  commissionTodayPaid: number;
  liveGate: {
    locationSet: boolean;
    statusActive: boolean;
    testPrintDone: boolean;
    kioskOnline: boolean;
    isDiscoverable: boolean;
  };
  liveGateMet: boolean;
}

export interface LmsStatus {
  keySet: boolean;
}

export interface LmsKeyResponse {
  key: string;
  url: string;
  urlWithEmail: string;
}

export interface EditQueueItem {
  items: DocumentEdit[];
}

export interface EditQueueFilters {
  status?: DocumentEditStatus;
  limit?: number;
}

export interface StartEditResponse {
  editId: string;
  status: DocumentEditStatus;
  editorUrl?: string;
}

export interface UploadEditedDocumentPayload {
  jobId: string;
  documentUrl: string;
  pageCount: number;
  fileSize: number;
  editOperations: any[];
  shopNotes?: string;
}

export interface CompleteEditResponse {
  editId: string;
  status: DocumentEditStatus;
  documentUrl?: string;
}

export interface ConfirmEditResponse {
  editId: string;
  status: DocumentEditStatus;
  printJobStatus: string;
}

export interface RejectEditPayload {
  jobId: string;
  reason?: string;
}

export interface ConfirmEditPaymentResponse {
  editId: string;
  status: DocumentEditStatus;
  printJobStatus: string;
}

export interface EditJobDetail {
  editId: string;
  status: DocumentEditStatus;
  printJob: {
    id: string;
    code: string;
    status: string;
    documentUrl: string | null;
    editedDocumentUrl: string | null;
    editingInstructions: string | null;
    totalPages: number;
    printConfiguration: any;
  } | null;
}