import { useMemo, useState } from "react";
import { Wallet, CreditCard, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import QrBlock from "@/components/ui/QrBlock";
import PrintPreview, { parsePageRange } from "@/components/print/PrintPreview";
import { useCreateBatchJobMutation, useGetPricingQuery } from "@/store/services/jobsApi";
import { extractError } from "@/lib/errors";
import { priceFromMatrix, type PricingRow } from "@/lib/pricing";
import { detectPages } from "@/lib/pageCount";

type Cfg = {
  copies: number;
  color: "bw" | "color";
  sided: "single" | "double";
  paper: "A4" | "A3" | "Letter";
  qualityDpi: 100 | 300 | 600;
  orientation: "portrait" | "landscape";
  pages: "all" | "range";
  pageRange: string;
};
type Doc = { file: File; cfg: Cfg; custom: boolean; pageCount: number; rangeable: boolean };

const DEFAULT_CFG: Cfg = {
  copies: 1, color: "bw", sided: "single", paper: "A4", qualityDpi: 300,
  orientation: "portrait",
  pages: "all", pageRange: "",
};

function printedPages(d: Doc) {
  if (d.cfg.pages === "range" && d.rangeable) {
    const n = parsePageRange(d.cfg.pageRange, d.pageCount).length;
    return n || d.pageCount || 1;
  }
  return d.pageCount || 1;
}
// Cost preview for a single document in the batch. Consults the live
// pricing matrix (same data the admin edits) instead of hardcoded rates.
// Server-side `computeCost` in `customerPrint.routes.ts /batch` remains
// the authoritative number at job creation.
function costOf(d: Doc, rows: PricingRow[] | undefined) {
  return priceFromMatrix(printedPages(d), d.cfg, rows);
}

const Chip = ({ on, children, onClick, disabled }: any) => (
  <button disabled={disabled} onClick={onClick}
    className={`pl-chip ${on ? "pl-chip-active" : ""} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}>
    {children}
  </button>
);

export default function BatchPrintPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [def, setDef] = useState<Cfg>(DEFAULT_CFG);
  const [editing, setEditing] = useState<number | null>(null);
  const [payment, setPayment] = useState<"wallet" | "paystack">("wallet");
  const [collate, setCollate] = useState(true);
  const [receipt, setReceipt] = useState<{ code: string; cost: number; qrPayload?: string } | null>(null);
  const [createBatchJob, { isLoading }] = useCreateBatchJobMutation();
  const { data: pricingData } = useGetPricingQuery();
  const pricingRows: PricingRow[] | undefined = pricingData?.configs;

  const total = useMemo(
    () => docs.reduce((s, d) => s + costOf(d, pricingRows), 0),
    [docs, pricingRows],
  );

  const addFiles = (list: FileList | null) => {
    const newFiles = Array.from(list || []);
    if (!newFiles.length) return;
    // Insert with a placeholder pageCount of 1 so cost appears immediately;
    // then asynchronously upgrade each row to the authoritative count.
    // This stops the bug where the batch summary read ₦210 (3 × 1 page)
    // and then bumped to ₦3,990 (3 × 19 pages) at receipt time.
    const start = docs.length;
    setDocs((d) => [
      ...d,
      ...newFiles.map((file) => ({
        file,
        cfg: { ...def },
        custom: false,
        pageCount: 1,
        rangeable: false,
      })),
    ]);
    newFiles.forEach((file, i) => {
      detectPages(file)
        .then((res) => {
          if (!res.supported) {
            toast.error(`"${file.name}" — unsupported format. Use PDF, JPG, or PNG.`);
            // Drop unsupported file from the list so the user isn't billed
            // on a placeholder page count.
            setDocs((list) => list.filter((d) => d.file !== file));
            return;
          }
          setDocs((list) =>
            list.map((d, idx) =>
              idx === start + i
                ? { ...d, pageCount: res.pageCount, rangeable: res.rangeable }
                : d,
            ),
          );
        })
        .catch(() => {
          toast.error(`"${file.name}" — could not read page count. Removed.`);
          setDocs((list) => list.filter((d) => d.file !== file));
        });
    });
  };

  const removeDoc = (idx: number) => {
    setDocs((list) => list.filter((_, i) => i !== idx));
    // If the user was customizing this doc, drop back to the list.
    if (editing !== null && editing === idx) setEditing(null);
    if (editing !== null && editing > idx) setEditing(editing - 1);
  };

  // Editing default settings re-applies to every not-yet-customized doc
  const updateDefault = (patch: Partial<Cfg>) => {
    const merged = { ...def, ...patch };
    setDef(merged);
    setDocs((list) => list.map((d) => (d.custom ? d : { ...d, cfg: { ...merged } })));
  };

  const patchDoc = (i: number, patch: Partial<Cfg>) =>
    setDocs((list) => list.map((d, idx) => (idx === i ? { ...d, cfg: { ...d.cfg, ...patch }, custom: true } : d)));

  const setMeta = (i: number, pageCount: number, rangeable: boolean) =>
    setDocs((list) => list.map((d, idx) => (idx === i ? { ...d, pageCount, rangeable } : d)));

  const pay = async () => {
    if (!docs.length) return toast.error("Attach at least one document.");
    try {
      // Real multi-file / ONE-code job: every document is uploaded; each
      // keeps its own settings; the kiosk releases them all with one code.
      const fd = new FormData();
      const items = docs.map((d) => ({
        fileName: d.file.name,
        pageCount: printedPages(d),
        printConfiguration: { ...d.cfg },
      }));
      docs.forEach((d) => fd.append("files", d.file, d.file.name));
      fd.append("items", JSON.stringify(items));
      fd.append("collate", String(collate));
      fd.append("paymentMethod", payment);
      const result = await createBatchJob(fd).unwrap();
      const payload = result?.response || result?.data || result;
      const job = payload?.job || payload;
      setReceipt({ code: job.code, cost: job.cost, qrPayload: job.qrPayload });
      toast.success("One batch code created for all documents.");
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  // ── Customize one document ───────────────────────────────
  if (editing !== null && docs[editing]) {
    const d = docs[editing];
    const sel =
      d.cfg.pages === "range" && d.rangeable ? parsePageRange(d.cfg.pageRange, d.pageCount) : null;
    return (
      <div className="animate-fadein">
        <div className="editorial-label text-persimmon mb-1">CUSTOMIZE DOCUMENT</div>
        <h1 className="pl-serif text-3xl font-bold tracking-tight mb-1 truncate">{d.file.name}</h1>
        <p className="pl-serif italic text-ink/60 mb-6">
          Document {editing + 1} of {docs.length} · changes apply to this file only.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
          <section className="border-2 border-ink p-6 bg-paper-light h-fit">
            <div className="border-2 border-ink bg-paper p-3 mb-5 flex justify-between items-center">
              <span className="editorial-label text-ink/60">PAGES</span>
              {d.rangeable
                ? <span className="pl-mono text-xl font-bold">{d.pageCount || "…"}</span>
                : <input type="number" min={1} value={d.pageCount || 1}
                    onChange={(e) => setMeta(editing, Math.max(1, Number(e.target.value)), false)}
                    className="pl-input pl-mono w-20 text-right" />}
            </div>
            <div className="editorial-label mb-2">COPIES</div>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => patchDoc(editing, { copies: Math.max(1, d.cfg.copies - 1) })} className="pl-btn-ghost px-3 py-2">-</button>
              <span className="pl-mono text-2xl font-bold w-12 text-center">{d.cfg.copies}</span>
              <button onClick={() => patchDoc(editing, { copies: d.cfg.copies + 1 })} className="pl-btn-ghost px-3 py-2">+</button>
            </div>
            <div className="editorial-label mb-2">COLOUR</div>
            <div className="flex gap-2 mb-4">
              <Chip on={d.cfg.color === "bw"} onClick={() => patchDoc(editing, { color: "bw" })}>B&amp;W</Chip>
              <Chip on={d.cfg.color === "color"} onClick={() => patchDoc(editing, { color: "color" })}>Colour</Chip>
            </div>
            <div className="editorial-label mb-2">SIDES</div>
            <div className="flex gap-2 mb-4">
              <Chip on={d.cfg.sided === "single"} onClick={() => patchDoc(editing, { sided: "single" })}>Single</Chip>
              <Chip on={d.cfg.sided === "double"} onClick={() => patchDoc(editing, { sided: "double" })}>Duplex</Chip>
            </div>
            <div className="editorial-label mb-2">PAPER</div>
            <div className="flex gap-2 mb-4">
              {(["A4", "A3", "Letter"] as const).map((p) => (
                <Chip key={p} on={d.cfg.paper === p} onClick={() => patchDoc(editing, { paper: p })}>{p}</Chip>
              ))}
            </div>
            <div className="editorial-label mb-2">ORIENTATION</div>
            <div className="flex gap-2 mb-4">
              <Chip on={d.cfg.orientation === "portrait"} onClick={() => patchDoc(editing, { orientation: "portrait" })}>Portrait</Chip>
              <Chip on={d.cfg.orientation === "landscape"} onClick={() => patchDoc(editing, { orientation: "landscape" })}>Landscape</Chip>
            </div>
            <div className="editorial-label mb-2">QUALITY</div>
            <select value={d.cfg.qualityDpi} onChange={(e) => patchDoc(editing, { qualityDpi: Number(e.target.value) as any })} className="pl-input mb-4">
              <option value={100}>100dpi draft</option>
              <option value={300}>300dpi standard</option>
              <option value={600}>600dpi sharp</option>
            </select>
            <div className="editorial-label mb-2">PAGES</div>
            <div className="flex gap-2 mb-3">
              <Chip on={d.cfg.pages === "all"} onClick={() => patchDoc(editing, { pages: "all" })}>All</Chip>
              <Chip on={d.cfg.pages === "range"} disabled={!d.rangeable} onClick={() => patchDoc(editing, { pages: "range" })}>Range</Chip>
            </div>
            {d.cfg.pages === "range" && d.rangeable && (
              <input value={d.cfg.pageRange} onChange={(e) => patchDoc(editing, { pageRange: e.target.value })}
                className="pl-input mb-2" placeholder="e.g. 2-3, 10-20" />
            )}
            <div className="bg-ink text-paper p-4 flex justify-between items-center mt-5">
              <span className="pl-serif italic">This file</span>
              <span className="pl-mono text-2xl font-bold">₦{costOf(d, pricingRows).toLocaleString()}</span>
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="ghost" onClick={() => setEditing(null)}>BACK TO LIST</Button>
              <Button variant="primary" arrow className="flex-1" onClick={() => { toast.success("Document settings saved."); setEditing(null); }}>
                SAVE
              </Button>
            </div>
          </section>
          <div className="border-2 border-ink">
            <PrintPreview file={d.file} pages={sel} color={d.cfg.color} copies={d.cfg.copies}
              orientation={d.cfg.orientation}
              onMeta={(m) => setMeta(editing, m.pageCount, m.rangeable)} />
          </div>
        </div>
      </div>
    );
  }

  // ── Receipt: ONE code for the whole batch ────────────────
  if (receipt) {
    return (
      <div className="animate-fadein">
        <div className="editorial-label text-persimmon mb-1">BATCH READY</div>
        <h1 className="pl-serif text-3xl sm:text-4xl font-bold tracking-tight mb-1">
          One code, <em className="italic text-persimmon font-semibold">{docs.length} documents</em>.
        </h1>
        <p className="pl-serif italic text-ink/60 mb-6 sm:mb-7 text-sm sm:text-base">
          A single 24-hour code releases the whole set at the kiosk — printed in order
          {collate ? ", collated" : ""}.
        </p>
        <div className="border-2 border-ink bg-paper-light p-7 flex flex-col md:flex-row gap-7 items-center">
          <QrBlock
            value={receipt.qrPayload || `printloop://release/${receipt.code}`}
            caption={receipt.code}
            label="ONE CODE · ALL DOCUMENTS"
            size={170}
            fileName={`printloop-batch-${receipt.code}`}
          />
          <div className="flex-1 w-full">
            <div className="flex justify-between border-b border-ink/15 py-2 text-sm">
              <span>Documents</span><b>{docs.length}</b>
            </div>
            <div className="flex justify-between border-b border-ink/15 py-2 text-sm">
              <span>Collated</span><b>{collate ? "Yes" : "No"}</b>
            </div>
            <div className="flex justify-between border-b border-ink/15 py-2 text-sm">
              <span>Paid</span><b>₦{Number(receipt.cost).toLocaleString()}</b>
            </div>
            <div className="mt-3 max-h-40 overflow-y-auto text-xs text-ink/70 space-y-1">
              {docs.map((d, i) => (
                <div key={i} className="truncate">
                  {String(i + 1).padStart(2, "0")} · {d.file.name} —{" "}
                  {d.cfg.color === "color" ? "Colour" : "B&W"}, {d.cfg.sided === "double" ? "Duplex" : "Single"}, x{d.cfg.copies}
                </div>
              ))}
            </div>
            <Button variant="ghost" className="mt-5" onClick={() => { setReceipt(null); setDocs([]); }}>
              START A NEW BATCH
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Batch list ───────────────────────────────────────────
  return (
    <div className="animate-fadein">
      <div className="editorial-label text-persimmon mb-1">PERSONAL BATCH PRINTING</div>
      <h1 className="pl-serif text-3xl sm:text-4xl font-bold tracking-tight mb-1">
        Many files, each <em className="italic text-persimmon font-semibold">your way</em>.
      </h1>
      <p className="pl-serif italic text-ink/60 mb-6 sm:mb-7 text-sm sm:text-base">
        Set a default, then fine-tune any document individually. Files left untouched use the default.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        <section className="border-2 border-ink p-4 sm:p-7">
          <label htmlFor="bf" className="block border-2 border-dashed border-ink/40 p-8 text-center cursor-pointer hover:bg-paper-light transition-colors">
            <div className="pl-serif text-xl font-bold">Attach documents</div>
            <div className="pl-serif italic text-ink/60 text-sm mt-1">PDF · JPG · PNG — add as many as you like</div>
            <input id="bf" hidden multiple type="file"
              accept="application/pdf,image/png,image/jpeg"
              onChange={(e) => addFiles(e.target.files)} />
          </label>

          <div className="mt-6 border-2 border-ink">
            <div className="bg-ink text-paper grid grid-cols-[34px_1fr_auto_92px_32px] gap-2 px-3 py-2 text-[10px] tracking-editorial font-bold items-center">
              <div>#</div><div>FILE</div><div>SETTINGS</div><div className="text-right">COST</div><div></div>
            </div>
            {docs.map((d, i) => (
              <div key={`${d.file.name}-${i}`} className="grid grid-cols-[34px_1fr_auto_92px_32px] gap-2 px-3 py-3 border-b border-ink/10 last:border-0 items-center">
                <div className="pl-serif italic text-ochre font-bold">{String(i + 1).padStart(2, "0")}</div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{d.file.name}</div>
                  <div className="text-[11px] mt-0.5 flex items-center gap-2">
                    {d.custom
                      ? <span className="text-persimmon font-bold">● Customized</span>
                      : <span className="text-fog">Using default</span>}
                    <span className="text-fog">·</span>
                    <span className="text-fog pl-mono">{printedPages(d)}pp</span>
                  </div>
                </div>
                <div className="text-[11px] text-ink/70 hidden sm:block">
                  {d.cfg.color === "color" ? "Colour" : "B&W"} · {d.cfg.sided === "double" ? "Duplex" : "Single"} · {d.cfg.paper}{" "}
                  {d.cfg.orientation === "landscape" ? "↺" : ""} ·{" "}
                  {d.cfg.pages === "range" && d.cfg.pageRange ? `p.${d.cfg.pageRange}` : "all"} · x{d.cfg.copies}
                  <button onClick={() => setEditing(i)} className="ml-3 pl-chip !py-1 !px-2 inline-flex items-center gap-1">
                    <Pencil size={12} /> Customize
                  </button>
                </div>
                <div className="pl-mono text-sm font-bold text-right">₦{costOf(d, pricingRows).toLocaleString()}</div>
                <button
                  onClick={() => removeDoc(i)}
                  title={`Remove ${d.file.name}`}
                  className="text-ink/40 hover:text-persimmon transition-colors p-1"
                  aria-label={`Remove ${d.file.name}`}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            {!docs.length && <div className="p-8 text-center text-ink/50 pl-serif italic">No files attached yet.</div>}
          </div>

          {/* Default settings */}
          <div className="mt-6 border-2 border-ink bg-paper-light p-5">
            <div className="editorial-label text-persimmon mb-3">DEFAULT SETTINGS — applied to non-customized files</div>
            <div className="flex flex-wrap gap-2">
              <Chip on={def.color === "bw"} onClick={() => updateDefault({ color: "bw" })}>B&amp;W</Chip>
              <Chip on={def.color === "color"} onClick={() => updateDefault({ color: "color" })}>Colour</Chip>
              <span className="w-px bg-ink/15 mx-1" />
              <Chip on={def.sided === "single"} onClick={() => updateDefault({ sided: "single" })}>Single</Chip>
              <Chip on={def.sided === "double"} onClick={() => updateDefault({ sided: "double" })}>Duplex</Chip>
              <span className="w-px bg-ink/15 mx-1" />
              {(["A4", "A3", "Letter"] as const).map((p) => (
                <Chip key={p} on={def.paper === p} onClick={() => updateDefault({ paper: p })}>{p}</Chip>
              ))}
              <span className="w-px bg-ink/15 mx-1" />
              <Chip on={def.orientation === "portrait"} onClick={() => updateDefault({ orientation: "portrait" })}>Portrait</Chip>
              <Chip on={def.orientation === "landscape"} onClick={() => updateDefault({ orientation: "landscape" })}>Landscape</Chip>
            </div>
          </div>
        </section>

        <aside className="border-2 border-ink p-4 sm:p-7 bg-paper-light h-fit">
          <div className="editorial-label text-persimmon mb-2">BATCH SUMMARY</div>
          <div className="pl-serif text-4xl font-bold mb-1">₦{total.toLocaleString()}</div>
          <div className="text-sm text-ink/60 mb-5">
            {docs.length} file{docs.length === 1 ? "" : "s"} · {docs.filter((d) => d.custom).length} customized · one code for all
          </div>

          <div className="editorial-label mb-2">PAYMENT METHOD</div>
          <div className="grid grid-cols-2 gap-2 mb-5">
            {([["wallet", "Wallet", Wallet], ["paystack", "Paystack", CreditCard]] as const).map(([k, label, Icon]) => (
              <button key={k} onClick={() => setPayment(k)}
                className={`border-2 border-ink rounded-md p-3 text-left transition-all ${payment === k ? "bg-persimmon text-paper" : "bg-paper"}`}>
                <Icon size={17} className="mb-1.5" />
                <div className="text-xs font-bold tracking-wider uppercase">{label}</div>
              </button>
            ))}
          </div>

          <label className="flex items-center justify-between border-2 border-ink bg-paper p-3 mb-4 cursor-pointer">
            <span className="text-sm font-bold">Collate copies</span>
            <input type="checkbox" checked={collate} onChange={(e) => setCollate(e.target.checked)} className="w-4 h-4 accent-persimmon" />
          </label>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between border-b border-ink/15 py-2"><span>Release code</span><b>1 for all</b></div>
            <div className="flex justify-between border-b border-ink/15 py-2"><span>Print order</span><b>Upload order{collate ? " · collated" : ""}</b></div>
            <div className="flex justify-between border-b border-ink/15 py-2"><span>Token expiry</span><b>24 hours</b></div>
          </div>
          <Button variant="primary" arrow className="w-full mt-6" loading={isLoading} disabled={!docs.length} onClick={pay}>
            <Check size={16} /> PAY &amp; GET CODE
          </Button>
        </aside>
      </div>
    </div>
  );
}
