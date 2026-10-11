/**
 * Operator API - RTK Query hooks for operator features
 * Shared between desktop and mobile apps
 */

import { createApi, fetchBaseQuery, BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react';

// Type imports
import type {
  TenantMeResponse,
  TenantBalanceResponse,
  PayoutRow,
  TransactionRow,
  SignupPayload,
  SignupResponse,
  TenantBranding,
  BrandingPatch,
  TenantDomain,
  DomainClaimResponse,
  TenantWebhook,
  WebhookEventName,
  OperatorKiosk,
  OpsSummary,
  LmsStatus,
  LmsKeyResponse,
  EditPricingConfig,
  DocumentEdit,
  DocumentEditStatus,
  EditQueueFilters,
  StartEditResponse,
  UploadEditedDocumentPayload,
  CompleteEditResponse,
  ConfirmEditResponse,
  RejectEditPayload,
  ConfirmEditPaymentResponse,
  EditJobDetail,
} from '../types/saas';

import type {
  PublicShop,
  NearbyResponse,
  ShopDetailResponse,
  Review,
} from '../types/discovery';

import type {
  PrintJob,
  InitializeJobPaymentResponse,
} from '../types/jobs';

import type { Station } from '../types/stations';

// API Base URL - will be injected by consuming app
const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return (window as any).__VITE_API_URL || '/api';
  }
  return process.env.API_BASE_URL || 'http://localhost:4000/api';
};

// Create base query with auth and tenant resolution
const createBaseQuery = (getToken: () => string | null, getTenantSlug: () => string | null) => {
  return fetchBaseQuery({
    baseUrl: getApiBaseUrl(),
    prepareHeaders: (headers, { endpoint }) => {
      const token = getToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);

      // Resolve tenant slug for operator routes
      const url = endpoint as string;
      const isOperatorRoute = typeof url === 'string' && (url.startsWith('saas/') || url.startsWith('admin/'));
      
      if (!isOperatorRoute) {
        const tenantSlug = getTenantSlug();
        if (tenantSlug) {
          headers.set('X-Tenant-Slug', tenantSlug);
        }
      }

      return headers;
    },
  });
};

// Base query with re-auth
const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extraOptions) => {
  // This will be properly implemented by the consuming app
  // For now, return a minimal implementation
  return { error: { status: 'CUSTOM_ERROR', error: 'Not configured - use consuming app store' } };
};

// Operator API slice
export const operatorApi = createApi({
  reducerPath: 'operatorApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    'TenantMe', 'TenantBalance', 'TenantPayouts', 'TenantTransactions',
    'TenantBranding', 'TenantDomains', 'TenantWebhooks',
    'TenantKiosks', 'TenantOps', 'TenantEditPricing', 'TenantEditQueue', 'TenantEditJob',
    'PlatformTenants', 'ShopDetail',
    'Stations', 'Jobs',
  ],
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: (builder) => ({
    // ── Anonymous ──
    signupTenant: builder.mutation<SignupResponse, SignupPayload>({
      query: (body) => ({ url: 'saas/signup', method: 'POST', body }),
    }),
    checkSlug: builder.mutation<{ available: boolean; reason?: string }, { slug: string }>({
      query: (body) => ({ url: 'saas/check-slug', method: 'POST', body }),
    }),
    verifyEmail: builder.mutation<{ verified: boolean; tenantSlug?: string }, { token: string; email?: string }>({
      query: (body) => ({ url: 'saas/verify-email', method: 'POST', body }),
    }),
    resendVerification: builder.mutation<{ success: boolean }, { email: string; tenantSlug?: string }>({
      query: (body) => ({ url: 'saas/resend-verification', method: 'POST', body }),
    }),

    // ── Authenticated ──
    getTenantMe: builder.query<TenantMeResponse, void>({
      query: () => 'saas/me',
      transformResponse: (r: { data: TenantMeResponse }) => r.data,
      providesTags: ['TenantMe'],
    }),
    setTenantAvailability: builder.mutation<
      { availability: 'open' | 'busy' | 'closed' },
      { availability: 'open' | 'busy' | 'closed' }
    >({
      query: (body) => ({ url: 'saas/me/availability', method: 'PATCH', body }),
      invalidatesTags: ['TenantMe'],
    }),
    getTenantBalance: builder.query<TenantBalanceResponse, void>({
      query: () => 'saas/balance',
      transformResponse: (r: { data: TenantBalanceResponse }) => r.data,
      providesTags: ['TenantBalance'],
    }),
    listPayouts: builder.query<{ items: PayoutRow[]; nextCursor: string | null }, { limit?: number; before?: string } | void>({
      query: (args) => {
        const params = new URLSearchParams();
        if (args && (args as any).limit) params.set('limit', String((args as any).limit));
        if (args && (args as any).before) params.set('before', String((args as any).before));
        return `saas/payouts${params.toString() ? `?${params.toString()}` : ''}`;
      },
      transformResponse: (r: { data: { items: PayoutRow[]; nextCursor: string | null } }) => r.data,
      providesTags: ['TenantPayouts'],
    }),
    listTransactions: builder.query<{ items: TransactionRow[]; nextCursor: string | null }, { limit?: number; before?: string } | void>({
      query: (args) => {
        const params = new URLSearchParams();
        if (args && (args as any).limit) params.set('limit', String((args as any).limit));
        if (args && (args as any).before) params.set('before', String((args as any).before));
        return `saas/transactions${params.toString() ? `?${params.toString()}` : ''}`;
      },
      transformResponse: (r: { data: { items: TransactionRow[]; nextCursor: string | null } }) => r.data,
      providesTags: ['TenantTransactions'],
    }),
    requestInstantPayout: builder.mutation<
      { id: string; amount: number; feeAmount: number; status: string; reference: string | null },
      void
    >({
      query: () => ({ url: 'saas/payouts/instant', method: 'POST' }),
      invalidatesTags: ['TenantBalance', 'TenantPayouts'],
    }),
    setupPaystackSubaccount: builder.mutation<
      { subaccountCode: string; accountName: string },
      { businessName: string; settlementBank: string; accountNumber: string; percentageCharge?: number }
    >({
      query: (body) => ({ url: 'saas/setup/paystack-subaccount', method: 'POST', body }),
      invalidatesTags: ['TenantMe'],
    }),
    setupBankAccount: builder.mutation<
      { recipientCode: string; accountName: string; bankCode: string },
      { accountName: string; accountNumber: string; bankCode: string }
    >({
      query: (body) => ({ url: 'saas/setup/bank-account', method: 'POST', body }),
      invalidatesTags: ['TenantMe'],
    }),

    // 2FA
    setup2fa: builder.mutation<{ secret: string; otpauthUrl: string }, void>({
      query: () => ({ url: 'saas/me/2fa/setup', method: 'POST' }),
      transformResponse: (r: { data: { secret: string; otpauthUrl: string } }) => r.data,
    }),
    enable2fa: builder.mutation<{ enabled: boolean }, { code: string }>({
      query: (body) => ({ url: 'saas/me/2fa/enable', method: 'POST', body }),
      transformResponse: (r: { data: { enabled: boolean } }) => r.data,
    }),
    disable2fa: builder.mutation<{ enabled: boolean }, { code: string }>({
      query: (body) => ({ url: 'saas/me/2fa/disable', method: 'POST', body }),
      transformResponse: (r: { data: { enabled: boolean } }) => r.data,
    }),

    // Branding
    getBranding: builder.query<TenantBranding, void>({
      query: () => 'saas/me/branding',
      transformResponse: (r: { data: TenantBranding }) => r.data,
      providesTags: ['TenantBranding'],
    }),
    updateBranding: builder.mutation<TenantBranding, Partial<Omit<TenantBranding, 'tenantId'>>>({
      query: (body) => ({ url: 'saas/me/branding', method: 'PUT', body }),
      transformResponse: (r: { data: TenantBranding }) => r.data,
      invalidatesTags: ['TenantBranding'],
    }),

    // Domains
    listDomains: builder.query<TenantDomain[], void>({
      query: () => 'saas/me/domains',
      transformResponse: (r: { data: TenantDomain[] }) => r.data,
      providesTags: ['TenantDomains'],
    }),
    claimDomain: builder.mutation<DomainClaimResponse, { domain: string }>({
      query: (body) => ({ url: 'saas/me/domains', method: 'POST', body }),
      transformResponse: (r: { data: DomainClaimResponse }) => r.data,
      invalidatesTags: ['TenantDomains'],
    }),
    verifyDomain: builder.mutation<{ verified: boolean }, { id: string }>({
      query: ({ id }) => ({ url: `saas/me/domains/${id}/verify`, method: 'POST' }),
      transformResponse: (r: { data: { verified: boolean } }) => r.data,
      invalidatesTags: ['TenantDomains', 'TenantMe'],
    }),
    deleteDomain: builder.mutation<{ success: boolean }, { id: string }>({
      query: ({ id }) => ({ url: `saas/me/domains/${id}`, method: 'DELETE' }),
      invalidatesTags: ['TenantDomains', 'TenantMe'],
    }),

    // Webhooks
    listWebhooks: builder.query<TenantWebhook[], void>({
      query: () => 'saas/me/webhooks',
      transformResponse: (r: { data: TenantWebhook[] }) => r.data,
      providesTags: ['TenantWebhooks'],
    }),
    createWebhook: builder.mutation<TenantWebhook, { name: string; url: string; events: WebhookEventName[] }>({
      query: (body) => ({ url: 'saas/me/webhooks', method: 'POST', body }),
      transformResponse: (r: { data: TenantWebhook }) => r.data,
      invalidatesTags: ['TenantWebhooks'],
    }),
    updateWebhook: builder.mutation<TenantWebhook, { id: string; name?: string; events?: WebhookEventName[]; isActive?: boolean }>({
      query: ({ id, ...body }) => ({ url: `saas/me/webhooks/${id}`, method: 'PATCH', body }),
      transformResponse: (r: { data: TenantWebhook }) => r.data,
      invalidatesTags: ['TenantWebhooks'],
    }),
    deleteWebhook: builder.mutation<{ success: boolean }, { id: string }>({
      query: ({ id }) => ({ url: `saas/me/webhooks/${id}`, method: 'DELETE' }),
      invalidatesTags: ['TenantWebhooks'],
    }),

    // Account
    closeTenant: builder.mutation<{ id: string; status: string }, { confirmSlug: string; reason?: string }>({
      query: (body) => ({ url: 'saas/me', method: 'DELETE', body }),
      transformResponse: (r: { data: { id: string; status: string } }) => r.data,
      invalidatesTags: ['TenantMe'],
    }),

    // Operator Console
    getOpsSummary: builder.query<OpsSummary, void>({
      query: () => 'saas/ops/summary',
      transformResponse: (r: { data: OpsSummary }) => r.data,
      providesTags: ['TenantOps', 'TenantKiosks'],
    }),

    // Kiosks
    listKiosks: builder.query<OperatorKiosk[], void>({
      query: () => 'saas/kiosks',
      transformResponse: (r: any) => (r?.data?.kiosks ?? r?.data ?? r ?? []) as OperatorKiosk[],
      providesTags: ['TenantKiosks'],
    }),
    createKiosk: builder.mutation<{ id: string; name: string; apiKey: string }, { name: string; location?: string; printerName?: string }>({
      query: (body) => ({ url: 'saas/kiosks', method: 'POST', body }),
      transformResponse: (r: any) => r?.data?.kiosk ?? r?.data ?? r,
      invalidatesTags: ['TenantKiosks', 'TenantOps'],
    }),
    updateKioskStatus: builder.mutation<unknown, { id: string; status: string }>({
      query: ({ id, status }) => ({ url: `saas/kiosks/${id}/status`, method: 'PATCH', body: { status } }),
      invalidatesTags: ['TenantKiosks', 'TenantOps'],
    }),
    regenerateKioskKey: builder.mutation<{ apiKey: string }, { id: string }>({
      query: ({ id }) => ({ url: `saas/kiosks/${id}/regenerate-key`, method: 'POST' }),
      transformResponse: (r: any) => ({ apiKey: r?.data?.apiKey ?? r?.data?.kiosk?.apiKey ?? r?.apiKey }),
      invalidatesTags: ['TenantKiosks'],
    }),
    markKioskTestPrint: builder.mutation<unknown, { id: string }>({
      query: ({ id }) => ({ url: `saas/kiosks/${id}/test-print`, method: 'POST' }),
      invalidatesTags: ['TenantKiosks', 'TenantOps', 'TenantMe'],
    }),
    deleteKiosk: builder.mutation<unknown, { id: string }>({
      query: ({ id }) => ({ url: `saas/kiosks/${id}`, method: 'DELETE' }),
      invalidatesTags: ['TenantKiosks', 'TenantOps'],
    }),

    // Discoverability
    setDiscoverable: builder.mutation<unknown, { isDiscoverable: boolean }>({
      query: (body) => ({ url: 'saas/me/location', method: 'PATCH', body }),
      invalidatesTags: ['TenantMe', 'TenantOps'],
    }),

    // LMS
    getLmsStatus: builder.query<LmsStatus, void>({
      query: () => 'saas/me/lms',
      transformResponse: (r: { data: LmsStatus }) => r.data,
      providesTags: ['TenantMe'],
    }),
    regenerateLmsKey: builder.mutation<LmsKeyResponse, void>({
      query: () => ({ url: 'saas/me/lms/regenerate', method: 'POST' }),
      transformResponse: (r: any) => r?.data ?? r,
      invalidatesTags: ['TenantMe'],
    }),

    // Edit Pricing
    getEditPricing: builder.query<EditPricingConfig, void>({
      query: () => 'saas/edit-pricing',
      transformResponse: (r: { data: EditPricingConfig }) => r.data,
      providesTags: ['TenantEditPricing'],
    }),
    saveEditPricing: builder.mutation<EditPricingConfig, Partial<EditPricingConfig>>({
      query: (body) => ({ url: 'saas/edit-pricing', method: 'POST', body }),
      transformResponse: (r: { data: EditPricingConfig }) => r.data,
      invalidatesTags: ['TenantEditPricing'],
    }),

    // Edit Queue
    listEditQueue: builder.query<{ items: DocumentEdit[] }, EditQueueFilters | void>({
      query: (args) => {
        const params = new URLSearchParams();
        if (args && (args as any).status) params.set('status', (args as any).status);
        if (args && (args as any).limit) params.set('limit', String((args as any).limit));
        return `saas/edit-queue${params.toString() ? `?${params.toString()}` : ''}`;
      },
      transformResponse: (r: { data: { items: DocumentEdit[] } }) => r.data,
      providesTags: ['TenantEditQueue'],
    }),

    // Edit Job Actions
    startEdit: builder.mutation<StartEditResponse, { jobId: string }>({
      query: ({ jobId }) => ({ url: `saas/edit/${jobId}/start`, method: 'POST' }),
      transformResponse: (r: { data: StartEditResponse }) => r.data,
      invalidatesTags: ['TenantEditQueue', 'TenantOps'],
    }),
    uploadEditedDocument: builder.mutation<{ editId: string; status: DocumentEditStatus }, UploadEditedDocumentPayload>({
      query: ({ jobId, ...body }) => ({ url: `saas/edit/${jobId}/upload`, method: 'POST', body }),
      transformResponse: (r: { data: { editId: string; status: DocumentEditStatus } }) => r.data,
      invalidatesTags: ['TenantEditQueue', 'TenantOps'],
    }),
    completeEdit: builder.mutation<CompleteEditResponse, { jobId: string }>({
      query: ({ jobId }) => ({ url: `saas/edit/${jobId}/complete`, method: 'POST' }),
      transformResponse: (r: { data: CompleteEditResponse }) => r.data,
      invalidatesTags: ['TenantEditQueue', 'TenantOps'],
    }),
    confirmEdit: builder.mutation<ConfirmEditResponse, { jobId: string }>({
      query: ({ jobId }) => ({ url: `saas/edit/${jobId}/confirm`, method: 'POST' }),
      transformResponse: (r: { data: ConfirmEditResponse }) => r.data,
      invalidatesTags: ['TenantEditQueue', 'TenantOps'],
    }),
    rejectEdit: builder.mutation<{ editId: string; status: DocumentEditStatus }, RejectEditPayload>({
      query: ({ jobId, ...body }) => ({ url: `saas/edit/${jobId}/reject`, method: 'POST', body }),
      transformResponse: (r: { data: { editId: string; status: DocumentEditStatus } }) => r.data,
      invalidatesTags: ['TenantEditQueue', 'TenantOps'],
    }),
    confirmEditPayment: builder.mutation<ConfirmEditPaymentResponse, { jobId: string }>({
      query: ({ jobId }) => ({ url: `saas/edit/${jobId}/confirm-payment`, method: 'POST' }),
      transformResponse: (r: { data: ConfirmEditPaymentResponse }) => r.data,
      invalidatesTags: ['TenantEditQueue', 'TenantOps'],
    }),
    getEditJob: builder.query<EditJobDetail, { jobId: string }>({
      query: ({ jobId }) => `saas/edit/${jobId}`,
      transformResponse: (r: { data: EditJobDetail }) => r.data,
      providesTags: (result, error, { jobId }) => [{ type: 'TenantEditJob', id: jobId }],
    }),

    // Discovery (for operator marketplace view)
    listNearbyShops: builder.query<NearbyResponse, { lat: number; lng: number; radius?: number; limit?: number }>({
      query: ({ lat, lng, radius = 10, limit = 20 }) => `discovery/shops/nearby?lat=${lat}&lng=${lng}&radius=${radius}&limit=${limit}`,
      transformResponse: (r: { data: NearbyResponse }) => r.data,
    }),
    listAllShops: builder.query<{ count: number; shops: PublicShop[] }, void>({
      query: () => 'discovery/shops',
      transformResponse: (r: { data: { count: number; shops: PublicShop[] } }) => r.data,
    }),
    getShopDetail: builder.query<ShopDetailResponse, { slug: string; lat?: number; lng?: number }>({
      query: ({ slug, lat, lng }) => {
        const params = lat != null && lng != null ? `?lat=${lat}&lng=${lng}` : '';
        return `discovery/shops/${slug}${params}`;
      },
      transformResponse: (r: { data: ShopDetailResponse }) => r.data,
      providesTags: (result, error, arg) => [{ type: 'ShopDetail', id: arg.slug }],
    }),

    // Stations (customer-facing)
    listStations: builder.query<Station[], void>({
      query: () => 'customer/stations',
      transformResponse: (r: any) => r?.response || r?.data || r,
      providesTags: ['Stations'],
    }),

    // Print Jobs
    listJobs: builder.query<PrintJob[], void>({
      query: () => 'customer/print-jobs',
      transformResponse: (r: any) => r?.response || r?.data || r,
      providesTags: ['Jobs'],
    }),
    initializeJobPayment: builder.mutation<InitializeJobPaymentResponse, { jobId: string }>({
      query: (body) => ({ url: 'payments/initialize-job-payment', method: 'POST', body }),
      transformResponse: (r: any) => {
        const unwrapped = r?.response || r?.data || r;
        if (unwrapped?.authorization_url && !unwrapped?.authorizationUrl) {
          return { ...unwrapped, authorizationUrl: unwrapped.authorization_url };
        }
        return unwrapped;
      },
    }),
    releasePrintCode: builder.mutation<any, { code: string; kioskId?: string }>({
      query: (body) => ({ url: 'kiosk/release', method: 'POST', body }),
      invalidatesTags: ['Jobs'],
    }),
  }),
});

// Export hooks
export const {
  useSignupTenantMutation,
  useCheckSlugMutation,
  useVerifyEmailMutation,
  useResendVerificationMutation,
  useGetTenantMeQuery,
  useSetTenantAvailabilityMutation,
  useGetTenantBalanceQuery,
  useListPayoutsQuery,
  useListTransactionsQuery,
  useRequestInstantPayoutMutation,
  useSetupPaystackSubaccountMutation,
  useSetupBankAccountMutation,
  useSetup2faMutation,
  useEnable2faMutation,
  useDisable2faMutation,
  useGetBrandingQuery,
  useUpdateBrandingMutation,
  useListDomainsQuery,
  useClaimDomainMutation,
  useVerifyDomainMutation,
  useDeleteDomainMutation,
  useListWebhooksQuery,
  useCreateWebhookMutation,
  useUpdateWebhookMutation,
  useDeleteWebhookMutation,
  useCloseTenantMutation,
  useGetOpsSummaryQuery,
  useListKiosksQuery,
  useCreateKioskMutation,
  useUpdateKioskStatusMutation,
  useRegenerateKioskKeyMutation,
  useMarkKioskTestPrintMutation,
  useDeleteKioskMutation,
  useSetDiscoverableMutation,
  useGetLmsStatusQuery,
  useRegenerateLmsKeyMutation,
  useGetEditPricingQuery,
  useSaveEditPricingMutation,
  useListEditQueueQuery,
  useStartEditMutation,
  useUploadEditedDocumentMutation,
  useCompleteEditMutation,
  useConfirmEditMutation,
  useRejectEditMutation,
  useConfirmEditPaymentMutation,
  useGetEditJobQuery,
  useListNearbyShopsQuery,
  useListAllShopsQuery,
  useGetShopDetailQuery,
  useListStationsQuery,
  useListJobsQuery,
  useInitializeJobPaymentMutation,
  useReleasePrintCodeMutation,
} = operatorApi;

export default operatorApi;