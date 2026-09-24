import { useState } from "react";
import { toast } from "sonner";
import { FileText, Upload, CheckCircle, MessageSquare, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/constants/routes";
import { useNavigate } from "react-router-dom";
import {
  useListEditQueueQuery,
  useStartEditMutation,
  useUploadEditedDocumentMutation,
  useCompleteEditMutation,
  useConfirmEditPaymentMutation,
  useGetEditJobQuery,
  useGetEditPricingQuery,
} from "@/store/services/saasApi";
import { extractError } from "@/lib/errors";

function statusConfig(status: string) {
  const configs: Record<string, { label: string; cls: string; icon: any }> = {
    pending_shop: { label: "PENDING SHOP", cls: "bg-ink/10 text-ink border border-ink/20", icon: AlertCircle },
    in_progress: { label: "IN PROGRESS", cls: "bg-ochre/15 text-ochre border border-ochre/30 animate-pulse", icon: MessageSquare },
    pending_customer: { label: "AWAITING CUSTOMER", cls: "bg-persimmon/15 text-persimmon border border-persimmon/30 animate-pulse", icon: AlertCircle },
    approved: { label: "APPROVED — AWAITING PAYMENT", cls: "bg-ochre/15 text-ochre border border-ochre/30", icon: CheckCircle },
    rejected: { label: "REJECTED — RE-EDIT NEEDED", cls: "bg-persimmon/15 text-persimmon border border-persimmon/30", icon: AlertCircle },
    completed: { label: "PAYMENT CONFIRMED", cls: "bg-sage/15 text-sage border border-sage/30", icon: CheckCircle },
  };
  return configs[status] || { label: status.toUpperCase(), cls: "bg-ink/10 text-ink", icon: AlertCircle };
}

function EditQueueCard({ edit, onStart, onUpload, onComplete, onConfirmPayment, onView, busy }: {
  edit: any;
  onStart: (id: string) => void;
  onUpload: (id: string) => void;
  onComplete: (id: string) => void;
  onConfirmPayment: (id: string) => void;
  onView: (id: string) => void;
  busy: boolean;
}) {
  const st = statusConfig(edit.status);
  const StatusIcon = st.icon;
  const job = edit.printJob;

  return (
    <div className="border-2 border-ink bg-paper-light overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        <div className="w-20 h-28 border-2 border-ink bg-paper shrink-0 flex items-center justify-center">
          <FileText className="w-8 h-8 text-ink/30" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <StatusIcon className="w-4 h-4" />
              <span className={`pl-pill text-[9px] font-bold uppercase ${st.cls}`}>{st.label}</span>
            </div>
            <span className="pl-mono text-[10px] text-ink/40">
              {new Date(edit.createdAt).toLocaleTimeString()}
            </span>
          </div>

          <h3 className="pl-serif font-bold text-lg leading-tight mt-1 truncate">
            {edit.originalDocumentMeta?.fileName || "Untitled document"}
          </h3>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink/65 mt-1.5 font-medium">
            <span>{edit.originalDocumentMeta?.pageCount || job?.totalPages || "?"} pp</span>
            <span>{job?.printConfiguration?.paper || "A4"}</span>
            <span>{job?.printConfiguration?.color === "color" ? "Colour" : "B&W"}</span>
            <span>{job?.printConfiguration?.sided === "double" ? "Duplex" : "Single"}</span>
            <span>{job?.printConfiguration?.qualityDpi || 300}dpi</span>
            <span>×{job?.printConfiguration?.copies || 1}</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[11px]">
            {job?.customerName ? (
              <span className="font-bold">{job.customerName}</span>
            ) : (
              <span className="text-ink/40 italic">guest</span>
            )}
            <span className="pl-mono font-bold text-persimmon">₦{Number(edit.totalEditFee).toLocaleString()}</span>
          </div>

          {job?.editingInstructions && (
            <div className="mt-2 text-[11px] text-ink/60 pl-serif italic bg-paper-light p-2 border border-ink/20">
              "{job.editingInstructions}"
            </div>
          )}
        </div>
      </div>

      <div className="border-t-2 border-ink px-4 py-2.5 flex gap-2 flex-wrap bg-paper">
        {edit.status === "pending_shop" && (
          <button
            onClick={() => onStart(edit.printJobId)}
            disabled={busy}
            className="pl-btn-primary px-3 py-1.5 text-[11px] font-bold flex items-center gap-1"
          >
            <MessageSquare className="w-3 h-3" /> START EDITING
          </button>
        )}
        {edit.status === "in_progress" && (
          <>
            <button
              onClick={() => {
                const padId = `edit-${edit.id}`;
                const etherpadUrl = `${window.location.origin.replace(':5173', ':9001')}/p/${padId}?showControls=true&showChat=true&showLineNumbers=true&useMonospaceFont=false`;
                window.open(etherpadUrl, '_blank', 'noopener,noreferrer');
              }}
              disabled={busy}
              className="pl-btn-primary px-3 py-1.5 text-[11px] font-bold flex items-center gap-1"
            >
              <MessageSquare className="w-3 h-3" /> OPEN EDITOR
            </button>
            <button
              onClick={() => onUpload(edit.printJobId)}
              disabled={busy}
              className="pl-btn-primary px-3 py-1.5 text-[11px] font-bold flex items-center gap-1"
            >
              <Upload className="w-3 h-3" /> UPLOAD EDITED
            </button>
            <button
              onClick={() => onComplete(edit.printJobId)}
              disabled={busy}
              className="pl-btn-dark px-3 py-1.5 text-[11px] font-bold flex items-center gap-1"
            >
              <CheckCircle className="w-3 h-3" /> MARK COMPLETE
            </button>
          </>
        )}
        {edit.status === "approved" && (
          <button
            onClick={() => onConfirmPayment(edit.printJobId)}
            disabled={busy}
            className="pl-btn-primary px-3 py-1.5 text-[11px] font-bold flex items-center gap-1"
          >
            <CheckCircle className="w-3 h-3" /> CONFIRM PAYMENT
          </button>
        )}
        {edit.status !== "pending_shop" && edit.status !== "completed" && (
          <button
            onClick={() => onView(edit.printJobId)}
            disabled={busy}
            className="pl-btn-ghost px-3 py-1.5 text-[11px] font-bold"
          >
            VIEW DETAILS
          </button>
        )}
      </div>
    </div>
  );
}

export default function SaasEditQueuePage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [uploadModal, setUploadModal] = useState<{ jobId: string; file: File | null; notes: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { data, isLoading, isFetching } = useListEditQueueQuery(
    { status: statusFilter !== "all" ? statusFilter as any : undefined, limit: 50 },
    { pollingInterval: 10_000, refetchOnFocus: true }
  );
  const [startEdit, { isLoading: isStarting }] = useStartEditMutation();
  const [uploadEditedDocument, { isLoading: isUploadingDoc }] = useUploadEditedDocumentMutation();
  const [completeEdit, { isLoading: isCompleting }] = useCompleteEditMutation();
  const [confirmEditPayment, { isLoading: isConfirmingPayment }] = useConfirmEditPaymentMutation();

  const edits: any[] = data?.items || [];
  const busy = isStarting || isUploadingDoc || isCompleting || isConfirmingPayment;

  const pending = edits.filter((e) => ["pending_shop", "in_progress"].includes(e.status));
  const awaitingCustomer = edits.filter((e) => ["pending_customer", "approved"].includes(e.status));
  const completed = edits.filter((e) => ["completed", "rejected"].includes(e.status));

  const filtered = statusFilter === "all" ? edits :
    statusFilter === "pending" ? pending :
    statusFilter === "awaiting_customer" ? awaitingCustomer :
    completed;

  const handleStart = async (jobId: string) => {
    try {
      const result = await startEdit({ jobId }).unwrap();
      const editorUrl = (result as any)?.editorUrl;
      if (editorUrl) {
        window.open(editorUrl, '_blank', 'noopener,noreferrer');
        toast.success("Edit job started — Etherpad opened in new tab.");
      } else {
        toast.success("Edit job started — you're now editing this document.");
      }
    } catch (err: any) {
      toast.error(extractError(err));
    }
  };

  const handleUpload = async (jobId: string) => {
    if (!uploadModal?.file) return;
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadModal.file);
      const uploadRes = await fetch("/api/files/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const uploadData = await uploadRes.json();
      const documentUrl = uploadData.fileURL || uploadData.url;

      await uploadEditedDocument({
        jobId,
        documentUrl,
        pageCount: uploadModal.file.size > 0 ? Math.ceil(uploadModal.file.size / 1024) : 1,
        fileSize: uploadModal.file.size,
        editOperations: [],
        shopNotes: uploadModal.notes,
      }).unwrap();

      toast.success("Edited document uploaded — customer notified for review.");
      setUploadModal(null);
    } catch (err: any) {
      toast.error(extractError(err));
    } finally {
      setIsUploading(false);
    }
  };

  const handleComplete = async (jobId: string) => {
    try {
      const result = await completeEdit({ jobId }).unwrap();
      const documentUrl = (result as any)?.documentUrl;
      if (documentUrl) {
        toast.success(`Edit complete — exported from Etherpad. Document ready for review.`);
      } else {
        toast.success("Edit marked complete — customer notified for review.");
      }
    } catch (err: any) {
      toast.error(extractError(err));
    }
  };

  const handleConfirmPayment = async (jobId: string) => {
    if (!confirm("Confirm this customer has paid the edit fee via bank transfer?")) return;
    try {
      await confirmEditPayment({ jobId }).unwrap();
      toast.success("Payment confirmed — job released to print queue.");
    } catch (err: any) {
      toast.error(extractError(err));
    }
  };

  const openUploadModal = (jobId: string) => {
    setUploadModal({ jobId, file: null, notes: "" });
  };

  const statusTabs = [
    { k: "all", label: `ALL · ${edits.length}` },
    { k: "pending", label: `PENDING · ${pending.length}` },
    { k: "awaiting_customer", label: `AWAITING CUSTOMER · ${awaitingCustomer.length}` },
    { k: "completed", label: `COMPLETED · ${completed.length}` },
  ];

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="editorial-label text-persimmon mb-1">▸ EDIT QUEUE</div>
          <h1 className="pl-serif font-extrabold text-3xl sm:text-4xl leading-none tracking-tight">
            Documents <em className="italic text-persimmon">being edited.</em>
          </h1>
          <p className="mt-1 text-sm text-ink/60 font-mono">
            {pending.length} pending · {awaitingCustomer.length} awaiting customer · {isFetching ? " · refreshing…" : " · live (10s)"}
          </p>
        </div>
      </div>

      <div className="mb-4 -mx-1 px-1 overflow-x-auto">
        <div className="flex border-2 border-ink w-fit">
          {statusTabs.map((tab, index) => (
            <button
              key={tab.k}
              onClick={() => setStatusFilter(tab.k)}
              className={`px-3 py-1.5 text-[11px] font-bold tracking-wider transition-colors whitespace-nowrap ${
                statusFilter === tab.k ? "bg-persimmon text-paper" : "hover:bg-ink hover:text-paper"
              } ${index < statusTabs.length - 1 ? "border-r border-ink" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="border-2 border-ink p-10 text-center text-fog italic pl-serif">
          Loading the edit queue…
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="border-4 border-ink bg-paper-light p-12 text-center">
          <div className="pl-mono text-5xl mb-3 text-ink/15">∅</div>
          <div className="pl-serif italic text-ink/55">
            No edit jobs {statusFilter !== "all" ? "in this view" : ""}.
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((edit) => (
            <EditQueueCard
              key={edit.id}
              edit={edit}
              onStart={handleStart}
              onUpload={openUploadModal}
              onComplete={handleComplete}
              onConfirmPayment={handleConfirmPayment}
              onView={(id) => navigate(`/saas/edit/${id}`)}
              busy={busy}
            />
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {uploadModal && (
        <div className="fixed inset-0 bg-ink/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadein">
          <form onSubmit={(e) => { e.preventDefault(); handleUpload(uploadModal.jobId); }} className="bg-paper border-4 border-ink shadow-[8px_8px_0_#000] p-6 max-w-md w-full rounded flex flex-col gap-4 animate-fadein relative">
            <button
              type="button"
              onClick={() => setUploadModal(null)}
              className="absolute top-3 right-3 text-ink bg-paper border-2 border-ink p-1 font-bold hover:bg-persimmon hover:text-paper leading-none transition-colors w-7 h-7 flex items-center justify-center rounded"
              aria-label="Close"
            >
              ✕
            </button>

            <div>
              <div className="editorial-label text-persimmon mb-0.5">UPLOAD EDITED DOCUMENT</div>
              <h2 className="pl-serif text-2xl font-bold tracking-tight leading-tight">Upload the corrected file</h2>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] tracking-editorial font-extrabold text-ink/75 uppercase">
                Edited File (PDF)
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setUploadModal({ ...uploadModal, file: e.target.files?.[0] || null })}
                className="border-2 border-ink p-2 text-sm bg-white font-medium focus:outline-none focus:ring-2 focus:ring-persimmon/55"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] tracking-editorial font-extrabold text-ink/75 uppercase">
                Shop Notes (optional)
              </label>
              <textarea
                value={uploadModal.notes}
                onChange={(e) => setUploadModal({ ...uploadModal, notes: e.target.value })}
                placeholder="Notes for the customer about what was changed..."
                rows={3}
                className="border-2 border-ink p-2 text-sm bg-white font-medium focus:outline-none focus:ring-2 focus:ring-persimmon/55"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="ghost" type="button" onClick={() => setUploadModal(null)}>CANCEL</Button>
              <Button variant="primary" type="submit" loading={isUploading}>UPLOAD EDITED DOCUMENT</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}