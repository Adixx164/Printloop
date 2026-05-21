import { useRef, useState } from "react";
import { toast } from "sonner";
import { useReleasePrintCodeMutation } from "@/store/services/kioskApi";
import { extractError } from "@/lib/errors";

export default function KioskCodePage() {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [releasePrintCode, { isLoading }] = useReleasePrintCodeMutation();
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const onChange = (i: number, v: string) => {
    const d = v.replace(/[^A-Z0-9]/i, "").toUpperCase().slice(0, 1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    if (d && i < 5) inputs.current[i + 1]?.focus();
  };

  const submit = async () => {
    if (digits.some((d) => !d)) return toast.error("Enter the full code.");
    try {
      await releasePrintCode({ code: digits.join(""), kioskId: "st_yaba" }).unwrap();
      toast.success("Code accepted. Your print is on the way.");
      setDigits(Array(6).fill(""));
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <div className="bg-ink text-paper border-b-[3px] border-persimmon px-10 py-4 flex justify-between items-baseline">
        <div className="font-serif font-extrabold text-2xl tracking-tight">
          PrintLoop<span className="text-persimmon">.</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] tracking-editorial font-bold">
          <span className="editorial-folio not-italic"><span className="italic">No. 04</span></span>
          <span className="opacity-50">·</span>
          <span>YABA STATION</span>
          <span className="opacity-50">·</span>
          <span className="text-sage flex items-center gap-1">
            <span className="w-2 h-2 bg-sage rounded-full animate-pulse-soft" /> ONLINE
          </span>
        </div>
      </div>

      <main className="flex-1 flex flex-col justify-center items-center text-center px-10 py-12 relative">
        <div className="absolute right-16 top-12 w-44 h-44 rounded-full bg-persimmon/10" />
        <div className="absolute left-16 bottom-12 w-32 h-32 rounded-full bg-ochre/15" />

        <div className="relative z-10 max-w-3xl">
          <div className="editorial-label text-persimmon mb-3">▸ A RITUAL IN SIX CHARACTERS</div>
          <h1 className="pl-serif font-extrabold text-[70px] leading-[0.95] tracking-tight mb-3">
            Kindly enter your <em className="italic text-persimmon font-semibold">code</em>.
          </h1>
          <p className="pl-serif italic text-xl text-ink/60 mb-10">
            The six characters delivered to your phone moments ago.
          </p>

          <div className="flex gap-3 justify-center mb-9">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputs.current[i] = el; }}
                value={d}
                onChange={(e) => onChange(i, e.target.value)}
                className={`w-20 h-28 text-5xl font-mono font-bold text-center border-2 border-ink rounded-lg outline-none transition-all
                  ${d ? "bg-ink text-paper" : "bg-paper"}
                  focus:border-persimmon focus:ring-4 focus:ring-persimmon/20`}
                maxLength={1}
              />
            ))}
          </div>

          <div className="flex gap-3 justify-center mb-7">
            <button onClick={submit} disabled={isLoading} className="pl-btn-primary text-base px-7 py-4">
              {isLoading ? "VERIFYING..." : "VERIFY CODE →"}
            </button>
            <button onClick={() => setDigits(Array(6).fill(""))} className="pl-btn-ghost text-base px-7 py-4">CLEAR</button>
          </div>

          <div className="text-ochre text-3xl mb-3">❦</div>
          <p className="text-sm text-ink/55">No code? Visit printloop.ng to begin.</p>
        </div>
      </main>

      <div className="bg-ink text-paper px-10 py-4 flex justify-between items-center">
        <span className="pl-serif italic text-sm opacity-80">Yours faithfully — PrintLoop, Yaba.</span>
        <span className="text-[11px] tracking-editorial">VOL. I · LAGOS · ©2026 <span className="text-ochre ml-2">❦</span></span>
      </div>
    </div>
  );
}
