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

export type PreviewMeta = {
  pageCount: number;
  rangeable: boolean;
  /** The document's OWN (native) orientation, so the caller can default the
   *  orientation selector to it. */
  orientation?: "portrait" | "landscape";
};

type Props = {
  file: File | null;
  /** null = print all pages; otherwise the explicit 1-based pages to print */
  pages: number[] | null;
  color: "bw" | "color";
  copies?: number;
  /**
   * Target sheet orientation. The page is **scaled to fit** a sheet of this
   * orientation — pillarboxed if the page is narrower (portrait page on a
   * landscape sheet), letterboxed if it's wider (landscape page on a portrait
   * sheet) — NOT rotated and never cropped, mirroring the server's
   * `fitToOrientation`. Pages already in this orientation fill the width.
   */
  orientation?: "portrait" | "landscape";
  /** reports detected page count, range-ability, and the document's own
   *  (native) orientation. */
  onMeta?: (m: PreviewMeta) => void;
};

/**
 * Draw one rendered page/image so it matches what the server bakes. If the
 * page's own orientation already equals the target it fills the width;
 * otherwise it's contained (scaled to fit, centred) inside a sheet of the
 * target orientation — pillarbox or letterbox, never cropped.
 *
 * The sheet height is set with the padding-bottom percentage trick (rock
 * solid across browsers) and the image is flex-centred inside an absolutely
 * positioned layer, bounded by max-width/height — a bulletproof "contain".
 */
function FitSheet({
  url,
  w,
  h,
  target,
  gray,
  alt,
}: {
  url: string;
  w: number;
  h: number;
  target: "portrait" | "landscape";
  gray: boolean;
  alt: string;
}) {
  const grayStyle = gray ? "grayscale(1)" : "none";
  const pageLandscape = w > h;
  const matches = w === h || pageLandscape === (target === "landscape");
  if (matches) {
    return (
      <img
        src={url}
        alt={alt}
        className="w-full block border-2 border-ink shadow-[6px_6px_0_#1A1410]"
        style={{ filter: grayStyle }}
      />
    );
  }
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  // padding-bottom = sheetHeight / sheetWidth, as a % of the (full) width.
  const padPct = target === "landscape" ? (short / long) * 100 : (long / short) * 100;
  return (
    <div
      className="relative w-full bg-white overflow-hidden border-2 border-ink shadow-[6px_6px_0_#1A1410]"
      style={{ paddingBottom: `${padPct}%` }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <img src={url} alt={alt} className="block" style={{ maxWidth: "100%", maxHeight: "100%", filter: grayStyle }} />
      </div>
    </div>
  );
}

export default function PrintPreview({ file, pages, color, copies = 1, orientation = "portrait", onMeta }: Props) {
  const [imgs, setImgs] = useState<{ page: number; url: string; w: number; h: number }[]>([]);
  const [kind, setKind] = useState<"pdf" | "image" | "other" | "none">("none");
  const [status, setStatus] = useState<string>("");
  const [imgUrl, setImgUrl] = useState<string>("");
  const [imgDim, setImgDim] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
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
      // Probe natural dimensions so we can report the image's native
      // orientation and fit it into the chosen sheet below.
      const probe = new Image();
      probe.onload = () => {
        if (reqId.current !== myReq) return;
        const w = probe.naturalWidth || 1;
        const h = probe.naturalHeight || 1;
        setImgDim({ w, h });
        onMeta?.({ pageCount: 1, rangeable: false, orientation: w > h ? "landscape" : "portrait" });
      };
      probe.onerror = () => {
        if (reqId.current === myReq) onMeta?.({ pageCount: 1, rangeable: false });
      };
      probe.src = u;
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
        // Detect the document's native orientation from page 1 so the caller
        // can default the orientation selector to it.
        const first = await pdf.getPage(1);
        const fvp = first.getViewport({ scale: 1 });
        onMeta?.({
          pageCount: total,
          rangeable: true,
          orientation: fvp.width > fvp.height ? "landscape" : "portrait",
        });

        const wanted =
          pages && pages.length
            ? pages.filter((p) => p >= 1 && p <= total)
            : Array.from({ length: total }, (_, i) => i + 1);

        const slice = wanted.slice(0, RENDER_CAP);
        const rendered: { page: number; url: string; w: number; h: number }[] = [];

        for (const n of slice) {
          if (reqId.current !== myReq) return;
          const page = await pdf.getPage(n);
          // Always render the page UPRIGHT; orientation is applied as a
          // scale-to-fit in the markup (FitSheet), matching the server.
          const viewport = page.getViewport({ scale: 1.4 });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx, viewport }).promise;
          rendered.push({ page: n, url: canvas.toDataURL("image/jpeg", 0.82), w: canvas.width, h: canvas.height });
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
    // orientation intentionally NOT a dep: pages render upright once, and the
    // fit-to-sheet is applied purely in the markup below.
  }, [file, isPdf, isImage, JSON.stringify(pages)]);

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
        <div className="p-6 grid place-items-center">
          <div className="w-full max-w-[620px]">
            <FitSheet url={imgUrl} w={imgDim.w} h={imgDim.h} target={orientation} gray={gray} alt={file.name} />
          </div>
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
          {imgs.map(({ page, url, w, h }) => (
            <figure key={page} className="w-full max-w-[640px]">
              {/* gray handled by the wrapper's filter above */}
              <FitSheet url={url} w={w} h={h} target={orientation} gray={false} alt={`Page ${page}`} />
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
