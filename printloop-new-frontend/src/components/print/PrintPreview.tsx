import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const RENDER_CAP = 24; // render at most this many pages for performance

/** Expand "2-3,10-20,5" into a sorted, unique page list clamped to [1,total]. */
export function parsePageRange(input: string, total: number): number[] {
  if (!input?.trim()) return [];
  const out = new Set<number>();
  for (const chunk of input.split(",")) {
    const part = chunk.trim();
    if (!part) continue;
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = parseInt(m[1], 10);
      let b = parseInt(m[2], 10);
      if (a > b) [a, b] = [b, a];
      for (let p = a; p <= b; p++) if (p >= 1 && p <= total) out.add(p);
    } else if (/^\d+$/.test(part)) {
      const p = parseInt(part, 10);
      if (p >= 1 && p <= total) out.add(p);
    }
  }
  return [...out].sort((x, y) => x - y);
}

type Props = {
  file: File | null;
  /** null = print all pages; otherwise the explicit 1-based pages to print */
  pages: number[] | null;
  color: "bw" | "color";
  copies?: number;
  /**
   * Page orientation. The PDF canvas is re-rendered with `rotation: 90`
   * for landscape (pdf.js handles the geometry natively, so dimensions
   * swap correctly). Images are rotated via CSS transform.
   */
  orientation?: "portrait" | "landscape";
  /** reports detected page count + whether we can parse it for range selection */
  onMeta?: (m: { pageCount: number; rangeable: boolean }) => void;
};

export default function PrintPreview({ file, pages, color, copies = 1, orientation = "portrait", onMeta }: Props) {
  const [imgs, setImgs] = useState<{ page: number; url: string }[]>([]);
  const [kind, setKind] = useState<"pdf" | "image" | "other" | "none">("none");
  const [status, setStatus] = useState<string>("");
  const [imgUrl, setImgUrl] = useState<string>("");
  const reqId = useRef(0);

  const ext = (file?.name.split(".").pop() || "").toLowerCase();
  const isPdf = file?.type === "application/pdf" || ext === "pdf";
  const isImage = (file?.type || "").startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext);

  useEffect(() => {
    const myReq = ++reqId.current;
    setImgs([]);
    setStatus("");

    if (!file) {
      setKind("none");
      return;
    }

    if (isImage) {
      setKind("image");
      const u = URL.createObjectURL(file);
      setImgUrl(u);
      onMeta?.({ pageCount: 1, rangeable: false });
      return () => URL.revokeObjectURL(u);
    }

    if (!isPdf) {
      setKind("other");
      onMeta?.({ pageCount: 0, rangeable: false });
      return;
    }

    setKind("pdf");
    setStatus("Rendering pages…");

    (async () => {
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        if (reqId.current !== myReq) return;
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        if (reqId.current !== myReq) return;

        const total = pdf.numPages;
        onMeta?.({ pageCount: total, rangeable: true });

        const wanted =
          pages && pages.length
            ? pages.filter((p) => p >= 1 && p <= total)
            : Array.from({ length: total }, (_, i) => i + 1);

        const slice = wanted.slice(0, RENDER_CAP);
        const rendered: { page: number; url: string }[] = [];

        for (const n of slice) {
          if (reqId.current !== myReq) return;
          const page = await pdf.getPage(n);
          // pdf.js does the geometry: rotation:90 swaps the viewport's
          // w/h, so the canvas it draws into is landscape. The actual
          // PDF bytes are unchanged — the kiosk prints with the IPP
          // orientation-requested attribute we already send.
          const viewport = page.getViewport({
            scale: 1.4,
            rotation: orientation === "landscape" ? 90 : 0,
          });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx, viewport }).promise;
          rendered.push({ page: n, url: canvas.toDataURL("image/jpeg", 0.82) });
          if (reqId.current === myReq) setImgs([...rendered]);
        }
        if (reqId.current === myReq) {
          setStatus(
            wanted.length > slice.length
              ? `Showing ${slice.length} of ${wanted.length} selected pages — all ${wanted.length} will print.`
              : ""
          );
        }
      } catch (e: any) {
        if (reqId.current === myReq) {
          setKind("other");
          setStatus(e?.message || "Could not render this document.");
        }
      }
    })();
  }, [file, isPdf, isImage, orientation, JSON.stringify(pages)]);

  const gray = color === "bw";

  if (!file)
    return (
      <div className="h-full grid place-items-center text-ink/50 pl-serif italic min-h-[420px]">
        Upload a file to preview.
      </div>
    );

  return (
    <div className="bg-paper-light">
      <div className="flex items-center justify-between px-4 py-2.5 border-b-2 border-ink bg-ink text-paper">
        <span className="editorial-label">
          {gray ? "Black &amp; White output" : "Colour output"}
          {copies > 1 ? ` · ${copies} copies` : ""}
          {" · "}
          {orientation === "landscape" ? "Landscape" : "Portrait"}
        </span>
        <span className="text-[10px] tracking-editorial font-bold opacity-70">
          WYSIWYG · EXACTLY WHAT PRINTS
        </span>
      </div>

      {kind === "image" && (
        // Single-image preview: rotate 90° for landscape via CSS — the
        // actual file bytes are unchanged; the kiosk applies orientation
        // at print time via IPP.
        <div className="p-6 grid place-items-center">
          <img
            src={imgUrl}
            alt={file.name}
            className="max-w-full max-h-[620px] border border-ink/20 shadow"
            style={{
              filter: gray ? "grayscale(1)" : "none",
              transform: orientation === "landscape" ? "rotate(90deg)" : "none",
              // Constrain the rotated image's overflow so it doesn't
              // spill outside the preview frame.
              maxHeight: orientation === "landscape" ? "440px" : "620px",
            }}
          />
        </div>
      )}

      {kind === "other" && (
        <div className="p-10 text-center min-h-[420px] grid place-items-center">
          <div>
            <div className="pl-serif text-xl font-bold mb-1">{file.name}</div>
            <div className="pl-serif italic text-ink/60 text-sm max-w-md mx-auto">
              {status ||
                "PrintLoop accepts PDF and image files only. Export your document to PDF and upload it here."}
            </div>
          </div>
        </div>
      )}

      {kind === "pdf" && (
        <div
          className="p-5 max-h-[640px] overflow-y-auto flex flex-col items-center gap-5"
          style={{ filter: gray ? "grayscale(1)" : "none" }}
        >
          {imgs.length === 0 && (
            <div className="py-20 text-ink/50 pl-serif italic">{status || "Rendering…"}</div>
          )}
          {imgs.map(({ page, url }) => (
            <figure key={page} className="w-full max-w-[640px]">
              <img src={url} alt={`Page ${page}`} className="w-full border-2 border-ink shadow-[6px_6px_0_#1A1410]" />
              <figcaption className="editorial-label text-center text-ink/50 mt-2">PAGE {page}</figcaption>
            </figure>
          ))}
          {status && imgs.length > 0 && (
            <div className="editorial-label text-persimmon py-2 text-center">{status}</div>
          )}
        </div>
      )}
    </div>
  );
}
