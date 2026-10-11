import React from "react";
import { Loader } from "@/components/ui/Loader";

/**
 * PDF preview placeholder.
 * 
 * The pdfjs-dist dependency has been removed per the V2 redesign.
 * This component renders a loader indicating that PDF preview
 * is not currently available.
 */
interface PrintPreviewInnerProps {
  file: File | null;
  pages: number[] | null;
  color: "bw" | "color";
  copies?: number;
  orientation?: "portrait" | "landscape";
  onMeta?: (m: any) => void;
  onZoom?: (zoom: number) => void;
  paper?: "A4" | "A3" | "Letter";
}

export default function PrintPreviewInner(_props: PrintPreviewInnerProps) {
  return (
    <div style={{ height: "400px" }}>
      <Loader />
      <p style={{ margin: "1rem 0 0 0", fontSize: "var(--text-sm)" }}>
        PDF preview is not available in this view.
      </p>
    </div>
  );
}