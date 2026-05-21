import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useDispatch } from "react-redux";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAdminLoginMutation } from "@/store/services/adminApi";
import { setCredentials } from "@/store/features/auth/authSlice";
import { ROUTES } from "@/constants/routes";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [adminLogin, { isLoading }] = useAdminLoginMutation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await adminLogin({ email, password }).unwrap();
      const payload = res?.data || res;
      dispatch(setCredentials(payload));
      toast.success(`Welcome, ${payload?.user?.firstName || "Admin"}.`);
      navigate(ROUTES.ADMIN.HOME);
    } catch (err: any) {
      const msg = err?.data?.message || "Invalid credentials";
      setError(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-screen bg-ink flex items-stretch">
      {/* Left brand strip */}
      <div className="hidden md:flex w-72 bg-sage flex-col justify-between p-10">
        <div>
          <div className="editorial-label text-paper/50 mb-1">PRINTLOOP</div>
          <div className="pl-serif text-4xl font-bold text-paper leading-tight">
            Admin<br />Console
          </div>
          <div className="editorial-rule mt-4 mb-6 border-paper/20" />
          <p className="pl-serif italic text-paper/60 text-sm leading-relaxed">
            Restricted access. Only authorised administrators may enter.
          </p>
        </div>
        <div className="editorial-label text-paper/30">VOL I · ISSUE 09</div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-paper">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="md:hidden mb-8">
            <div className="editorial-label text-persimmon mb-1">PRINTLOOP ADMIN</div>
          </div>

          <div className="editorial-label text-persimmon mb-1">RESTRICTED ACCESS</div>
          <h1 className="pl-serif text-4xl font-bold text-ink mb-1">
            Admin Sign In
          </h1>
          <p className="pl-serif italic text-ink/60 mb-8">
            Enter your administrative credentials to continue.
          </p>

          {error && (
            <div className="border-2 border-persimmon bg-persimmon/10 text-ink p-3 mb-5 text-sm font-semibold">
              ⚠ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="ADMIN EMAIL"
              type="email"
              name="email"
              placeholder="admin@printloop.test"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <div>
              <label className="editorial-label block mb-1.5">PASSWORD</label>
              <input
                type="password"
                name="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-input"
                required
              />
            </div>

            <Button
              type="submit"
              variant="dark"
              arrow
              loading={isLoading}
              className="w-full mt-2"
            >
              ACCESS ADMIN CONSOLE
            </Button>
          </form>

          {/* Dev hint */}
          <div className="mt-8 border-2 border-ink/10 bg-ink/5 p-4">
            <div className="editorial-label text-ink/40 mb-2">DEV CREDENTIALS</div>
            <div className="pl-mono text-xs text-ink/60 space-y-1">
              <div><span className="font-bold text-ink">Email:</span> admin@printloop.test</div>
              <div><span className="font-bold text-ink">Password:</span> Admin1234!</div>
            </div>
          </div>

          <p className="text-center text-xs text-fog mt-6">
            Not an admin?{" "}
            <a href={ROUTES.AUTH.LOGIN} className="text-persimmon font-bold border-b border-persimmon">
              Return to user login →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
