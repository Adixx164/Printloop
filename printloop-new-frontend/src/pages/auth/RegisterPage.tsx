import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { toast } from "sonner";
import { useRegisterMutation } from "@/store/services/authApi";
import { extractError } from "@/lib/errors";
import { ROUTES } from "@/constants/routes";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [register, { isLoading }] = useRegisterMutation();
  const [serverError, setServerError] = useState<string | null>(null);

  const schema = Yup.object({
    firstName: Yup.string().required("First name is required"),
    lastName: Yup.string().required("Last name is required"),
    email: Yup.string().email("Invalid email").required("Email is required"),
    phoneNumber: Yup.string().min(10, "At least 10 digits").required("Phone is required"),
    password: Yup.string()
      .min(8, "At least 8 characters")
      .matches(/[A-Z]/, "Include uppercase")
      .matches(/[a-z]/, "Include lowercase")
      .matches(/[0-9]/, "Include a number")
      .matches(/[^A-Za-z0-9]/, "Include a special character")
      .required("Password is required"),
  });

  const formik = useFormik({
    initialValues: { firstName: "", lastName: "", email: "", phoneNumber: "", password: "" },
    validationSchema: schema,
    onSubmit: async (values) => {
      setServerError(null);
      try {
        const result = await register(values).unwrap();
        const payload = result?.response || result?.data || result;
        const code = payload?.verificationToken;
        toast.success(code ? `Account created. Dev verification code: ${code}` : "Account created. Check your inbox.");
        navigate(
          `${ROUTES.AUTH.VERIFY_EMAIL}?email=${encodeURIComponent(values.email)}${
            code ? `&code=${code}` : ""
          }`,
        );
      } catch (err) {
        const msg = extractError(err);
        setServerError(msg);
        toast.error(msg);
      }
    },
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr] md:min-h-[600px]">
      {/* ── Branding panel ────────────────────────────────────────── */}
      {/* On mobile this becomes a compact strip; on desktop it's a full panel. */}
      <aside className="bg-ink text-paper px-5 sm:px-7 md:px-9 py-6 sm:py-8 md:py-10 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-40 sm:w-60 h-40 sm:h-60 rounded-full bg-persimmon/20 pointer-events-none" />
        <div className="hidden md:block absolute -bottom-20 -left-20 w-52 h-52 rounded-full bg-ochre/15 pointer-events-none" />

        <div className="relative z-10">
          <div className="font-serif font-extrabold text-2xl sm:text-3xl tracking-tight mb-4 md:mb-10">
            PrintLoop<span className="text-persimmon">.</span>
          </div>
          <div className="editorial-label text-persimmon mb-2 md:mb-3">▸ JOIN THE LOOP</div>
          <h1 className="pl-serif font-extrabold text-[26px] sm:text-[34px] md:text-[44px] lg:text-[54px] leading-[1.02] md:leading-[0.95] tracking-tight mb-3 md:mb-4 max-w-sm">
            Your campus print station,{" "}
            <em className="text-persimmon italic font-semibold">finally</em> done right.
          </h1>
          <p className="pl-serif italic text-sm sm:text-base md:text-lg opacity-80 max-w-sm leading-snug mb-4 md:mb-8">
            Upload from your phone. Pay online. Walk into any PrintLoop station and your prints are
            waiting.
          </p>

          {/* Detailed bullets — desktop only (mobile shows them after the form via the tagline). */}
          <div className="hidden md:block">
            {[
              ["01", "No more queues.", "Submit from class, collect when you're free."],
              ["02", "Honest pricing.", "₦5 per page · no shop-by-shop markup games."],
              ["03", "One wallet, every station.", "Top up once, print across all 12 stations."],
            ].map(([n, b, t]) => (
              <div key={n} className="flex gap-3 mb-4">
                <span className="editorial-folio not-italic text-base">
                  <span className="italic">{n}</span>
                </span>
                <div className="text-sm leading-snug opacity-90">
                  <b className="font-bold opacity-100">{b}</b> {t}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:flex absolute bottom-7 left-9 right-9 justify-between items-baseline text-[11px] tracking-editorial opacity-55">
            <span>★ PRINTLOOP — LAGOS</span>
            <span className="text-ochre text-lg">❦</span>
          </div>
        </div>
      </aside>

      {/* ── Form panel ────────────────────────────────────────────── */}
      <section className="px-4 sm:px-6 md:px-8 py-6 sm:py-8 md:py-10 flex flex-col justify-center">
        <div className="editorial-label text-persimmon mb-2">▸ STEP 01 OF 03 — CREATE ACCOUNT</div>
        <h2 className="pl-serif font-bold text-2xl sm:text-3xl mb-1 tracking-tight">
          Begin your account.
        </h2>
        <p className="text-sm text-ink/65 mb-6">
          Already have one?{" "}
          <Link to={ROUTES.AUTH.LOGIN} className="text-persimmon font-bold border-b-2 border-persimmon">
            Sign in instead →
          </Link>
        </p>

        {serverError && (
          <div className="border-2 border-persimmon bg-persimmon/10 text-ink p-3 rounded mb-4 text-sm font-semibold">
            {serverError}
          </div>
        )}

        <form onSubmit={formik.handleSubmit} noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
            <Input
              label="FIRST NAME"
              name="firstName"
              placeholder="Abdurrahman"
              autoComplete="given-name"
              autoCapitalize="words"
              value={formik.values.firstName}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={formik.touched.firstName ? formik.errors.firstName : undefined}
            />
            <Input
              label="LAST NAME"
              name="lastName"
              placeholder="Bello"
              autoComplete="family-name"
              autoCapitalize="words"
              value={formik.values.lastName}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={formik.touched.lastName ? formik.errors.lastName : undefined}
            />
          </div>

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

          <Input
            label="PHONE NUMBER"
            type="tel"
            name="phoneNumber"
            placeholder="+234 802 145 9087"
            autoComplete="tel"
            inputMode="tel"
            value={formik.values.phoneNumber}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.phoneNumber ? formik.errors.phoneNumber : undefined}
          />

          <Input
            label="PASSWORD"
            type="password"
            name="password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            value={formik.values.password}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.password ? formik.errors.password : undefined}
            helper="Must include uppercase, lowercase, number & special character."
          />

          <Button type="submit" variant="primary" arrow loading={isLoading} className="w-full mt-2">
            CREATE ACCOUNT
          </Button>

          <p className="text-center text-xs text-ink/55 mt-4">
            By continuing you agree to the PrintLoop terms.
          </p>
        </form>
      </section>
    </div>
  );
}
