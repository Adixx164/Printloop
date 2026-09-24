import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { toast } from "sonner";
import { useLoginMutation } from "@/store/services/authApi";
import { useVerifyHandoffQuery } from "@/store/services/discoveryApi";
import { extractError } from "@/lib/errors";
import { ROUTES } from "@/constants/routes";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const navigate = useNavigate();
  const [login, { isLoading }] = useLoginMutation();
  const [needsVerification, setNeedsVerification] = useState<string | null>(null);
  const [needs2fa, setNeeds2fa] = useState(false);
  const [params] = useSearchParams();
  const handoffToken = params.get("handoff");
  // V2-32 — when arriving from /find with a handoff token, verify
  // it and pre-fill the email field. The query auto-fires when the
  // token is present and stays skipped otherwise.
  const handoff = useVerifyHandoffQuery(
    { token: handoffToken || "" },
    { skip: !handoffToken },
  );

  const schema = Yup.object({
    email: Yup.string().email("Invalid email").required("Email is required"),
    password: Yup.string().required("Password is required"),
    totpCode: Yup.string(),
  });

  const formik = useFormik({
    initialValues: { email: "", password: "", totpCode: "" },
    validationSchema: schema,
    onSubmit: async (values) => {
      try {
        const result = await login({
          email: values.email,
          password: values.password,
          totpCode: values.totpCode || undefined,
        }).unwrap();
        toast.success("Welcome back.");
        // V2-57: role-aware routing — shop owners/staff go to the shop
        // console, plain customers to their dashboard.
        const payload = result?.response || result?.data || result;
        const user = payload?.user;
        const isOperator =
          user?.role === "admin" ||
          user?.role === "super_admin" ||
          (Array.isArray(user?.memberships) && user.memberships.length > 0);
        if (isOperator) {
          sessionStorage.removeItem("activeTenantSlug");
          sessionStorage.removeItem("reviewedPricesForTenant");
          navigate("/saas/dashboard");
        } else {
          navigate(ROUTES.APP.DASHBOARD);
        }
      } catch (err) {
        const code = (err as any)?.data?.code;
        const msg = extractError(err);
        // 2FA gate (V2-24): TOTP_REQUIRED means the account has 2FA on
        // but no code was sent — reveal the field and let them resubmit.
        // Without this, enabling 2FA would lock the account out here.
        if (code === "TOTP_REQUIRED") {
          setNeeds2fa(true);
          toast.message("Enter your authenticator code to continue.");
        } else if (code === "TOTP_INVALID") {
          setNeeds2fa(true);
          toast.error("That code didn't match. Try the current one.");
        } else if (/verif/i.test(msg)) {
          setNeedsVerification(values.email);
          toast.error("Your email isn't verified yet.");
        } else {
          setNeedsVerification(null);
          toast.error(msg);
        }
      }
    },
  });

  const loginDemo = async () => {
    try {
      await login({ email: "student@printloop.test", password: "Password1!" }).unwrap();
      toast.success("Demo account loaded.");
      navigate(ROUTES.APP.DASHBOARD);
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  // V2-32 handoff: once the verify query lands, pre-fill the email
  // field (if the customer typed one on /find/:slug) and show a
  // small chip so they know they came in from the marketplace.
  useEffect(() => {
    if (handoff.data?.email && !formik.values.email) {
      formik.setFieldValue("email", handoff.data.email);
    }
    if (handoff.isError && handoffToken) {
      const errCode = (handoff.error as any)?.data?.code;
      toast.error(
        errCode === "TOKEN_EXPIRED"
          ? "Your handoff link expired. Go back to /find and pick again."
          : "Handoff link was invalid.",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff.data, handoff.isError]);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16 flex justify-center relative overflow-hidden">
      <Link
        to={ROUTES.ADMIN.LOGIN}
        className="absolute right-4 sm:right-8 top-4 sm:top-6 z-20 text-[10px] font-bold tracking-editorial border-2 border-ink px-2.5 sm:px-3 py-1.5 bg-paper hover:bg-ink hover:text-paper transition-all"
      >
        ADMIN →
      </Link>
      <div className="absolute -right-4 top-10 w-24 h-24 sm:w-36 sm:h-36 rounded-full bg-persimmon/10 pointer-events-none" />
      <div className="absolute -left-4 bottom-10 w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-ochre/15 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md py-4">
        <div className="editorial-label text-persimmon mb-2">▸ WELCOME BACK</div>
        <h1 className="pl-serif font-extrabold text-[32px] sm:text-[38px] lg:text-[42px] leading-[1.02] sm:leading-[0.98] tracking-tight mb-2">
          Sign in to your <em className="italic text-persimmon font-semibold">loop</em>.
        </h1>
        <p className="pl-serif italic text-sm text-ink/70 mb-6 sm:mb-7">
          Three jobs printed last week. Welcome back to the dispatch.
        </p>

        {needsVerification && (
          <div className="border-2 border-ochre bg-ochre/10 text-ink p-3 rounded mb-4 text-sm font-semibold">
            Your email isn't verified.{" "}
            <Link
              to={`${ROUTES.AUTH.VERIFY_EMAIL}?email=${encodeURIComponent(needsVerification)}`}
              className="underline text-persimmon font-bold"
            >
              Verify your email →
            </Link>
          </div>
        )}

        <form onSubmit={formik.handleSubmit} noValidate>
          <Input
            label="EMAIL"
            type="email"
            name="email"
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            value={formik.values.email}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.email ? formik.errors.email : undefined}
          />

          <div className="mb-3">
            <div className="flex justify-between items-center mb-1.5">
              <label className="editorial-label">PASSWORD</label>
              <Link
                to={ROUTES.AUTH.FORGOT_PASSWORD}
                className="text-[11px] text-persimmon font-bold border-b-2 border-persimmon"
              >
                FORGOT? →
              </Link>
            </div>
            <input
              type="password"
              name="password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={formik.values.password}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className={`pl-input ${formik.touched.password && formik.errors.password ? "error" : ""}`}
            />
            {formik.touched.password && formik.errors.password && (
              <div className="text-xs text-persimmon font-semibold mt-1">{formik.errors.password}</div>
            )}
          </div>

          {needs2fa && (
            <div className="mb-3">
              <label className="editorial-label mb-1.5 block">
                AUTHENTICATOR CODE
              </label>
              <input
                type="text"
                name="totpCode"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                autoComplete="one-time-code"
                value={formik.values.totpCode}
                onChange={formik.handleChange}
                className="pl-input tracking-[0.4em] text-center text-lg"
                autoFocus
              />
              <p className="text-[11px] text-ink/60 mt-1">
                From your authenticator app (Google Authenticator, Authy…).
              </p>
            </div>
          )}

          <Button type="submit" variant="primary" arrow loading={isLoading} className="w-full mt-2">
            {needs2fa ? "VERIFY & SIGN IN" : "SIGN IN"}
          </Button>
          <Button type="button" variant="ghost" loading={isLoading} className="w-full mt-3" onClick={loginDemo}>
            USE DEMO ACCOUNT
          </Button>
        </form>

        <p className="text-center text-sm text-ink/65 mt-6">
          No account yet?{" "}
          <Link to={ROUTES.AUTH.REGISTER} className="text-persimmon font-bold border-b-2 border-persimmon">
            Create one →
          </Link>
        </p>
        <p className="text-center text-sm text-ink/65 mt-4">
          Are you a print shop owner?{" "}
          <Link to="/saas/login" className="text-persimmon font-bold border-b-2 border-persimmon">
            Sign in to your shop console →
          </Link>
        </p>
      </div>
    </div>
  );
}
