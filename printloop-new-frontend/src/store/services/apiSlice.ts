import { createApi, fetchBaseQuery, BaseQueryFn, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import { CONFIG } from "@/constants/config";
import type { RootState } from "@/store";
import { logOut, setCredentials } from "@/store/features/auth/authSlice";

const rawBase = fetchBaseQuery({
  baseUrl: CONFIG.apiBaseUrl,
  prepareHeaders: (headers, { getState, endpoint }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) headers.set("Authorization", `Bearer ${token}`);

    // Resolve tenant slug from URL or sessionStorage for local development.
    // V2-57: the OPERATOR surfaces (/saas/*, /admin/*) resolve their
    // tenant from the signed-in user — a leftover slug from the student
    // app's shop pick must never leak into them.
    const url = endpoint as string;
    const isOperatorRoute =
      typeof url === "string" && (url.startsWith("saas/") || url.startsWith("admin/"));
    if (!isOperatorRoute) {
      const urlParams = new URLSearchParams(window.location.search);
      let tenantSlug = urlParams.get("tenantSlug");
      if (tenantSlug) {
        sessionStorage.setItem("activeTenantSlug", tenantSlug);
      } else {
        tenantSlug = sessionStorage.getItem("activeTenantSlug");
      }
      if (tenantSlug) {
        headers.set("X-Tenant-Slug", tenantSlug);
      }
    }

    return headers;
  },
});

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extraOptions) => {
  let result = await rawBase(args, api, extraOptions);

  if (result.error && (result.error.status === 401 || result.error.status === 403)) {
    const refreshToken = (api.getState() as RootState).auth.refreshToken;
    if (!refreshToken) {
      api.dispatch(logOut());
      return result;
    }

    const refreshRes = await rawBase(
      { url: "auth/refresh", method: "POST", body: { refreshToken } },
      api,
      extraOptions
    );
    const refreshed: any = refreshRes.data;
    if (refreshed) {
      const payload = refreshed.response || refreshed.data || refreshed;
      api.dispatch(setCredentials(payload));
      result = await rawBase(args, api, extraOptions);
    } else {
      api.dispatch(logOut());
    }
  }
  return result;
};

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    "Auth", "Jobs", "Stations", "GroupSessions", "Pricing",
    "AdminStats", "AdminJobs", "AdminUsers", "AdminKiosks", "AdminPricing",
    "AdminPromotions", "AdminTransactions", "AdminReports", "AdminSettings",
    "AdminAudit", "AdminDisputes", "AdminBlog", "AdminPrinterProfiles",
    // Marketing blog (V2-54)
    "Blog",
    // SaaS tenant admin surface (Phase A — Dimension 15)
    "TenantMe", "TenantBalance", "TenantPayouts", "TenantTransactions",
    // Settings surfaces (V2-17): branding, custom domains, webhooks.
    "TenantBranding", "TenantDomains", "TenantWebhooks",
    // Operator console (V2-39): kiosk fleet + live ops snapshot.
    "TenantKiosks", "TenantOps",
    // Platform admin console (V2-18).
    "PlatformTenants", "ShopDetail",
    // Document Editing Service (V2-XX — Edit & Print feature)
    "TenantEditPricing", "TenantEditQueue", "TenantEditJob",
  ],
  // The pricing matrix is the obvious user-visible reason to enable
  // these: an admin saves a price change → any customer returning to a
  // print page (window focus / network reconnect) refetches and sees
  // the new number, no hard reload required.
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: () => ({}),
});
