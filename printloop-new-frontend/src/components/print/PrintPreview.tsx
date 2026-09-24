import { Suspense, lazy, useEffect, useState } from "react";
import { parsePageRange, type PreviewMeta } from "@/components/print/PrintPreviewShared";

const PrintPreviewInner = lazy(() => 
  import("@/components/print/PrintPreviewInner").then((mod) => ({ default: mod.default }))
);

type Props = {
  file: File | null;
  pages: number[] | null;
  color: "bw" | "color";
  copies?: number;
  orientation?: "portrait" | "landscape";
  onMeta?: (m: PreviewMeta) => void;
  onZoom?: (zoom: number) => void;
  paper?: "A4" | "A3" | "Letter";
};

export default function PrintPreview({
  file,
  pages,
  color,
  copies = 1,
  orientation = "portrait",
  onMeta,
  onZoom,
  paper,
}: Props) {
  const [showInner, setShowInner] = useState(false);

  useEffect(() => {
    if (file) setShowInner(true);
  }, [file]);

  if (!showInner) {
    return (
      <div className="h-full grid place-items-center text-ink/50 pl-serif italic min-h-[420px]">
        Upload a file to preview.
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-persimmon border-t-transparent rounded-full animate-spin" />
          <p className="pl-serif italic text-ink/50 text-sm">Loading PDF preview…</p>
        </div>
      </div>
    }>
      <PrintPreviewInner
        file={file}
        pages={pages}
        color={color}
        copies={copies}
        orientation={orientation}
        onMeta={onMeta}
        onZoom={onZoom}
        paper={paper}
      />
    </Suspense>
  );
}

export { parsePageRange };
export type { PreviewMeta };