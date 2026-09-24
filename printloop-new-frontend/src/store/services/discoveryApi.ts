import { apiSlice } from "./apiSlice";

/**
 * Marketplace discovery (V2-30) — the customer-facing surface that
 * lets a student walk into `/find`, give us their location, and see
 * the nearest print shops. Backend: routes/discovery.routes.ts.
 *
 * All three endpoints are anonymous — no Authorization header. The
 * apiSlice's prepareHeaders adds Authorization only when a token
 * exists, so anonymous use is a no-op.
 */

export interface PublicShop {
  id: string;
  slug: string;
  name: string;
  status: "trial" | "active" | "suspended" | "closed";
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** Only present when origin lat/lng supplied to the query. */
  distanceKm?: number;
  agentOnline: boolean;
  brand: {
    wordmark: string | null;
    primaryColor: string | null;
    logoUrl: string | null;
  };
  cheapestPerPage: number | null;
  hasColor: boolean;
  paperSizes: Array<"A4" | "A3">;
  queueLength: number;
  estimatedWaitMin: number;
  ratingAverage: number;
  ratingCount: number;
  photos: string[];
}

export interface NearbyResponse {
  origin: { lat: number; lng: number };
  radiusKm: number;
  count: number;
  shops: PublicShop[];
}

export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  photoUrl?: string | null;
  createdAt: string;
  user: {
    firstName: string;
    lastName: string;
  };
}

export interface ShopDetailResponse {
  shop: PublicShop;
  pricing: Array<{
    paperSize: "A4" | "A3";
    colorType: "bw" | "color";
    price100Simplex: number;
    price300Simplex: number;
    price600Simplex: number;
    price100Duplex: number;
    price300Duplex: number;
    price600Duplex: number;
  }>;
  reviews: Review[];
}

export interface HandoffMintResponse {
  token: string;
  expiresIn: number;
}

export interface HandoffVerifyResponse {
  tenantSlug: string;
  email: string | null;
  expiresAt: string | null;
}

export const discoveryApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Nearby — requires lat + lng. radius (km) and limit are
     * server-clamped (max 50 / 50).
     */
    listNearbyShops: builder.query<
      NearbyResponse,
      { lat: number; lng: number; radius?: number; limit?: number }
    >({
      query: ({ lat, lng, radius = 10, limit = 20 }) =>
        `discovery/shops/nearby?lat=${lat}&lng=${lng}&radius=${radius}&limit=${limit}`,
      transformResponse: (r: { data: NearbyResponse }) => r.data,
    }),

    /**
     * No-location fallback — alphabetical list of discoverable shops.
     * Renders while the geolocation prompt is pending or denied so
     * the page never sits empty.
     */
    listAllShops: builder.query<{ count: number; shops: PublicShop[] }, void>({
      query: () => `discovery/shops`,
      transformResponse: (
        r: { data: { count: number; shops: PublicShop[] } },
      ) => r.data,
    }),

    /**
     * Mint a short-lived handoff token (V2-32) so the customer can
     * jump from /find/:slug into the tenant's portal without
     * re-entering their email.
     */
    mintHandoff: builder.mutation<
      HandoffMintResponse,
      { slug: string; email?: string }
    >({
      query: (body) => ({
        url: "discovery/handoff",
        method: "POST",
        body,
      }),
      transformResponse: (r: { data: HandoffMintResponse }) => r.data,
    }),
    /**
     * Verify a handoff token on landing in the tenant portal. The
     * tenant frontend reads ?handoff= from the URL and calls this
     * to pre-fill the login form.
     */
    verifyHandoff: builder.query<HandoffVerifyResponse, { token: string }>({
      query: ({ token }) =>
        `discovery/handoff/verify?token=${encodeURIComponent(token)}`,
      transformResponse: (r: { data: HandoffVerifyResponse }) => r.data,
    }),

    getShopDetail: builder.query<
      ShopDetailResponse,
      { slug: string; lat?: number; lng?: number }
    >({
      query: ({ slug, lat, lng }) => {
        const params =
          lat != null && lng != null
            ? `?lat=${lat}&lng=${lng}`
            : "";
        return `discovery/shops/${slug}${params}`;
      },
      providesTags: (result, error, arg) => [{ type: "ShopDetail" as const, id: arg.slug }],
      transformResponse: (r: { data: ShopDetailResponse }) => r.data,
    }),

    submitShopReview: builder.mutation<
      any,
      { slug: string; rating: number; comment?: string; photoUrl?: string }
    >({
      query: ({ slug, ...body }) => ({
        url: `customer/shops/${slug}/reviews`,
        method: "POST",
        body,
      }),
      invalidatesTags: (result, error, arg) => [{ type: "ShopDetail" as const, id: arg.slug }],
    }),
  }),
});

export const {
  useListNearbyShopsQuery,
  useListAllShopsQuery,
  useGetShopDetailQuery,
  useMintHandoffMutation,
  useVerifyHandoffQuery,
  useSubmitShopReviewMutation,
} = discoveryApi;
