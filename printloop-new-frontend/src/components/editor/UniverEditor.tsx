import React from "react";

/**
 * Univer editor placeholder.
 * 
 * The Univer.js integration has been removed per the V2 redesign.
 * This component renders a simple empty state indicating that
 * the document editor is not currently available in this view.
 */
interface UniverEditorProps {
  sessionId: string;
  role: string;
  initialDocument?: any;
  token?: string;
  iceServers?: RTCIceServer[];
  onExport?: (format?: "pdf" | "pwg") => Promise<void>;
  onApprove?: () => Promise<void>;
  onReject?: (reason?: any) => Promise<void>;
  onSaveStatusChange?: (status: any) => void;
  [key: string]: any;
}

export default function UniverEditor(_props: UniverEditorProps) {
  return (
    <div
      style={{
        minHeight: "400px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--neutral-100)",
        border: "2px dashed var(--hairline)",
        borderRadius: "var(--radius-md)",
        color: "var(--muted)",
      }}
    >
      <p style={{ fontSize: "var(--text-sm)", margin: 0 }}>
        Document editor is not available in this view.
      </p>
    </div>
  );
}