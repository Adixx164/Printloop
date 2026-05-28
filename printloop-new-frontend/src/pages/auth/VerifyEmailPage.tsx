import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useVerifyEmailMutation, useResendVerificationMutation } from "@/store/services/authApi";
import { extractError } from "@/lib/errors";
import { ROUTES } from "@/constants/routes";
import { Button } from "@/components/ui/Button";

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialEmail = params.get("email") || "";
  const initialCode = (params.get("code") || "").replace(/\D/g, "").slice(0, 6);
  const [email, setEmail] = useState(initialEmail);
  const [digits, setDigits] = useState<string[]>([
    ...initialCode.split(""),
    ...Array(Math.max(0, 6 - initialCode.length)).fill(""),
  ]);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const [verifyEmail, { isLoading }] = useVerifyEmailMutation();
  const [resend, { isLoading: isResending }] = useResendVerificationMutation();

  useEffect(() => { inputs.current[0]?.focus(); }, []);

  const onChange = (i: number, v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    if (d && i < 5) inputs.current[i + 1]?.focus();
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!paste) return;
    const next = Array(6).fill("");
    for (let i = 0; i < paste.length; i++) next[i] = paste[i];
    setDigits(next);
    inputs.current[Math.min(paste.length, 5)]?.focus();
  };

  const submit = async () => {
    const token = digits.join("");
    if (!email) return toast.error("Enter your email first");
    if (token.length !== 6) return toast.error("Enter the 6-digit code");
    try {
      await verifyEmail({ email, token }).unwrap();
      toast.success("Email verified. You can sign in now.");
      navigate(ROUTES.AUTH.LOGIN);
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  const handleResend = async () => {
    if (!email) return toast.error("Enter your email first");
    try {
      await resend({ email }).unwrap();
      toast.success("A new code has been sent.");
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16 flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute -right-4 top-10 w-24 h-24 sm:w-36 sm:h-36 rounded-full bg-persimmon/10 pointer-events-none" />
      <div className="absolute -left-4 bottom-10 w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-ochre/15 pointer-events-none" />

      <div className="relative z-10 max-w-xl w-full text-center">
        <div className="editorial-label text-persimmon mb-3">▸ STEP 02 OF 03 — VERIFY EMAIL</div>
        <h1 className="pl-serif font-extrabold text-[28px] sm:text-[38px] lg:text-[48px] leading-[1.05] sm:leading-[0.98] tracking-tight mb-3">
          Check your inbox for{" "}
          <em className="text-persimmon italic font-semibold">six characters</em>.
        </h1>
        <p className="pl-serif italic text-sm sm:text-base text-ink/70 mb-6 sm:mb-8 max-w-md mx-auto leading-snug">
          We sent the code to{" "}
          <span className="not-italic font-semibold text-ink break-all">{email || "your email"}</span>.
          Type it below — it expires in 10 minutes.
        </p>

        {!initialEmail && (
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            className="pl-input mb-5 sm:mb-6 max-w-md mx-auto"
          />
        )}

        {/* 6-digit code. Tight gap + smaller cells on phones so it fits ~320px. */}
        <div className="flex gap-1.5 sm:gap-2.5 justify-center mb-6 sm:mb-7">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              value={d}
              onChange={(e) => onChange(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
              onPaste={i === 0 ? onPaste : undefined}
              className={`w-[44px] h-[56px] sm:w-12 sm:h-16 lg:w-14 lg:h-[72px] border-2 border-ink rounded-md font-mono text-2xl sm:text-3xl font-bold text-center
                outline-none transition-all
                ${d ? "bg-ink text-paper" : "bg-paper"}
                focus:border-persimmon focus:ring-4 focus:ring-persimmon/20`}
            />
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:justify-center mb-5">
          <Button variant="primary" arrow loading={isLoading} onClick={submit} className="w-full sm:w-auto">
            VERIFY EMAIL
          </Button>
          <Button variant="ghost" loading={isResending} onClick={handleResend} className="w-full sm:w-auto">
            RESEND CODE
          </Button>
        </div>

        <p className="text-sm text-ink/55">
          Wrong email?{" "}
          <Link to={ROUTES.AUTH.REGISTER} className="text-persimmon font-bold border-b-2 border-persimmon">
            Go back to sign-up
          </Link>
        </p>
      </div>
    </div>
  );
}
