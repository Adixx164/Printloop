import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useForgotPasswordMutation } from "@/store/services/authApi";
import { extractError } from "@/lib/errors";
import { ROUTES } from "@/constants/routes";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [forgot, { isLoading }] = useForgotPasswordMutation();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return toast.error("Enter your email");
    try {
      await forgot({ email }).unwrap();
      setSent(true);
      toast.success("Check your inbox for next steps.");
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  return (
    <div className="px-8 py-16 flex justify-center relative">
      <div className="absolute right-12 top-10 w-36 h-36 rounded-full bg-persimmon/10" />
      <div className="absolute left-12 bottom-10 w-32 h-32 rounded-full bg-ochre/15" />

      <div className="relative z-10 w-full max-w-md py-4">
        <div className="editorial-label text-persimmon mb-2">▸ PASSWORD RESET</div>
        <h1 className="pl-serif font-extrabold text-[42px] leading-[0.98] tracking-tight mb-2">
          Forgot your <em className="italic text-persimmon font-semibold">code</em>?
        </h1>
        <p className="pl-serif italic text-sm text-ink/70 mb-7">
          Enter your email and we'll send a reset link.
        </p>

        {sent ? (
          <div className="border-2 border-ink p-5 rounded">
            <div className="editorial-label text-persimmon mb-2">▸ SENT</div>
            <p className="pl-serif text-lg font-semibold">
              A reset link is on its way to <span className="text-persimmon">{email}</span>.
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <Input
              label="EMAIL"
              type="email"
              name="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" variant="primary" arrow loading={isLoading} className="w-full mt-2">
              SEND RESET LINK
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-ink/65 mt-6">
          Remembered it?{" "}
          <Link to={ROUTES.AUTH.LOGIN} className="text-persimmon font-bold border-b-2 border-persimmon">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
