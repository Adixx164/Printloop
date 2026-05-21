/**
 * PrintLoop Kiosk UI — v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Flow:
 *   idle → validating → doc-preview → print-summary → printing → success | error
 *
 * New screens vs v1:
 *   • doc-preview   — renders the actual PDF from Cloudinary fileURL in <iframe>
 *                     Electron/Chromium has a native PDF viewer, so it just works.
 *   • print-summary — full spec table + cost (₦) + printer selector before confirm
 *
 * Reads from window.printloop (injected by preload.js).
 * Falls back to a dev mock when not running in Electron.
 * Dev code: AB1234
 */

import { useState, useEffect } from "react";

// ─── Dev mock ─────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const devMock = {
  validateCode: async (code) => {
    await sleep(1300);
    if (code === "AB1234") return { valid: true, jobNumber: 1042 };
    return { valid: false, message: "Code not found or payment not completed." };
  },
  getJob: async () => {
    await sleep(700);
    return {
      jobNumber: 1042,
      fileName: "Research_Paper_Q3_2025.pdf",
      fileURL: "https://www.africau.edu/images/default/sample.pdf",
      printConfiguration: {
        paperSize: "A4",
        orientation: "portrait",
        copies: 2,
        colorType: "black_white",
        duplex: "double_sided_long_edge",
        resolution: 600,
        staple: true,
        pageRange: "1-12",
      },
      cost: 850,
      customerInfo: { email: "ab***@gmail.com", fullName: "Abdurrahman" },
    };
  },
  getPrinters: async () => [
    { name: "HP LaserJet Pro M404n", isDefault: true },
    { name: "Epson L3250", isDefault: false },
  ],
  printJob: async () => {
    await sleep(3500);
    return { success: true };
  },
};

const pl =
  typeof window !== "undefined" && window.printloop ? window.printloop : devMock;

// ─── Keyboard layout ──────────────────────────────────────────────────────────
const KEYS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M", "⌫"],
];

// ─── Progress step config ─────────────────────────────────────────────────────
const STEP_SCREENS = ["idle", "doc-preview", "print-summary"];
const STEP_LABELS  = ["Enter code", "Preview", "Confirm"];

// ─── Label helpers ────────────────────────────────────────────────────────────
const dDuplex = (d) =>
  ({
    single_sided: "Single sided",
    double_sided_long_edge: "Double sided (long edge)",
    double_sided_short_edge: "Double sided (short edge)",
  }[d] || d);
const dColor = (c) => (c === "color" ? "Color" : "Black & White");
const dOri   = (o) => (o === "landscape" ? "Landscape" : "Portrait");
const fmtNGN = (n) =>
  n != null
    ? `₦${Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
    : null;

// ─── Global CSS (keyframes + helpers) ────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
  @keyframes pl-spin  { to { transform: rotate(360deg); } }
  @keyframes pl-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
  @keyframes pl-pop   { 0%{transform:scale(.4);opacity:0} 70%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
  @keyframes pl-blink { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes pl-slide { from{transform:translateY(10px);opacity:0} to{transform:translateY(0);opacity:1} }
  .pl-screen          { animation: pl-slide .25s ease; width:100%; display:flex; flex-direction:column; align-items:center; }
  .pl-cursor::after   { content:''; position:absolute; width:2px; height:32px; background:#3a9fd1; border-radius:1px; animation: pl-blink 1s step-end infinite; }
  .pl-key:hover       { background:#162738 !important; border-color:#225275 !important; }
  .pl-key:active      { transform:scale(.96); }
  .pl-btn-p:hover     { background:#2d6a99 !important; }
  .pl-btn-s:hover     { color:#ccdce9 !important; border-color:#527a95 !important; }
  .pl-sel:focus       { outline:none; border-color:#225275; }
`;

// ─── Style tokens ─────────────────────────────────────────────────────────────
const T = {
  root:     { fontFamily:"'Sora',sans-serif", background:"#07111d", minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", color:"#ccdce9", padding:24, position:"relative" },
  logo:     { position:"absolute", top:18, left:24, display:"flex", alignItems:"center", gap:9, fontSize:13, fontWeight:600, letterSpacing:".1em", color:"#3a9fd1" },
  badge:    { position:"absolute", top:18, right:24, fontSize:12, color:"#527a95", display:"flex", alignItems:"center", gap:5 },
  onlineDot:{ width:7, height:7, borderRadius:"50%", background:"#22c55e", flexShrink:0 },
  card:     { background:"#0e1e2e", border:"1px solid #1a3045", borderRadius:16, padding:"24px 28px", width:"100%", maxWidth:640 },
  divider:  { height:1, background:"#1a3045", margin:"14px 0" },
  specGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 },
  specItem: { background:"#071525", borderRadius:10, padding:"11px 13px" },
  specLabel:{ fontSize:10, color:"#527a95", textTransform:"uppercase", letterSpacing:".08em", marginBottom:3 },
  specValue:{ fontSize:13, fontWeight:500, color:"#eaf2f8" },
  btnP:     { background:"#225275", color:"#eaf2f8", border:"none", borderRadius:10, padding:"14px 28px", fontSize:15, fontWeight:600, cursor:"pointer", width:"100%", fontFamily:"'Sora',sans-serif", letterSpacing:".02em" },
  btnS:     { background:"transparent", color:"#527a95", border:"1.5px solid #1a3045", borderRadius:10, padding:"12px 28px", fontSize:14, fontWeight:500, cursor:"pointer", fontFamily:"'Sora',sans-serif" },
  key:      { minWidth:42, height:48, border:"1.5px solid #1a3045", borderRadius:8, background:"#0e1e2e", color:"#ccdce9", fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:500, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flex:"1 0 auto", userSelect:"none" },
  select:   { background:"#071525", color:"#ccdce9", border:"1.5px solid #1a3045", borderRadius:8, padding:"9px 12px", fontFamily:"'Sora',sans-serif", fontSize:13, width:"100%" },
  note:     { background:"#071525", border:"1px solid #1a3045", borderRadius:8, padding:"10px 14px", marginTop:10, display:"flex", alignItems:"flex-start", gap:8 },
  codeBox:  (f, a) => ({ width:58, height:70, border:`2px solid ${a?"#3a9fd1":f?"#2d6a99":"#1a3045"}`, borderRadius:10, background:a?"#0f2540":f?"#0d2038":"#0a1828", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono',monospace", fontSize:28, fontWeight:500, color:"#eaf2f8", transition:"border-color .15s,background .15s", position:"relative" }),
};

// ─── Shared micro-components ──────────────────────────────────────────────────
const Logo = () => (
  <svg width="24" height="24" viewBox="0 0 26 26" fill="none">
    <rect width="26" height="26" rx="6" fill="#225275"/>
    <polyline points="6,18 6,10 13,6 20,10 20,18" stroke="#eaf2f8" strokeWidth="1.8" strokeLinejoin="round" fill="none"/>
    <rect x="9" y="14" width="8" height="7" rx="1.5" stroke="#eaf2f8" strokeWidth="1.6" fill="none"/>
  </svg>
);

const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#527a95" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,marginTop:2}}>
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const PrinterIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e0f0ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6,9 6,2 18,2 18,9"/>
    <path d="M6,18H4a2,2,0,0,1-2-2v-5a2,2,0,0,1,2-2H20a2,2,0,0,1,2,2v5a2,2,0,0,1-2,2H18"/>
    <rect x="6" y="14" width="12" height="8"/>
  </svg>
);

const StepDots = ({ screen }) => {
  const idx = STEP_SCREENS.indexOf(screen);
  if (idx < 0) return null;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:28 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ width:8, height:8, borderRadius:"50%", transition:"background .2s",
          background: i < idx ? "#225275" : i === idx ? "#3a9fd1" : "#1a3045" }} />
      ))}
      <span style={{ fontSize:11, color:"#527a95", marginLeft:4 }}>{STEP_LABELS[idx]}</span>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function PrintLoopKiosk() {
  const [screen,     setScreen]     = useState("idle");
  const [code,       setCode]       = useState("");
  const [job,        setJob]        = useState(null);
  const [printers,   setPrinters]   = useState([]);
  const [selPrinter, setSelPrinter] = useState("");
  const [errMsg,     setErrMsg]     = useState("");

  // Inject global styles + load printers once
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = GLOBAL_CSS;
    document.head.appendChild(style);
    pl.getPrinters()
      .then((list) => {
        setPrinters(list);
        const def = list.find((p) => p.isDefault) || list[0];
        if (def) setSelPrinter(def.name);
      })
      .catch(console.error);
    return () => document.head.removeChild(style);
  }, []);

  // Physical keyboard (only on idle screen)
  useEffect(() => {
    if (screen !== "idle") return;
    const onKey = (e) => {
      const k = e.key.toUpperCase();
      if (/^[A-Z0-9]$/.test(k)) {
        setCode((p) => (p.length < 6 ? p + k : p));
      } else if (e.key === "Backspace") {
        setCode((p) => p.slice(0, -1));
      } else if (e.key === "Enter") {
        setCode((p) => { if (p.length === 6) handleValidate(p); return p; });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen]);

  // Auto-submit when 6 chars entered
  useEffect(() => {
    if (code.length === 6) {
      const t = setTimeout(() => handleValidate(code), 350);
      return () => clearTimeout(t);
    }
  }, [code]);

  // Auto-reset from success/error
  useEffect(() => {
    if (screen === "success" || screen === "error") {
      const t = setTimeout(doReset, 9000);
      return () => clearTimeout(t);
    }
  }, [screen]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  function doReset() {
    setScreen("idle");
    setCode("");
    setJob(null);
    setErrMsg("");
  }

  async function handleValidate(c = code) {
    if (c.length !== 6) return;
    setScreen("validating");
    try {
      const res = await pl.validateCode(c);
      if (!res.valid) {
        setErrMsg(res.message || "Invalid code.");
        setScreen("error");
        return;
      }
      const jobData = await pl.getJob(c);
      setJob(jobData);
      setScreen("doc-preview"); // Step 2: show document
    } catch (e) {
      setErrMsg(e.message || "Network error. Please try again.");
      setScreen("error");
    }
  }

  async function handlePrint() {
    setScreen("printing");
    try {
      const res = await pl.printJob({ code, printerId: selPrinter, printerName: selPrinter });
      if (res.success) {
        setScreen("success");
      } else {
        setErrMsg(res.error || "Print failed.");
        setScreen("error");
      }
    } catch (e) {
      setErrMsg(e.message || "Print failed.");
      setScreen("error");
    }
  }

  function onVirtualKey(k) {
    if (k === "⌫") { setCode((p) => p.slice(0, -1)); }
    else if (code.length < 6) { setCode((p) => p + k); }
  }

  // ── Screens ──────────────────────────────────────────────────────────────────

  const IdleScreen = () => (
    <div className="pl-screen" style={{ maxWidth:560, alignItems:"center" }}>
      <StepDots screen="idle" />
      <h1 style={{ fontSize:24, fontWeight:300, color:"#eaf2f8", marginBottom:5, textAlign:"center" }}>
        Enter your pickup code
      </h1>
      <p style={{ fontSize:13, color:"#527a95", marginBottom:32, textAlign:"center" }}>
        You received this after completing payment
      </p>

      {/* Code boxes */}
      <div style={{ display:"flex", gap:9, marginBottom:32 }}>
        {Array.from({ length: 6 }).map((_, i) => {
          const f = !!code[i], a = i === code.length && i < 6;
          return (
            <div key={i} style={T.codeBox(f, a)} className={a ? "pl-cursor" : ""}>
              {code[i] || ""}
            </div>
          );
        })}
      </div>

      {/* Virtual keyboard */}
      <div style={{ width:"100%", maxWidth:500, display:"flex", flexDirection:"column", gap:6 }}>
        {KEYS.map((row, ri) => (
          <div key={ri} style={{ display:"flex", gap:5, justifyContent:"center" }}>
            {row.map((k) => (
              <button
                key={k}
                className="pl-key"
                style={{ ...T.key, ...(k === "⌫" ? { flex:"1.6 0 auto", background:"#162736", fontSize:17 } : {}) }}
                onMouseDown={(e) => { e.preventDefault(); onVirtualKey(k); }}
              >
                {k}
              </button>
            ))}
          </div>
        ))}
      </div>

      {code.length > 0 && (
        <div style={{ display:"flex", gap:10, marginTop:20, width:"100%", maxWidth:500 }}>
          <button className="pl-btn-s" style={{ ...T.btnS, width:"auto", padding:"11px 22px" }} onClick={doReset}>
            Clear
          </button>
          {code.length === 6 ? (
            <button className="pl-btn-p" style={T.btnP} onClick={() => handleValidate(code)}>
              Check Code →
            </button>
          ) : (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#527a95" }}>
              {6 - code.length} more character{6 - code.length > 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const ValidatingScreen = () => (
    <div className="pl-screen" style={{ alignItems:"center", textAlign:"center" }}>
      <div style={{ width:60, height:60, border:"3px solid #1a3045", borderTopColor:"#3a9fd1", borderRadius:"50%", animation:"pl-spin .9s linear infinite", marginBottom:20 }} />
      <p style={{ fontSize:18, color:"#ccdce9" }}>
        Checking code{" "}
        <span style={{ fontFamily:"'DM Mono',monospace", color:"#3a9fd1" }}>{code}</span>…
      </p>
    </div>
  );

  /**
   * DocPreviewScreen
   * Loads the Cloudinary fileURL in an <iframe>.
   * In Electron (Chromium), PDFs are rendered natively without any library.
   *
   * Tip: If your Cloudinary PDF URL triggers a download instead of inline
   * display, append ?fl_attachment=false to the URL in the API response,
   * or set the Cloudinary delivery type to force inline.
   */
  const DocPreviewScreen = () => (
    <div className="pl-screen" style={{ maxWidth:640 }}>
      <StepDots screen="doc-preview" />
      <div style={T.card}>
        {/* File info header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, gap:12 }}>
          <div style={{ overflow:"hidden" }}>
            <p style={{ fontSize:15, fontWeight:600, color:"#eaf2f8", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              {job?.fileName}
            </p>
            <p style={{ fontSize:12, color:"#527a95", marginTop:2 }}>
              Job #{job?.jobNumber} · {job?.customerInfo?.email}
            </p>
          </div>
          <div style={{ flexShrink:0, background:"#071525", borderRadius:8, padding:"6px 14px", fontFamily:"'DM Mono',monospace", fontSize:12, color:"#3a9fd1", whiteSpace:"nowrap" }}>
            CODE: {code}
          </div>
        </div>

        <div style={T.divider} />

        <p style={{ fontSize:11, color:"#527a95", textTransform:"uppercase", letterSpacing:".08em", marginBottom:8 }}>
          Document Preview
        </p>

        {/* PDF viewer — Electron/Chromium renders this natively */}
        <div style={{ width:"100%", height:360, border:"1px solid #1a3045", borderRadius:12, background:"#071525", overflow:"hidden" }}>
          <iframe
            src={job?.fileURL}
            title="Document preview"
            style={{ width:"100%", height:"100%", border:"none" }}
          />
        </div>

        <p style={{ fontSize:11, color:"#2d4d5e", marginTop:8, textAlign:"center" }}>
          Scroll to review all pages before printing
        </p>

        <div style={{ marginTop:14, display:"flex", gap:8 }}>
          <button
            className="pl-btn-s"
            style={{ ...T.btnS, width:"auto", padding:"11px 20px" }}
            onClick={() => { setScreen("idle"); setCode(""); setJob(null); }}
          >
            ← Back
          </button>
          <button
            className="pl-btn-p"
            style={T.btnP}
            onClick={() => setScreen("print-summary")}
          >
            Looks Good — Review & Print →
          </button>
        </div>
      </div>
    </div>
  );

  const PrintSummaryScreen = () => {
    const cfg  = job?.printConfiguration || {};
    const cost = fmtNGN(job?.cost);
    const specs = [
      ["Paper",       cfg.paperSize],
      ["Copies",      cfg.copies],
      ["Color",       dColor(cfg.colorType)],
      ["Orientation", dOri(cfg.orientation)],
      ["Duplex",      dDuplex(cfg.duplex)],
      ["Pages",       cfg.pageRange && cfg.pageRange !== "all" ? cfg.pageRange : "All"],
      ["Resolution",  cfg.resolution ? cfg.resolution + " dpi" : "—"],
      ["Staple",      cfg.staple ? "Yes" : "No"],
    ];

    return (
      <div className="pl-screen" style={{ maxWidth:640 }}>
        <StepDots screen="print-summary" />
        <div style={T.card}>
          {/* File + cost */}
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
            <div style={{ width:40, height:40, background:"#225275", borderRadius:9, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <PrinterIcon />
            </div>
            <div style={{ overflow:"hidden" }}>
              <p style={{ fontSize:15, fontWeight:600, color:"#eaf2f8", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {job?.fileName}
              </p>
              <p style={{ fontSize:12, color:"#527a95" }}>Job #{job?.jobNumber}</p>
            </div>
            {cost && (
              <div style={{ marginLeft:"auto", flexShrink:0, background:"#071525", borderRadius:10, padding:"8px 16px", textAlign:"center" }}>
                <p style={{ fontSize:10, color:"#527a95", textTransform:"uppercase", letterSpacing:".07em", marginBottom:2 }}>
                  Total paid
                </p>
                <p style={{ fontFamily:"'DM Mono',monospace", fontSize:18, fontWeight:500, color:"#3a9fd1" }}>
                  {cost}
                </p>
              </div>
            )}
          </div>

          <div style={T.divider} />

          <p style={{ fontSize:11, color:"#527a95", textTransform:"uppercase", letterSpacing:".08em", marginBottom:10 }}>
            Print Configuration
          </p>

          <div style={T.specGrid}>
            {specs.map(([label, value]) => (
              <div key={label} style={T.specItem}>
                <div style={T.specLabel}>{label}</div>
                <div style={T.specValue}>{value ?? "—"}</div>
              </div>
            ))}
          </div>

          <div style={T.divider} />

          <p style={{ fontSize:11, color:"#527a95", textTransform:"uppercase", letterSpacing:".08em", marginBottom:8 }}>
            Print to
          </p>
          <select
            className="pl-sel"
            style={T.select}
            value={selPrinter}
            onChange={(e) => setSelPrinter(e.target.value)}
          >
            {printers.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>

          <div style={T.note}>
            <InfoIcon />
            <p style={{ fontSize:12, color:"#527a95", lineHeight:1.6 }}>
              Payment was already collected. Confirming will send this job directly to the printer — no further charge.
            </p>
          </div>

          <div style={{ marginTop:14, display:"flex", gap:8 }}>
            <button
              className="pl-btn-s"
              style={{ ...T.btnS, width:"auto", padding:"11px 20px" }}
              onClick={() => setScreen("doc-preview")}
            >
              ← Back
            </button>
            <button className="pl-btn-p" style={T.btnP} onClick={handlePrint}>
              Confirm & Print
            </button>
          </div>
        </div>
      </div>
    );
  };

  const PrintingScreen = () => (
    <div className="pl-screen" style={{ alignItems:"center", textAlign:"center" }}>
      <div style={{ position:"relative", width:76, height:76, marginBottom:24 }}>
        <div style={{ position:"absolute", inset:0, border:"3px solid #1a3045", borderTopColor:"#225275", borderRadius:"50%", animation:"pl-spin 1.1s linear infinite" }} />
        <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:36, height:36, background:"#225275", borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <PrinterIcon />
        </div>
      </div>
      <h2 style={{ fontSize:22, fontWeight:300, color:"#eaf2f8", marginBottom:8 }}>Printing your document</h2>
      <p style={{ fontSize:13, color:"#527a95", animation:"pl-pulse 2s infinite" }}>Please do not leave the kiosk</p>
      {job && <p style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#3a9fd1", marginTop:14 }}>JOB #{job.jobNumber}</p>}
    </div>
  );

  const SuccessScreen = () => (
    <div className="pl-screen" style={{ alignItems:"center", textAlign:"center", maxWidth:400 }}>
      <div style={{ width:76, height:76, borderRadius:"50%", background:"#071f10", border:"2px solid #22c55e", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:22, animation:"pl-pop .5s cubic-bezier(0.34,1.56,0.64,1) forwards" }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20,6 9,17 4,12"/>
        </svg>
      </div>
      <h2 style={{ fontSize:24, fontWeight:300, color:"#eaf2f8", marginBottom:8 }}>Collect your document</h2>
      <p style={{ fontSize:13, color:"#527a95", marginBottom:18 }}>Your document is printing now</p>
      {job && (
        <div style={{ background:"#071525", borderRadius:10, padding:"10px 22px", marginBottom:22 }}>
          <span style={{ fontFamily:"'DM Mono',monospace", fontSize:13, color:"#22c55e" }}>
            JOB #{job.jobNumber} · COMPLETE
          </span>
        </div>
      )}
      <button className="pl-btn-s" style={{ ...T.btnS, width:"auto", padding:"11px 26px" }} onClick={doReset}>
        Start Over
      </button>
      <p style={{ fontSize:11, color:"#2d4d5e", marginTop:18 }}>Screen resets automatically</p>
    </div>
  );

  const ErrorScreen = () => (
    <div className="pl-screen" style={{ alignItems:"center", textAlign:"center", maxWidth:400 }}>
      <div style={{ width:70, height:70, borderRadius:"50%", background:"#2c0a0a", border:"2px solid #ef4444", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:22 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </div>
      <h2 style={{ fontSize:20, fontWeight:300, color:"#eaf2f8", marginBottom:10 }}>Could not proceed</h2>
      <p style={{ fontSize:13, color:"#e07070", marginBottom:26, fontFamily:"'DM Mono',monospace", lineHeight:1.7 }}>
        {errMsg}
      </p>
      <button className="pl-btn-p" style={T.btnP} onClick={doReset}>Try Again</button>
    </div>
  );

  const screenMap = {
    idle:            IdleScreen,
    validating:      ValidatingScreen,
    "doc-preview":   DocPreviewScreen,
    "print-summary": PrintSummaryScreen,
    printing:        PrintingScreen,
    success:         SuccessScreen,
    error:           ErrorScreen,
  };
  const Current = screenMap[screen] || IdleScreen;

  return (
    <div style={T.root}>
      <div style={T.logo}><Logo /> PRINTLOOP</div>
      {selPrinter && (
        <div style={T.badge}>
          <div style={T.onlineDot} />
          <span>{selPrinter}</span>
        </div>
      )}
      <Current />
    </div>
  );
}
