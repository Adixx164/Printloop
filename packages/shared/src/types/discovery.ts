/**
 * Discovery & Marketplace Types
 * Extracted from printloop-new-frontend/src/store/services/discoveryApi.ts
 */

export interface PublicShop {
  id: string;
  slug: string;
  name: string;
  status: "trial" | "active" | "suspended" | "closed";
  address: string | null;
  lat: number | null;
  lng: number | null;
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

export interface ShopReviewPayload {
  slug: string;
  rating: number;
  comment?: string;
  photoUrl?: string;
}

export interface ShopReviewResponse {
  id: string;
  rating: number;
  comment: string | null;
  photoUrl: string | null;
  createdAt: string;
  user: {
    firstName: string;
    lastName: string;
  };
}

export interface MintHandoffPayload {
  slug: string;
  email?: string;
}

export interface VerifyHandoffPayload {
  token: string;
}