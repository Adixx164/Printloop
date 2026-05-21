import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import QrBlock from "@/components/ui/QrBlock";
import { CONFIG } from "@/constants/config";
import PrintPreview, { parsePageRange } from "@/components/print/PrintPreview";

type Stage = "loading" | "closed" | "join" | "configure" | "done";
type Cfg = {
  color: "bw" | "color";
  sided: "single" | "double";
  paper: string;
  qualityDpi: number;
  pages: "all" | "range";
  pageRange: string;
  copies: number;
};

const API = CONFIG.apiBaseUrl;

function priceOf(pages: number, c: Cfg) {
  const perPage = c.color === "color" ? 25 : 5;
  const duplex = c.sided === "double" ? 0.85 : 1;
  const quality = c.qualityDpi === 600 ? 1.2 : c.qualityDpi === 100 ? 0.8 : 1;
  return Math.max(5, Math.round(pages * c.copies * perPage * duplex * quality));
}

/** Module-level so it keeps a stable identity across renders — defining it
 * inside the component remounted every input on each keystroke. */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <header className="bg-ink text-paper border-b-[3px] border-persimmon px-8 py-4 flex justify-between items-baseline">
        <div className="pl-serif font-extrabold text-2xl">PrintLoop<span className="text-persimmon">.</span></div>
        <div className="editorial-label text-paper/60">GROUP UPLOAD</div>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-10">{children}</main>
      <footer className="bg-ink text-paper px-8 py-4 flex justify-between items-center">
        <span className="pl-serif italic text-sm opacity-80">Yours faithfully — PrintLoop.</span>
        <span className="text-[11px] tracking-editorial">VOL. I · ©2026 <span className="text-ochre ml-2">❦</span></span>
      </footer>
    </div>
  );
}

export default function JoinPage() {
  const { shareId = "" } = useParams();
  const [stage, setStage] = useState<Stage>("loading");
  const [session, setSession] = useState<any>(null);
  const [err, setErr] = useState("");

  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [token, setToken] = useState("");
  const [watermarkId, setWatermarkId] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [docPages, setDocPages] = useState(0);
  const [rangeable, setRangeable] = useState(false);
  const [manualPages, setManualPages] = useState(1);
  const [cfg, setCfg] = useState<Cfg>({
    color: "bw", sided: "single", paper: "A4", qualityDpi: 300, pages: "all", pageRange: "", copies: 1,
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ code: string; cost: number } | null>(null);

  const enforced = !!session?.defaultOptions?.enforce;

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/groups/share/${shareId}`);
        const j = await r.json();
        if (!r.ok || !j.success) {
          setErr(j?.message || "This group session isn't available.");
          setStage("closed");
          return;
        }
        setSession(j.data.session);
        const o = j.data.session.defaultOptions || {};
        setCfg((c) => ({
          ...c,
          color: o.color === "color" ? "color" : "bw",
          sided: o.sided === "double" ? "double" : "single",
          paper: o.paper || "A4",
          qualityDpi: o.qualityDpi || 300,
        }));
        setStage("join");
      } catch {
        setErr("Couldn't reach the server.");
        setStage("closed");
      }
    })();
  }, [shareId]);

  const totalPages = rangeable ? docPages : manualPages;
  const selected = useMemo(() => {
    if (cfg.pages === "all" || !rangeable) return null;
    const list = parsePageRange(cfg.pageRange, docPages);
    return list.length ? list : null;
  }, [cfg.pages, cfg.pageRange, rangeable, docPages]);
  const printed = cfg.pages === "range" && selected ? selected.length : totalPages || 1;
  const cost = priceOf(printed, cfg);

  const join = async () => {
    if (!form.name.trim()) return toast.error("Enter your name.");
    if (!form.email && !form.phone) return toast.error("Enter an email or phone number.");
    setBusy(true);
    try {
      const r = await fetch(`${API}/groups/${shareId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email || undefined, phoneNumber: form.phone || undefined }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.message || "Couldn't join.");
      setToken(j.data.uploadToken);
      setWatermarkId(j.data.participant.watermarkId);
      setStage("configure");
      toast.success("You're in. Upload your document.");
    } catch (e: any) {
      toast.error(e.message || "Failed to join.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!file) return toast.error("Choose a document.");
    setBusy(true);
    try {
      const r = await fetch(`${API}/participant-upload/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Upload-Token": token },
        body: JSON.stringify({
          fileURL: `local://${encodeURIComponent(file.name)}`,
          fileName: file.name,
          pageCount: printed,
          mimeType: file.type || "application/pdf",
          sizeBytes: file.size,
          printConfiguration: enforced ? undefined : {
            paper: cfg.paper, color: cfg.color, sided: cfg.sided, qualityDpi: cfg.qualityDpi,
          },
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.message || "Upload failed.");
      setResult({ code: j.data.printJob.code, cost: j.data.printJob.cost });
      setStage("done");
      toast.success("Paid & added to the batch.");
    } catch (e: any) {
      toast.error(e.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  if (stage === "loading")
    return <Shell><div className="text-center pl-serif italic text-ink/50 py-24">Loading session…</div></Shell>;

  if (stage === "closed")
    return (
      <Shell>
        <div className="border-2 border-ink p-10 text-center">
          <div className="text-5xl mb-3">❦</div>
          <h1 className="pl-serif text-3xl font-bold mb-2">Session unavailable</h1>
          <p className="pl-serif italic text-ink/60">{err}</p>
        </div>
      </Shell>
    );

  if (stage === "done" && result)
    return (
      <Shell>
        <div className="border-2 border-ink animate-fadein">
          <div className="bg-ink text-paper px-6 py-8 text-center">
            <div className="editorial-label text-persimmon mb-2">YOU'RE IN THE BATCH</div>
            <div className="pl-mono text-5xl font-bold tracking-wider">{result.code}</div>
          </div>
          <div className="p-7 flex flex-col md:flex-row gap-7 items-center">
            <div className="shrink-0">
              <QrBlock
                value={`printloop://release/${result.code}`}
                label="YOUR DOCUMENT QR"
                size={160}
                fileName={`printloop-${result.code}`}
              />
            </div>
            <div>
              <h1 className="pl-serif text-2xl font-bold mb-1">Document submitted &amp; paid.</h1>
              <p className="pl-serif italic text-ink/60 mb-3">
                {session?.defaultOptions?.watermark?.enabled !== false && (
                  <>Your watermark ID is <b className="not-italic pl-mono">{watermarkId}</b>. </>
                )}
                The host prints
                the whole batch with one token — your pages are included.
              </p>
              <div className="text-sm">Paid: <b>₦{Number(result.cost).toLocaleString()}</b></div>
            </div>
          </div>
        </div>
      </Shell>
    );

  // join + configure share the session header
  return (
    <Shell>
      <div className="editorial-label text-persimmon mb-1">GROUP SESSION</div>
      <h1 className="pl-serif text-3xl font-bold mb-1">{session?.groupName}</h1>
      <p className="pl-serif italic text-ink/60 mb-6">
        Closes {new Date(session?.deadline).toLocaleString()} ·{" "}
        {enforced ? "host settings are enforced" : "you can configure your own settings"}
      </p>

      {stage === "join" && (
        <div className="border-2 border-ink p-7 max-w-md">
          <h2 className="pl-serif text-2xl font-bold mb-4">Join the group.</h2>
          <div className="editorial-label mb-1">YOUR NAME</div>
          <input className="pl-input mb-3" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
          <div className="editorial-label mb-1">EMAIL</div>
          <input className="pl-input mb-3" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
          <div className="editorial-label mb-1">OR PHONE</div>
          <input className="pl-input mb-5" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+234…" />
          <button onClick={join} disabled={busy} className="pl-btn-primary w-full">
            {busy ? "JOINING…" : "JOIN & CONTINUE →"}
          </button>
        </div>
      )}

      {stage === "configure" && (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
          <section className="border-2 border-ink p-6 bg-paper-light h-fit">
            <label htmlFor="gf" className="block border-2 border-dashed border-ink/40 p-6 text-center cursor-pointer hover:bg-paper transition-colors mb-5">
              <div className="pl-serif font-bold">{file ? file.name : "Choose your document"}</div>
              <div className="pl-serif italic text-ink/60 text-xs mt-1">PDF · JPG · PNG</div>
              <input id="gf" hidden type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={(e) => { setFile(e.target.files?.[0] || null); setDocPages(0); setRangeable(false); }} />
            </label>

            {!rangeable && file && (
              <div className="mb-4">
                <div className="editorial-label mb-1">PAGES IN DOCUMENT</div>
                <input type="number" min={1} value={manualPages}
                  onChange={(e) => setManualPages(Math.max(1, Number(e.target.value)))}
                  className="pl-input pl-mono" />
              </div>
            )}

            {enforced ? (
              <div className="border-2 border-ink bg-paper p-4 text-sm">
                <div className="editorial-label text-persimmon mb-2">HOST-ENFORCED SETTINGS</div>
                {cfg.paper} · {cfg.color === "color" ? "Colour" : "B&W"} · {cfg.sided === "double" ? "Duplex" : "Single"} · {cfg.qualityDpi}dpi
              </div>
            ) : (
              <>
                <div className="editorial-label mb-2">COLOUR</div>
                <div className="flex gap-2 mb-3">
                  {(["bw", "color"] as const).map((c) => (
                    <button key={c} onClick={() => setCfg({ ...cfg, color: c })} className={`pl-chip ${cfg.color === c ? "pl-chip-active" : ""}`}>{c === "bw" ? "B&W" : "Colour"}</button>
                  ))}
                </div>
                <div className="editorial-label mb-2">SIDES</div>
                <div className="flex gap-2 mb-3">
                  {(["single", "double"] as const).map((s) => (
                    <button key={s} onClick={() => setCfg({ ...cfg, sided: s })} className={`pl-chip ${cfg.sided === s ? "pl-chip-active" : ""}`}>{s === "single" ? "Single" : "Duplex"}</button>
                  ))}
                </div>
                <div className="editorial-label mb-2">PAGES</div>
                <div className="flex gap-2 mb-2">
                  <button onClick={() => setCfg({ ...cfg, pages: "all" })} className={`pl-chip ${cfg.pages === "all" ? "pl-chip-active" : ""}`}>All</button>
                  <button disabled={!rangeable} onClick={() => setCfg({ ...cfg, pages: "range" })} className={`pl-chip ${cfg.pages === "range" ? "pl-chip-active" : ""} ${!rangeable ? "opacity-40" : ""}`}>Range</button>
                </div>
                {cfg.pages === "range" && rangeable && (
                  <input className="pl-input mb-2" placeholder="2-3, 10-20" value={cfg.pageRange} onChange={(e) => setCfg({ ...cfg, pageRange: e.target.value })} />
                )}
              </>
            )}

            <div className="bg-ink text-paper p-4 flex justify-between items-center mt-5">
              <span className="pl-serif italic">Your total</span>
              <span className="pl-mono text-2xl font-bold">₦{cost.toLocaleString()}</span>
            </div>
            <button onClick={submit} disabled={busy || !file} className="pl-btn-primary w-full mt-4">
              {busy ? "SUBMITTING…" : `PAY ₦${cost.toLocaleString()} & SUBMIT →`}
            </button>
          </section>

          <div className="border-2 border-ink">
            <PrintPreview file={file} pages={selected} color={cfg.color} copies={cfg.copies}
              onMeta={(m) => { setDocPages(m.pageCount); setRangeable(m.rangeable); }} />
          </div>
        </div>
      )}
    </Shell>
  );
}
