import { useState } from "react";
import { toast } from "sonner";
import {
  useGetAdminJobsQuery,
  useReleaseJobMutation,
  useAcceptJobMutation,
  useUpdateJobStatusMutation,
  useRequeueJobMutation,
} from "@/store/services/adminApi";

/**
 * /saas/queue — the shop operator's Bolt-style job queue (V2-57/58).
 * Live-polling job cards: document preview, specs, payment status,
 * ACCEPT (the V2-58 accept window — a job nobody accepts reroutes to
 * the next nearest open shop), one-tap PRINT (releases to the kiosk
 * agent → silent IPP print) and COLLECT (verify code / mark handed
 * over). A code search box acts as the auth-code scanner.
 */

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Awaiting payment", cls: "bg-ink/10 text-ink" },
  rendering: { label: "Rendering", cls: "bg-ink/10 text-ink animate-pulse" },
  awaiting_accept: { label: "AWAITING ACCEPT", cls: "bg-persimmon/15 text-persimmon border border-persimmon/30 animate-pulse" },
  ready: { label: "READY — waiting for you", cls: "bg-sage/15 text-sage border border-sage/30" },
  releasing: { label: "Printing…", cls: "bg-ochre/15 text-ochre border border-ochre/30 animate-pulse" },
  printing: { label: "Printing…", cls: "bg-ochre/15 text-ochre border border-ochre/30 animate-pulse" },
  done: { label: "Collected", cls: "bg-ink/10 text-ink" },
  failed: { label: "Failed", cls: "bg-persimmon/15 text-persimmon border border-persimmon/30" },
  expired: { label: "Expired", cls: "bg-ink/10 text-ink/50" },
};

/** V2-58: seconds left in the 2-minute accept window (client estimate). */
function acceptWindowLeft(job: any): number {
  const from = job.updatedAt ? new Date(job.updatedAt).getTime() : Date.now();
  return Math.max(0, Math.round((from + 120_000 - Date.now()) / 1000));
}

function JobCard({
  job,
  onAccept,
  onPrint,
  onCollect,
  onRequeue,
  busy,
}: {
  job: any;
  onAccept: (j: any) => void;
  onPrint: (j: any) => void;
  onCollect: (j: any) => void;
  onRequeue: (j: any) => void;
  busy: boolean;
}) {
  const cfg: any = job.printConfiguration || {};
  const st = STATUS[job.status] || { label: job.status, cls: "bg-ink/10 text-ink" };
  const paid = Boolean(job.paymentReference) || job.status !== "pending";
  const preview = Array.isArray(job.previewImageUrls) ? job.previewImageUrls[0] : null;
  const user = job.user || {};
  const shortfall =
    job.finalCost != null && Number(job.finalCost) > Number(job.cost)
      ? Number(job.finalCost) - Number(job.cost)
      : 0;

  return (
    <div className="border-2 border-ink bg-paper-light overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        {preview ? (
          <img
            src={preview}
            alt=""
            className="w-20 h-28 object-cover border-2 border-ink bg-paper shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-20 h-28 border-2 border-ink bg-paper shrink-0 flex items-center justify-center">
            <span className="pl-mono text-[9px] text-ink/30 rotate-0">PDF</span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="pl-mono text-lg font-bold">{job.code || "------"}</span>
              <span className={`pl-pill text-[9px] font-bold uppercase ${st.cls}`}>{st.label}</span>
              {paid && (
                <span className="pl-pill text-[9px] font-bold uppercase bg-sage/15 text-sage border border-sage/30">
                  PAID ₦{Number(job.cost || 0).toLocaleString()}
                </span>
              )}
            </div>
            <span className="pl-mono text-[10px] text-ink/40">
              {new Date(job.createdAt).toLocaleTimeString()}
            </span>
          </div>

          <h3 className="pl-serif font-bold text-lg leading-tight mt-1 truncate">
            {job.fileName || "Untitled document"}
          </h3>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink/65 mt-1.5 font-medium">
            <span>{job.totalPages || "?"} pp</span>
            <span>{cfg.paper || "A4"}</span>
            <span>{cfg.color === "color" ? "Colour" : "B&W"}</span>
            <span>{cfg.sided === "double" ? "Duplex" : "Single"}</span>
            <span>{cfg.qualityDpi || 300}dpi</span>
            <span>×{cfg.copies || 1}</span>
            {job.jobType === "personal_batch" && <span className="text-persimmon font-bold">BATCH</span>}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[11px]">
            {user.firstName ? (
              <span className="font-bold">{user.firstName} {user.lastName || ""}</span>
            ) : (
              <span className="text-ink/40 italic">guest</span>
            )}
            {shortfall > 0 && (
              <span className="text-persimmon font-bold">
                +₦{shortfall.toLocaleString()} due (final pages)
              </span>
            )}
            {job.finalCost != null && Number(job.finalCost) !== Number(job.cost) && (
              <span className="text-ink/40">final ₦{Number(job.finalCost).toLocaleString()}</span>
            )}
          </div>
        </div>
      </div>

      <div className="border-t-2 border-ink px-4 py-2.5 flex gap-2 flex-wrap bg-paper">
        {job.status === "awaiting_accept" && (
          <button
            onClick={() => onAccept(job)}
            disabled={busy}
            className="pl-btn-primary px-3 py-1.5 text-[11px] font-bold"
          >
            ✓ ACCEPT JOB ({acceptWindowLeft(job)}s)
          </button>
        )}
        {job.status === "ready" && (
          <button
            onClick={() => onPrint(job)}
            disabled={busy}
            className="pl-btn-primary px-3 py-1.5 text-[11px] font-bold"
          >
            🖨 PRINT NOW
          </button>
        )}
        {(job.status === "ready" || job.status === "printing" || job.status === "releasing") && (
          <button
            onClick={() => onCollect(job)}
            disabled={busy}
            className="pl-btn-dark px-3 py-1.5 text-[11px] font-bold"
          >
            ✓ MARK COLLECTED
          </button>
        )}
        {job.status === "failed" && (
          <button
            onClick={() => onRequeue(job)}
            disabled={busy}
            className="pl-btn-ghost px-3 py-1.5 text-[11px] font-bold"
          >
            ↻ REQUEUE
          </button>
        )}
      </div>
    </div>
  );
}

export default function SaasQueuePage() {
  const [codeQuery, setCodeQuery] = useState("");
  const [search, setSearch] = useState("");
  const { data, isLoading, isFetching } = useGetAdminJobsQuery(
    { page: 1, limit: 60, search: search || undefined, status: undefined },
    { pollingInterval: 10_000, refetchOnFocus: true },
  );
  const [releaseJob, { isLoading: releasing }] = useReleaseJobMutation();
  const [acceptJob, { isLoading: accepting }] = useAcceptJobMutation();
  const [updateStatus, { isLoading: updating }] = useUpdateJobStatusMutation();
  const [requeue, { isLoading: requeuing }] = useRequeueJobMutation();

  const jobs: any[] = data?.jobs || [];
  const busy = releasing || accepting || updating || requeuing;

  const active = jobs.filter((j) => !["done", "failed", "expired"].includes(j.status));
  const finished = jobs.filter((j) => ["done", "failed", "expired"].includes(j.status));

  const handleAccept = async (j: any) => {
    try {
      await acceptJob(j.id).unwrap();
      toast.success(`${j.code || "Job"} accepted — it's ready to print.`);
    } catch (err: any) {
      toast.error(err?.data?.message || "Could not accept job");
    }
  };

  const handlePrint = async (j: any) => {
    try {
      await releaseJob(j.id).unwrap();
      toast.success(`${j.code || "Job"} released — the kiosk is printing it.`);
    } catch (err: any) {
      toast.error(err?.data?.message || "Could not release job");
    }
  };

  const handleCollect = async (j: any) => {
    if (!confirm(`Mark ${j.code || "this job"} as collected/handed over?`)) return;
    try {
      await updateStatus({ id: j.id, status: "done" }).unwrap();
      toast.success(`${j.code || "Job"} collected.`);
    } catch (err: any) {
      toast.error(err?.data?.message || "Could not update job");
    }
  };

  const handleRequeue = async (j: any) => {
    try {
      await requeue(j.id).unwrap();
      toast.success(`${j.code || "Job"} requeued.`);
    } catch (err: any) {
      toast.error(err?.data?.message || "Could not requeue job");
    }
  };

  const runSearch = () => setSearch(codeQuery.trim());

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="editorial-label text-persimmon mb-1">▸ LIVE JOB QUEUE</div>
          <h1 className="pl-serif font-extrabold text-3xl sm:text-4xl leading-none tracking-tight">
            Print what's <em className="italic text-persimmon">waiting.</em>
          </h1>
          <p className="mt-1 text-sm text-ink/60 font-mono">
            {active.length} active · {finished.length} finished
            {isFetching ? " · refreshing…" : " · live (10s)"}
          </p>
        </div>

        {/* Auth-code scanner (V2-57): look up a job by its release code. */}
        <div className="flex gap-2">
          <input
            value={codeQuery}
            onChange={(e) => setCodeQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Scan / type release code…"
            className="pl-input pl-mono w-48"
          />
          <button onClick={runSearch} className="pl-btn-ghost px-3 py-2 text-xs font-bold">
            FIND
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="border-2 border-ink p-10 text-center text-fog italic pl-serif">
          Loading the queue…
        </div>
      )}

      {!isLoading && active.length === 0 && (
        <div className="border-4 border-ink bg-paper-light p-12 text-center">
          <div className="pl-mono text-5xl mb-3 text-ink/15">∅</div>
          <div className="pl-serif italic text-ink/55">
            No active jobs{search ? " matching that code" : ""} — new orders land here the
            moment a customer pays.
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {active.map((j) => (
            <JobCard
              key={j.id}
              job={j}
              onAccept={handleAccept}
              onPrint={handlePrint}
              onCollect={handleCollect}
              onRequeue={handleRequeue}
              busy={busy}
            />
          ))}
        </div>
      )}

      {finished.length > 0 && (
        <div>
          <div className="editorial-label text-ink/45 mb-2">FINISHED</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-60">
            {finished.map((j) => (
              <JobCard
                key={j.id}
                job={j}
                onAccept={handleAccept}
                onPrint={handlePrint}
                onCollect={handleCollect}
                onRequeue={handleRequeue}
                busy={busy}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
