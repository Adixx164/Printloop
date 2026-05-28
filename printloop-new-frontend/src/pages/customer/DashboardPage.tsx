import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { useListJobsQuery } from "@/store/services/jobsApi";
import { useGetWalletQuery } from "@/store/services/walletApi";
import { useListStationsQuery } from "@/store/services/stationsApi";
import { ResponsiveTable, type ResponsiveColumn } from "@/components/layout/ResponsiveTable";

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

  return (
    <div>
      {jobsError && (
        <div className="border-2 border-persimmon bg-persimmon/10 text-ink p-3 rounded mb-4 text-sm font-semibold">
          Could not reach the backend API. Make sure the backend is running on port 4000.
        </div>
      )}

      {/* ── Active code + wallet ───────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-3 mb-3">
        <div className="bg-ink text-paper p-4 sm:p-5 border-2 border-ink rounded transition-all md:hover:-translate-x-1 md:hover:-translate-y-1 md:hover:[box-shadow:6px_6px_0_#D14B2C] cursor-pointer relative">
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
              <b className="font-bold">NEAREST:</b> {nearestStation?.name || "--"}
            </span>
            <span>
              <b className="font-bold">DISTANCE:</b>{" "}
              {nearestStation ? `${nearestStation.distanceMeters}m` : "--"}
            </span>
          </div>
          <div className="h-1.5 bg-paper/15 mt-3 overflow-hidden">
            <div className="h-full bg-persimmon" style={{ width: activeJob ? "62%" : "0%" }} />
          </div>
        </div>

        <Link
          to={ROUTES.APP.WALLET}
          className="pl-card flex flex-col justify-between no-underline text-ink"
        >
          <div>
            <div className="editorial-label mb-1.5">WALLET BALANCE</div>
            <div className="pl-serif text-[28px] sm:text-[34px] font-bold leading-none tracking-tight">
              ₦{walletLoading ? "--" : formatMoney(walletBalance)}
            </div>
            <div className="text-[11px] text-sage font-semibold mt-1">Synced from backend wallet</div>
          </div>
          <div className="bg-persimmon text-paper px-2.5 py-1.5 text-[11px] font-bold tracking-wider w-fit mt-3">
            TOP UP →
          </div>
        </Link>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-2 border-ink mb-4">
        {[
          { label: "PAGES", num: totalPages, sub: `${jobs.length} jobs` },
          {
            label: "STATIONS",
            num: stations.length || "--",
            sub: `${stations.filter((s) => s.status === "online").length} online`,
          },
          { label: "READY", num: readyCount, sub: "active codes" },
          { label: "DONE", num: doneCount, sub: "completed" },
        ].map((s, i, arr) => (
          <div
            key={s.label}
            className={`p-3 sm:p-3.5 cursor-pointer transition-colors hover:bg-ink hover:text-paper group
              ${i % 2 === 0 ? "border-r border-ink sm:border-r" : ""}
              ${i < 2 ? "border-b border-ink sm:border-b-0" : ""}
              ${i === 1 ? "sm:border-r" : ""}
              ${i === 2 ? "sm:border-r" : ""}
              ${i === arr.length - 1 ? "sm:border-r-0" : ""}
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

      {/* ── Primary actions ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 mb-6 sm:mb-7">
        <Link to={ROUTES.APP.NEW_PRINT} className="pl-btn-primary justify-center sm:justify-start">
          + NEW PRINT <span className="font-extrabold">→</span>
        </Link>
        <Link to={ROUTES.APP.BATCH_PRINT} className="pl-btn-dark justify-center sm:justify-start">
          BATCH PRINT →
        </Link>
        <Link to={ROUTES.APP.GROUP_PRINT} className="pl-btn-ghost justify-center sm:justify-start">
          GROUP SESSION
        </Link>
        <Link to={ROUTES.APP.WALLET} className="pl-btn-dark justify-center sm:justify-start">
          TOP UP →
        </Link>
        <Link to={ROUTES.APP.STATIONS} className="pl-btn-ghost justify-center sm:justify-start">
          FIND STATION
        </Link>
      </div>

      {/* ── Recent jobs ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-2 mb-3">
        <h2 className="pl-serif text-xl sm:text-2xl font-bold tracking-tight">
          Recent jobs <em className="italic text-ochre font-medium text-base sm:text-lg">— from backend</em>
        </h2>
        {/* Filter chips — horizontal scroll on phones if they don't fit. */}
        <div className="flex border-2 border-ink overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0 sm:overflow-visible">
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
  );
}
