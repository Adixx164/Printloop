import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { SuspenseOutlet, SuspenseInlineOutlet } from "@/components/SuspenseOutlet";
import { TabTitleNudge } from "@/components/AppChrome";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { ProtectedRoute, PublicOnlyRoute, AdminProtectedRoute, AdminPublicOnlyRoute } from "@/routes/ProtectedRoute";
import { ROUTES } from "@/constants/routes";
import { SaasShell } from "@/components/layout/SaasShell";
import { SaasProtectedRoute } from "@/components/SaasProtectedRoute";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { CookieConsent } from "@/components/ui/CookieConsent";
import { Loader } from "@/components/ui/Loader";

const LandingPage = lazy(() => import("@/pages/LandingPage"));
const FeaturesPage = lazy(() => import("@/pages/marketing/FeaturesPage"));
const PricingPage = lazy(() => import("@/pages/marketing/PricingPage"));
const AboutPage = lazy(() => import("@/pages/marketing/AboutPage"));
const ContactPage = lazy(() => import("@/pages/marketing/ContactPage"));
const BlogPage = lazy(() => import("@/pages/marketing/BlogPage"));
const BlogPostPage = lazy(() => import("@/pages/marketing/BlogPostPage"));
const PrivacyPage = lazy(() => import("@/pages/legal/PrivacyPage"));
const TermsPage = lazy(() => import("@/pages/legal/TermsPage"));

const FindPage = lazy(() => import("@/pages/discovery/FindPage"));
const ShopDetailPage = lazy(() => import("@/pages/discovery/ShopDetailPage"));
const JoinPage = lazy(() => import("@/pages/group/JoinPage"));

const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage"));
const VerifyEmailPage = lazy(() => import("@/pages/auth/VerifyEmailPage"));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/ForgotPasswordPage"));

const DashboardPage = lazy(() => import("@/pages/customer/DashboardPage"));
const NewPrintPage = lazy(() => import("@/pages/customer/NewPrintPage"));
const BatchPrintPage = lazy(() => import("@/pages/customer/BatchPrintPage"));
const GroupPrintPage = lazy(() => import("@/pages/customer/GroupPrintPage"));
const PrintJobsPage = lazy(() => import("@/pages/customer/PrintJobsPage"));
const EditReviewPage = lazy(() => import("@/pages/customer/EditReviewPage"));
const EditorWorkspacePage = lazy(() => import("@/pages/saas/EditorWorkspacePage"));
const StationsPage = lazy(() => import("@/pages/customer/StationsPage"));
const SettingsPage = lazy(() => import("@/pages/customer/SettingsPage"));

const KioskCodePage = lazy(() => import("@/pages/kiosk/KioskCodePage"));

const SignupPage = lazy(() => import("@/pages/saas/SignupPage"));
const SaasLoginPage = lazy(() => import("@/pages/saas/SaasLoginPage"));
const SaasVerifyEmailPage = lazy(() => import("@/pages/saas/VerifyEmailPage"));
const DashboardHomePage = lazy(() => import("@/pages/saas/DashboardHomePage"));
const SaasQueuePage = lazy(() => import("@/pages/saas/SaasQueuePage"));
const SaasEditQueuePage = lazy(() => import("@/pages/saas/SaasEditQueuePage"));
const PayoutsPage = lazy(() => import("@/pages/saas/PayoutsPage"));
const TransactionsPage = lazy(() => import("@/pages/saas/TransactionsPage"));
const SetupSubaccountPage = lazy(() => import("@/pages/saas/SetupSubaccountPage"));
const SetupBankPage = lazy(() => import("@/pages/saas/SetupBankPage"));
const SettingsLayout = lazy(() => import("@/pages/saas/SettingsLayout"));
const BrandingPage = lazy(() => import("@/pages/saas/BrandingPage"));
const DomainsPage = lazy(() => import("@/pages/saas/DomainsPage"));
const WebhooksPage = lazy(() => import("@/pages/saas/WebhooksPage"));
const SecurityPage = lazy(() => import("@/pages/saas/SecurityPage"));
const AccountPage = lazy(() => import("@/pages/saas/AccountPage"));
const ClosedPage = lazy(() => import("@/pages/saas/ClosedPage"));
const OperatorConsolePage = lazy(() => import("@/pages/saas/OperatorConsolePage"));
const OperatorPrintersPage = lazy(() => import("@/pages/saas/OperatorPrintersPage"));

const AdminLoginPage = lazy(() => import("@/pages/admin/AdminLoginPage"));
const AdminConsolePage = lazy(() => import("@/pages/admin/AdminConsolePage"));

const PlatformConsolePage = lazy(() => import("@/pages/platform/PlatformConsolePage"));

export default function App() {
  return (
    <>
      <TabTitleNudge />
      <ImpersonationBanner />
      <CookieConsent />
      <Routes>
        {/* Public marketing pages */}
        <Route element={<SuspenseOutlet />}>
          <Route path={ROUTES.ROOT} element={<LandingPage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
        </Route>

        {/* Kiosk */}
        <Route element={<SuspenseOutlet />}>
          <Route path={ROUTES.KIOSK.HOME} element={<KioskCodePage />} />
          <Route path={ROUTES.KIOSK.CODE} element={<KioskCodePage />} />
        </Route>

        {/* Marketplace discovery */}
        <Route element={<SuspenseOutlet />}>
          <Route path="/join/:shareId" element={<JoinPage />} />
          <Route path="/find" element={<FindPage />} />
          <Route path="/find/:slug" element={<ShopDetailPage />} />
        </Route>

        {/* SaaS tenant admin — public pages */}
        <Route element={<SuspenseOutlet />}>
          <Route path="/saas/signup" element={<SignupPage />} />
          <Route path="/saas/login" element={<SaasLoginPage />} />
          <Route path="/saas/verify-email" element={<SaasVerifyEmailPage />} />
        </Route>

        {/* SaaS tenant admin — protected pages */}
        <Route element={<SaasProtectedRoute />}>
          <Route element={<SaasShell />}>
            <Route element={<SuspenseOutlet />}>
              <Route path="/saas/dashboard" element={<DashboardHomePage />} />
              <Route path="/saas/queue" element={<SaasQueuePage />} />
              <Route path="/saas/edit-queue" element={<SaasEditQueuePage />} />
              <Route path="/saas/editor/:sessionId" element={<EditorWorkspacePage />} />
              <Route path="/saas/operator" element={<OperatorConsolePage />} />
              <Route path="/saas/transactions" element={<TransactionsPage />} />
              <Route path="/saas/payouts" element={<PayoutsPage />} />
              <Route path="/saas/closed" element={<ClosedPage />} />
              <Route path="/saas/setup/subaccount" element={<SetupSubaccountPage />} />
              <Route path="/saas/setup/bank-account" element={<SetupBankPage />} />
              <Route path="/saas/operator/printers" element={<OperatorPrintersPage />} />
            </Route>
          </Route>
        </Route>

        {/* Tenant settings — nested under tab-nav shell */}
        <Route path="/saas/settings" element={<SettingsLayout />}>
          <Route element={<SuspenseInlineOutlet />}>
            <Route index element={<BrandingPage />} />
            <Route path="branding" element={<BrandingPage />} />
            <Route path="domains" element={<DomainsPage />} />
            <Route path="webhooks" element={<WebhooksPage />} />
            <Route path="security" element={<SecurityPage />} />
            <Route path="account" element={<AccountPage />} />
          </Route>
        </Route>

        {/* Platform operator console (SUPER_ADMIN only) */}
        <Route element={<SuspenseOutlet />}>
          <Route path="/platform" element={<PlatformConsolePage />} />
        </Route>

        {/* Auth pages — only visible when signed out */}
        <Route element={<PublicOnlyRoute />}>
          <Route element={<AuthLayout />}>
            <Route element={<SuspenseOutlet />}>
              <Route path={ROUTES.AUTH.LOGIN} element={<LoginPage />} />
              <Route path={ROUTES.AUTH.REGISTER} element={<RegisterPage />} />
              <Route path={ROUTES.AUTH.VERIFY_EMAIL} element={<VerifyEmailPage />} />
              <Route path={ROUTES.AUTH.FORGOT_PASSWORD} element={<ForgotPasswordPage />} />
            </Route>
          </Route>
        </Route>

        {/* Admin login — standalone page, no AppLayout, redirect if already admin */}
        <Route element={<AdminPublicOnlyRoute />}>
          <Route element={<SuspenseOutlet />}>
            <Route path={ROUTES.ADMIN.LOGIN} element={<AdminLoginPage />} />
          </Route>
        </Route>

        {/* Admin console — fully separate: own layout, no customer chrome */}
        <Route element={<AdminProtectedRoute />}>
          <Route element={<AdminLayout />}>
            <Route element={<SuspenseOutlet />}>
              <Route path={ROUTES.ADMIN.HOME} element={<AdminConsolePage />} />
            </Route>
          </Route>
        </Route>

        {/* Protected customer app */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route element={<SuspenseOutlet />}>
              <Route path={ROUTES.APP.DASHBOARD} element={<DashboardPage />} />
              <Route path={ROUTES.APP.NEW_PRINT} element={<NewPrintPage />} />
              <Route path={ROUTES.APP.BATCH_PRINT} element={<BatchPrintPage />} />
              <Route path={ROUTES.APP.GROUP_PRINT} element={<GroupPrintPage />} />
              <Route path={ROUTES.APP.PRINT_JOBS} element={<PrintJobsPage />} />
              <Route path={ROUTES.APP.EDIT_REVIEW} element={<EditReviewPage />} />
              <Route path={ROUTES.APP.STATIONS} element={<StationsPage />} />
              <Route path={ROUTES.APP.SETTINGS} element={<SettingsPage />} />
            </Route>
          </Route>
        </Route>

        {/* Fallback */}
        <Route
          path="*"
          element={<Navigate to={ROUTES.ROOT} replace />}
        />
      </Routes>
    </>
  );
}