import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { toast } from "sonner";
import { useLoginMutation } from "@/store/services/authApi";
import { extractError } from "@/lib/errors";
import { ROUTES } from "@/constants/routes";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const navigate = useNavigate();
  const [login, { isLoading }] = useLoginMutation();
  const [needsVerification, setNeedsVerification] = useState<string | null>(null);

  const schema = Yup.object({
    email: Yup.string().email("Invalid email").required("Email is required"),
    password: Yup.string().required("Password is required"),
  });

  const formik = useFormik({
    initialValues: { email: "", password: "" },
    validationSchema: schema,
    onSubmit: async (values) => {
      try {
        await login(values).unwrap();
        toast.success("Welcome back.");
        navigate(ROUTES.APP.DASHBOARD);
      } catch (err) {
        const msg = extractError(err);
        if (/verif/i.test(msg)) {
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

          <Button type="submit" variant="primary" arrow loading={isLoading} className="w-full mt-2">
            SIGN IN
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
      </div>
    </div>
  );
}
