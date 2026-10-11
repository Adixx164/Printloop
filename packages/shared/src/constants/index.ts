/**
 * Shared Constants
 */

// API Routes
export const API_ROUTES = {
  // Auth
  AUTH: {
    REGISTER: 'customer/auth/register',
    LOGIN: 'customer/auth/login',
    VERIFY_EMAIL: 'auth/verify-email',
    RESEND_VERIFICATION: 'auth/send-verification-email',
    FORGOT_PASSWORD: 'auth/forgot-password',
    ME: 'customer/auth/me',
    PASSWORD: 'customer/auth/password',
    REFRESH: 'auth/refresh',
  },
  
  // Jobs
  JOBS: {
    LIST: 'customer/print-jobs',
    CREATE: 'customer/print-jobs',
    BATCH: 'customer/print-jobs/batch',
    PAYMENT: 'payments/initialize-job-payment',
    UPLOAD_FILE: 'files/upload',
    DISPUTE: 'customer/disputes',
  },
  
  // Discovery
  DISCOVERY: {
    NEARBY: 'discovery/shops/nearby',
    ALL: 'discovery/shops',
    DETAIL: (slug: string) => `discovery/shops/${slug}`,
    HANDOFF: 'discovery/handoff',
    HANDOFF_VERIFY: 'discovery/handoff/verify',
    REVIEW: (slug: string) => `customer/shops/${slug}/reviews`,
  },
  
  // Stations
  STATIONS: {
    LIST: 'customer/stations',
  },
  
  // Kiosk
  KIOSK: {
    RELEASE: 'kiosk/release',
  },
  
  // Groups
  GROUPS: {
    LIST: 'groups',
    CREATE: 'groups',
    DETAIL: (id: string) => `groups/${id}`,
    CLOSE: (id: string) => `groups/${id}/close`,
  },
  
  // SaaS
  SAAS: {
    SIGNUP: 'saas/signup',
    CHECK_SLUG: 'saas/check-slug',
    VERIFY_EMAIL: 'saas/verify-email',
    RESEND_VERIFICATION: 'saas/resend-verification',
    ME: 'saas/me',
    AVAILABILITY: 'saas/me/availability',
    BALANCE: 'saas/balance',
    PAYOUTS: 'saas/payouts',
    PAYOUTS_INSTANT: 'saas/payouts/instant',
    TRANSACTIONS: 'saas/transactions',
    PAYSTACK_SUBACCOUNT: 'saas/setup/paystack-subaccount',
    BANK_ACCOUNT: 'saas/setup/bank-account',
    SETUP_2FA: 'saas/me/2fa/setup',
    ENABLE_2FA: 'saas/me/2fa/enable',
    DISABLE_2FA: 'saas/me/2fa/disable',
    BRANDING: 'saas/me/branding',
    DOMAINS: 'saas/me/domains',
    DOMAIN_VERIFY: (id: string) => `saas/me/domains/${id}/verify`,
    WEBHOOKS: 'saas/me/webhooks',
    CLOSE: 'saas/me',
    OPS_SUMMARY: 'saas/ops/summary',
    KIOSKS: 'saas/kiosks',
    KIOSK_STATUS: (id: string) => `saas/kiosks/${id}/status`,
    KIOSK_REGENERATE_KEY: (id: string) => `saas/kiosks/${id}/regenerate-key`,
    KIOSK_TEST_PRINT: (id: string) => `saas/kiosks/${id}/test-print`,
    KIOSK_DELETE: (id: string) => `saas/kiosks/${id}`,
    DISCOVERABLE: 'saas/me/location',
    LMS_STATUS: 'saas/me/lms',
    LMS_REGENERATE: 'saas/me/lms/regenerate',
    EDIT_PRICING: 'saas/edit-pricing',
    EDIT_QUEUE: 'saas/edit-queue',
    EDIT_START: (jobId: string) => `saas/edit/${jobId}/start`,
    EDIT_UPLOAD: (jobId: string) => `saas/edit/${jobId}/upload`,
    EDIT_COMPLETE: (jobId: string) => `saas/edit/${jobId}/complete`,
    EDIT_CONFIRM: (jobId: string) => `saas/edit/${jobId}/confirm`,
    EDIT_REJECT: (jobId: string) => `saas/edit/${jobId}/reject`,
    EDIT_CONFIRM_PAYMENT: (jobId: string) => `saas/edit/${jobId}/confirm-payment`,
    EDIT_JOB: (jobId: string) => `saas/edit/${jobId}`,
  },
  
  // Pricing
  PRICING: {
    GET: 'pricing',
  },
} as const;

// App Configuration
export const APP_CONFIG = {
  name: 'PrintLoop',
  version: '1.0.0',
  apiBaseUrl: typeof window !== 'undefined' 
    ? ((window as any).__VITE_API_URL || '/api')
    : process.env.API_BASE_URL || 'http://localhost:4000/api',
} as const;

// Tenant Status
export const TENANT_STATUS = {
  TRIAL: 'trial',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  CLOSED: 'closed',
} as const;

export type TenantStatus = typeof TENANT_STATUS[keyof typeof TENANT_STATUS];

// Availability
export const AVAILABILITY = {
  OPEN: 'open',
  BUSY: 'busy',
  CLOSED: 'closed',
} as const;

export type Availability = typeof AVAILABILITY[keyof typeof AVAILABILITY];

// Print Job Status
export const PRINT_JOB_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  RENDERING: 'rendering',
  READY: 'ready',
  PRINTING: 'printing',
  COMPLETED: 'completed',
  COLLECTED: 'collected',
  FAILED: 'failed',
  DISPUTED: 'disputed',
  REFUNDED: 'refunded',
  AWAITING_ACCEPT: 'awaiting_accept',
} as const;

export type PrintJobStatus = typeof PRINT_JOB_STATUS[keyof typeof PRINT_JOB_STATUS];

// Payout Status
export const PAYOUT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  PAID: 'paid',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type PayoutStatus = typeof PAYOUT_STATUS[keyof typeof PAYOUT_STATUS];

// Payout Trigger
export const PAYOUT_TRIGGER = {
  SCHEDULED: 'scheduled',
  INSTANT: 'instant',
  MANUAL: 'manual',
} as const;

export type PayoutTrigger = typeof PAYOUT_TRIGGER[keyof typeof PAYOUT_TRIGGER];

// Transaction Types
export const TRANSACTION_TYPE = {
  TOPUP: 'topup',
  PRINT: 'print',
  REFUND: 'refund',
  CREDIT: 'credit',
} as const;

export type TransactionType = typeof TRANSACTION_TYPE[keyof typeof TRANSACTION_TYPE];

// Webhook Events
export const WEBHOOK_EVENTS = {
  JOB_COMPLETED: 'job.completed',
  JOB_FAILED: 'job.failed',
  CUSTOMER_SIGNED_UP: 'customer.signed_up',
  PAYOUT_PAID: 'payout.paid',
} as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[keyof typeof WEBHOOK_EVENTS];

// Domain Status
export const DOMAIN_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  FAILED: 'failed',
} as const;

export type DomainStatus = typeof DOMAIN_STATUS[keyof typeof DOMAIN_STATUS];

// Document Edit Status
export const DOCUMENT_EDIT_STATUS = {
  PENDING_SHOP: 'pending_shop',
  IN_PROGRESS: 'in_progress',
  PENDING_CUSTOMER: 'pending_customer',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
} as const;

export type DocumentEditStatus = typeof DOCUMENT_EDIT_STATUS[keyof typeof DOCUMENT_EDIT_STATUS];

// Kiosk Status
export const KIOSK_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  BUSY: 'busy',
  ERROR: 'error',
} as const;

export type KioskStatus = typeof KIOSK_STATUS[keyof typeof KIOSK_STATUS];

// Paper Sizes
export const PAPER_SIZES = {
  A4: 'A4',
  A3: 'A3',
} as const;

export type PaperSize = typeof PAPER_SIZES[keyof typeof PAPER_SIZES];

// Color Types
export const COLOR_TYPES = {
  BW: 'bw',
  COLOR: 'color',
} as const;

export type ColorType = typeof COLOR_TYPES[keyof typeof COLOR_TYPES];

// DPI Options
export const DPI_OPTIONS = {
  DPI_100: 100,
  DPI_300: 300,
  DPI_600: 600,
} as const;

export type Dpi = typeof DPI_OPTIONS[keyof typeof DPI_OPTIONS];

// Sides
export const SIDES = {
  SIMPLEX: 'simplex',
  DUPLEX: 'duplex',
} as const;

export type Sides = typeof SIDES[keyof typeof SIDES];

// User Roles
export const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

// Editor Roles
export const EDITOR_ROLES = {
  SHOP: 'shop',
  CUSTOMER: 'customer',
} as const;

export type EditorRole = typeof EDITOR_ROLES[keyof typeof EDITOR_ROLES];

// Editor Session Status
export const EDITOR_SESSION_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
  IN_PROGRESS: 'in_progress',
  PENDING_CUSTOMER: 'pending_customer',
  APPROVED: 'approved',
  AWAITING_PAYMENT: 'awaiting_payment',
} as const;

export type EditorSessionStatus = typeof EDITOR_SESSION_STATUS[keyof typeof EDITOR_SESSION_STATUS];

// Conversion Status
export const CONVERSION_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type ConversionStatus = typeof CONVERSION_STATUS[keyof typeof CONVERSION_STATUS];

// Deep Link Schemes
export const DEEP_LINKS = {
  OPERATOR: 'printloop-operator://',
  CUSTOMER: 'printloop://',
  KIOSK: 'printloop-kiosk://',
} as const;

// Notification Categories
export const NOTIFICATION_CATEGORIES = {
  PRINT_JOB_ACTIONS: 'PRINT_JOB_ACTIONS',
  PAYOUT: 'PAYOUT',
  CHAT: 'CHAT',
  SYSTEM: 'SYSTEM',
} as const;

// Storage Keys
export const STORAGE_KEYS = {
  AUTH: 'pl_auth',
  TENANT_SLUG: 'activeTenantSlug',
  THEME: 'theme',
  LANGUAGE: 'language',
} as const;

// Pagination
export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 50,
} as const;

// Timeouts
export const TIMEOUTS = {
  API_REQUEST: 30000,
  PAYMENT_POLLING: 5000,
  ACCEPT_WINDOW: 120000, // 2 minutes
  SOCKET_RECONNECT: 5000,
} as const;

// Regex Patterns
export const REGEX = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE_NG: /^(\+234|234|0)[789][01]\d{8}$/,
  SLUG: /^[a-z0-9-]{3,30}$/,
  URL: /^https?:\/\/.+/,
} as const;

// Date Formats
export const DATE_FORMATS = {
  SHORT: 'MMM d, yyyy',
  LONG: 'MMMM d, yyyy',
  TIME: 'h:mm a',
  DATETIME: 'MMM d, yyyy h:mm a',
  ISO: "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
} as const;

// Currency
export const CURRENCY = {
  CODE: 'NGN',
  SYMBOL: '₦',
  LOCALE: 'en-NG',
} as const;

// Default Pricing (NGN per page)
export const DEFAULT_PRICING = {
  A4: {
    bw: { simplex: 5, duplex: 8 },
    color: { simplex: 25, duplex: 40 },
  },
  A3: {
    bw: { simplex: 10, duplex: 16 },
    color: { simplex: 50, duplex: 80 },
  },
} as const;