/**
 * Stations & Kiosk Types
 * Extracted from printloop-new-frontend/src/store/services/stationsApi.ts and kioskApi.ts
 */

export interface Station {
  id: string;
  name: string;
  location: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  isPublic: boolean;
  printerName: string | null;
  queueLength: number;
  estimatedWaitMin: number;
  isOnline: boolean;
  lastSeenAt: string | null;
}

export interface StationListResponse {
  stations: Station[];
}

export interface ReleasePrintCodePayload {
  code: string;
  kioskId?: string;
}

export interface ReleasePrintCodeResponse {
  success: boolean;
  jobId?: string;
  message?: string;
}