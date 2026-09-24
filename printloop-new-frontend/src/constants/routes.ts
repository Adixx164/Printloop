export const ROUTES = {
  ROOT: "/",
  AUTH: {
    LOGIN: "/auth/login",
    REGISTER: "/auth/register",
    VERIFY_EMAIL: "/auth/verify-email",
    FORGOT_PASSWORD: "/auth/forgot-password",
  },
  APP: {
    DASHBOARD: "/dashboard",
    NEW_PRINT: "/print/new",
    BATCH_PRINT: "/print/batch",
    GROUP_PRINT: "/groups",
    PRINT_JOBS: "/jobs",
    EDIT_REVIEW: "/jobs/:jobId/edit-review",
    STATIONS: "/stations",
    SETTINGS: "/settings",
  },
  SAAS: {
    DASHBOARD: "/saas/dashboard",
    QUEUE: "/saas/queue",
    EDIT_QUEUE: "/saas/edit-queue",
    EDIT_WORKSPACE: "/saas/editor/:sessionId",
    OPERATOR: "/saas/operator",
    TRANSACTIONS: "/saas/transactions",
    PAYOUTS: "/saas/payouts",
    SETUP_SUBACCOUNT: "/saas/setup/subaccount",
    SETUP_BANK: "/saas/setup/bank-account",
    OPERATOR_PRINTERS: "/saas/operator/printers",
  },
  ADMIN: {
    HOME: "/admin",
    LOGIN: "/admin/login",
  },
  KIOSK: {
    HOME: "/kiosk",
    CODE: "/kiosk/code",
  },
} as const;
