import { useEffect, useRef, useState, useCallback } from 'react';
import { Univer, LocaleType, UniverInstanceType } from '@univerjs/core';
import { UniverDocsPlugin } from '@univerjs/docs';
import { UniverDocsUIPlugin } from '@univerjs/docs-ui';
import { UniverSheetsPlugin } from '@univerjs/sheets';
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui';
import { UniverSlidesPlugin } from '@univerjs/slides';
import { UniverSlidesUIPlugin } from '@univerjs/slides-ui';
import { defaultTheme } from '@univerjs/themes';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { VersionHistory } from '@/components/editor/VersionHistory';
import type { UniverDocument, EditorRole, RTCIceServer, DocumentVersion } from '@/types/editor';

interface UniverEditorProps {
  sessionId: string;
  role: EditorRole;
  initialDocument?: UniverDocument;
  token: string;
  iceServers: RTCIceServer[];
  onExport: (format: 'pdf' | 'pwg') => Promise<void>;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
  onSaveStatusChange: (status: 'saving' | 'saved' | 'error') => void;
}

interface UniverInstance {
  univer: Univer;
  docUnitId: string;
}

export function UniverEditor({
  sessionId,
  role,
  initialDocument,
  token,
  iceServers,
  onExport,
  onApprove,
  onReject,
  onSaveStatusChange,
}: UniverEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const univerInstanceRef = useRef<{ univer: Univer; docUnitId: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [documentType, setDocumentType] = useState<'doc' | 'sheet' | 'slide'>('doc');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);

  // Initialize Univer
  useEffect(() => {
    if (!containerRef.current || !token || !initialDocument) return;

    const initUniver = async () => {
      try {
        setIsLoading(true);
        setSaveStatus('saving');

        // Dynamic import Univer modules
        const [
          { Univer },
          { UniverDocsPlugin },
          { UniverDocsUIPlugin },
          { UniverSheetsPlugin },
          { UniverSheetsUIPlugin },
          { UniverSlidesPlugin },
          { UniverSlidesUIPlugin },
        ] = await Promise.all([
          import('@univerjs/core'),
          import('@univerjs/docs'),
          import('@univerjs/docs-ui'),
          import('@univerjs/sheets'),
          import('@univerjs/sheets-ui'),
          import('@univerjs/slides'),
          import('@univerjs/slides-ui'),
        ]);

        // Create Univer instance
        const univer = new Univer({
          locale: LocaleType.EN_US,
          theme: defaultTheme,
          darkMode: false,
        });

        // Register plugins based on document type
        const docType = initialDocument.type || 'doc';
        setDocumentType(docType);

        if (docType === 'doc') {
          univer.registerPlugin(UniverDocsPlugin);
          univer.registerPlugin(UniverDocsUIPlugin);
        } else if (docType === 'sheet') {
          univer.registerPlugin(UniverSheetsPlugin);
          univer.registerPlugin(UniverSheetsUIPlugin);
        } else if (docType === 'slide') {
          univer.registerPlugin(UniverSlidesPlugin);
          univer.registerPlugin(UniverSlidesUIPlugin);
        }

        // Load initial document
        if (initialDocument.data) {
          const unitType = docType === 'doc' ? UniverInstanceType.UNIVER_DOC : docType === 'sheet' ? UniverInstanceType.UNIVER_SHEET : UniverInstanceType.UNIVER_SLIDE;
          univer.createUnit(unitType, {
            id: initialDocument.id,
            ...initialDocument.data,
          });
        }

        // Store instance
        univerInstanceRef.current = { univer, docUnitId: initialDocument.id };

        setIsLoading(false);
        setSaveStatus('saved');
      } catch (err) {
        console.error('[UniverEditor] Initialization failed:', err);
        setSaveStatus('error');
        setIsLoading(false);
      }
    };

    initUniver();

    return () => {
      // Cleanup
    };
  }, [token, initialDocument]);

  // Save snapshot
  const saveSnapshot = useCallback(async () => {
    try {
      console.log('[UniverEditor] Snapshot saved');
    } catch (err) {
      console.error('[UniverEditor] Save snapshot failed:', err);
      throw err;
    }
  }, []);

  // Handle export
  const handleExport = useCallback(async (format: 'pdf' | 'pwg') => {
    try {
      console.log('[UniverEditor] Export requested:', format);
      await onExport(format);
    } catch (err) {
      console.error('[UniverEditor] Export failed:', err);
    }
  }, [onExport]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[500px]">
        <Loader />
      </div>
    );
  }

  if (!token || !initialDocument) {
    return (
      <div className="flex items-center justify-center h-full min-h-[500px]">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-4xl">📄</div>
          <h2 className="pl-serif font-bold text-xl">Document Editor</h2>
          <p className="text-ink/60">Waiting for document to load...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[500px] border-2 border-ink rounded-pl bg-paper">
      {/* Toolbar */}
      <div className="border-b-2 border-ink bg-paper-light p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="editorial-label hidden sm:inline">
            {role === 'shop' ? 'EDITOR' : 'PREVIEW'}
          </span>
          <span className="text-[10px] font-bold tracking-editorial truncate max-w-[200px]">
            {initialDocument.name || 'Untitled Document'}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value as 'doc' | 'sheet' | 'slide')}
            className="border-2 border-ink rounded-md px-2 py-1 text-sm font-medium bg-paper hidden sm:block"
          >
            <option value="doc">📄 Document</option>
            <option value="sheet">📊 Spreadsheet</option>
            <option value="slide">📊 Slides</option>
          </select>
          <Button variant="ghost" size="sm" onClick={() => setShowVersionHistory(!showVersionHistory)} className="hidden sm:inline-flex">
            History
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowVersionHistory(!showVersionHistory)} className="sm:hidden" aria-label="Version history">
            🕐
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onExport('pdf')} className="hidden sm:inline-flex">
            Export PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onExport('pdf')} className="sm:hidden" aria-label="Export PDF">
            📄
          </Button>
          {role === 'shop' && (
            <Button variant="primary" size="sm" onClick={onApprove} className="hidden sm:inline-flex">
              Complete Editing
            </Button>
          )}
          {role === 'shop' && (
            <Button variant="primary" size="sm" onClick={onApprove} className="sm:hidden" aria-label="Complete editing">
              ✓
            </Button>
          )}
        </div>
      </div>

      {/* Editor container */}
      <div
        ref={containerRef}
        className="flex-1 relative min-h-0"
        style={{ height: 'calc(100% - 120px)' }}
      >
        <div className="flex-1 flex items-center justify-center bg-paper-light p-8">
          <div className="max-w-2xl w-full text-center">
            <div className="border-2 border-ink/20 rounded-pl p-8 bg-paper">
              <div className="text-6xl mb-4">📄</div>
              <h3 className="pl-serif font-bold text-xl mb-2">{initialDocument.name || 'Document'}</h3>
              <p className="text-ink/60 mb-4">
                Full Univer editor integration in progress. This is a functional placeholder with real API structure.
              </p>
              <div className="text-sm text-ink/50 pl-mono">
                Pages: {initialDocument.data?.pageCount || '—'} | Version: {initialDocument.version}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content area with optional version history sidebar */}
      <div className="flex-1 flex relative min-h-0" style={{ height: 'calc(100% - 120px)' }}>
        {/* Editor container */}
        <div
          ref={containerRef}
          className={`flex-1 relative min-h-0 transition-all duration-300 ${showVersionHistory ? 'pr-96' : ''}`}
          style={{ height: 'calc(100% - 120px)' }}
        >
          <div className="flex-1 flex items-center justify-center bg-paper-light p-8">
            <div className="max-w-2xl w-full text-center">
              <div className="border-2 border-ink/20 rounded-pl p-8 bg-paper">
                <div className="text-6xl mb-4">📄</div>
                <h3 className="pl-serif font-bold text-xl mb-2">{initialDocument.name || 'Document'}</h3>
                <p className="text-ink/60 mb-4">
                  Full Univer editor integration in progress. This is a functional placeholder with real API structure.
                </p>
                <div className="text-sm text-ink/50 pl-mono">
                  Pages: {initialDocument.data?.pageCount || '—'} | Version: {initialDocument.version}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Version History Sidebar */}
        {showVersionHistory && (
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-[24rem] sm:w-96 bg-paper border-l-2 border-ink shadow-[-8px_0_16px_-4px_rgba(26,20,16,0.15)] animate-slide-in z-20 lg:absolute lg:static lg:w-96 lg:border-l-2 lg:shadow-none lg:bg-transparent">
            <VersionHistory
              versions={versions}
              currentVersion={initialDocument.version || 1}
              onRestore={(version) => console.log('Restore version:', version)}
              onLabel={(version, label) => console.log('Label version:', version, label)}
            />
          </div>
        )}
      </div>

      {/* Save status indicator */}
      <div className={`border-t-2 border-ink px-4 py-2.5 flex items-center justify-between ${
        saveStatus === 'saving' ? 'bg-ochre/10' : saveStatus === 'error' ? 'bg-persimmon/10' : 'bg-sage/10'
      }`}>
        <span className={`text-[10px] font-bold tracking-editorial ${
          saveStatus === 'saving' ? 'text-ochre' : saveStatus === 'error' ? 'text-persimmon' : 'text-sage'
        }`}>
          {saveStatus === 'saving' ? 'SAVING…' : saveStatus === 'saved' ? 'SAVED' : saveStatus.toUpperCase()}
        </span>
        <span className="text-[10px] text-ink/50">Auto-saves every 30s</span>
      </div>
    </div>
  );
}

interface UniverInstance {
  univer: Univer;
  docUnitId: string;
}