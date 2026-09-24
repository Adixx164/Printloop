import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Download, CheckCircle, AlertCircle, FileText, Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { UniverEditor } from '@/components/editor';
import { useEditorSession } from '@/hooks/useEditorSession';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/constants/routes';
import { config } from '@/lib/config';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import type { EditorRole } from '@/types/editor';

export default function EditorWorkspacePage() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'pwg'>('pdf');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showExportDialog, setShowExportDialog] = useState(false);

  const { sessionId: paramSessionId } = useParams<{ sessionId: string }>();
  const effectiveSessionId = sessionId || paramSessionId;

  const role: EditorRole = 'shop';

  const {
    session,
    document: univerDocument,
    token,
    iceServers,
    isLoading,
    isConnected,
    saveSnapshot,
    exportDocument,
    approveEdit,
    rejectEdit,
    refreshSession,
} = useEditorSession({
    sessionId: effectiveSessionId || '',
    role,
    onSaveStatusChange: setSaveStatus,
    onError: (err) => toast.error(err.message),
  });

  // Handle export
  const handleExport = async (format: 'pdf' | 'pwg') => {
    if (!token) return;
    setIsExporting(true);
    try {
      const result = await exportDocument(format);
      toast.success(`Exported as ${format.toUpperCase()} — ${result.pageCount} page${result.pageCount > 1 ? 's' : ''}`);

      // Auto-download
      const link = globalThis.document.createElement('a');
      link.href = result.documentUrl;
      link.download = `edited-${session?.documentEditId}.${format}`;
      link.click();
    } catch (err: any) {
      toast.error(err.message || 'Export failed');
    } finally {
      setIsExporting(false);
      setShowExportDialog(false);
    }
  };

  // Handle approve (shop marks complete)
  const handleApprove = async () => {
    try {
      // Export first if needed
      if (session?.status === 'in_progress') {
        setIsExporting(true);
        try {
          const result = await exportDocument('pdf');
          toast.success('Document exported — ready for customer review');
        } catch (err) {
          toast.error('Failed to export before approval');
          return;
        } finally {
          setIsExporting(false);
        }
      }
      
      // The customer approves, not the shop
      // Shop just exports and marks complete via export
      toast.success('Document exported successfully. Customer will be notified for review.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve');
    }
  };

  // Handle back navigation
  const handleBack = () => {
    navigate(ROUTES.SAAS.EDIT_QUEUE);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-persimmon border-t-transparent rounded-full animate-spin" />
          <p className="pl-serif italic text-ink/60">Loading editor session…</p>
        </div>
      </div>
    );
  }

  if (!token || !session) {
    return (
      <div className="border-2 border-ink rounded-pl p-8 text-center">
        <div className="text-4xl mb-3">📝</div>
        <h2 className="pl-serif font-bold text-xl mb-2">Unable to load editor</h2>
        <p className="text-ink/60 mb-4">The editing session could not be loaded.</p>
        <Button variant="ghost" onClick={handleBack}>← Back to Edit Queue</Button>
      </div>
    );
  }

  const printJob = session.documentEdit?.printJob;
  const editInstructions = printJob?.editingInstructions || 'No specific instructions provided.';

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 h-[calc(100vh-80px)] flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack} className="flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            BACK
          </Button>
          <div>
            <div className="editorial-label text-persimmon">EDITOR WORKSPACE</div>
            <h1 className="pl-serif font-extrabold text-2xl sm:text-3xl leading-tight">
              {univerDocument?.name || 'Untitled Document'}
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

          {/* Save status */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 border-2 rounded-pl ${
            saveStatus === 'saving' ? 'border-ochre bg-ochre/10' :
            saveStatus === 'error' ? 'border-persimmon bg-persimmon/10' :
            'border-sage bg-sage/10'
          }`}>
            <span className={`w-2 h-2 rounded-full ${saveStatus === 'saving' ? 'animate-pulse' : ''} ${
              saveStatus === 'saving' ? 'bg-ochre' :
              saveStatus === 'error' ? 'bg-persimmon' :
              'bg-sage'
            }`} />
            <span className="text-[10px] font-bold tracking-editorial">
              {saveStatus === 'saving' ? 'SAVING…' : saveStatus === 'saved' ? 'SAVED' : saveStatus.toUpperCase()}
            </span>
          </div>

          {/* Export button */}
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setShowExportDialog(true)}
            className="flex items-center gap-1"
          >
            <Download className="w-4 h-4" />
            EXPORT
          </Button>

          {session.status === 'in_progress' || session.status === 'pending_customer' ? (
            <Button 
              variant="primary" 
              size="sm" 
              onClick={handleApprove}
              className="flex items-center gap-1"
            >
              <CheckCircle className="w-4 h-4" />
              {session.status === 'in_progress' ? 'EXPORT & COMPLETE' : 'CUSTOMER REVIEW'}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Document info bar */}
      <div className="border-2 border-ink bg-paper-light rounded-pl p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div>
            <div className="editorial-label text-ink/60">PRINT JOB</div>
            <div className="font-bold pl-mono">{printJob?.code || '—'}</div>
          </div>
          <div>
            <div className="editorial-label text-ink/60">PAGES</div>
            <div className="font-bold pl-mono">{printJob?.totalPages || '?'} pp</div>
          </div>
          <div>
            <div className="editorial-label text-ink/60">FORMAT</div>
            <div className="font-bold">{printJob?.printConfiguration?.paper || 'A4'}</div>
          </div>
          <div>
            <div className="editorial-label text-ink/60">COLOR</div>
            <div className="font-bold">{printJob?.printConfiguration?.color === 'color' ? 'Colour' : 'B&W'}</div>
          </div>
          <div>
            <div className="editorial-label text-ink/60">QUALITY</div>
            <div className="font-bold pl-mono">{printJob?.printConfiguration?.qualityDpi || 300}dpi</div>
          </div>
        </div>
        
        {/* Edit instructions */}
        <div className="mt-4 pt-4 border-t-2 border-ink/20">
          <div className="editorial-label text-persimmon mb-1">EDIT INSTRUCTIONS</div>
          <p className="pl-serif italic text-ink/70 whitespace-pre-wrap">{editInstructions}</p>
        </div>
      </div>

      {/* Main Editor */}
      <div className="flex-1 min-h-0 relative">
{token && univerDocument && (
            <UniverEditor
            sessionId={effectiveSessionId!}
            role={role}
            initialDocument={univerDocument}
            token={token}
            iceServers={iceServers}
            onExport={handleExport}
            onApprove={handleApprove}
            onReject={(reason) => rejectEdit(reason)}
            onSaveStatusChange={setSaveStatus}
          />
        )}
      </div>

{/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>EXPORT DOCUMENT</DialogTitle>
            <DialogDescription>
              Choose format and export the edited document for printing or review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {(['pdf', 'pwg'] as const).map(format => (
              <button
                key={format}
                onClick={() => handleExport(format)}
                disabled={isExporting}
                className={`w-full p-4 border-2 rounded-pl text-left transition-colors ${
                  exportFormat === format
                    ? 'border-ink bg-ink/5'
                    : 'border-ink/20 hover:border-persimmon'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold">{format.toUpperCase()}</div>
                    <div className="text-sm text-ink/60">
                      {format === 'pdf' ? 'Standard PDF for review & archival' : 'PWG Raster for direct printing'}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-pl-sm ${
                    exportFormat === format ? 'bg-persimmon text-paper' : 'bg-ink/10 text-ink'
                  }`}>
                    {exportFormat === format ? 'SELECTED' : 'CHOOSE'}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="flex gap-3 justify-end mt-4">
            <Button variant="ghost" onClick={() => setShowExportDialog(false)}>CANCEL</Button>
            <Button variant="primary" onClick={() => handleExport(exportFormat)} loading={isExporting}>
              {isExporting ? 'EXPORTING…' : `EXPORT AS ${exportFormat.toUpperCase()}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}