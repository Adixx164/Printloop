import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, Share2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  /** The payload encoded in the QR (a link, printloop:// uri, etc.) */
  value: string;
  /** Big human-readable text under the QR (e.g. the code) */
  caption?: string;
  /** Small label above the buttons */
  label?: string;
  size?: number;
  /** Download/share file name (no extension) */
  fileName?: string;
};

/** Renders the SVG QR to a padded PNG blob (white background). */
async function toPng(svg: SVGSVGElement, size: number): Promise<Blob> {
  const xml = new XMLSerializer().serializeToString(svg);
  const svg64 = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("render failed"));
    img.src = svg64;
  });
  const pad = Math.round(size * 0.12);
  const canvas = document.createElement("canvas");
  canvas.width = size + pad * 2;
  canvas.height = size + pad * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, pad, pad, size, size);
  return new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("blob failed"))), "image/png")
  );
}

export default function QrBlock({ value, caption, label, size = 150, fileName = "printloop-qr" }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);

  const getSvg = () => wrapRef.current?.querySelector("svg") as SVGSVGElement | null;

  const download = async () => {
    const svg = getSvg();
    if (!svg) return;
    try {
      const blob = await toPng(svg, size);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("QR image saved.");
    } catch {
      toast.error("Could not export the QR.");
    }
  };

  const share = async () => {
    const svg = getSvg();
    if (!svg) return;
    try {
      const blob = await toPng(svg, size);
      const file = new File([blob], `${fileName}.png`, { type: "image/png" });
      const nav = navigator as any;
      // Prefer sharing the actual image + link so it can be sent to others
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({
          files: [file],
          title: "PrintLoop",
          text: `${caption ? caption + " — " : ""}${value}`,
        });
        return;
      }
      if (nav.share) {
        await nav.share({ title: "PrintLoop", text: caption || "PrintLoop code", url: value });
        return;
      }
      await navigator.clipboard.writeText(value);
      toast.success("Link copied — sharing isn't supported on this device.");
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error("Could not share.");
    }
  };

  return (
    <div className="inline-flex flex-col items-center">
      <div ref={wrapRef} className="bg-paper border-2 border-ink p-3">
        <QRCodeSVG value={value} size={size} includeMargin level="M" />
      </div>
      {caption && <div className="pl-mono text-2xl font-bold mt-3 tracking-wider">{caption}</div>}
      {label && <div className="editorial-label text-ink/60 mt-1">{label}</div>}
      <div className="flex gap-2 mt-3">
        <button onClick={download} className="pl-btn-ghost text-[11px] px-3 py-1.5 inline-flex items-center gap-1.5">
          <Download size={13} /> SAVE PNG
        </button>
        <button onClick={share} className="pl-btn-primary text-[11px] px-3 py-1.5 inline-flex items-center gap-1.5">
          <Share2 size={13} /> SHARE
        </button>
      </div>
    </div>
  );
}
