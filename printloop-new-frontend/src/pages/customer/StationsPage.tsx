import { useListStationsQuery } from "@/store/services/stationsApi";

type Station = {
  id: string;
  name: string;
  area: string;
  campus?: string | null;
  status: "online" | "offline" | "maintenance";
  mapsUrl?: string | null;
  queue: number;
  lastSeenAt?: string | null;
};

function getStations(data: any): Station[] {
  return Array.isArray(data) ? data : data?.stations || [];
}

const STATUS_STYLES: Record<string, { dot: string; text: string }> = {
  online: { dot: "bg-sage animate-pulse-soft", text: "text-sage" },
  maintenance: { dot: "bg-ochre", text: "text-ochre" },
  offline: { dot: "bg-fog", text: "text-fog" },
};

export default function StationsPage() {
  const { data, isLoading, isError } = useListStationsQuery();
  const stations = getStations(data);

  return (
    <div>
      <div className="editorial-label text-persimmon mb-1">STATIONS</div>
      <h1 className="pl-serif text-4xl font-bold tracking-tight mb-1">
        {stations.length > 0 ? `${stations.length} ${stations.length === 1 ? "station" : "stations"}` : "Stations"}
        ,{" "}
        <em className="italic text-persimmon font-semibold">always ready</em>.
      </h1>
      <p className="pl-serif italic text-ink/60 mb-7">
        Live directory — updated as soon as new kiosks are added in the admin console.
      </p>

      {isError && (
        <div className="border-2 border-persimmon bg-persimmon/10 text-ink p-3 rounded mb-4 text-sm font-semibold">
          Stations could not be loaded from the backend.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {stations.map((station, index) => {
          const style = STATUS_STYLES[station.status] || STATUS_STYLES.offline;
          return (
            <div key={station.id} className="pl-card">
              <div className="flex justify-between items-baseline mb-3">
                <span className="editorial-folio not-italic">
                  <span className="italic">No.</span>
                  <span className="italic"> {String(index + 1).padStart(2, "0")}</span>
                </span>
                <span className={`text-[10px] tracking-editorial font-bold ${style.text}`}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${style.dot}`} />
                  {station.status.toUpperCase()}
                </span>
              </div>
              <h3 className="pl-serif text-xl font-bold leading-tight tracking-tight">{station.name}</h3>
              <div className="pl-serif italic text-ink/60 text-sm mt-1">
                {station.area || "—"}
                {station.campus && station.campus !== station.area ? ` · ${station.campus}` : ""}
              </div>
              <div className="flex justify-between items-baseline mt-4 pt-3 border-t border-ink/15">
                <div>
                  <div className="editorial-label opacity-60">QUEUE</div>
                  <div className="pl-mono font-bold text-sm">{station.queue === 0 ? "—" : `${station.queue} ahead`}</div>
                </div>
                {station.mapsUrl ? (
                  <a
                    href={station.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pl-btn-ghost text-[11px] py-1.5 px-3 inline-flex items-center"
                  >
                    DIRECTIONS →
                  </a>
                ) : (
                  <span className="text-[10px] text-fog italic">No map link set</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!isLoading && stations.length === 0 && (
        <div className="border-2 border-ink p-10 text-center text-ink/50 pl-serif italic">
          No stations are available yet. Add one from the admin console (Kiosks tab) and it will appear here automatically.
        </div>
      )}
    </div>
  );
}
