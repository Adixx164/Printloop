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
    WALLET: "/wallet",
    STATIONS: "/stations",
    SETTINGS: "/settings",
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
