import { useMemo, useState } from "react";
import { Copy, QrCode, AlertTriangle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useListJobsQuery, useSubmitDisputeMutation, useUploadFileMutation } from "@/store/services/jobsApi";
import { useSubmitShopReviewMutation } from "@/store/services/discoveryApi";

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
  tenantId?: string | null;
  tenantSlug?: string | null;
  tenantName?: string | null;
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
    { k: "ready" as const, l: `READY · ${allJobs.filter((j) => j.status === "ready").length}` },
    { k: "done" as const, l: `DONE · ${allJobs.filter((j) => j.status === "done").length}` },
    { k: "refunded" as const, l: `REFUNDED · ${allJobs.filter((j) => j.status === "refunded").length}` },
    { k: "failed" as const, l: `FAILED · ${allJobs.filter((j) => j.status === "failed").length}` },
  ];

  const [submitDispute, { isLoading: isDisputing }] = useSubmitDisputeMutation();

  const [submitReview, { isLoading: isSubmittingReview }] = useSubmitShopReviewMutation();
  const [uploadFile] = useUploadFileMutation();

  const [reviewingJob, setReviewingJob] = useState<Job | null>(null);
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>("");
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);

  const handleOpenReview = (job: Job) => {
    setReviewingJob(job);
  };

  const handleCloseReview = () => {
    setReviewingJob(null);
    setRating(5);
    setComment("");
    setSelectedPhoto(null);
    setUploadedPhotoUrl(null);
    setIsUploadingPhoto(false);
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedPhoto(file);
    setIsUploadingPhoto(true);
    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await uploadFile(fd).unwrap();
      if (res?.data?.fileURL) {
        setUploadedPhotoUrl(res.data.fileURL);
        toast.success("Photo uploaded successfully.");
      } else {
        toast.error("Failed to get photo URL from server.");
      }
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to upload photo.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingJob || !reviewingJob.tenantSlug) return;

    try {
      await submitReview({
        slug: reviewingJob.tenantSlug,
        rating,
        comment: comment.trim() || undefined,
        photoUrl: uploadedPhotoUrl || undefined,
      }).unwrap();
      toast.success("Thank you! Your review has been submitted.");
      handleCloseReview();
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to submit review.");
    }
  };

  const handleDispute = async (jobId: string) => {
    const reason = prompt("Describe the issue with this print job (e.g., paper jam, poor print quality, didn't print):");
    if (!reason?.trim()) return;

    try {
      await submitDispute({ printJobId: jobId, reason: reason.trim() }).unwrap();
      toast.success("Dispute filed successfully. A shop administrator will review it.");
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to file dispute.");
    }
  };

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
      <h1 className="pl-serif text-3xl sm:text-4xl font-bold tracking-tight mb-1">
        Every print, <em className="italic text-persimmon font-semibold">accounted for</em>.
      </h1>
      <p className="pl-serif italic text-ink/60 mb-6 sm:mb-7 text-sm sm:text-base">
        Tap any code to copy it. Use the QR at a kiosk for faster release.
      </p>

      {isError && (
        <div className="border-2 border-persimmon bg-persimmon/10 text-ink p-3 rounded mb-4 text-sm font-semibold">
          The backend did not respond. Start the backend and refresh this page.
        </div>
      )}

      {/* Filter tabs — horizontal scroll on phone so they all fit. */}
      <div className="mb-4 -mx-1 px-1 overflow-x-auto">
        <div className="flex border-2 border-ink w-fit">
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

      {/* ── Desktop table ─────────────────────────────────────────── */}
      <div className="hidden md:block border-2 border-ink">
        <div className="bg-ink text-paper grid grid-cols-[30px_1fr_110px_85px_70px_80px_150px] gap-3 px-3 py-2 text-[10px] tracking-editorial font-bold">
          <div>#</div>
          <div>JOB</div>
          <div>CODE</div>
          <div>DATE</div>
          <div>COST</div>
          <div>STATUS</div>
          <div>ACTION</div>
        </div>
        {filtered.map((job, index) => {
          const qrValue = job.qrPayload || `printloop://release/${job.code}`;
          const qrIsOpen = openQr === job.id;

          return (
            <div
              key={job.id}
              className={`${
                job.status === "ready" ? "bg-persimmon text-paper" : "hover:bg-paper-light"
              } transition-colors border-b border-ink/10 last:border-0`}
            >
              <div className="grid grid-cols-[30px_1fr_110px_85px_70px_80px_150px] gap-3 px-3 py-3 cursor-pointer items-center">
                <div
                  className={`pl-serif italic font-bold text-base ${
                    job.status === "ready" ? "text-paper" : "text-ochre"
                  }`}
                >
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div>
                  <div className="font-semibold text-[13px]">{job.title || job.fileName}</div>
                  <div
                    className={`text-[11px] mt-0.5 ${
                      job.status === "ready" ? "text-paper/70" : "text-fog"
                    }`}
                  >
                    {job.meta}
                  </div>
                  {job.status === "refunded" && (
                    <div className="text-[10px] font-bold mt-1">
                      Auto-refunded after 24-hour expiry.
                    </div>
                  )}
                </div>
                <button
                  onClick={() => copyCode(job.code)}
                  className={`pl-mono text-[12px] font-bold inline-flex items-center gap-2 border-2 px-2 py-1 rounded transition-all ${
                    job.status === "ready"
                      ? "border-paper text-paper hover:bg-paper hover:text-persimmon"
                      : "border-ink hover:bg-ink hover:text-paper"
                  }`}
                  title="Copy print code"
                >
                  {job.code}
                  <Copy size={13} />
                </button>
                <div
                  className={`text-xs font-semibold ${job.status === "ready" ? "" : "text-fog"}`}
                >
                  {formatDate(job.createdAt)}
                </div>
                <div className="pl-mono text-[13px] font-bold">₦{job.cost.toLocaleString()}</div>
                <div>
                  <span
                    className={`px-2 py-0.5 text-[9px] tracking-editorial font-bold ${statusClass(
                      job.status,
                    )}`}
                  >
                    {job.status.toUpperCase()}
                  </span>
                </div>
                {job.status === "ready" ? (
                  <button
                    onClick={() => setOpenQr(qrIsOpen ? null : job.id)}
                    className="inline-flex items-center justify-center border-2 rounded-md h-9 w-9 border-paper text-paper hover:bg-paper hover:text-persimmon transition-all"
                    title="Show QR code"
                  >
                    <QrCode size={17} />
                  </button>
                ) : job.status === "done" ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleDispute(job.id)}
                      disabled={isDisputing}
                      className="inline-flex items-center justify-center border-2 border-persimmon text-persimmon hover:bg-persimmon hover:text-paper rounded-md h-9 px-2 text-[10px] font-bold transition-all disabled:opacity-50"
                      title="Dispute print job"
                    >
                      DISPUTE
                    </button>
                    {job.tenantSlug && (
                      <button
                        onClick={() => handleOpenReview(job)}
                        className="inline-flex items-center justify-center border-2 border-ink bg-ink text-paper hover:bg-persimmon hover:text-paper rounded-md h-9 px-2 text-[10px] font-bold transition-all"
                        title="Leave a Review"
                      >
                        REVIEW
                      </button>
                    )}
                  </div>
                ) : job.status === "failed" ? (
                  <button
                    onClick={() => handleDispute(job.id)}
                    disabled={isDisputing}
                    className="inline-flex items-center justify-center border-2 border-persimmon text-persimmon hover:bg-persimmon hover:text-paper rounded-md h-9 px-2 text-[10px] font-bold transition-all disabled:opacity-50"
                    title="Dispute print job"
                  >
                    DISPUTE
                  </button>
                ) : (
                  <span className="text-fog text-xs">—</span>
                )}
              </div>
              {qrIsOpen && (
                <div className="px-3 pb-4 animate-fadein">
                  <div className="bg-paper text-ink border-2 border-ink p-4 inline-flex items-center gap-4">
                    <QRCodeSVG value={qrValue} size={112} level="M" includeMargin />
                    <div className="text-left">
                      <div className="editorial-label text-persimmon mb-1">KIOSK QR TOKEN</div>
                      <div className="pl-mono font-bold text-sm">{job.code}</div>
                      <div className="text-xs text-ink/60 mt-1">
                        Valid until{" "}
                        {job.expiresAt ? new Date(job.expiresAt).toLocaleString() : "24 hours after payment"}.
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

      {/* ── Mobile cards ──────────────────────────────────────────── */}
      <ul className="md:hidden flex flex-col gap-3">
        {filtered.map((job) => {
          const qrValue = job.qrPayload || `printloop://release/${job.code}`;
          const qrIsOpen = openQr === job.id;
          const isReady = job.status === "ready";
          return (
            <li
              key={job.id}
              className={`border-2 border-ink rounded-lg overflow-hidden ${
                isReady ? "bg-persimmon text-paper" : "bg-paper-light"
              }`}
            >
              <div className="p-4">
                {/* Title + status */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-base truncate">{job.title || job.fileName}</div>
                    {job.meta && (
                      <div
                        className={`text-[11px] mt-0.5 ${isReady ? "text-paper/70" : "text-fog"}`}
                      >
                        {job.meta}
                      </div>
                    )}
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[9px] tracking-editorial font-bold flex-shrink-0 ${statusClass(
                      job.status,
                    )}`}
                  >
                    {job.status.toUpperCase()}
                  </span>
                </div>

                {/* Code — large, tappable to copy */}
                <button
                  onClick={() => copyCode(job.code)}
                  className={`w-full pl-mono text-xl font-bold inline-flex items-center justify-between gap-2 border-2 px-3 py-2.5 rounded transition-all mb-3 ${
                    isReady
                      ? "border-paper text-paper active:bg-paper active:text-persimmon"
                      : "border-ink active:bg-ink active:text-paper"
                  }`}
                >
                  {job.code}
                  <Copy size={16} />
                </button>

                {/* Date + cost */}
                <div className="flex items-center justify-between text-xs mb-3">
                  <span className={isReady ? "" : "text-fog"}>
                    <span className="font-bold">When:</span> {formatDate(job.createdAt)}
                  </span>
                  <span className="pl-mono font-bold text-sm">₦{job.cost.toLocaleString()}</span>
                </div>

                {/* QR toggle */}
                {isReady && (
                  <button
                    onClick={() => setOpenQr(qrIsOpen ? null : job.id)}
                    className="w-full inline-flex items-center justify-center gap-2 border-2 px-3 py-2.5 rounded text-[11px] font-bold tracking-editorial transition-all border-paper text-paper active:bg-paper active:text-persimmon"
                  >
                    <QrCode size={15} />
                    {qrIsOpen ? "HIDE QR" : "SHOW QR FOR KIOSK"}
                  </button>
                )}

                {/* Dispute button */}
                {(job.status === "done" || job.status === "failed") && (
                  <button
                    onClick={() => handleDispute(job.id)}
                    disabled={isDisputing}
                    className="w-full inline-flex items-center justify-center gap-2 border-2 border-persimmon text-persimmon active:bg-persimmon active:text-paper px-3 py-2.5 rounded text-[11px] font-bold tracking-editorial transition-all disabled:opacity-50"
                  >
                    <AlertTriangle size={15} />
                    DISPUTE PRINT JOB
                  </button>
                )}

                {/* Review button */}
                {job.status === "done" && job.tenantSlug && (
                  <button
                    onClick={() => handleOpenReview(job)}
                    className="w-full mt-2 inline-flex items-center justify-center gap-2 border-2 border-ink bg-ink text-paper active:bg-persimmon active:text-paper px-3 py-2.5 rounded text-[11px] font-bold tracking-editorial transition-all"
                  >
                    LEAVE SHOP REVIEW
                  </button>
                )}

                {job.status === "refunded" && (
                  <div className="text-[10px] font-bold mt-3">
                    Auto-refunded after 24-hour expiry.
                  </div>
                )}
              </div>

              {qrIsOpen && (
                <div className="bg-paper text-ink border-t-2 border-ink p-4 flex flex-col items-center gap-3 animate-fadein">
                  <QRCodeSVG value={qrValue} size={160} level="M" includeMargin />
                  <div className="text-center">
                    <div className="editorial-label text-persimmon mb-1">KIOSK QR TOKEN</div>
                    <div className="pl-mono font-bold text-sm">{job.code}</div>
                    <div className="text-xs text-ink/60 mt-1">
                      Valid until{" "}
                      {job.expiresAt ? new Date(job.expiresAt).toLocaleString() : "24 hours after payment"}.
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {!isLoading && filtered.length === 0 && (
          <li className="border-2 border-dashed border-ink/30 rounded-lg p-8 text-center text-sm text-fog">
            No jobs in this view.
          </li>
        )}
      </ul>

      {/* Review Modal */}
      {reviewingJob && (
        <div className="fixed inset-0 bg-ink/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleReviewSubmit}
            className="bg-paper border-4 border-ink shadow-[8px_8px_0_#000] p-6 max-w-md w-full rounded flex flex-col gap-4 animate-fadein relative"
          >
            {/* Close button */}
            <button
              type="button"
              onClick={handleCloseReview}
              className="absolute top-3 right-3 text-ink bg-paper border-2 border-ink p-1 font-bold hover:bg-persimmon hover:text-paper leading-none transition-colors w-7 h-7 flex items-center justify-center rounded"
              aria-label="Close"
            >
              ✕
            </button>

            <div>
              <div className="editorial-label text-persimmon mb-0.5">LEAVE A REVIEW</div>
              <h2 className="pl-serif text-2xl font-bold tracking-tight leading-tight">
                {reviewingJob.tenantName || "Rate Print Shop"}
              </h2>
              <p className="text-xs text-ink/60 mt-1 italic">
                Share your print experience for job code <span className="font-mono font-bold">{reviewingJob.code}</span>.
              </p>
            </div>

            {/* Stars */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] tracking-editorial font-extrabold text-ink/75 uppercase text-center">
                Rating
              </label>
              <div className="flex gap-1.5 justify-center my-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className={`w-10 h-10 text-lg font-bold border-2 border-ink flex items-center justify-center transition-colors rounded ${
                      star <= rating ? "bg-ochre text-ink" : "bg-paper text-ink/40 hover:bg-ochre/25"
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] tracking-editorial font-extrabold text-ink/75 uppercase">
                Comment (optional)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What went well? How was the service?"
                rows={3}
                className="border-2 border-ink p-2 text-sm bg-white font-medium focus:outline-none focus:ring-2 focus:ring-persimmon/55"
              />
            </div>

            {/* Photo upload */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] tracking-editorial font-extrabold text-ink/75 uppercase">
                Attach Photo (optional)
              </label>
              <div className="border-2 border-dashed border-ink/40 p-4 bg-white text-center relative flex flex-col items-center justify-center min-h-[96px]">
                {uploadedPhotoUrl ? (
                  <div className="flex flex-col items-center gap-2">
                    <img src={uploadedPhotoUrl} alt="Preview" className="max-h-24 object-cover border-2 border-ink" />
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPhoto(null);
                        setUploadedPhotoUrl(null);
                      }}
                      className="text-[10px] text-persimmon font-bold hover:underline"
                    >
                      Remove Photo
                    </button>
                  </div>
                ) : isUploadingPhoto ? (
                  <p className="text-xs text-gray-500 font-bold animate-pulse">Uploading photo...</p>
                ) : (
                  <>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoChange}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <p className="text-xs text-gray-500 font-semibold">Click to upload or drag image here</p>
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end mt-2">
              <button
                type="button"
                onClick={handleCloseReview}
                className="px-4 py-2 border-2 border-ink bg-paper text-ink font-bold text-xs uppercase hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingReview || isUploadingPhoto}
                className="pl-btn-primary py-2 px-4 justify-center text-center font-extrabold text-xs uppercase disabled:opacity-50"
              >
                {isSubmittingReview ? "Submitting..." : "Submit Review"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
