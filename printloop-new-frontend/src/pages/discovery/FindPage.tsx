import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "@/store";
import { ROUTES } from "@/constants/routes";
import {
  MapContainer,
  TileLayer,
  Popup,
  CircleMarker,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/leaflet.markercluster.js";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import {
  useListNearbyShopsQuery,
  useListAllShopsQuery,
  type PublicShop,
} from "@/store/services/discoveryApi";
import { Reveal } from "@/components/ui/scrollFx";

/**
 * `/find` — Bolt-style marketplace home (V2-31).
 *
 * Layout (top → bottom on every viewport, since the map is the
 * dominant cue): location chip + filters → map (55vh) → result list.
 * Map and list are bound to the SAME filtered shops state so search
 * and toggles update both at once.
 *
 * Anonymous — no login required. Backend: GET /api/discovery/shops*.
 */

type GeoState =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "granted"; lat: number; lng: number }
  | { kind: "denied"; reason: string }
  | { kind: "unsupported" };

// Fallback origin (Lagos centre) used purely to anchor the map when
// the user hasn't granted location yet — pins still appear if any
// shops have coords; otherwise the map shows OSM tiles only.
const FALLBACK_CENTER: [number, number] = [6.5244, 3.3792];

export default function FindPage() {
  const token = useSelector((s: RootState) => s.auth.accessToken);

  if (token) {
    return <Navigate to={ROUTES.APP.DASHBOARD} replace />;
  }

  const [geo, setGeo] = useState<GeoState>({ kind: "idle" });
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [query, setQuery] = useState("");
  const [filterColor, setFilterColor] = useState(false);
  const [filterA3, setFilterA3] = useState(false);
  const [filterOnline, setFilterOnline] = useState(false);

  const origin = useMemo(
    () => (geo.kind === "granted" ? { lat: geo.lat, lng: geo.lng } : null),
    [geo],
  );

  const nearby = useListNearbyShopsQuery(
    origin ? { ...origin, radius: 20, limit: 30 } : ({} as any),
    { skip: !origin },
  );
  const fallback = useListAllShopsQuery(undefined, { skip: !!origin });

  useEffect(() => {
    if (geo.kind !== "idle") return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo({ kind: "unsupported" });
      return;
    }
    setGeo({ kind: "asking" });
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setGeo({
          kind: "granted",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      (err) =>
        setGeo({ kind: "denied", reason: err.message || "Permission denied" }),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, [geo.kind]);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setGeo({ kind: "granted", lat, lng });
    }
  };

  const rawShops: PublicShop[] = origin
    ? nearby.data?.shops ?? []
    : fallback.data?.shops ?? [];
  const isLoading = origin ? nearby.isLoading : fallback.isLoading;
  const isError = origin ? nearby.isError : fallback.isError;

  // Apply client-side search + filters to BOTH the map pins and list.
  const shops = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rawShops.filter((s) => {
      if (filterColor && !s.hasColor) return false;
      if (filterA3 && !s.paperSizes.includes("A3")) return false;
      if (filterOnline && !s.agentOnline) return false;
      if (!q) return true;
      const hay = `${s.name} ${s.brand.wordmark || ""} ${s.address || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rawShops, query, filterColor, filterA3, filterOnline]);

  // Pick the map centre: granted origin → first shop with coords →
  // fallback Lagos centre.
  const mapCenter: [number, number] = origin
    ? [origin.lat, origin.lng]
    : shops.find((s) => s.lat != null && s.lng != null)
      ? [shops[0].lat as number, shops[0].lng as number]
      : FALLBACK_CENTER;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
      <header className="mb-3">
        <h1 className="text-2xl sm:text-3xl font-bold">Print shops near you</h1>
        <p className="text-gray-600 text-sm">
          Find a shop, upload, pay, pick up the printout — no queueing.
        </p>
      </header>

      {/* Compact location + filter bar */}
      <div className="mb-3 flex flex-col gap-2">
        <LocationChip
          geo={geo}
          manualLat={manualLat}
          manualLng={manualLng}
          setManualLat={setManualLat}
          setManualLng={setManualLng}
          submitManual={submitManual}
          onReset={() => setGeo({ kind: "idle" })}
        />

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search by shop name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-[200px] border rounded px-3 py-1.5 text-sm"
          />
          <FilterChip
            active={filterColor}
            onClick={() => setFilterColor((v) => !v)}
          >
            Colour
          </FilterChip>
          <FilterChip
            active={filterA3}
            onClick={() => setFilterA3((v) => !v)}
          >
            A3
          </FilterChip>
          <FilterChip
            active={filterOnline}
            onClick={() => setFilterOnline((v) => !v)}
          >
            Online now
          </FilterChip>
          <span className="text-xs text-gray-500 ml-auto">
            {shops.length} shop{shops.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* MAP — the dominant element, Bolt-style */}
      <div className="rounded-lg overflow-hidden border mb-4 h-[45vh] sm:h-[55vh]">
        <MapContainer
          center={mapCenter}
          zoom={origin ? 13 : 11}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <RecenterOnChange center={mapCenter} />
          {origin && (
            <CircleMarker
              center={[origin.lat, origin.lng]}
              radius={9}
              pathOptions={{
                color: "#fff",
                fillColor: "#225275",
                fillOpacity: 1,
                weight: 3,
              }}
            >
              <Popup>You are here</Popup>
            </CircleMarker>
          )}
          <ShopClusterLayer shops={shops} />
        </MapContainer>
      </div>

      {/* Result list under the map */}
      {isLoading && (
        <p className="text-gray-500 text-sm">Loading shops…</p>
      )}
      {isError && (
        <p className="text-red-600 text-sm">
          Could not load shops. Try again in a moment.
        </p>
      )}
      {!isLoading && !isError && shops.length === 0 && (
        <p className="text-gray-500 text-sm">
          {rawShops.length === 0
            ? "No discoverable print shops yet — check back soon."
            : "No shops match the current filters."}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {shops.map((shop, i) => (
          <Reveal key={shop.id} variant="rise" delay={(i % 2) * 110}>
            <ShopCard shop={shop} />
          </Reveal>
        ))}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs rounded-full px-3 py-1.5 border ${
        active
          ? "bg-[#225275] text-white border-[#225275]"
          : "bg-white text-gray-700 border-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

function LocationChip(props: {
  geo: GeoState;
  manualLat: string;
  manualLng: string;
  setManualLat: (s: string) => void;
  setManualLng: (s: string) => void;
  submitManual: (e: React.FormEvent) => void;
  onReset: () => void;
}) {
  const { geo } = props;
  if (geo.kind === "asking") {
    return (
      <p className="text-xs text-gray-500 px-2">
        Asking your browser for location…
      </p>
    );
  }
  if (geo.kind === "granted") {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2 py-1 rounded-full bg-gray-100">
          Near {geo.lat.toFixed(3)}, {geo.lng.toFixed(3)}
        </span>
        <button
          type="button"
          onClick={props.onReset}
          className="underline text-gray-500"
        >
          Change
        </button>
      </div>
    );
  }
  return (
    <form
      onSubmit={props.submitManual}
      className="flex flex-wrap items-end gap-2 text-xs bg-white border rounded px-2 py-2"
    >
      <span className="text-gray-600 self-center">
        {geo.kind === "denied"
          ? `Location denied (${geo.reason}). Enter coords:`
          : "Browser can't share location — enter coords:"}
      </span>
      <input
        type="number"
        step="0.0001"
        value={props.manualLat}
        onChange={(e) => props.setManualLat(e.target.value)}
        placeholder="lat"
        className="border rounded px-2 py-1 w-20"
      />
      <input
        type="number"
        step="0.0001"
        value={props.manualLng}
        onChange={(e) => props.setManualLng(e.target.value)}
        placeholder="lng"
        className="border rounded px-2 py-1 w-20"
      />
      <button
        type="submit"
        className="bg-[#225275] text-white px-3 py-1 rounded font-semibold"
      >
        Use
      </button>
    </form>
  );
}

function ShopCard({ shop }: { shop: PublicShop }) {
  const brand = shop.brand.primaryColor || "#225275";
  const isSelectable = shop.agentOnline && shop.status === "active";

  const cardContent = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-base leading-tight">
            {shop.brand.wordmark || shop.name}
          </h2>
          {shop.address && (
            <p className="text-xs text-gray-500 mt-0.5">{shop.address}</p>
          )}
        </div>
        <div
          className="w-3 h-3 rounded-full shrink-0 mt-1.5"
          aria-hidden
          style={{ backgroundColor: brand }}
        />
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2 text-[11px]">
        {shop.distanceKm != null && (
          <span className="px-2 py-0.5 rounded bg-gray-100">
            {shop.distanceKm.toFixed(1)} km
          </span>
        )}
        {shop.cheapestPerPage != null && (
          <span className="px-2 py-0.5 rounded bg-gray-100">
            ₦{shop.cheapestPerPage}/page
          </span>
        )}
        {shop.hasColor && (
          <span className="px-2 py-0.5 rounded bg-gray-100">Colour</span>
        )}
        {shop.paperSizes.includes("A3") && (
          <span className="px-2 py-0.5 rounded bg-gray-100">A3</span>
        )}
        {shop.ratingCount > 0 && (
          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
            ★ {shop.ratingAverage.toFixed(1)} ({shop.ratingCount})
          </span>
        )}
        {shop.queueLength > 0 && (
          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
            Queue: {shop.queueLength} ({shop.estimatedWaitMin}m wait)
          </span>
        )}
        <span
          className={`px-2 py-0.5 rounded font-medium ${
            shop.agentOnline
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {shop.agentOnline ? "Online" : "Offline"}
        </span>
      </div>
    </>
  );

  if (!isSelectable) {
    return (
      <div className="block rounded-lg border bg-gray-50 opacity-60 p-3 cursor-not-allowed border-gray-200">
        {cardContent}
      </div>
    );
  }

  return (
    <Link
      to={`/find/${shop.slug}`}
      className="block rounded-lg border bg-white p-3 hover:shadow-md transition"
    >
      {cardContent}
    </Link>
  );
}

/**
 * Recenter the map imperatively when the center prop changes. React-Leaflet
 * doesn't re-anchor MapContainer once mounted; this hook does it.
 */
function RecenterOnChange({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [map, center[0], center[1]]);
  return null;
}

/**
 * Cluster layer (V2-34). Wraps leaflet.markercluster in a React-leaflet-
 * compatible component: builds an L.markerClusterGroup, adds it to the
 * map on mount, replaces its marker set when `shops` changes, removes
 * it on unmount. The popup HTML is hand-rendered (not React) because
 * each leaflet marker owns its own DOM subtree — small and worth the
 * boundary so we don't pay for a hidden React root per pin.
 */
function ShopClusterLayer({ shops }: { shops: PublicShop[] }) {
  const map = useMap();
  useEffect(() => {
    // Cast — @types/leaflet.markercluster augments L but TS sometimes
    // doesn't pick up the side-effect import in strict module mode.
    const cluster = (L as any).markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
    });
    for (const shop of shops) {
      if (shop.lat == null || shop.lng == null) continue;
      const marker = L.marker([shop.lat, shop.lng], {
        icon: shopPinIcon(shop.brand.primaryColor || "#225275"),
      });
      marker.bindPopup(buildPopupHtml(shop));
      cluster.addLayer(marker);
    }
    map.addLayer(cluster);
    return () => {
      map.removeLayer(cluster);
    };
  }, [map, shops]);
  return null;
}

function buildPopupHtml(shop: PublicShop): string {
  const esc = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
          c
        ] as string),
    );
  const name = esc(shop.brand.wordmark || shop.name);
  const addr = shop.address
    ? `<div style="color:#6b7280;font-size:12px">${esc(shop.address)}</div>`
    : "";
  const distance =
    shop.distanceKm != null ? `${shop.distanceKm.toFixed(1)} km` : "";
  const price =
    shop.cheapestPerPage != null
      ? ` · from ₦${shop.cheapestPerPage}/page`
      : "";
  const online = shop.agentOnline
    ? `<span style="color:#15803d;font-weight:500"> · online</span>`
    : `<span style="color:#b91c1c;font-weight:500"> · offline</span>`;
  const queue = shop.queueLength > 0
    ? `<div style="color:#d97706;font-size:11px;font-weight:500;margin-top:2px">Queue: ${shop.queueLength} (${shop.estimatedWaitMin}m wait)</div>`
    : "";
  const actionLink = (shop.agentOnline && shop.status === "active")
    ? `<a href="/find/${esc(shop.slug)}" style="display:inline-block;margin-top:8px;color:#225275;font-weight:600">View shop →</a>`
    : `<span style="display:inline-block;margin-top:8px;color:#6b7280;font-weight:600">Temporarily offline</span>`;
  return `
    <div style="min-width:180px;font-size:13px">
      <div style="font-weight:700">${name}</div>
      ${addr}
      <div style="margin-top:4px;font-size:12px">${distance}${price}${online}</div>
      ${queue}
      ${actionLink}
    </div>
  `;
}

/**
 * Custom SVG pin coloured per shop brand. Beats Leaflet's default
 * (which 404s on the asset paths in vite builds anyway).
 */
function shopPinIcon(color: string): L.DivIcon {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38">
  <path d="M14 0C6.27 0 0 6.27 0 14c0 9.5 14 24 14 24s14-14.5 14-24c0-7.73-6.27-14-14-14z" fill="${color}" stroke="white" stroke-width="2"/>
  <circle cx="14" cy="14" r="5" fill="white"/>
</svg>`.trim();
  return L.divIcon({
    className: "",
    html: svg,
    iconSize: [28, 38],
    iconAnchor: [14, 38],
    popupAnchor: [0, -32],
  });
}
