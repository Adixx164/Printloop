import { useMemo, useState } from "react";
import { Copy, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useListJobsQuery } from "@/store/services/jobsApi";

type JobStatus = "all" | "ready" | "done" | "expired" | "refunded" | "printing" | "failed";

type Job = {
  id: string;
  title?: string;
  fileName?: string;
  meta?: string;
  code: string;
  qrPayload?: string;
  cost: number;
  status: Exclude<JobStatus, "all">;
  createdAt?: string;
  expiresAt?: string;
  refundedAt?: string;
};

function getJobs(data: any): Job[] {
  return Array.isArray(data) ? data : data?.jobs || [];
}

function formatDate(value?: string) {
  if (!value) return "--";
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function statusClass(status: Job["status"]) {
  if (status === "ready") return "bg-paper text-persimmon";
  if (status === "done") return "text-sage border border-sage";
  if (status === "refunded") return "text-ochre border border-ochre";
  return "text-fog border border-fog";
}

export default function PrintJobsPage() {
  const [filter, setFilter] = useState<JobStatus>("all");
  const [openQr, setOpenQr] = useState<string | null>(null);
  const { data, isLoading, isError } = useListJobsQuery();
  const allJobs = useMemo(() => getJobs(data), [data]);
  const filtered = filter === "all" ? allJobs : allJobs.filter((job) => job.status === filter);

  const tabs = [
    { k: "all" as const, l: `ALL · ${allJobs.length}` },
    { k: "ready" as const, l: `READY · ${allJobs.filter((job) => job.status === "ready").length}` },
    { k: "done" as const, l: `DONE · ${allJobs.filter((job) => job.status === "done").length}` },
    { k: "refunded" as const, l: `REFUNDED · ${allJobs.filter((job) => job.status === "refunded").length}` },
    { k: "failed" as const, l: `FAILED · ${allJobs.filter((job) => job.status === "failed").length}` },
  ];

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`Copied print code ${code}.`);
    } catch {
      toast.error("Could not copy code.");
    }
  };

  return (
    <div className="animate-fadein">
      <div className="editorial-label text-persimmon mb-1">JOB LEDGER</div>
      <h1 className="pl-serif text-4xl font-bold tracking-tight mb-1">
        Every print, <em className="italic text-persimmon font-semibold">accounted for</em>.
      </h1>
      <p className="pl-serif italic text-ink/60 mb-7">
        Tap any code to copy it. Use the QR at a kiosk for faster release.
      </p>

      {isError && (
        <div className="border-2 border-persimmon bg-persimmon/10 text-ink p-3 rounded mb-4 text-sm font-semibold">
          The backend did not respond. Start the backend and refresh this page.
        </div>
      )}

      <div className="flex justify-between items-center mb-4 overflow-x-auto">
        <div className="flex border-2 border-ink">
          {tabs.map((tab, index) => (
            <button
              key={tab.k}
              onClick={() => setFilter(tab.k)}
              className={`px-3 py-1.5 text-[11px] font-bold tracking-wider transition-colors whitespace-nowrap ${
                filter === tab.k ? "bg-persimmon text-paper" : "hover:bg-ink hover:text-paper"
              } ${index < tabs.length - 1 ? "border-r border-ink" : ""}`}
            >
              {tab.l}
            </button>
          ))}
        </div>
      </div>

      <div className="border-2 border-ink">
        <div className="bg-ink text-paper grid grid-cols-[30px_1fr_130px_92px_80px_96px_72px] gap-3 px-3 py-2 text-[10px] tracking-editorial font-bold">
          <div>#</div><div>JOB</div><div>CODE</div><div>DATE</div><div>COST</div><div>STATUS</div><div>QR</div>
        </div>
        {filtered.map((job, index) => {
          const qrValue = job.qrPayload || `printloop://release/${job.code}`;
          const qrIsOpen = openQr === job.id;

          return (
            <div key={job.id} className={`${job.status === "ready" ? "bg-persimmon text-paper" : "hover:bg-paper-light"} transition-colors border-b border-ink/10 last:border-0`}>
              <div className="grid grid-cols-[30px_1fr_130px_92px_80px_96px_72px] gap-3 px-3 py-3 cursor-pointer items-center">
                <div className={`pl-serif italic font-bold text-base ${job.status === "ready" ? "text-paper" : "text-ochre"}`}>
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div>
                  <div className="font-semibold text-[13px]">{job.title || job.fileName}</div>
                  <div className={`text-[11px] mt-0.5 ${job.status === "ready" ? "text-paper/70" : "text-fog"}`}>{job.meta}</div>
                  {job.status === "refunded" && <div className="text-[10px] font-bold mt-1">Auto-refunded after 24-hour expiry.</div>}
                </div>
                <button
                  onClick={() => copyCode(job.code)}
                  className={`pl-mono text-[12px] font-bold inline-flex items-center gap-2 border-2 px-2 py-1 rounded transition-all ${
                    job.status === "ready" ? "border-paper text-paper hover:bg-paper hover:text-persimmon" : "border-ink hover:bg-ink hover:text-paper"
                  }`}
                  title="Copy print code"
                >
                  {job.code}
                  <Copy size={13} />
                </button>
                <div className={`text-xs font-semibold ${job.status === "ready" ? "" : "text-fog"}`}>{formatDate(job.createdAt)}</div>
                <div className="pl-mono text-[13px] font-bold">₦{job.cost.toLocaleString()}</div>
                <div>
                  <span className={`px-2 py-0.5 text-[9px] tracking-editorial font-bold ${statusClass(job.status)}`}>{job.status.toUpperCase()}</span>
                </div>
                <button
                  onClick={() => setOpenQr(qrIsOpen ? null : job.id)}
                  className={`inline-flex items-center justify-center border-2 rounded-md h-9 transition-all ${
                    job.status === "ready" ? "border-paper text-paper hover:bg-paper hover:text-persimmon" : "border-ink hover:bg-ink hover:text-paper"
                  }`}
                  title="Show QR code"
                >
                  <QrCode size={17} />
                </button>
              </div>
              {qrIsOpen && (
                <div className="px-3 pb-4 animate-fadein">
                  <div className="bg-paper text-ink border-2 border-ink p-4 inline-flex items-center gap-4">
                    <QRCodeSVG value={qrValue} size={112} level="M" includeMargin />
                    <div className="text-left">
                      <div className="editorial-label text-persimmon mb-1">KIOSK QR TOKEN</div>
                      <div className="pl-mono font-bold text-sm">{job.code}</div>
                      <div className="text-xs text-ink/60 mt-1">
                        Valid until {job.expiresAt ? new Date(job.expiresAt).toLocaleString() : "24 hours after payment"}.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!isLoading && filtered.length === 0 && (
          <div className="p-10 text-center text-ink/50 pl-serif italic">No jobs in this view.</div>
        )}
      </div>
    </div>
  );
}
