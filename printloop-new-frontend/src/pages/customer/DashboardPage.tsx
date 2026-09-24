import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { useListJobsQuery } from "@/store/services/jobsApi";
import { ResponsiveTable, type ResponsiveColumn } from "@/components/layout/ResponsiveTable";

// Leaflet dependencies
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

// Discovery API
import {
  useListNearbyShopsQuery,
  useListAllShopsQuery,
  useGetShopDetailQuery,
  type PublicShop,
} from "@/store/services/discoveryApi";

type Job = {
  id: string;
  title?: string;
  fileName?: string;
  meta?: string;
  code: string;
  cost: number;
  status: "ready" | "done" | "expired";
  pageCount?: number;
  createdAt?: string;
  expiresAt?: string;
};

type GeoState =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "granted"; lat: number; lng: number }
  | { kind: "denied"; reason: string }
  | { kind: "unsupported" };

const FALLBACK_CENTER: [number, number] = [6.5244, 3.3792];

function getJobs(data: any): Job[] {
  return Array.isArray(data) ? data : data?.jobs || [];
}

function formatMoney(amount = 0) {
  return amount.toLocaleString();
}

function minutesUntil(date?: string) {
  if (!date) return 60;
  return Math.max(0, Math.round((new Date(date).getTime() - Date.now()) / 60000));
}

export default function DashboardPage() {
  const navigate = useNavigate();

  // Queries
  const { data: jobsData, isLoading: jobsLoading, isError: jobsError } = useListJobsQuery();

  // Geolocation & filters state
  const [geo, setGeo] = useState<GeoState>({ kind: "idle" });
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [query, setQuery] = useState("");
  const [filterColor, setFilterColor] = useState(false);
  const [filterA3, setFilterA3] = useState(false);
  const [filterOnline, setFilterOnline] = useState(false);

  // Shop selection state
  const [selectedShopSlug, setSelectedShopSlug] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"prices" | "reviews" | "photos">("prices");

  const origin = useMemo(
    () => (geo.kind === "granted" ? { lat: geo.lat, lng: geo.lng } : null),
    [geo],
  );

  const nearby = useListNearbyShopsQuery(
    origin ? { ...origin, radius: 20, limit: 30 } : ({} as any),
    { skip: !origin },
  );
  const fallback = useListAllShopsQuery(undefined, { skip: !!origin });

  // Geolocation engine
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

  // Set up container click listener for map popup "Select Shop" buttons
  useEffect(() => {
    const handlePopupClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("select-shop-btn")) {
        const slug = target.getAttribute("data-slug");
        if (slug) {
          setSelectedShopSlug(slug);
          // Set tab default
          setDetailTab("prices");
        }
      }
    };
    document.addEventListener("click", handlePopupClick);
    return () => document.removeEventListener("click", handlePopupClick);
  }, []);
  // Trigger nearby demo seeding when location is granted
  useEffect(() => {
    if (origin) {
      fetch("/api/discovery/shops/seed-demo-nearby", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ lat: origin.lat, lng: origin.lng }),
      })
        .then((r) => r.json())
        .then((res) => {
          if (res.success && res.seeded) {
            nearby.refetch();
          }
        })
        .catch((err) => console.error("Failed to seed nearby demo shops:", err));
    }
  }, [origin]);

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
  const shopsLoading = origin ? nearby.isLoading : fallback.isLoading;
  const shopsError = origin ? nearby.isError : fallback.isError;

  // Apply search + filters to shop markers & lists
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

  const mapCenter: [number, number] = origin
    ? [origin.lat, origin.lng]
    : shops.find((s) => s.lat != null && s.lng != null)
      ? [shops[0].lat as number, shops[0].lng as number]
      : FALLBACK_CENTER;

  // Fetch details for the selected shop
  const { data: selectedShopData, isLoading: selectedShopLoading } = useGetShopDetailQuery(
    { slug: selectedShopSlug || "", lat: origin?.lat, lng: origin?.lng },
    { skip: !selectedShopSlug }
  );

  // Track if user reviewed prices for the selected shop
  useEffect(() => {
    if (selectedShopData?.shop) {
      sessionStorage.setItem("reviewedPricesForTenant", selectedShopData.shop.slug);
    }
  }, [selectedShopData]);

  const jobs = useMemo(() => getJobs(jobsData), [jobsData]);
  const activeJob = jobs.find((job) => job.status === "ready");
  
  // Find nearest active shop
  const nearestShop = useMemo(() => {
    return rawShops.find((s) => s.agentOnline && s.status === "active") || rawShops[0];
  }, [rawShops]);

  const totalPages = jobs.reduce((sum, job) => sum + Number(job.pageCount || 0), 0);
  const recentJobs = jobs.slice(0, 4);
  const readyCount = jobs.filter((job) => job.status === "ready").length;
  const doneCount = jobs.filter((job) => job.status === "done").length;

  const columns: ResponsiveColumn<Job>[] = [
    {
      label: "Job",
      cell: (j) => (
        <div>
          <div className="font-semibold text-[13px] truncate">{j.title || j.fileName}</div>
          {j.meta && <div className="text-[11px] text-fog mt-0.5">{j.meta}</div>}
        </div>
      ),
    },
    {
      label: "Code",
      cell: (j) => <span className="pl-mono text-[11px] font-bold">{j.code}</span>,
    },
    {
      label: "Cost",
      cell: (j) => <span className="pl-mono text-[13px] font-bold">₦{formatMoney(j.cost)}</span>,
    },
    {
      label: "Status",
      cell: (j) =>
        j.status === "ready" ? (
          <span className="pl-pill pl-pill-ready">READY</span>
        ) : (
          <span className="pl-pill pl-pill-done">{j.status.toUpperCase()}</span>
        ),
    },
  ];

  // Render selected shop details
  let selectedShopPanel = null;
  if (selectedShopSlug) {
    if (selectedShopLoading) {
      selectedShopPanel = (
        <div className="border-4 border-ink bg-paper shadow-[6px_6px_0_#000] p-6 text-center rounded">
          <p className="text-gray-500 font-semibold pl-serif italic">Loading shop details...</p>
        </div>
      );
    } else if (selectedShopData) {
      const { shop, pricing, reviews = [] } = selectedShopData;
      const brandColor = shop.brand.primaryColor || "#225275";
      
      selectedShopPanel = (
        <div className="border-4 border-ink bg-paper shadow-[6px_6px_0_#000] p-4 flex flex-col gap-3 relative animate-fadein rounded">
          {/* Close button */}
          <button
            type="button"
            onClick={() => setSelectedShopSlug(null)}
            className="absolute top-3 right-3 text-ink bg-paper border-2 border-ink p-1 font-bold hover:bg-persimmon hover:text-paper leading-none transition-colors w-7 h-7 flex items-center justify-center rounded"
            aria-label="Close"
          >
            ✕
          </button>

          {/* Brand header bar */}
          <div className="h-2 w-full rounded" style={{ backgroundColor: brandColor }} />

          {/* Title & info */}
          <div>
            <h3 className="text-xl sm:text-2xl font-bold pl-serif leading-none">
              {shop.brand.wordmark || shop.name}
            </h3>
            {shop.address && (
              <p className="text-xs text-gray-500 mt-1">{shop.address}</p>
            )}
          </div>

          {/* Shop distance / status badges */}
          <div className="flex flex-wrap gap-2 text-xs">
            {shop.distanceKm != null && (
              <span className="bg-paper-light border border-ink/20 px-2 py-0.5 rounded font-bold">
                {shop.distanceKm.toFixed(1)} km away
              </span>
            )}
            <span
              className={`px-2 py-0.5 rounded font-bold border border-ink/20 ${
                shop.agentOnline ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}
            >
              {shop.agentOnline ? "Online" : "Offline"}
            </span>
            {shop.queueLength > 0 && (
              <span className="bg-amber-50 text-amber-700 border border-ink/20 px-2 py-0.5 rounded font-bold">
                Queue: {shop.queueLength} ({shop.estimatedWaitMin}m wait)
              </span>
            )}
          </div>

          {/* Rating */}
          {shop.ratingCount > 0 ? (
            <div className="flex items-center gap-1 text-xs text-ochre font-bold">
              <span>★ {shop.ratingAverage.toFixed(1)} / 5.0</span>
              <span className="text-ink/60 font-normal">({shop.ratingCount} {shop.ratingCount === 1 ? 'review' : 'reviews'})</span>
            </div>
          ) : (
            <p className="text-xs text-ink/60 italic">No reviews yet</p>
          )}

          {/* CTA Print Actions Grid */}
          <div className="mt-1 flex flex-col gap-1.5 bg-paper-light border-2 border-ink p-3 rounded">
            <div className="text-[10px] tracking-editorial font-extrabold text-ink/75 uppercase">Select Print Option</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={() => {
                  navigate(`/print/new?tenantSlug=${encodeURIComponent(shop.slug)}`);
                }}
                disabled={!shop.agentOnline}
                className="pl-btn-primary py-2 justify-center text-center font-extrabold text-xs uppercase disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + SINGLE PRINT
              </button>
              <button
                onClick={() => {
                  navigate(`/print/batch?tenantSlug=${encodeURIComponent(shop.slug)}`);
                }}
                disabled={!shop.agentOnline}
                className="pl-btn-dark py-2 justify-center text-center font-extrabold text-xs uppercase disabled:opacity-40 disabled:cursor-not-allowed"
              >
                BATCH PRINT
              </button>
              <button
                onClick={() => {
                  navigate(`/groups?tenantSlug=${encodeURIComponent(shop.slug)}`);
                }}
                disabled={!shop.agentOnline}
                className="pl-btn-ghost bg-paper text-ink py-2 justify-center text-center font-extrabold text-xs uppercase disabled:opacity-40 disabled:cursor-not-allowed"
              >
                GROUP PRINT
              </button>
            </div>
          </div>

          {/* Tabs bar */}
          <div className="flex border-b border-ink/20 text-xs font-bold mt-2">
            {(["prices", "reviews", "photos"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setDetailTab(tab)}
                className={`py-2 px-4 border-t border-l border-r border-transparent -mb-px capitalize ${
                  detailTab === tab
                    ? "border-ink/20 bg-paper-light text-ink border-b-paper-light"
                    : "text-ink/50 hover:text-ink"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tabs content box */}
          <div className="bg-paper-light p-3 border border-ink/10 rounded">
            {detailTab === "prices" && (
              <div>
                <h4 className="font-bold text-xs mb-1.5 uppercase tracking-wider text-ink/65">Pricing Sheet</h4>
                {pricing.length === 0 ? (
                  <p className="text-xs text-ink/60 italic">No prices listed by this shop.</p>
                ) : (
                  <div className="overflow-x-auto max-h-[160px] border border-ink/15 rounded bg-paper">
                    <table className="w-full text-[11px] border-collapse text-left">
                      <thead>
                        <tr className="bg-ink text-paper text-[10px] uppercase font-bold">
                          <th className="p-1.5">Size</th>
                          <th className="p-1.5">Color</th>
                          <th className="p-1.5">100dpi</th>
                          <th className="p-1.5">300dpi</th>
                          <th className="p-1.5">600dpi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pricing.map((row: any, i: number) => (
                          <tr key={i} className="border-b last:border-0 border-ink/10">
                            <td className="p-1.5 font-bold">{row.paperSize}</td>
                            <td className="p-1.5 capitalize">{row.colorType === "color" ? "Colour" : "B&W"}</td>
                            <td className="p-1.5">₦{row.price100Simplex}</td>
                            <td className="p-1.5">₦{row.price300Simplex}</td>
                            <td className="p-1.5">₦{row.price600Simplex}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {detailTab === "reviews" && (
              <div className="max-h-[180px] overflow-y-auto space-y-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-ink/65 mb-1">Reviews</h4>
                {reviews.length === 0 ? (
                  <p className="text-xs text-ink/60 italic">No customer reviews yet.</p>
                ) : (
                  reviews.map((r: any) => (
                    <div key={r.id} className="bg-paper p-2 border border-ink/10 rounded text-xs">
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-[11px]">{r.user.firstName} {r.user.lastName}</span>
                        <span className="text-[10px] text-ink/50">{new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="text-amber-500 text-[10px] my-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i}>{i < r.rating ? "★" : "☆"}</span>
                        ))}
                      </div>
                      {r.comment && <p className="text-ink/80 leading-snug mt-1 text-[11px]">{r.comment}</p>}
                    </div>
                  ))
                )}
              </div>
            )}

            {detailTab === "photos" && (
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider text-ink/65 mb-1.5">Shop Photos</h4>
                {shop.photos.length === 0 ? (
                  <p className="text-xs text-ink/60 italic">No shop photos uploaded.</p>
                ) : (
                  <div className="flex gap-2 overflow-x-auto py-1 scrollbar-thin">
                    {shop.photos.map((url: string, idx: number) => (
                      <img
                        key={idx}
                        src={url}
                        alt={`${shop.name} brand ${idx + 1}`}
                        className="w-40 h-24 object-cover rounded border border-ink/10 flex-shrink-0"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }
  }

  return (
    <div>
      {jobsError && (
        <div className="border-2 border-persimmon bg-persimmon/10 text-ink p-3 rounded mb-4 text-sm font-semibold">
          Could not reach the backend API. Make sure the backend is running on port 4000.
        </div>
      )}

      {/* ── Split Screen Layout (Map-First dashboard) ─────────────────────────────────── */}
      <div className="flex flex-col lg:grid lg:grid-cols-[1.4fr_1fr] gap-6 mb-6">
        
        {/* Left column: Leaflet map discovery */}
        <div className="flex flex-col gap-4">
          <div className="border-4 border-ink bg-paper p-4 shadow-[6px_6px_0_#000] rounded">
            <header className="mb-3">
              <h2 className="text-xl sm:text-2xl font-bold pl-serif">Print shops near you</h2>
              <p className="text-gray-600 text-xs mt-0.5">
                Browse nearby active stations, check reviews/prices, and submit print jobs instantly.
              </p>
            </header>

            {/* Filter and location selection */}
            <div className="flex flex-col gap-2 mb-3">
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
                  className="flex-1 min-w-[150px] border-2 border-ink rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ink"
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
                <span className="text-[11px] text-gray-500 font-bold ml-auto shrink-0">
                  {shops.length} shop{shops.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            {/* Map Container */}
            <div className="rounded border-4 border-ink overflow-hidden h-[40vh] sm:h-[45vh] relative z-10">
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
                <ShopClusterLayer shops={shops} onSelectShop={setSelectedShopSlug} />
              </MapContainer>
            </div>
          </div>

          {/* Shop detail drawer or list cards */}
          {selectedShopPanel ? (
            selectedShopPanel
          ) : (
            <div className="border-4 border-ink bg-paper shadow-[6px_6px_0_#000] p-4 flex flex-col gap-3 rounded">
              <h3 className="font-bold text-xs pl-serif uppercase tracking-wider text-ink/65">Nearby Shops</h3>
              
              {shopsLoading && (
                <p className="text-gray-500 text-xs italic">Loading shops…</p>
              )}
              {shopsError && (
                <p className="text-red-600 text-xs font-semibold">
                  Could not load shops. Try again in a moment.
                </p>
              )}
              {!shopsLoading && !shopsError && shops.length === 0 && (
                <p className="text-gray-500 text-xs italic">
                  {rawShops.length === 0
                    ? "No discoverable print shops yet."
                    : "No shops match the current filters."}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                {shops.map((shop) => {
                  const brandColor = shop.brand.primaryColor || "#225275";
                  const isSelectable = shop.agentOnline && shop.status === "active";
                  return (
                    <button
                      key={shop.id}
                      type="button"
                      onClick={() => {
                        setSelectedShopSlug(shop.slug);
                        setDetailTab("prices");
                      }}
                      className={`text-left block rounded-lg border-2 border-ink p-3 hover:shadow-md transition bg-white ${
                        !isSelectable ? "opacity-60 cursor-not-allowed" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-bold text-sm leading-tight text-ink">
                            {shop.brand.wordmark || shop.name}
                          </h4>
                          {shop.address && (
                            <p className="text-[11px] text-gray-500 mt-0.5 truncate max-w-[180px]">
                              {shop.address}
                            </p>
                          )}
                        </div>
                        <div
                          className="w-3 h-3 rounded-full shrink-0 mt-1"
                          style={{ backgroundColor: brandColor }}
                        />
                      </div>

                      <div className="flex flex-wrap gap-1 mt-2 text-[10px]">
                        {shop.distanceKm != null && (
                          <span className="px-1.5 py-0.5 rounded bg-gray-100 font-semibold text-gray-700">
                            {shop.distanceKm.toFixed(1)} km
                          </span>
                        )}
                        {shop.cheapestPerPage != null && (
                          <span className="px-1.5 py-0.5 rounded bg-gray-100 font-semibold text-gray-700">
                            ₦{shop.cheapestPerPage}/pg
                          </span>
                        )}
                        {shop.ratingCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                            ★ {shop.ratingAverage.toFixed(1)}
                          </span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold ${
                            shop.agentOnline
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {shop.agentOnline ? "Online" : "Offline"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right column: dashboard active items & stats */}
        <div className="flex flex-col gap-4">
          
          {/* Active print code card */}
          <div className="bg-ink text-paper p-4 sm:p-5 border-4 border-ink rounded transition-all md:hover:-translate-x-1 md:hover:-translate-y-1 md:hover:[box-shadow:6px_6px_0_#D14B2C] cursor-pointer relative">
            <div className="flex justify-between items-center mb-2 gap-2">
              <span className="editorial-label">ACTIVE PRINT CODE</span>
              <span className="bg-persimmon text-paper px-2.5 py-1 text-[10px] tracking-editorial font-bold inline-flex items-center gap-1.5 flex-shrink-0">
                <span className="w-1.5 h-1.5 bg-paper animate-blink" />
                {activeJob ? "READY" : jobsLoading ? "LOADING" : "NONE"}
              </span>
            </div>
            <div className="pl-mono text-[36px] sm:text-[44px] font-bold tracking-wide leading-none my-2 break-all">
              {activeJob?.code || "------"}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 text-xs">
              <span>
                <b className="font-bold">EXPIRES:</b>{" "}
                {activeJob ? `${minutesUntil(activeJob.expiresAt)} min` : "--"}
              </span>
              <span className="truncate">
                <b className="font-bold">NEAREST:</b> {nearestShop?.brand.wordmark || nearestShop?.name || "--"}
              </span>
              <span>
                <b className="font-bold">DISTANCE:</b>{" "}
                {nearestShop?.distanceKm != null ? `${nearestShop.distanceKm.toFixed(1)} km` : "--"}
              </span>
            </div>
            <div className="h-1.5 bg-paper/15 mt-3 overflow-hidden">
              <div className="h-full bg-persimmon" style={{ width: activeJob ? "62%" : "0%" }} />
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 border-4 border-ink rounded overflow-hidden">
            {[
              { label: "PAGES", num: totalPages, sub: `${jobs.length} jobs` },
              {
                label: "STATIONS",
                num: rawShops.length || "--",
                sub: `${rawShops.filter((s) => s.agentOnline).length} online`,
              },
              { label: "READY", num: readyCount, sub: "active codes" },
              { label: "DONE", num: doneCount, sub: "completed" },
            ].map((s, i) => (
              <div
                key={s.label}
                className={`p-3 cursor-pointer transition-colors bg-white hover:bg-ink hover:text-paper group border-b border-r border-ink/25
                  ${i >= 2 ? "border-b-0" : ""}
                  ${i % 2 === 1 ? "border-r-0" : ""}
                `}
              >
                <div className="text-[9px] tracking-editorial font-bold mb-1 opacity-80">{s.label}</div>
                <div className="pl-mono text-xl font-bold group-hover:text-persimmon">{s.num}</div>
                <div className="text-[10px] text-fog group-hover:text-paper/80 font-medium mt-0.5">
                  {s.sub}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Actions Buttons */}
          <div className="grid grid-cols-2 gap-2 mt-1">
            <Link to={ROUTES.APP.NEW_PRINT} className="pl-btn-primary py-2.5 text-center justify-center font-bold text-xs uppercase">
              NEW PRINT →
            </Link>
            <Link to={ROUTES.APP.PRINT_JOBS} className="pl-btn-dark py-2.5 text-center justify-center font-bold text-xs uppercase">
              VIEW JOB CODES →
            </Link>
          </div>
        </div>
      </div>

      {/* ── Bottom Section: Recent Jobs Table ─────────────────────────────────────── */}
      <div className="border-4 border-ink p-4 sm:p-5 shadow-[6px_6px_0_#000] bg-paper rounded mt-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-2 mb-3">
          <h2 className="pl-serif text-xl sm:text-2xl font-bold tracking-tight">
            Recent jobs <em className="italic text-ochre font-medium text-base sm:text-lg">— from backend</em>
          </h2>
          <div className="flex border-2 border-ink overflow-x-auto rounded bg-white">
            <span className="pl-chip-active px-3 py-1 text-[11px] font-bold tracking-wider border-r border-ink whitespace-nowrap">
              ALL · {jobs.length}
            </span>
            <span className="px-3 py-1 text-[11px] font-bold tracking-wider border-r border-ink whitespace-nowrap">
              READY · {readyCount}
            </span>
            <span className="px-3 py-1 text-[11px] font-bold tracking-wider whitespace-nowrap">
              DONE · {doneCount}
            </span>
          </div>
        </div>

        <ResponsiveTable
          columns={columns}
          rows={recentJobs}
          rowKey={(j) => j.id}
          mobileTitle={(j) => j.title || j.fileName || "Untitled"}
          mobileTrailing={(j) =>
            j.status === "ready" ? (
              <span className="pl-pill pl-pill-ready">READY</span>
            ) : (
              <span className="pl-pill pl-pill-done">{j.status.toUpperCase()}</span>
            )
          }
          emptyState={!jobsLoading ? "No print jobs yet." : "Loading…"}
        />
      </div>
    </div>
  );
}

// Helper components
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
      className={`text-[10px] sm:text-xs rounded-full px-2.5 py-1 border-2 font-bold transition-all ${
        active
          ? "bg-[#225275] text-white border-ink"
          : "bg-white text-gray-700 border-ink/40 hover:border-ink/65"
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
      <p className="text-[11px] text-gray-500 font-bold px-2 py-1 bg-gray-50 border border-dashed border-ink/20 rounded">
        Asking browser for location…
      </p>
    );
  }
  if (geo.kind === "granted") {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2 py-1 rounded bg-gray-100 border border-ink/25 font-bold text-gray-700">
          Near {geo.lat.toFixed(3)}, {geo.lng.toFixed(3)}
        </span>
        <button
          type="button"
          onClick={props.onReset}
          className="underline text-gray-500 hover:text-ink font-bold"
        >
          Change
        </button>
      </div>
    );
  }
  return (
    <form
      onSubmit={props.submitManual}
      className="flex flex-wrap items-end gap-2 text-xs bg-white border-2 border-ink rounded p-2"
    >
      <span className="text-gray-600 font-semibold self-center text-[11px]">
        {geo.kind === "denied"
          ? `Location denied (${geo.reason.slice(0, 15)}). Coords:`
          : "Location unavailable. Coords:"}
      </span>
      <input
        type="number"
        step="0.0001"
        value={props.manualLat}
        onChange={(e) => props.setManualLat(e.target.value)}
        placeholder="lat"
        className="border-2 border-ink rounded px-2 py-1 w-20 text-xs"
      />
      <input
        type="number"
        step="0.0001"
        value={props.manualLng}
        onChange={(e) => props.setManualLng(e.target.value)}
        placeholder="lng"
        className="border-2 border-ink rounded px-2 py-1 w-20 text-xs"
      />
      <button
        type="submit"
        className="bg-[#225275] text-white px-3 py-1.5 rounded font-bold text-xs"
      >
        Use
      </button>
    </form>
  );
}

function RecenterOnChange({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [map, center[0], center[1]]);
  return null;
}

function ShopClusterLayer({ shops, onSelectShop }: { shops: PublicShop[]; onSelectShop: (slug: string) => void }) {
  const map = useMap();
  useEffect(() => {
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
      marker.on("click", () => {
        onSelectShop(shop.slug);
      });
      cluster.addLayer(marker);
    }
    map.addLayer(cluster);
    return () => {
      map.removeLayer(cluster);
    };
  }, [map, shops, onSelectShop]);
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
  
  const rating = shop.ratingCount > 0
    ? `<div style="color:#d97706;font-size:11px;font-weight:500;margin-top:2px">★ ${shop.ratingAverage.toFixed(1)} (${shop.ratingCount})</div>`
    : "";

  const selectButton = `<button class="select-shop-btn" data-slug="${shop.slug}" style="margin-top:8px;background:#225275;color:#fff;border:none;padding:6px 8px;font-size:11px;font-weight:700;cursor:pointer;width:100%;text-align:center;border-radius:3px;">Select Shop</button>`;
  
  return `
    <div style="min-width:180px;font-size:13px;font-family:sans-serif;">
      <div style="font-weight:700">${name}</div>
      ${addr}
      <div style="margin-top:4px;font-size:12px">${distance}${price}${online}</div>
      ${queue}
      ${rating}
      ${selectButton}
    </div>
  `;
}

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
