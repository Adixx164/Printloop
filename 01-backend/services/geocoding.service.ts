/**
 * Geocoding (V2-30) — turn a human-readable address into (lat, lng)
 * so the tenant shows up in /api/discovery/nearby.
 *
 * Pluggable. Default = OpenStreetMap Nominatim (free, no API key,
 * Nigerian coverage decent for major cities). Swap providers by
 * setting GEOCODER=google|disabled in env; the disabled mode is
 * a clean no-op for dev runs without internet (returns null).
 *
 * Nominatim's usage policy requires:
 *   1. A descriptive User-Agent (set below).
 *   2. ≤1 req/sec.
 *   3. Caching results (we don't re-geocode on every read — only on
 *      signup or when an admin edits the address).
 *
 * Reference: https://operations.osmfoundation.org/policies/nominatim/
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName?: string;
}

export interface Geocoder {
  geocode(address: string): Promise<GeocodeResult | null>;
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT =
  process.env.GEOCODER_USER_AGENT ||
  'PrintLoop-SaaS/2.0 (https://printloop.app; ops@printloop.app)';

// Simple in-process throttle so a burst of signups stays within
// Nominatim's 1 req/sec ceiling. Production rarely sees concurrent
// signups; this is belt-and-braces.
let lastNominatimAt = 0;
async function nominatimThrottle(): Promise<void> {
  const gap = Date.now() - lastNominatimAt;
  if (gap < 1100) await new Promise((r) => setTimeout(r, 1100 - gap));
  lastNominatimAt = Date.now();
}

class NominatimGeocoder implements Geocoder {
  async geocode(address: string): Promise<GeocodeResult | null> {
    const q = address.trim();
    if (!q) return null;
    await nominatimThrottle();
    try {
      const url =
        `${NOMINATIM_BASE}?format=json&limit=1&addressdetails=0` +
        `&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
      if (!r.ok) {
        console.warn(
          `[geocoder:nominatim] HTTP ${r.status} for "${q}"`,
        );
        return null;
      }
      const arr = (await r.json()) as Array<{
        lat: string;
        lon: string;
        display_name?: string;
      }>;
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const top = arr[0];
      const lat = parseFloat(top.lat);
      const lng = parseFloat(top.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng, displayName: top.display_name };
    } catch (err) {
      console.warn('[geocoder:nominatim] error:', err);
      return null;
    }
  }
}

class DisabledGeocoder implements Geocoder {
  async geocode(): Promise<GeocodeResult | null> {
    return null;
  }
}

/**
 * Fixed-point geocoder for tests — looks up an address against an
 * inline table so the E2E doesn't depend on Nominatim reachability.
 * Activated by `GEOCODER=fixture` in env. The table is intentionally
 * tiny; tests add their entries via the address string they use.
 */
class FixtureGeocoder implements Geocoder {
  private table: Record<string, GeocodeResult> = {
    // Lagos landmarks the E2E uses.
    'yaba, lagos': { lat: 6.5095, lng: 3.3711, displayName: 'Yaba, Lagos' },
    'unilag, akoka, lagos': {
      lat: 6.5158,
      lng: 3.3898,
      displayName: 'UNILAG, Akoka, Lagos',
    },
    'lekki phase 1, lagos': {
      lat: 6.4488,
      lng: 3.4724,
      displayName: 'Lekki Phase 1, Lagos',
    },
    'ikoyi, lagos': {
      lat: 6.4541,
      lng: 3.435,
      displayName: 'Ikoyi, Lagos',
    },
  };
  async geocode(address: string): Promise<GeocodeResult | null> {
    return this.table[address.trim().toLowerCase()] || null;
  }
}

let cached: Geocoder | null = null;

/**
 * Resolve the configured geocoder. Lazy + cached so we don't pay the
 * env read on every call.
 */
export function getGeocoder(): Geocoder {
  if (cached) return cached;
  const choice = (process.env.GEOCODER || 'nominatim').toLowerCase();
  if (choice === 'disabled') cached = new DisabledGeocoder();
  else if (choice === 'fixture') cached = new FixtureGeocoder();
  else cached = new NominatimGeocoder();
  return cached;
}

/**
 * Compute great-circle distance between two points in km. Used both
 * by the discovery route's SQL ORDER BY (we'd compute it in SQL for
 * speed but SQLite has no math fns by default) and by tests.
 *
 * Haversine formula — accurate enough for our radii (<100km). Earth
 * radius ≈ 6371 km. Inputs in degrees.
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Test hook — drop the cached instance so tests can flip GEOCODER mid-run. */
export function _resetGeocoderForTests(): void {
  cached = null;
}
