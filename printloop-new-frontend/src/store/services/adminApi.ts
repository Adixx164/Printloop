import { apiSlice } from "@/store/services/apiSlice";

/** Build a query string from a params object, skipping empty values. */
function qs(params?: Record<string, any>) {
  const q = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

const unwrap = (r: any) => r?.data ?? r;

export const adminApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // ── Auth ────────────────────────────────────────────────────────────
    adminLogin: builder.mutation<any, { email: string; password: string }>({
      query: (body) => ({ url: "admin/auth/login", method: "POST", body }),
    }),
    getAdminMe: builder.query<any, void>({
      query: () => "admin/auth/me",
      transformResponse: unwrap,
    }),

    // ── Dashboard ───────────────────────────────────────────────────────
    getDashboardStats: builder.query<any, void>({
      query: () => "admin/dashboard/stats",
      transformResponse: unwrap,
      providesTags: ["AdminStats"],
    }),

    // ── Jobs ────────────────────────────────────────────────────────────
    getAdminJobs: builder.query<
      any,
      { status?: string; search?: string; page?: number; limit?: number } | void
    >({
      query: (p) => `admin/jobs${qs(p as any)}`,
      transformResponse: unwrap,
      providesTags: ["AdminJobs"],
    }),
    requeueJob: builder.mutation<any, string>({
      query: (id) => ({ url: `admin/jobs/${id}/requeue`, method: "PATCH" }),
      invalidatesTags: ["AdminJobs", "AdminStats"],
    }),
    updateJobStatus: builder.mutation<any, { id: string; status: string }>({
      query: ({ id, status }) => ({
        url: `admin/jobs/${id}/status`,
        method: "PATCH",
        body: { status },
      }),
      invalidatesTags: ["AdminJobs", "AdminStats"],
    }),

    // ── Users ───────────────────────────────────────────────────────────
    getAdminUsers: builder.query<
      any,
      { search?: string; page?: number; limit?: number } | void
    >({
      query: (p) => `admin/users${qs(p as any)}`,
      transformResponse: unwrap,
      providesTags: ["AdminUsers"],
    }),
    getAdminUser: builder.query<any, string>({
      query: (id) => `admin/users/${id}`,
      transformResponse: unwrap,
      providesTags: ["AdminUsers"],
    }),
    blockUser: builder.mutation<any, { id: string; isBlocked: boolean; reason?: string }>({
      query: ({ id, ...body }) => ({
        url: `admin/users/${id}/block`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["AdminUsers", "AdminStats"],
    }),
    setUserRole: builder.mutation<any, { id: string; role: string }>({
      query: ({ id, role }) => ({
        url: `admin/users/${id}/role`,
        method: "PATCH",
        body: { role },
      }),
      invalidatesTags: ["AdminUsers"],
    }),
    setUserPrivileges: builder.mutation<any, { id: string; privileges: string[] }>({
      query: ({ id, privileges }) => ({
        url: `admin/users/${id}/privileges`,
        method: "PATCH",
        body: { privileges },
      }),
      invalidatesTags: ["AdminUsers"],
    }),

    // ── Pricing ─────────────────────────────────────────────────────────
    getPricing: builder.query<any, void>({
      query: () => "admin/pricing",
      transformResponse: unwrap,
      providesTags: ["AdminPricing"],
    }),
    updatePricingConfig: builder.mutation<any, { id: string; [k: string]: any }>({
      query: ({ id, ...body }) => ({
        url: `admin/pricing/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["AdminPricing"],
    }),
    createPricingConfig: builder.mutation<any, Record<string, any>>({
      query: (body) => ({ url: "admin/pricing", method: "POST", body }),
      invalidatesTags: ["AdminPricing"],
    }),
    deletePricingConfig: builder.mutation<any, string>({
      query: (id) => ({ url: `admin/pricing/${id}`, method: "DELETE" }),
      invalidatesTags: ["AdminPricing"],
    }),

    // ── Promotions ──────────────────────────────────────────────────────
    getPromotions: builder.query<any, void>({
      query: () => "admin/promotions",
      transformResponse: unwrap,
      providesTags: ["AdminPromotions"],
    }),
    createPromotion: builder.mutation<any, any>({
      query: (body) => ({ url: "admin/promotions", method: "POST", body }),
      invalidatesTags: ["AdminPromotions"],
    }),
    updatePromotion: builder.mutation<any, { id: string; [k: string]: any }>({
      query: ({ id, ...body }) => ({
        url: `admin/promotions/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["AdminPromotions"],
    }),

    // ── Transactions & refunds ──────────────────────────────────────────
    getTransactions: builder.query<
      any,
      { status?: string; method?: string; page?: number; limit?: number } | void
    >({
      query: (p) => `admin/transactions${qs(p as any)}`,
      transformResponse: unwrap,
      providesTags: ["AdminTransactions"],
    }),
    issueRefund: builder.mutation<
      any,
      { paymentId: string; amount?: number; reason?: string; refundType?: string }
    >({
      query: (body) => ({ url: "admin/refunds", method: "POST", body }),
      invalidatesTags: ["AdminTransactions", "AdminStats"],
    }),

    // ── Reports ─────────────────────────────────────────────────────────
    getRevenueReport: builder.query<any, { days?: number } | void>({
      query: (p) => `admin/reports/revenue${qs({ days: (p as any)?.days ?? 30 })}`,
      transformResponse: unwrap,
      providesTags: ["AdminReports"],
    }),
    getKioskReport: builder.query<any, void>({
      query: () => "admin/reports/kiosks",
      transformResponse: unwrap,
      providesTags: ["AdminReports"],
    }),

    // ── System settings ─────────────────────────────────────────────────
    getSettings: builder.query<any, void>({
      query: () => "admin/settings",
      transformResponse: unwrap,
      providesTags: ["AdminSettings"],
    }),
    updateSetting: builder.mutation<any, { key: string; value: string | number | boolean }>({
      query: ({ key, value }) => ({
        url: `admin/settings/${key}`,
        method: "PATCH",
        body: { value },
      }),
      invalidatesTags: ["AdminSettings"],
    }),

    // ── Audit log ───────────────────────────────────────────────────────
    getAuditLogs: builder.query<
      any,
      { page?: number; limit?: number; action?: string } | void
    >({
      query: (p) => `admin/audit-logs${qs(p as any)}`,
      transformResponse: unwrap,
      providesTags: ["AdminAudit"],
    }),

    // ── Kiosks (admin-kiosk routes) ─────────────────────────────────────
    getAdminKiosks: builder.query<
      any,
      { status?: string; campus?: string; location?: string } | void
    >({
      query: (p) => `admin/kiosks${qs(p as any)}`,
      transformResponse: unwrap,
      providesTags: ["AdminKiosks"],
    }),
    createKiosk: builder.mutation<any, Record<string, any>>({
      query: (body) => ({ url: "admin/kiosks", method: "POST", body }),
      invalidatesTags: ["AdminKiosks"],
    }),
    updateKiosk: builder.mutation<any, { id: string; [k: string]: any }>({
      query: ({ id, ...body }) => ({ url: `admin/kiosks/${id}`, method: "PATCH", body }),
      invalidatesTags: ["AdminKiosks"],
    }),
    updateKioskStatus: builder.mutation<any, { id: string; status: string }>({
      query: ({ id, status }) => ({
        url: `admin/kiosks/${id}/status`,
        method: "PATCH",
        body: { status },
      }),
      invalidatesTags: ["AdminKiosks"],
    }),
    deleteKiosk: builder.mutation<any, string>({
      query: (id) => ({ url: `admin/kiosks/${id}`, method: "DELETE" }),
      invalidatesTags: ["AdminKiosks"],
    }),
    regenerateKioskKey: builder.mutation<any, string>({
      query: (id) => ({ url: `admin/kiosks/${id}/regenerate-key`, method: "POST" }),
      invalidatesTags: ["AdminKiosks"],
    }),
  }),
});

export const {
  useAdminLoginMutation,
  useGetAdminMeQuery,
  useGetDashboardStatsQuery,
  useGetAdminJobsQuery,
  useRequeueJobMutation,
  useUpdateJobStatusMutation,
  useGetAdminUsersQuery,
  useGetAdminUserQuery,
  useBlockUserMutation,
  useSetUserRoleMutation,
  useSetUserPrivilegesMutation,
  useGetPricingQuery,
  useUpdatePricingConfigMutation,
  useCreatePricingConfigMutation,
  useDeletePricingConfigMutation,
  useGetPromotionsQuery,
  useCreatePromotionMutation,
  useUpdatePromotionMutation,
  useGetTransactionsQuery,
  useIssueRefundMutation,
  useGetRevenueReportQuery,
  useGetKioskReportQuery,
  useGetSettingsQuery,
  useUpdateSettingMutation,
  useGetAuditLogsQuery,
  useGetAdminKiosksQuery,
  useCreateKioskMutation,
  useUpdateKioskMutation,
  useUpdateKioskStatusMutation,
  useDeleteKioskMutation,
  useRegenerateKioskKeyMutation,
} = adminApi;
