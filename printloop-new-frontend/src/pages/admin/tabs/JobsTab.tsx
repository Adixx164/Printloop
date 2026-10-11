import { useState } from "react";
import { toast } from "sonner";
import {
  useGetAdminJobsQuery,
  useUpdateJobStatusMutation,
  useRequeueJobMutation,
} from "@/store/services/adminApi";

const STATUS_STYLES: Record<string, string> = {
  ready: "bg-emerald-600/15 text-emerald-600 border border-emerald-600/30",
  printing: "bg-amber-500/15 text-amber-500 border border-amber-500/30",
  done: "bg-gray-900/10 text-gray-900 border border-gray-900/20",
  failed: "bg-indigo-600/15 text-indigo-600 border border-indigo-600/30",
  expired: "bg-gray-500/20 text-gray-500 border border-gray-500/30",
  refunded: "bg-amber-500/10 text-amber-500 border border-amber-500/20",
};

const ALL_STATUSES = ["ready", "printing", "done", "failed", "expired", "refunded"];

export default function JobsTab({ canManage }: { canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = useGetAdminJobsQuery({
    search,
    status: filterStatus,
    page,
    limit: 25,
  });
  const [updateJobStatus] = useUpdateJobStatusMutation();
  const [requeueJob] = useRequeueJobMutation();

  const jobs: any[] = data?.jobs || [];
  const total: number = data?.total || 0;
  const totalPages: number = data?.totalPages || 1;

  const handleStatusChange = async (id: string, currentStatus: string, code: string) => {
    const next = prompt(
      `Change status of job ${code}.\nCurrent: ${currentStatus}\nEnter new status:\n${ALL_STATUSES.join(
        " | "
      )}`,
      currentStatus
    );
    if (!next || next === currentStatus) return;
    if (!ALL_STATUSES.includes(next)) {
      toast.error("Invalid status");
      return;
    }
    try {
      await updateJobStatus({ id, status: next }).unwrap();
      toast.success(`Job ${code} → ${next}`);
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to update");
    }
  };

  const handleRequeue = async (id: string, code: string) => {
    if (!confirm(`Requeue failed job ${code}?`)) return;
    try {
      await requeueJob(id).unwrap();
      toast.success(`Job ${code} requeued.`);
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to requeue");
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(draftSearch);
    setPage(1);
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <div className="editorial-label text-indigo-600 mb-1">ADMIN CONSOLE</div>
        <h1 className="pl-serif text-4xl font-bold text-gray-900 mb-1">Print Jobs</h1>
        <p className="pl-serif italic text-gray-50/60">
          Search, inspect, and manage all print jobs across the system.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => {
            setFilterStatus("");
            setPage(1);
          }}
          className={`text-xs font-bold px-3 py-1.5 border-2 transition-colors ${
            !filterStatus ? "bg-gray-900 text-gray-50 border-gray-900" : "border-gray-900/20 text-gray-900 hover:border-gray-900"
          }`}
        >
          ALL
        </button>
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => {
              setFilterStatus(s);
              setPage(1);
            }}
            className={`text-xs font-bold px-3 py-1.5 border-2 transition-colors uppercase ${
              filterStatus === s
                ? "bg-gray-900 text-gray-50 border-gray-900"
                : "border-gray-900/20 text-gray-900 hover:border-gray-900"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <form onSubmit={handleSearch} className="flex gap-3 flex-wrap">
        <input
          value={draftSearch}
          onChange={(e) => setDraftSearch(e.target.value)}
          placeholder="Search by file name, code, user email…"
          className="pl-input flex-1 min-w-48"
        />
        <button type="submit" className="pl-btn bg-gray-900 text-gray-50 border-gray-900 text-xs px-4">
          SEARCH
        </button>
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setDraftSearch("");
              setPage(1);
            }}
            className="pl-btn-ghost text-xs px-3 py-2"
          >
            CLEAR
          </button>
        )}
      </form>

      <div className="border-2 border-gray-900 overflow-hidden">
        <div className="bg-gray-900 text-gray-50 px-5 py-3 flex justify-between items-center">
          <div className="editorial-label">
            {isLoading || isFetching ? "LOADING JOBS…" : `JOBS — ${total} TOTAL`}
          </div>
          {totalPages > 1 && (
            <div className="text-xs text-gray-50/60">
              Page {page} / {totalPages}
            </div>
          )}
        </div>
        <div className="overflow-x-auto bg-gray-100">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-900/20 bg-gray-900/5 text-gray-50/70">
                <th className="p-3 font-semibold">Code</th>
                <th className="p-3 font-semibold">File</th>
                <th className="p-3 font-semibold">User</th>
                <th className="p-3 font-semibold">Config</th>
                <th className="p-3 font-semibold text-right">Cost</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold whitespace-nowrap">Created</th>
                <th className="p-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {(isLoading || isFetching) && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-500 italic">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && !isFetching && jobs.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-500 italic">
                    No jobs match your search.
                  </td>
                </tr>
              )}
              {jobs.map((job) => {
                const cfg = job.printConfiguration || {};
                const u = job.user || {};
                return (
                  <tr
                    key={job.id}
                    className="border-b border-gray-900/10 last:border-0 hover:bg-gray-900/5 transition-colors"
                  >
                    <td className="p-3">
                      <span className="pl-mono font-bold text-sm tracking-wider">{job.code}</span>
                    </td>
                    <td className="p-3 max-w-[180px]">
                      <div className="font-medium text-gray-900 truncate" title={job.fileName}>
                        {job.fileName?.replace(/\.[^.]+$/, "") || "—"}
                      </div>
                      <div className="text-xs text-gray-500">{job.totalPages}pp</div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-gray-900 text-xs">
                        {u.firstName ? `${u.firstName} ${u.lastName}` : "—"}
                      </div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </td>
                    <td className="p-3 text-xs text-gray-500">
                      <div>
                        {cfg.paper} · {cfg.color === "color" ? "Colour" : "B&W"}
                      </div>
                      <div>
                        {cfg.sided === "double" ? "2-sided" : "1-sided"} · ×{cfg.copies}
                      </div>
                    </td>
                    <td className="p-3 pl-mono font-bold text-right">
                      ₦{Number(job.cost || 0).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <span
                        className={`pl-pill text-[10px] font-bold uppercase ${
                          STATUS_STYLES[job.status] || "bg-gray-900/10"
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3 text-right space-x-3 whitespace-nowrap">
                      {canManage && job.status === "failed" && (
                        <button
                          onClick={() => handleRequeue(job.id, job.code)}
                          className="text-xs text-amber-500 font-bold hover:underline"
                        >
                          REQUEUE
                        </button>
                      )}
                      {canManage && (
                        <button
                          onClick={() => handleStatusChange(job.id, job.status, job.code)}
                          className="text-xs text-emerald-600 font-bold hover:underline"
                        >
                          STATUS
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex gap-2 justify-center">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="pl-btn-ghost text-xs px-4 py-2 disabled:opacity-30"
          >
            ← PREV
          </button>
          <span className="px-4 py-2 text-xs font-bold border-2 border-gray-900 bg-gray-50">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="pl-btn-ghost text-xs px-4 py-2 disabled:opacity-30"
          >
            NEXT →
          </button>
        </div>
      )}
    </div>
  );
}
