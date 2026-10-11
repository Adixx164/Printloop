import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  useGetAdminJobsQuery,
  useGetAdminKiosksQuery,
  useUpdateJobStatusMutation,
  useRequeueJobMutation,
} from "@/store/services/adminApi";

const STATUS_BADGES: Record<string, string> = {
  ready: "bg-emerald-600/15 text-emerald-600 border border-emerald-600/30",
  printing: "bg-amber-500/15 text-amber-500 border border-amber-500/30 animate-pulse",
  done: "bg-gray-900/10 text-gray-900 border border-gray-900/20",
  failed: "bg-indigo-600/15 text-indigo-600 border border-indigo-600/30",
};

const KIOSK_STATUS_BADGES: Record<string, string> = {
  ACTIVE: "bg-emerald-600 text-gray-50",
  OFFLINE: "bg-indigo-600 text-gray-50",
  MAINTENANCE: "bg-amber-500 text-gray-50",
  DISABLED: "bg-gray-900/30 text-gray-50",
};

export default function OperatorQueuePage() {
  const [pollingInterval, setPollingInterval] = useState(10000); // 10s default polling
  const { data: jobsData, isLoading: jobsLoading, refetch: refetchJobs } = useGetAdminJobsQuery(
    { page: 1, limit: 50 },
    { pollingInterval }
  );
  const { data: kiosksData, isLoading: kiosksLoading, refetch: refetchKiosks } = useGetAdminKiosksQuery(
    undefined,
    { pollingInterval }
  );

  const [updateJobStatus] = useUpdateJobStatusMutation();
  const [requeueJob] = useRequeueJobMutation();

  const kiosks = kiosksData?.kiosks || [];
  const jobs = jobsData?.jobs || [];

  // Filter queue to active jobs only: ready or printing
  const activeQueue = jobs.filter((j: any) => j.status === "ready" || j.status === "printing");

  // Calculate stats
  const totalPagesInQueue = activeQueue.reduce((acc: number, j: any) => acc + (j.totalPages || 0), 0);
  const estimatedQueueTimeMin = Math.ceil(totalPagesInQueue * 0.2 + activeQueue.length * 0.5); // ~12s per page + 30s prep time

  const handleRefresh = () => {
    refetchJobs();
    refetchKiosks();
    toast.success("Queue refreshed");
  };

  const handleCancelJob = async (id: string, code: string) => {
    if (!confirm(`Are you sure you want to cancel job ${code}?`)) return;
    try {
      await updateJobStatus({ id, status: "failed" }).unwrap();
      toast.success(`Job ${code} cancelled`);
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to cancel job");
    }
  };

  const handleCompleteJob = async (id: string, code: string) => {
    if (!confirm(`Mark job ${code} as printed/done?`)) return;
    try {
      await updateJobStatus({ id, status: "done" }).unwrap();
      toast.success(`Job ${code} marked done`);
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to complete job");
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <div className="editorial-label text-indigo-600 mb-1">OPERATOR DASHBOARD</div>
          <h1 className="pl-serif text-4xl font-bold text-gray-900 mb-1">Live Queue & Fleet</h1>
          <p className="pl-serif italic text-gray-50/60">
            Monitor real-time printshop queue status, page counts, and physical kiosk heartbeats.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <label className="text-xs text-gray-500 font-medium mr-2">
            Auto-refresh:
            <select
              value={pollingInterval}
              onChange={(e) => setPollingInterval(Number(e.target.value))}
              className="pl-input ml-2 !py-1 !px-2 inline-block w-28 text-xs"
            >
              <option value={5000}>Every 5s</option>
              <option value={10000}>Every 10s</option>
              <option value={30000}>Every 30s</option>
              <option value={0}>Disabled</option>
            </select>
          </label>
          <button
            onClick={handleRefresh}
            className="pl-btn bg-emerald-600 text-gray-50 border-emerald-600 hover:bg-gray-900 hover:border-gray-900 text-xs px-4"
          >
            ↻ REFRESH
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 border-2 border-gray-900">
        <div className="p-4 bg-gray-100">
          <div className="editorial-label text-gray-500 mb-1">JOBS IN QUEUE</div>
          <div className="pl-mono text-3xl font-bold text-gray-900">{activeQueue.length}</div>
        </div>
        <div className="p-4 bg-gray-100 border-t-2 md:border-t-0 md:border-l-2 border-gray-900">
          <div className="editorial-label text-gray-500 mb-1">PAGES TO PRINT</div>
          <div className="pl-mono text-3xl font-bold text-gray-900">{totalPagesInQueue}</div>
        </div>
        <div className="p-4 bg-gray-100 border-t-2 md:border-t-0 md:border-l-2 border-gray-900">
          <div className="editorial-label text-gray-500 mb-1">EST. WAIT TIME</div>
          <div className="pl-mono text-3xl font-bold text-amber-500">
            {estimatedQueueTimeMin} <span className="text-sm font-normal">mins</span>
          </div>
        </div>
        <div className="p-4 bg-gray-900 text-gray-50 border-t-2 md:border-t-0 md:border-l-2 border-gray-900">
          <div className="editorial-label text-gray-50/60 mb-1">KIOSKS ONLINE</div>
          <div className="pl-mono text-3xl font-bold">
            {kiosks.filter((k: any) => k.status === "ACTIVE").length}{" "}
            <span className="text-sm font-normal opacity-50">/ {kiosks.length}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Queue Section */}
        <div className="lg:col-span-2 space-y-4">
          <div className="editorial-label text-gray-50/50">ACTIVE PRINT QUEUE</div>
          
          <div className="border-2 border-gray-900 overflow-hidden bg-gray-100">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-900/5 border-b border-gray-900/20 text-gray-50/70">
                    <th className="p-3 font-semibold text-xs">Job Code</th>
                    <th className="p-3 font-semibold text-xs">Document</th>
                    <th className="p-3 font-semibold text-xs">Print Settings</th>
                    <th className="p-3 font-semibold text-xs text-center">Status</th>
                    <th className="p-3 font-semibold text-xs text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobsLoading && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-gray-500 italic">
                        Loading live queue…
                      </td>
                    </tr>
                  )}
                  {!jobsLoading && activeQueue.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-gray-500 italic">
                        No active jobs in the queue.
                        <div className="text-xs mt-1 not-italic">
                          Pending and ready jobs will appear here in real-time.
                        </div>
                      </td>
                    </tr>
                  )}
                  {activeQueue.map((job: any) => {
                    const cfg = job.printConfiguration || {};
                    return (
                      <tr
                        key={job.id}
                        className="border-b border-gray-900/10 last:border-0 hover:bg-gray-900/5 transition-colors align-middle"
                      >
                        <td className="p-3">
                          <span className="pl-mono font-bold text-sm tracking-wider text-gray-900 block">
                            {job.code}
                          </span>
                          <span className="text-[10px] text-gray-500 font-medium block uppercase mt-0.5">
                            {new Date(job.createdAt).toLocaleTimeString()}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-gray-900 truncate max-w-[180px]" title={job.fileName}>
                            {job.fileName}
                          </div>
                          <div className="text-xs text-gray-500">{job.totalPages || 0} pages</div>
                        </td>
                        <td className="p-3 text-xs text-gray-500">
                          <div className="font-medium text-gray-900">
                            {cfg.paper} · {cfg.color === "color" ? "Colour" : "B&W"}
                          </div>
                          <div>
                            {cfg.sided === "double" ? "Duplex" : "Simplex"} · ×{cfg.copies || 1} copies
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`pl-pill text-[10px] font-bold uppercase ${
                              STATUS_BADGES[job.status] || "bg-gray-900/10"
                            }`}
                          >
                            {job.status === "ready" ? "READY" : "PRINTING"}
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-2 whitespace-nowrap">
                          {job.status === "printing" && (
                            <button
                              onClick={() => handleCompleteJob(job.id, job.code)}
                              className="text-xs bg-emerald-600 text-gray-50 px-2 py-1 border border-emerald-600 hover:bg-gray-900 hover:border-gray-900 font-bold transition-colors"
                            >
                              MARK DONE
                            </button>
                          )}
                          <button
                            onClick={() => handleCancelJob(job.id, job.code)}
                            className="text-xs text-indigo-600 font-bold hover:underline"
                          >
                            CANCEL
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Kiosks & Hardware Section */}
        <div className="space-y-4">
          <div className="editorial-label text-gray-50/50">KIOSK FLEET STATUS</div>

          <div className="border-2 border-gray-900 bg-gray-100 p-4 space-y-4">
            {kiosksLoading && <div className="text-center italic text-gray-500 text-sm py-4">Loading kiosks…</div>}
            {!kiosksLoading && kiosks.length === 0 && (
              <div className="text-center italic text-gray-500 text-sm py-4">No kiosks registered.</div>
            )}
            {kiosks.map((k: any) => {
              const minutesSinceLastSeen = k.lastSeenAt
                ? Math.floor((Date.now() - new Date(k.lastSeenAt).getTime()) / 60000)
                : null;
              const isOffline = k.status === "OFFLINE" || (minutesSinceLastSeen !== null && minutesSinceLastSeen > 2);

              return (
                <div key={k.id} className="border border-gray-900/10 p-3 bg-gray-50 hover:bg-gray-900/5 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-sm text-gray-900">{k.name}</h4>
                      <p className="text-xs text-gray-500">{k.location || "No location info"}</p>
                    </div>
                    <span
                      className={`pl-pill text-[9px] font-bold uppercase ${
                        isOffline
                          ? "bg-indigo-600 text-gray-50"
                          : k.status === "MAINTENANCE"
                          ? "bg-amber-500 text-gray-50"
                          : "bg-emerald-600 text-gray-50"
                      }`}
                    >
                      {isOffline ? "OFFLINE" : k.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-gray-900/10 text-xs">
                    <div>
                      <span className="text-[10px] text-gray-500 block font-semibold">IP ADDRESS</span>
                      <span className="pl-mono font-medium text-gray-900">{k.ipAddress || "—"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block font-semibold">LAST SEEN</span>
                      <span className="font-medium text-gray-900 whitespace-nowrap">
                        {minutesSinceLastSeen === null
                          ? "Never"
                          : minutesSinceLastSeen === 0
                          ? "Just now"
                          : `${minutesSinceLastSeen}m ago`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
