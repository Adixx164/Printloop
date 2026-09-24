import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle, AlertCircle, CreditCard, Download, FileText, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { UniverEditor } from '@/components/editor';
import { useEditorSession } from '@/hooks/useEditorSession';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/constants/routes';
import { config } from '@/lib/config';
import type { EditorRole } from '@/types/editor';

export default function EditReviewPage() {
  const navigate = useNavigate();
  const { jobId } = useParams<{ jobId: string }>();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Find the session for this jobId
  // In real app, we'd fetch session by jobId from API
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<any>(null);

  // Fetch session info
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/saas/edit/by-job/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data?.sessionId) {
            setSessionId(data.data.sessionId);
            setSessionInfo(data.data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch edit session:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSession();
  }, [jobId]);

  const role: EditorRole = 'customer';

  const {
    session,
    document,
    token,
    iceServers,
    isLoading: editorLoading,
    isConnected,
    saveSnapshot,
    exportDocument,
    approveEdit,
    rejectEdit,
  } = useEditorSession({
    sessionId: sessionId || '',
    role,
    onError: (err) => toast.error(err.message),
  });

  // Handle approve
  const handleApprove = async () => {
    if (!token) return;
    setIsSubmitting(true);
    try {
      const result = await approveEdit();
      // Redirect to Paystack checkout
      if (result.paymentUrl) {
        window.open(result.paymentUrl, '_blank', 'noopener');
        toast.success('Redirecting to Paystack for payment...');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle reject
  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setIsSubmitting(true);
    try {
      await rejectEdit(rejectReason);
      toast.success('Changes requested — shop notified to revise');
      setShowRejectDialog(false);
      setRejectReason('');
      // Refresh to get updated status
      if (sessionId) {
        // The session will be updated via WebSocket
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to request changes');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle back
  const handleBack = () => {
    navigate(ROUTES.APP.DASHBOARD);
  };

  // Loading state
  if (isLoading || !sessionId) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-persimmon border-t-transparent rounded-full animate-spin" />
          <p className="pl-serif italic text-ink/60">Loading edit review...</p>
        </div>
      </div>
    );
  }

  if (!token || !session) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="border-2 border-ink rounded-pl p-8 text-center">
          <div className="text-4xl mb-3">📝</div>
          <h2 className="pl-serif font-bold text-xl mb-2">Edit session not found</h2>
          <p className="text-ink/60 mb-4">This document is not available for review or the session has expired.</p>
          <Button variant="ghost" onClick={handleBack}>← Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  const printJob = session.documentEdit?.printJob;
  const isPendingCustomer = session.status === 'pending_customer';
  const isApproved = session.status === 'approved';
  const isAwaitingPayment = session.status === 'awaiting_payment';

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack} className="flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            BACK
          </Button>
          <div>
            <div className="editorial-label text-persimmon">EDIT REVIEW</div>
            <h1 className="pl-serif font-extrabold text-2xl sm:text-3xl leading-tight">
              {document?.name || 'Untitled Document'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Connection status */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 border-2 rounded-pl ${isConnected ? 'border-sage bg-sage/10' : 'border-persimmon bg-persimmon/10'}`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-sage' : 'bg-persimmon'}`} />
            <span className="text-[10px] font-bold tracking-editorial">
              {isConnected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>

          {/* Status badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 border-2 rounded-pl ${
            isPendingCustomer ? 'border-persimmon bg-persimmon/10' :
            isApproved ? 'border-ochre bg-ochre/10' :
            isAwaitingPayment ? 'border-ochre bg-ochre/10' :
            'border-sage bg-sage/10'
          }`}>
            <span className="text-[10px] font-bold tracking-editorial">
              {isPendingCustomer ? 'AWAITING YOUR REVIEW' :
              isApproved ? 'APPROVED — AWAITING PAYMENT' :
              isAwaitingPayment ? 'PAYMENT PENDING' :
              'REVIEW COMPLETE'}
            </span>
          </div>
        </div>
      </div>

      {/* Document info */}
      <div className="border-2 border-ink bg-paper-light rounded-pl p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
          <div>
            <div className="editorial-label text-ink/60">PRINT JOB</div>
            <div className="font-bold pl-mono">{sessionInfo?.printJob?.code || '—'}</div>
          </div>
          <div>
            <div className="editorial-label text-ink/60">PAGES</div>
            <div className="font-bold pl-mono">{sessionInfo?.printJob?.totalPages || '?'} pp</div>
          </div>
          <div>
            <div className="editorial-label text-ink/60">FORMAT</div>
            <div className="font-bold">{sessionInfo?.printJob?.printConfiguration?.paper || 'A4'}</div>
          </div>
          <div>
            <div className="editorial-label text-ink/60">TOTAL EDIT FEE</div>
            <div className="font-bold text-persimmon pl-mono">₦{Number(sessionInfo?.totalEditFee || 0).toLocaleString()}</div>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showOriginal}
              onChange={(e) => setShowOriginal(e.target.checked)}
              className="w-4 h-4 border-2 border-ink rounded accent-persimmon"
            />
            <span className="text-sm font-medium">
              {showOriginal ? 'Showing Original' : 'Showing Edited Version'}
            </span>
          </label>

          <div className="flex-1" />

          {/* Shop notes */}
          {session?.shopNotes ? (
            <div className="border-2 border-ochre/60 bg-ochre/10 p-3 rounded-pl text-sm pl-serif">
              <span className="font-bold text-ochre">Shop Notes: </span>
              <span className="pl-serif italic">{session.shopNotes}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Main content area */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Main editor/preview */}
        <div className="relative min-h-[600px]">
          {token && document ? (
            <UniverEditor
              sessionId={sessionId!}
              role={role}
              initialDocument={document}
              token={token}
              iceServers={iceServers}
              onExport={async () => {}}
              onApprove={handleApprove}
              onReject={handleReject}
              onSaveStatusChange={() => {}}
            />
          ) : null}

          {!token ? (
            <div className="border-2 border-ink rounded-pl p-8 text-center min-h-[600px] flex flex-col items-center justify-center">
              <div className="text-4xl mb-3">📄</div>
              <h2 className="pl-serif font-bold text-xl mb-2">Document not available</h2>
              <p className="text-ink/60 mb-4">The document is still being prepared or the session has expired.</p>
              <Button variant="ghost" onClick={handleBack}>← Back to Dashboard</Button>
            </div>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Status card */}
          <div className={`border-2 rounded-pl p-5 ${
            isPendingCustomer ? 'border-persimmon bg-persimmon/5' :
            isApproved ? 'border-ochre bg-ochre/10' :
            'border-sage bg-sage/5'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isPendingCustomer ? 'bg-persimmon/20' :
                isApproved ? 'bg-ochre/20' :
                'bg-sage/20'
              }`}>
                {isPendingCustomer ? (
                <AlertCircle className="w-5 h-5 text-persimmon" />
              ) : isApproved ? (
                <CheckCircle className="w-5 h-5 text-ochre" />
              ) : (
                <CheckCircle className="w-5 h-5 text-sage" />
              )}
              </div>
              <div>
                <div className="editorial-label text-persimmon">STATUS</div>
                <div className="pl-serif font-bold text-lg">
                  {isPendingCustomer ? 'REVIEW REQUIRED' : isApproved ? 'APPROVED' : 'COMPLETED'}
                </div>
              </div>
            </div>

            {isPendingCustomer ? (
              <div className="space-y-3">
                <p className="pl-serif italic text-ink/60 text-sm">
                  The shop has finished editing your document. Please review the changes above.
                </p>

                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    arrow
                    onClick={handleApprove}
                    loading={isSubmitting}
                    className="flex-1"
                  >
                    {isSubmitting ? 'PROCESSING…' : `APPROVE & PAY ₦${Number(sessionInfo?.totalEditFee || 0).toLocaleString()}`}
                  </Button>
                  <Button
                    variant="dark"
                    onClick={() => setShowRejectDialog(true)}
                    className="flex-1"
                  >
                    REQUEST CHANGES
                  </Button>
                </div>
              </div>
) : null}

            {isApproved ? (
              <div className="space-y-3">
                <p className="pl-serif italic text-ink/60 text-sm">
                  You've approved the edits. Complete payment to proceed to printing.
                </p>
                <Button
                  variant="primary"
                  arrow
                  onClick={handleApprove}
                  loading={isSubmitting}
                  className="w-full"
                >
                  {isSubmitting ? 'PROCESSING…' : `PAY ₦${Number(sessionInfo?.totalEditFee || 0).toLocaleString()} & PRINT`}
                </Button>
                <p className="text-[11px] text-ink/55 pl-serif italic text-center">
                  Secure checkout via <b>Paystack</b> — Card · Transfer · USSD
                </p>
              </div>
            ) : null}
          </div>

          {/* Edit instructions */}
          <div className="border-2 border-ink bg-paper-light rounded-pl p-4">
            <div className="editorial-label text-persimmon mb-2">YOUR INSTRUCTIONS</div>
            <p className="pl-serif italic text-ink/70 whitespace-pre-wrap text-sm">
              {sessionInfo?.printJob?.editingInstructions || 'No specific instructions provided.'}
            </p>
          </div>

          {/* Shop notes */}
          {session?.shopNotes ? (
            <div className="border-2 border-ochre/60 bg-ochre/10 rounded-pl p-4">
              <div className="editorial-label text-ochre mb-2">SHOP NOTES</div>
              <p className="pl-serif italic text-sm">{session.shopNotes}</p>
            </div>
          ) : null}

          {/* Bank details for payment */}
          {isApproved && sessionInfo?.bankDetails ? (
            <div className="border-2 border-ink bg-paper-light rounded-pl p-4">
              <div className="editorial-label text-persimmon mb-3">PAYMENT DETAILS</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="editorial-label">Account Name</span>
                  <span className="font-bold pl-mono">{sessionInfo.bankDetails.accountName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="editorial-label">Account Number</span>
                  <span className="font-bold pl-mono">{sessionInfo.bankDetails.accountNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="editorial-label">Bank</span>
                  <span className="font-bold">{sessionInfo.bankDetails.bankName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="editorial-label">Sort Code</span>
                  <span className="font-bold pl-mono">{sessionInfo.bankDetails.sortCode}</span>
                </div>
                <p className="text-[10px] text-ink/55 pl-serif italic pt-2">
                  After payment, the shop will confirm and your job will proceed to printing.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Reject Dialog */}
      {showRejectDialog ? (
        <div className="fixed inset-0 bg-ink/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadein">
          <form onSubmit={(e) => { e.preventDefault(); handleReject(); }} className="bg-paper border-4 border-ink shadow-[8px_8px_0_#000] p-6 max-w-md w-full rounded animate-fadein">
            <button
              type="button"
              onClick={() => { setShowRejectDialog(false); setRejectReason(''); }}
              className="absolute top-3 right-3 text-ink bg-paper border-2 border-ink p-1 font-bold hover:bg-persimmon hover:text-paper leading-none transition-colors w-7 h-7 flex items-center justify-center rounded"
              aria-label="Close"
            >
              ✕
            </button>

            <div className="mb-4">
              <div className="editorial-label text-persimmon mb-1">REQUEST CHANGES</div>
              <h2 className="pl-serif text-2xl font-bold tracking-tight leading-tight">
                What needs to be fixed?
              </h2>
            </div>

            <div className="mb-4">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Describe the changes needed (e.g., 'Page 3 formatting is off', 'Logo is wrong color', 'Page numbers missing'...)"
                rows={4}
                className="w-full border-2 border-ink p-3 text-sm bg-paper-light font-medium resize-y focus:outline-none focus:border-persimmon"
                required
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="ghost" type="button" onClick={() => { setShowRejectDialog(false); setRejectReason(''); }}>CANCEL</Button>
              <Button variant="dark" type="submit" loading={isSubmitting}>SUBMIT REQUEST</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}