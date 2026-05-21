import { Routes, Route, Navigate } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { ProtectedRoute, PublicOnlyRoute, AdminProtectedRoute, AdminPublicOnlyRoute } from "@/routes/ProtectedRoute";
import { ROUTES } from "@/constants/routes";

import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import VerifyEmailPage from "@/pages/auth/VerifyEmailPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import DashboardPage from "@/pages/customer/DashboardPage";
import NewPrintPage from "@/pages/customer/NewPrintPage";
import BatchPrintPage from "@/pages/customer/BatchPrintPage";
import GroupPrintPage from "@/pages/customer/GroupPrintPage";
import PrintJobsPage from "@/pages/customer/PrintJobsPage";
import WalletPage from "@/pages/customer/WalletPage";
import StationsPage from "@/pages/customer/StationsPage";
import SettingsPage from "@/pages/customer/SettingsPage";
import KioskCodePage from "@/pages/kiosk/KioskCodePage";
import JoinPage from "@/pages/group/JoinPage";
import AdminLoginPage from "@/pages/admin/AdminLoginPage";
import AdminConsolePage from "@/pages/admin/AdminConsolePage";

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path={ROUTES.ROOT} element={<LandingPage />} />
      <Route path={ROUTES.KIOSK.HOME} element={<KioskCodePage />} />
      <Route path={ROUTES.KIOSK.CODE} element={<KioskCodePage />} />
      <Route path="/join/:shareId" element={<JoinPage />} />

      {/* Auth pages — only visible when signed out */}
      <Route element={<PublicOnlyRoute />}>
        <Route element={<AuthLayout />}>
          <Route path={ROUTES.AUTH.LOGIN} element={<LoginPage />} />
          <Route path={ROUTES.AUTH.REGISTER} element={<RegisterPage />} />
          <Route path={ROUTES.AUTH.VERIFY_EMAIL} element={<VerifyEmailPage />} />
          <Route path={ROUTES.AUTH.FORGOT_PASSWORD} element={<ForgotPasswordPage />} />
        </Route>
      </Route>

      {/* Admin login — standalone page, no AppLayout, redirect if already admin */}
      <Route element={<AdminPublicOnlyRoute />}>
        <Route path={ROUTES.ADMIN.LOGIN} element={<AdminLoginPage />} />
      </Route>

      {/* Admin console — fully separate: own layout, no customer chrome */}
      <Route element={<AdminProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route path={ROUTES.ADMIN.HOME} element={<AdminConsolePage />} />
        </Route>
      </Route>

      {/* Protected customer app */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path={ROUTES.APP.DASHBOARD} element={<DashboardPage />} />
          <Route path={ROUTES.APP.NEW_PRINT} element={<NewPrintPage />} />
          <Route path={ROUTES.APP.BATCH_PRINT} element={<BatchPrintPage />} />
          <Route path={ROUTES.APP.GROUP_PRINT} element={<GroupPrintPage />} />
          <Route path={ROUTES.APP.PRINT_JOBS} element={<PrintJobsPage />} />
          <Route path={ROUTES.APP.WALLET} element={<WalletPage />} />
          <Route path={ROUTES.APP.STATIONS} element={<StationsPage />} />
          <Route path={ROUTES.APP.SETTINGS} element={<SettingsPage />} />
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to={ROUTES.ROOT} replace />} />
    </Routes>
  );
}
