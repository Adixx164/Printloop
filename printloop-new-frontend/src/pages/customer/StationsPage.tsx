import { useListStationsQuery } from "@/store/services/stationsApi";

type Station = {
  id: string;
  name: string;
  area: string;
  distanceMeters: number;
  status: "online" | "offline";
  queue: number;
};

function getStations(data: any): Station[] {
  return Array.isArray(data) ? data : data?.stations || [];
}

function formatDistance(meters: number) {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export default function StationsPage() {
  const { data, isLoading, isError } = useListStationsQuery();
  const stations = getStations(data);

  return (
    <div>
      <div className="editorial-label text-persimmon mb-1">STATIONS</div>
      <h1 className="pl-serif text-4xl font-bold tracking-tight mb-1">
        Twelve stations, <em className="italic text-persimmon font-semibold">always ready</em>.
      </h1>
      <p className="pl-serif italic text-ink/60 mb-7">Fetched from the backend station directory.</p>

      {isError && (
        <div className="border-2 border-persimmon bg-persimmon/10 text-ink p-3 rounded mb-4 text-sm font-semibold">
          Stations could not be loaded from the backend.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {stations.map((station, index) => (
          <div key={station.id} className="pl-card">
            <div className="flex justify-between items-baseline mb-3">
              <span className="editorial-folio not-italic">
                <span className="italic">No.</span>
                <span className="italic"> {String(index + 1).padStart(2, "0")}</span>
              </span>
              <span className={`text-[10px] tracking-editorial font-bold ${station.status === "online" ? "text-sage" : "text-fog"}`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${station.status === "online" ? "bg-sage animate-pulse-soft" : "bg-fog"}`} />
                {station.status === "online" ? "ONLINE" : "OFFLINE"}
              </span>
            </div>
            <h3 className="pl-serif text-xl font-bold leading-tight tracking-tight">{station.name}</h3>
            <div className="pl-serif italic text-ink/60 text-sm mt-1">{station.area}</div>
            <div className="flex justify-between items-baseline mt-4 pt-3 border-t border-ink/15">
              <div>
                <div className="editorial-label opacity-60">DISTANCE</div>
                <div className="pl-mono font-bold text-sm">{formatDistance(station.distanceMeters)}</div>
              </div>
              <div>
                <div className="editorial-label opacity-60">QUEUE</div>
                <div className="pl-mono font-bold text-sm">{station.queue === 0 ? "-" : `${station.queue} ahead`}</div>
              </div>
              <button className="pl-btn-ghost text-[11px] py-1.5 px-3">DIRECTIONS →</button>
            </div>
          </div>
        ))}
      </div>

      {!isLoading && stations.length === 0 && (
        <div className="border-2 border-ink p-10 text-center text-ink/50 pl-serif italic">
          No stations are available yet.
        </div>
      )}
    </div>
  );
}
