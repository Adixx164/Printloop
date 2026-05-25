import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import QrBlock from "@/components/ui/QrBlock";
import { ROUTES } from "@/constants/routes";
import PrintPreview, { parsePageRange } from "@/components/print/PrintPreview";
import { useCreateJobMutation, useGetPricingQuery } from "@/store/services/jobsApi";
import { useGetWalletQuery, useTopUpMutation } from "@/store/services/walletApi";
import { extractError } from "@/lib/errors";
import { priceFromMatrix, type PricingRow } from "@/lib/pricing";

type Step = 1 | 2 | 3 | 4;
type QualityDpi = 100 | 300 | 600;
type PaymentMethod = "wallet" | "paystack";

type Config = {
  copies: number;
  pages: "all" | "range";
  pageRange: string;
  color: "bw" | "color";
  sided: "single" | "double";
  paper: "A4" | "A3" | "Letter";
  qualityDpi: QualityDpi;
  orientation: "portrait" | "landscape";
  paymentMethod: PaymentMethod;
};

type Receipt = { code: string; cost: number; expiresAt?: string; qrPayload?: string };

const qualityOptions: QualityDpi[] = [100, 300, 600];
const paymentOptions = [
  { key: "wallet" as const, label: "Wallet", icon: Wallet, note: "Instant · prepaid balance" },
  { key: "paystack" as const, label: "Paystack", icon: CreditCard, note: "Card · transfer · USSD · bank" },
];

// `priceOf` was previously hardcoded to ₦5/₦25/0.85 multipliers, which
// silently diverged from the admin pricing matrix. Live calc now lives in
// `priceFromMatrix` above and is fed by `useGetPricingQuery` inside the
// component.

function formatExpiry(value?: string) {
  if (!value) return "24 hours";
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

export default function NewPrintPage() {
  const navigate = useNavigate();
  const [createJob, { isLoading: isCreating }] = useCreateJobMutation();
  const { data: wallet } = useGetWalletQuery();
  const [topUp, { isLoading: isToppingUp }] = useTopUpMutation();
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [topUpAmount, setTopUpAmount] = useState(1000);

  // Auto-detected from the document; manualPages only used for formats we
  // cannot parse (e.g. DOCX) — that is the entire purpose of "page count".
  const [docPages, setDocPages] = useState(0);
  const [rangeable, setRangeable] = useState(false);
  const [manualPages, setManualPages] = useState(1);

  const [config, setConfig] = useState<Config>({
    copies: 1, pages: "all", pageRange: "", color: "bw",
    sided: "single", paper: "A4", qualityDpi: 300,
    orientation: "portrait",
    paymentMethod: "wallet",
  });
  // Live pricing matrix — refetches whenever admin pricing changes (the
  // admin's save invalidates the `Pricing` tag).
  const { data: pricingData } = useGetPricingQuery();
  const pricingRows: PricingRow[] | undefined = pricingData?.configs;

  const totalDocPages = rangeable ? docPages : manualPages;
  const selectedPages = useMemo(() => {
    if (config.pages === "all" || !rangeable) return null;
    const list = parsePageRange(config.pageRange, docPages);
    return list.length ? list : null;
  }, [config.pages, config.pageRange, rangeable, docPages]);

  const printedPageCount =
    config.pages === "range" && selectedPages ? selectedPages.length : totalDocPages || 1;
  const total = priceFromMatrix(printedPageCount, config, pricingRows);
  const walletBalance = Number(wallet?.balance || 0);
  const walletShortfall = Math.max(0, total - walletBalance);

  // Per-page rate and the actual simplex↔duplex delta — both derived from
  // the same matrix the server bills against, so the review panel can
  // never lie about "₦5/page" while charging matrix prices.
  const ratePerPage = priceFromMatrix(1, { ...config, copies: 1 }, pricingRows);
  const simplexRate = priceFromMatrix(
    1,
    { ...config, copies: 1, sided: "single" },
    pricingRows,
  );
  const duplexRate = priceFromMatrix(
    1,
    { ...config, copies: 1, sided: "double" },
    pricingRows,
  );
  const duplexDeltaPct =
    simplexRate > 0 ? Math.round(((duplexRate - simplexRate) / simplexRate) * 100) : 0;
  // Positive => duplex more expensive; negative => duplex cheaper. Both
  // legitimate depending on the admin's pricing model.
  const duplexLabel =
    config.sided !== "double"
      ? "—"
      : duplexDeltaPct === 0
        ? "Same as single"
        : duplexDeltaPct > 0
          ? `+${duplexDeltaPct}% vs single`
          : `${Math.abs(duplexDeltaPct)}% off single`;

  useEffect(() => {
    setStep(1);
  }, []);

  const submitPrintJob = async () => {
    if (!file) return toast.error("Choose a file first.");
    if (config.paymentMethod === "wallet" && walletShortfall > 0) {
      toast.error("Top up your wallet or pay with Paystack.");
      return;
    }
    try {
      // Multipart → the real customer endpoint persists the actual document
      // and creates a real PrintJob a kiosk can fetch & print.
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("fileName", file.name);
      fd.append("pageCount", String(printedPageCount));
      fd.append("paymentMethod", config.paymentMethod);
      fd.append("jobType", "single");
      fd.append(
        "printConfiguration",
        JSON.stringify({
          ...config,
          pageCount: printedPageCount,
          pageRange: config.pages === "range" ? config.pageRange : "",
        })
      );
      const result = await createJob(fd).unwrap();
      const payload = result?.response || result?.data || result;
      const job = payload?.job || payload;
      setReceipt({ code: job.code, cost: job.cost, expiresAt: job.expiresAt, qrPayload: job.qrPayload });
      toast.success("Payment complete. Your print token is ready.");
      setStep(4);
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  const handleTopUp = async () => {
    try {
      await topUp({ amount: topUpAmount }).unwrap();
      toast.success(`Wallet topped up with ₦${topUpAmount.toLocaleString()}.`);
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  const stepLabels = ["UPLOAD", "CONFIGURE + REVIEW", "SUMMARY + PREVIEW", "TOKEN"];
  const pagesLabel =
    config.pages === "range"
      ? selectedPages
        ? `${config.pageRange} · ${printedPageCount} page${printedPageCount === 1 ? "" : "s"}`
        : "Range (enter pages)"
      : `All ${totalDocPages || "?"} pages`;

  return (
    <div className="animate-fadein">
      <div className="editorial-label text-persimmon mb-1">NEW PRINT</div>
      <h1 className="pl-serif text-4xl font-bold tracking-tight mb-1">
        Upload, price, preview, <em className="italic text-persimmon font-semibold">release</em>.
      </h1>
      <p className="pl-serif italic text-ink/60 mb-7">
        Print codes stay valid for 24 hours. Unprinted jobs are auto-refunded to your wallet.
      </p>

      <div className="grid grid-cols-4 gap-2 mb-7">
        {stepLabels.map((label, index) => {
          const n = (index + 1) as Step;
          const active = n === step;
          const done = n < step;
          return (
            <div key={label} className={`p-3 border-2 transition-all ${
              active ? "border-ink bg-persimmon text-paper animate-pulse-ring"
              : done ? "border-ink bg-ink text-paper" : "border-ink/30 bg-paper text-ink/60"}`}>
              <div className="pl-serif italic font-bold text-sm opacity-80">0{n}</div>
              <div className="text-[11px] font-bold tracking-editorial mt-0.5">{label}</div>
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <div className="border-2 border-ink p-7 animate-fadein">
          <h2 className="pl-serif text-2xl font-bold mb-4">Submit your document.</h2>
          <label htmlFor="filein" className="block border-2 border-dashed border-ink/40 p-10 text-center cursor-pointer hover:bg-paper-light transition-colors rounded">
            <div className="pl-serif text-xl font-semibold mb-1">Drop a file, or click to browse.</div>
            <div className="pl-serif italic text-ink/60 text-sm mb-4">PDF · JPG · PNG · up to 50MB</div>
            {file && <div className="inline-block bg-ink text-paper px-3 py-1.5 text-xs font-semibold">{file.name}</div>}
            <input id="filein" type="file"
              accept="application/pdf,image/png,image/jpeg"
              hidden onChange={(e) => { setFile(e.target.files?.[0] || null); setDocPages(0); setRangeable(false); }} />
          </label>
          <div className="flex justify-end mt-6 gap-2">
            <Button variant="ghost" onClick={() => navigate(ROUTES.APP.DASHBOARD)}>CANCEL</Button>
            <Button variant="primary" arrow disabled={!file} onClick={() => file && setStep(2)}>CONTINUE</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-4 animate-fadein">
          <section className="border-2 border-ink p-7">
            <h2 className="pl-serif text-2xl font-bold mb-1">Configure the print.</h2>
            <p className="pl-serif italic text-ink/55 text-sm mb-5">
              Pages are read from your document automatically — choose a range to print only part of it.
            </p>

            {/* Hidden detector: parses page count without showing the preview yet */}
            <div className="hidden">
              <PrintPreview file={file} pages={null} color="color" orientation={config.orientation}
                onMeta={(m) => { setDocPages(m.pageCount); setRangeable(m.rangeable); }} />
            </div>

            <div className="border-2 border-ink bg-paper-light p-4 mb-5 flex items-center justify-between">
              <div>
                <div className="editorial-label text-ink/60">DOCUMENT</div>
                <div className="pl-serif font-bold text-lg truncate max-w-[280px]">{file?.name}</div>
              </div>
              <div className="text-right">
                <div className="editorial-label text-ink/60">PAGES DETECTED</div>
                {rangeable ? (
                  <div className="pl-mono text-2xl font-bold">{docPages || "…"}</div>
                ) : (
                  <input type="number" min={1} value={manualPages}
                    onChange={(e) => setManualPages(Math.max(1, Number(e.target.value)))}
                    className="pl-input pl-mono text-lg font-bold w-24 text-right"
                    title="We can't auto-read pages for this format — enter the page count" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <div className="editorial-label mb-2">COPIES</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setConfig({ ...config, copies: Math.max(1, config.copies - 1) })} className="pl-btn-ghost px-3 py-2">-</button>
                  <span className="pl-mono text-2xl font-bold w-12 text-center">{config.copies}</span>
                  <button onClick={() => setConfig({ ...config, copies: config.copies + 1 })} className="pl-btn-ghost px-3 py-2">+</button>
                </div>
              </div>

              <div>
                <div className="editorial-label mb-2">PAPER</div>
                <div className="flex gap-2 flex-wrap">
                  {(["A4", "A3", "Letter"] as const).map((paper) => (
                    <button key={paper} onClick={() => setConfig({ ...config, paper })} className={`pl-chip ${config.paper === paper ? "pl-chip-active" : ""}`}>{paper}</button>
                  ))}
                </div>
              </div>

              <div>
                <div className="editorial-label mb-2">COLOUR</div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setConfig({ ...config, color: "bw" })} className={`pl-chip ${config.color === "bw" ? "pl-chip-active" : ""}`}>Black &amp; White</button>
                  <button onClick={() => setConfig({ ...config, color: "color" })} className={`pl-chip ${config.color === "color" ? "pl-chip-active" : ""}`}>Colour</button>
                </div>
              </div>

              <div>
                <div className="editorial-label mb-2">SIDES</div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setConfig({ ...config, sided: "single" })} className={`pl-chip ${config.sided === "single" ? "pl-chip-active" : ""}`}>Single</button>
                  <button onClick={() => setConfig({ ...config, sided: "double" })} className={`pl-chip ${config.sided === "double" ? "pl-chip-active" : ""}`}>Duplex</button>
                </div>
              </div>

              <div>
                <div className="editorial-label mb-2">PAGES</div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setConfig({ ...config, pages: "all" })} className={`pl-chip ${config.pages === "all" ? "pl-chip-active" : ""}`}>All</button>
                  <button disabled={!rangeable} onClick={() => setConfig({ ...config, pages: "range" })}
                    className={`pl-chip ${config.pages === "range" ? "pl-chip-active" : ""} ${!rangeable ? "opacity-40 cursor-not-allowed" : ""}`}>Range</button>
                </div>
              </div>

              <div>
                <div className="editorial-label mb-2">ORIENTATION</div>
                <div className="flex gap-2 flex-wrap">
                  {(["portrait", "landscape"] as const).map((o) => (
                    <button
                      key={o}
                      onClick={() => setConfig({ ...config, orientation: o })}
                      className={`pl-chip ${config.orientation === o ? "pl-chip-active" : ""}`}
                    >
                      {o === "portrait" ? "Portrait" : "Landscape"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {config.pages === "range" && rangeable && (
              <div className="mt-5">
                <div className="editorial-label mb-2">PAGE RANGE — of {docPages} pages</div>
                <input value={config.pageRange}
                  onChange={(e) => setConfig({ ...config, pageRange: e.target.value })}
                  className="pl-input" placeholder="e.g. 2-3, 10-20" />
                <div className="text-xs text-ink/55 pl-serif italic mt-1">
                  Only these pages will print and be charged.
                </div>
              </div>
            )}

            <div className="mt-7 border-2 border-ink p-5 bg-paper-light">
              <div className="flex justify-between items-baseline mb-3">
                <div>
                  <div className="editorial-label">PRINT RESOLUTION</div>
                  <div className="pl-serif text-xl font-bold">{config.qualityDpi}dpi</div>
                </div>
                <div className="text-xs text-ink/60 pl-serif italic">100dpi draft · 300dpi standard · 600dpi sharp</div>
              </div>
              <input type="range" min={0} max={2} step={1}
                value={qualityOptions.indexOf(config.qualityDpi)}
                onChange={(e) => setConfig({ ...config, qualityDpi: qualityOptions[Number(e.target.value)] })}
                className="pl-slider w-full" />
              <div className="flex justify-between text-[10px] tracking-editorial font-bold mt-2">
                {qualityOptions.map((q) => <span key={q}>{q}DPI</span>)}
              </div>
            </div>
          </section>

          <aside className="border-2 border-ink p-7 bg-paper-light">
            <div className="editorial-label text-persimmon mb-2">REVIEW PRICING</div>
            <h2 className="pl-serif text-2xl font-bold mb-5">No surprises later.</h2>
            {[
              ["FILE", file?.name || "-"],
              // Per-page rate matches what the matrix charges for this exact
              // (paper, colour, dpi, sided) cell — no more lying about ₦5/page
              // while billing ₦70.
              ["RATE", `₦${ratePerPage.toLocaleString()}/page`],
              ["QUALITY", `${config.qualityDpi}dpi`],
              ["PAGES", `${printedPageCount} x ${config.copies} cop${config.copies === 1 ? "y" : "ies"}`],
              ["DUPLEX", duplexLabel],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-ink/15 py-2.5 gap-4">
                <span className="editorial-label">{k}</span>
                <span className="font-semibold text-sm text-right">{v}</span>
              </div>
            ))}
            <div className="bg-ink text-paper p-5 flex justify-between items-center mt-5">
              <span className="pl-serif text-lg italic">Total locked price</span>
              <span className="pl-mono text-3xl font-bold">₦{total.toLocaleString()}</span>
            </div>

            <div className="mt-5">
              <div className="editorial-label mb-2">PAYMENT METHOD</div>
              <div className="grid grid-cols-2 gap-2">
                {paymentOptions.map(({ key, label, icon: Icon, note }) => (
                  <button key={key} onClick={() => setConfig({ ...config, paymentMethod: key })}
                    className={`border-2 border-ink rounded-md p-3 text-left transition-all hover:-translate-x-1 hover:-translate-y-1 hover:[box-shadow:4px_4px_0_#1A1410] ${
                      config.paymentMethod === key ? "bg-persimmon text-paper" : "bg-paper"}`}>
                    <Icon size={18} className="mb-2" />
                    <div className="text-xs font-bold tracking-wider uppercase">{label}</div>
                    <div className={`text-[10px] mt-1 ${config.paymentMethod === key ? "text-paper/80" : "text-ink/55"}`}>{note}</div>
                  </button>
                ))}
              </div>
            </div>

            {config.paymentMethod === "wallet" && walletShortfall > 0 && (
              <div className="mt-5 border-2 border-persimmon bg-persimmon/10 p-4 animate-fadein">
                <div className="editorial-label text-persimmon mb-2">WALLET SHORT BY ₦{walletShortfall.toLocaleString()}</div>
                <div className="flex gap-2">
                  <input type="number" value={topUpAmount}
                    onChange={(e) => setTopUpAmount(Math.max(0, Number(e.target.value)))} className="pl-input pl-mono" />
                  <Button variant="dark" loading={isToppingUp} onClick={handleTopUp}>TOP UP</Button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-7">
              <Button variant="ghost" onClick={() => setStep(1)}>BACK</Button>
              <Button variant="primary" arrow onClick={() => setStep(3)}>SUMMARY &amp; PREVIEW</Button>
            </div>
          </aside>
        </div>
      )}

      {step === 3 && (
        <div className="animate-fadein space-y-4">
          {/* ── Summary first ───────────────────────────────── */}
          <div className="border-2 border-ink">
            <div className="bg-ink text-paper px-6 py-4 flex justify-between items-center">
              <div>
                <div className="editorial-label text-persimmon mb-1">ORDER SUMMARY</div>
                <h2 className="pl-serif text-2xl font-bold">Confirm before you pay.</h2>
              </div>
              <div className="pl-mono text-3xl font-bold">₦{total.toLocaleString()}</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 divide-x divide-ink/15 border-b-2 border-ink">
              {[
                ["Document", file?.name || "-"],
                ["Pages", pagesLabel],
                ["Copies", String(config.copies)],
                ["Paper", config.paper],
                ["Orientation", config.orientation === "landscape" ? "Landscape" : "Portrait"],
                ["Colour", config.color === "color" ? "Colour" : "B&W"],
                ["Sides", config.sided === "double" ? "Duplex" : "Single"],
                ["Quality", `${config.qualityDpi}dpi`],
              ].map(([k, v]) => (
                <div key={String(k)} className="p-4">
                  <div className="editorial-label opacity-60">{k}</div>
                  <div className="font-semibold text-sm mt-1 break-words">{v}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center p-4 bg-paper-light gap-3 flex-wrap">
              <div className="pl-serif italic text-ink/60 text-sm">
                Token valid 24 hours · unprinted jobs auto-refunded · paying with{" "}
                <b className="not-italic">{config.paymentMethod === "wallet" ? "Wallet" : "Paystack"}</b>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep(2)}>BACK TO CONFIGURE</Button>
                <Button variant="primary" arrow loading={isCreating} onClick={submitPrintJob}>
                  PAY ₦{total.toLocaleString()} &amp; PRINT
                </Button>
              </div>
            </div>
          </div>

          {/* ── Preview after summary ───────────────────────── */}
          <div className="border-2 border-ink">
            <div className="bg-ink text-paper px-6 py-3">
              <div className="editorial-label text-persimmon">PRINT PREVIEW</div>
              <h2 className="pl-serif text-xl font-bold">Exactly what comes out of the tray.</h2>
            </div>
            <PrintPreview
              file={file}
              pages={selectedPages}
              color={config.color}
              copies={config.copies}
              orientation={config.orientation}
              onMeta={(m) => { setDocPages(m.pageCount); setRangeable(m.rangeable); }}
            />
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="border-2 border-ink animate-fadein">
          <div className="bg-ink text-paper px-6 py-8 text-center">
            <div className="editorial-label text-persimmon mb-2">YOUR 24-HOUR PRINT TOKEN</div>
            <div className="pl-mono text-5xl font-bold tracking-wider mb-1">{receipt?.code || "------"}</div>
            <div className="pl-serif italic opacity-80 text-sm">
              Expires {formatExpiry(receipt?.expiresAt)}. Unprinted jobs are refunded automatically.
            </div>
          </div>
          <div className="p-7">
            <div className="flex flex-col md:flex-row items-center gap-7">
              <div className="shrink-0">
                <QrBlock
                  value={receipt?.qrPayload || `printloop://release/${receipt?.code || ""}`}
                  label="SCAN AT KIOSK"
                  size={168}
                  fileName={`printloop-${receipt?.code || "code"}`}
                />
              </div>
              <div className="flex-1 w-full">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                  <div className="border border-ink/15 p-3">
                    <div className="editorial-label mb-1">NEAREST</div>
                    <div className="pl-serif font-semibold text-lg">Yaba</div>
                    <div className="text-fog text-xs">240m away</div>
                  </div>
                  <div className="border border-ink/15 p-3">
                    <div className="editorial-label mb-1">EXPIRES</div>
                    <div className="pl-serif font-semibold text-lg">24 hours</div>
                    <div className="text-fog text-xs">Auto-refund after expiry</div>
                  </div>
                  <div className="border border-ink/15 p-3">
                    <div className="editorial-label mb-1">PAID</div>
                    <div className="pl-serif font-semibold text-lg">₦{receipt?.cost ?? total}</div>
                    <div className="text-fog text-xs">{config.paymentMethod === "wallet" ? "WALLET" : "PAYSTACK"}</div>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="primary" arrow onClick={() => navigate(ROUTES.APP.DASHBOARD)}>BACK TO DASHBOARD</Button>
                  <Button variant="ghost" onClick={() => navigate(ROUTES.APP.PRINT_JOBS)}>VIEW JOB CODE</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
