import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { useListJobsQuery } from "@/store/services/jobsApi";
import { useGetWalletQuery } from "@/store/services/walletApi";
import { useListStationsQuery } from "@/store/services/stationsApi";

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

type Station = {
  id: string;
  name: string;
  area: string;
  distanceMeters: number;
  status: "online" | "offline";
  queue: number;
};

function getJobs(data: any): Job[] {
  return Array.isArray(data) ? data : data?.jobs || [];
}

function getStations(data: any): Station[] {
  return Array.isArray(data) ? data : data?.stations || [];
}

function formatMoney(amount = 0) {
  return amount.toLocaleString();
}

function minutesUntil(date?: string) {
  if (!date) return 60;
  return Math.max(0, Math.round((new Date(date).getTime() - Date.now()) / 60000));
}

export default function DashboardPage() {
  const { data: jobsData, isLoading: jobsLoading, isError: jobsError } = useListJobsQuery();
  const { data: walletData, isLoading: walletLoading } = useGetWalletQuery();
  const { data: stationsData } = useListStationsQuery();

  const jobs = useMemo(() => getJobs(jobsData), [jobsData]);
  const stations = useMemo(() => getStations(stationsData), [stationsData]);
  const activeJob = jobs.find((job) => job.status === "ready");
  const nearestStation = stations.find((station) => station.status === "online") || stations[0];
  const totalPages = jobs.reduce((sum, job) => sum + Number(job.pageCount || 0), 0);
  const recentJobs = jobs.slice(0, 4);
  const readyCount = jobs.filter((job) => job.status === "ready").length;
  const doneCount = jobs.filter((job) => job.status === "done").length;
  const walletBalance = Number(walletData?.balance || 0);

  return (
    <div>
      {jobsError && (
        <div className="border-2 border-persimmon bg-persimmon/10 text-ink p-3 rounded mb-4 text-sm font-semibold">
          Could not reach the backend API. Make sure the backend is running on port 4000.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-3 mb-3">
        <div className="bg-ink text-paper p-5 border-2 border-ink rounded transition-all hover:-translate-x-1 hover:-translate-y-1 hover:[box-shadow:6px_6px_0_#D14B2C] cursor-pointer relative">
          <div className="flex justify-between items-center mb-2">
            <span className="editorial-label">ACTIVE PRINT CODE</span>
            <span className="bg-persimmon text-paper px-2.5 py-1 text-[10px] tracking-editorial font-bold inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-paper animate-blink" />
              {activeJob ? "READY" : jobsLoading ? "LOADING" : "NONE"}
            </span>
          </div>
          <div className="pl-mono text-[44px] font-bold tracking-wide leading-none my-2">
            {activeJob?.code || "------"}
          </div>
          <div className="flex gap-5 text-xs flex-wrap">
            <span><b className="font-bold">EXPIRES:</b> {activeJob ? `${minutesUntil(activeJob.expiresAt)} min` : "--"}</span>
            <span><b className="font-bold">NEAREST:</b> {nearestStation?.name || "--"}</span>
            <span><b className="font-bold">DISTANCE:</b> {nearestStation ? `${nearestStation.distanceMeters}m` : "--"}</span>
          </div>
          <div className="h-1.5 bg-paper/15 mt-3 overflow-hidden">
            <div className="h-full bg-persimmon" style={{ width: activeJob ? "62%" : "0%" }} />
          </div>
        </div>

        <Link to={ROUTES.APP.WALLET} className="pl-card flex flex-col justify-between no-underline text-ink">
          <div>
            <div className="editorial-label mb-1.5">WALLET BALANCE</div>
            <div className="pl-serif text-[34px] font-bold leading-none tracking-tight">
              ₦{walletLoading ? "--" : formatMoney(walletBalance)}
            </div>
            <div className="text-[11px] text-sage font-semibold mt-1">
              Synced from backend wallet
            </div>
          </div>
          <div className="bg-persimmon text-paper px-2.5 py-1.5 text-[11px] font-bold tracking-wider w-fit mt-3">
            TOP UP →
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-4 border-2 border-ink mb-4">
        {[
          { label: "PAGES", num: totalPages, sub: `${jobs.length} jobs` },
          { label: "STATIONS", num: stations.length || "--", sub: `${stations.filter((s) => s.status === "online").length} online` },
          { label: "READY", num: readyCount, sub: "active codes" },
          { label: "DONE", num: doneCount, sub: "completed" },
        ].map((s, i, arr) => (
          <div
            key={s.label}
            className={`p-3.5 cursor-pointer transition-colors hover:bg-ink hover:text-paper group ${
              i < arr.length - 1 ? "border-r border-ink" : ""
            }`}
          >
            <div className="text-[9px] tracking-editorial font-bold mb-1 opacity-80">{s.label}</div>
            <div className="pl-mono text-xl font-bold group-hover:text-persimmon">{s.num}</div>
            <div className="text-[10px] text-fog group-hover:text-paper/80 font-medium mt-0.5">
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap mb-7">
        <Link to={ROUTES.APP.NEW_PRINT} className="pl-btn-primary">+ NEW PRINT <span className="font-extrabold">→</span></Link>
        <Link to={ROUTES.APP.BATCH_PRINT} className="pl-btn-dark">BATCH PRINT →</Link>
        <Link to={ROUTES.APP.GROUP_PRINT} className="pl-btn-ghost">GROUP SESSION</Link>
        <Link to={ROUTES.APP.WALLET} className="pl-btn-dark">TOP UP →</Link>
        <Link to={ROUTES.APP.STATIONS} className="pl-btn-ghost">FIND STATION</Link>
      </div>

      <div className="flex justify-between items-baseline mb-3">
        <h2 className="pl-serif text-2xl font-bold tracking-tight">
          Recent jobs <em className="italic text-ochre font-medium text-lg">— from backend</em>
        </h2>
        <div className="flex border-2 border-ink">
          <span className="pl-chip-active px-3 py-1 text-[11px] font-bold tracking-wider border-r border-ink">ALL · {jobs.length}</span>
          <span className="px-3 py-1 text-[11px] font-bold tracking-wider border-r border-ink">READY · {readyCount}</span>
          <span className="px-3 py-1 text-[11px] font-bold tracking-wider">DONE · {doneCount}</span>
        </div>
      </div>

      <div className="border-2 border-ink">
        <div className="bg-ink text-paper grid grid-cols-[30px_1fr_90px_70px_90px_24px] gap-3 px-3 py-2 text-[10px] tracking-editorial font-bold">
          <div>#</div><div>JOB</div><div>CODE</div><div>COST</div><div>STATUS</div><div></div>
        </div>
        {recentJobs.map((job, index) => (
          <div
            key={job.id}
            className={`grid grid-cols-[30px_1fr_90px_70px_90px_24px] gap-3 px-3 py-3 border-b border-ink/10 last:border-0 cursor-pointer items-center transition-colors ${
              job.status === "ready" ? "bg-persimmon text-paper" : "hover:bg-paper-light"
            }`}
          >
            <div className={`pl-serif italic font-bold text-base ${job.status === "ready" ? "text-paper" : "text-ochre"}`}>
              {String(index + 1).padStart(2, "0")}
            </div>
            <div>
              <div className="font-semibold text-[13px]">{job.title || job.fileName}</div>
              <div className={`text-[11px] mt-0.5 ${job.status === "ready" ? "text-paper/70" : "text-fog"}`}>{job.meta}</div>
            </div>
            <div className={`pl-mono text-[11px] font-bold ${job.status === "done" ? "text-fog" : ""}`}>{job.code}</div>
            <div className="pl-mono text-[13px] font-bold">₦{formatMoney(job.cost)}</div>
            <div>
              {job.status === "ready" ? (
                <span className="bg-paper text-persimmon px-2 py-0.5 text-[9px] tracking-editorial font-bold inline-flex items-center gap-1">
                  <span className="w-1 h-1 bg-persimmon" />READY
                </span>
              ) : (
                <span className="text-fog border border-fog px-2 py-0.5 text-[9px] tracking-editorial font-bold">{job.status.toUpperCase()}</span>
              )}
            </div>
            <div className={`text-sm font-extrabold ${job.status === "done" ? "text-fog" : ""}`}>→</div>
          </div>
        ))}
        {!jobsLoading && recentJobs.length === 0 && (
          <div className="p-10 text-center text-ink/50 pl-serif italic">No print jobs yet.</div>
        )}
      </div>
    </div>
  );
}
