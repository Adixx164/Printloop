import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const RENDER_CAP = 24;
const ZOOM_STEP = 0.15;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;

import { type PreviewMeta } from "@/components/print/PrintPreviewShared";

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

export default function PrintPreviewInner({
  file,
  pages,
  color,
  copies = 1,
  orientation = "portrait",
  onMeta,
  onZoom,
  paper,
}: Props) {
  const [imgs, setImgs] = useState<{ page: number; url: string; w: number; h: number }[]>([]);
  const [kind, setKind] = useState<"pdf" | "image" | "other" | "none">("none");
  const [status, setStatus] = useState<string>("");
  const [imgUrl, setImgUrl] = useState<string>("");
  const [imgDim, setImgDim] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const reqId = useRef(0);
  const [zoom, setZoom] = useState<number>(1);

  useEffect(() => {
    onZoom?.(zoom);
  }, [zoom, onZoom]);

  const zoomLabel = useMemo(() => `${Math.round(zoom * 100)}%`, [zoom]);
  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)));
  const zoomReset = () => setZoom(1);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [singlePage, setSinglePage] = useState(false);

  useEffect(() => {
    setCurrentPage(1);
    setZoom(1);
    setSinglePage(false);
  }, [file, JSON.stringify(pages)]);

  useEffect(() => {
    if (kind !== "pdf") return;
    setCurrentPage((page) => {
      if (imgs.length === 0) return 1;
      if (page > imgs.length) return imgs[imgs.length - 1].page;
      return page;
    });
  }, [kind, imgs]);

  const singlePageOn = singlePage && kind === "pdf" && imgs.length > 1;

  const visibleImgs = useMemo(() => {
    if (kind !== "pdf") return imgs;
    if (!singlePageOn) return imgs;
    const target = imgs.find((item) => item.page === currentPage);
    return target ? [target] : imgs;
  }, [kind, imgs, currentPage, singlePageOn]);

  const pagePool = useMemo(() => imgs.map((i) => i.page), [imgs]);

  const goPrev = () => {
    if (!pagePool.length) return;
    const idx = pagePool.indexOf(currentPage);
    const next = idx > 0 ? pagePool[idx - 1] : pagePool[pagePool.length - 1];
    setCurrentPage(next);
  };

  const goNext = () => {
    if (!pagePool.length) return;
    const idx = pagePool.indexOf(currentPage);
    const next = idx < pagePool.length - 1 ? pagePool[idx + 1] : pagePool[0];
    setCurrentPage(next);
  };

  const paperLine = useMemo(() => {
    if (!paper) return null;
    const label = paper === "A3" ? "A3 — double charge" : `${paper} page`;
    return label;
  }, [paper]);

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
              : wanted.length === 0
                ? "Nothing matches the selected page range."
                : "",
          );
        }
      } catch (e: any) {
        if (reqId.current === myReq) {
          setKind("other");
          setStatus(e?.message || "Could not render this document.");
        }
      }
    })();
  }, [file, isPdf, isImage, JSON.stringify(pages)]);

  const gray = color === "bw";

  return (
    <div className="bg-paper-light">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b-2 border-ink bg-ink text-paper">
        <div className="flex flex-wrap items-center gap-2">
          <span className="editorial-label">
            {gray ? "Black & White output" : "Colour output"}
            {copies > 1 ? ` · ${copies} copies` : ""}
            {" · "}
            {orientation === "landscape" ? "Landscape" : "Portrait"}
          </span>
          {paperLine ? <span className="text-[10px] font-bold opacity-80">{paperLine}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {kind === "pdf" && imgs.length > 1 ? (
            <button
              type="button"
              className="px-2 py-1 text-[10px] font-bold border border-paper/60 bg-ink/20"
              onClick={() => setSinglePage((v) => !v)}
            >
              {singlePageOn ? "All pages" : "One page"}
            </button>
          ) : null}
          <div className="flex items-center gap-1">
            <button type="button" className="px-2 py-1 text-[10px] font-bold border border-paper/60 bg-ink/20" onClick={zoomOut}>
              −
            </button>
            <span className="text-[10px] font-bold w-12 text-center">{zoomLabel}</span>
            <button type="button" className="px-2 py-1 text-[10px] font-bold border border-paper/60 bg-ink/20" onClick={zoomIn}>
              +
            </button>
            <button type="button" className="px-2 py-1 text-[10px] font-bold border border-paper/60 bg-ink/20" onClick={zoomReset}>
              1:1
            </button>
          </div>
          {singlePageOn && pagePool.length > 1 ? (
            <div className="flex items-center gap-1">
              <button type="button" className="px-2 py-1 text-[10px] font-bold border border-paper/60 bg-ink/20" onClick={goPrev}>
                ←
              </button>
              <span className="text-[10px] font-bold">
                {pagePool.indexOf(currentPage) + 1}/{pagePool.length}
              </span>
              <button type="button" className="px-2 py-1 text-[10px] font-bold border border-paper/60 bg-ink/20" onClick={goNext}>
                →
              </button>
            </div>
          ) : null}
          <span className="text-[10px] tracking-editorial font-bold opacity-70">WYSIWYG · EXACTLY WHAT PRINTS</span>
        </div>
      </div>

      {kind === "image" && (
        <div className="p-6 grid place-items-center">
          <div className="w-full max-w-[620px]" style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
            <FitSheet url={imgUrl} w={imgDim.w} h={imgDim.h} target={orientation} gray={gray} alt={file.name} />
          </div>
        </div>
      )}

      {kind === "other" && (
        <div className="p-10 text-center min-h-[420px] grid place-items-center">
          <div>
            <div className="pl-serif text-xl font-bold mb-1">{file.name}</div>
            <div className="pl-serif italic text-ink/60 text-sm max-w-md mx-auto">
              {status || "PrintLoop accepts PDF and image files only. Export your document to PDF and upload it here."}
            </div>
          </div>
        </div>
      )}

      {kind === "pdf" && (
        <div
          className="p-5 max-h-[720px] overflow-y-auto flex flex-col items-center gap-5"
          style={{ filter: gray ? "grayscale(1)" : "none" }}
        >
          {imgs.length === 0 && (
            <div className="py-20 text-ink/50 pl-serif italic">{status || "Rendering…"}</div>
          )}
          {visibleImgs.map(({ page, url, w, h }) => (
            <figure key={page} className="w-full max-w-[640px]" style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
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