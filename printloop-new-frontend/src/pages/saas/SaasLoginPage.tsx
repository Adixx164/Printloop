import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useLoginMutation } from "@/store/services/authApi";

/**
 * /saas/login — the printshop operator's front door (V2-57).
 * Same credentials as everywhere else (customer auth endpoint),
 * but routing is role-aware: shop owners/staff land on the shop
 * console, plain customers go to their dashboard.
 */
export default function SaasLoginPage() {
  const navigate = useNavigate();
  const [login, { isLoading }] = useLoginMutation();
  const [params] = useSearchParams();
  const welcome = params.get("welcome");
  const slug = params.get("slug");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Email and password are required.");
      return;
    }
    try {
      const result = await login({
        email,
        password,
        totpCode: totpCode || undefined,
      }).unwrap();
      const payload = result?.response || result?.data || result;
      const user = payload?.user;
      const isOperator =
        user?.role === "admin" ||
        user?.role === "super_admin" ||
        (Array.isArray(user?.memberships) && user.memberships.length > 0);
      if (isOperator) {
        // Clear any stale shop selection left over from the student app
        // — the shop console resolves its tenant from the signed-in
        // user, and a leftover X-Tenant-Slug would 403 every /saas call.
        sessionStorage.removeItem("activeTenantSlug");
        sessionStorage.removeItem("reviewedPricesForTenant");
        navigate("/saas/dashboard");
      } else {
        navigate("/dashboard");
      }
    } catch (err: any) {
      const code = err?.data?.code;
      if (code === "TOTP_REQUIRED") {
        setNeeds2fa(true);
        toast.message("Enter your authenticator code to continue.");
      } else if (code === "TOTP_INVALID") {
        setNeeds2fa(true);
        toast.error("That code didn't match. Try the current one.");
      } else {
        toast.error(err?.data?.message || "Login failed");
      }
    }
  };

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <div className="border-b-2 border-ink bg-paper px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between">
        <Link to="/" className="font-serif font-extrabold text-[22px] tracking-tight">
          PrintLoop<span className="text-persimmon">.</span>
        </Link>
        <span className="editorial-label text-persimmon">SHOP CONSOLE</span>
      </div>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {welcome && (
            <div className="border-2 border-ochre/60 bg-ochre/10 p-4 mb-5 text-sm pl-serif">
              {slug ? (
                <>
                  <span className="font-bold">{slug}.printloop.app</span> is live. Sign in to
                  take your first orders.
                </>
              ) : (
                "Your shop is live. Sign in to take your first orders."
              )}
            </div>
          )}

          <div className="border-4 border-ink bg-paper-light p-6 sm:p-8">
            <div className="editorial-label text-persimmon mb-2">▸ PRINT SHOP SIGN IN</div>
            <h1 className="pl-serif text-3xl font-extrabold tracking-tight mb-6">
              Run your shop <em className="italic text-persimmon">from here.</em>
            </h1>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="editorial-label block mb-1.5">EMAIL</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourprintshop.com"
                  className="pl-input"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="editorial-label block mb-1.5">PASSWORD</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-input"
                  autoComplete="current-password"
                />
              </div>
              {needs2fa && (
                <div className="animate-fadein">
                  <label className="editorial-label block mb-1.5">AUTHENTICATOR CODE</label>
                  <input
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="6-digit code"
                    className="pl-input pl-mono"
                  />
                </div>
              )}
              <button type="submit" disabled={isLoading} className="pl-btn-primary w-full py-3 font-bold">
                {isLoading ? "SIGNING IN…" : "SIGN IN →"}
              </button>
            </form>

            <div className="flex items-center justify-between mt-5 text-xs">
              <Link to="/auth/login" className="font-bold text-ink/55 hover:text-persimmon">
                ← CUSTOMER SIGN IN
              </Link>
              <Link to="/saas/signup" className="font-bold text-ink/55 hover:text-persimmon">
                START A SHOP →
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
