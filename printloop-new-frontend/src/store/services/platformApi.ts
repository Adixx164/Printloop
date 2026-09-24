import { apiSlice } from "./apiSlice";

/**
 * RTK Query bindings for the platform admin console
 * (`/api/platform/*` — SUPER_ADMIN only; see
 * 01-backend/routes/platform.routes.ts).
 */

export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  status: "trial" | "active" | "suspended" | "closed";
  commissionPct: number;
  customDomain: string | null;
  paystackSubaccountCode: string | null;
  suspendedAt: string | null;
  suspendReason: string | null;
  createdAt: string;
}

interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ImpersonateResponse {
  token: string;
  ttlSeconds: number;
  tenant: { id: string; slug: string; name: string };
}

export const platformApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listTenants: builder.query<
      Paginated<PlatformTenant>,
      { status?: string; limit?: number; before?: string } | void
    >({
      query: (args) => {
        const p = new URLSearchParams();
        if (args && (args as any).status) p.set("status", (args as any).status);
        if (args && (args as any).limit) p.set("limit", String((args as any).limit));
        if (args && (args as any).before) p.set("before", String((args as any).before));
        const qs = p.toString();
        return `platform/tenants${qs ? `?${qs}` : ""}`;
      },
      transformResponse: (r: { data: Paginated<PlatformTenant> }) => r.data,
      providesTags: ["PlatformTenants"],
    }),
    suspendTenant: builder.mutation<unknown, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({
        url: `platform/tenants/${id}/suspend`,
        method: "POST",
        body: { reason },
      }),
      invalidatesTags: ["PlatformTenants"],
    }),
    reactivateTenant: builder.mutation<unknown, { id: string }>({
      query: ({ id }) => ({
        url: `platform/tenants/${id}/reactivate`,
        method: "POST",
      }),
      invalidatesTags: ["PlatformTenants"],
    }),
    impersonateTenant: builder.mutation<
      ImpersonateResponse,
      { id: string; ttl?: number }
    >({
      query: ({ id, ttl }) => ({
        url: `platform/tenants/${id}/impersonate${ttl ? `?ttl=${ttl}` : ""}`,
        method: "POST",
      }),
      transformResponse: (r: { data: ImpersonateResponse }) => r.data,
    }),
    hardDeleteTenant: builder.mutation<unknown, { id: string; force?: boolean }>({
      query: ({ id, force }) => ({
        url: `platform/tenants/${id}${force ? "?force=true" : ""}`,
        method: "DELETE",
      }),
      invalidatesTags: ["PlatformTenants"],
    }),
  }),
});

export const {
  useListTenantsQuery,
  useSuspendTenantMutation,
  useReactivateTenantMutation,
  useImpersonateTenantMutation,
  useHardDeleteTenantMutation,
} = platformApi;
