import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "@/store";
import { ROUTES } from "@/constants/routes";

/** Standard user auth gate — redirects to /auth/login if not authenticated */
export function ProtectedRoute() {
  const token = useSelector((s: RootState) => s.auth.accessToken);
  const location = useLocation();
  if (!token) {
    return <Navigate to={ROUTES.AUTH.LOGIN} state={{ from: location }} replace />;
  }
  return <Outlet />;
}

/** Admin-only gate — redirects to /admin/login if not authenticated OR not admin/super_admin */
export function AdminProtectedRoute() {
  const token = useSelector((s: RootState) => s.auth.accessToken);
  const user = useSelector((s: RootState) => s.auth.user) as any;
  const location = useLocation();

  if (!token) {
    return <Navigate to={ROUTES.ADMIN.LOGIN} state={{ from: location }} replace />;
  }

  const role = user?.role;
  if (role !== "admin" && role !== "super_admin") {
    // Authenticated but not an admin — send them to admin login, not user dashboard
    return <Navigate to={ROUTES.ADMIN.LOGIN} state={{ from: location }} replace />;
  }

  return <Outlet />;
}

/** Redirect logged-in users away from auth pages */
export function PublicOnlyRoute() {
  const token = useSelector((s: RootState) => s.auth.accessToken);
  if (token) return <Navigate to={ROUTES.APP.DASHBOARD} replace />;
  return <Outlet />;
}

/** Redirect already-authenticated admins away from the admin login page */
export function AdminPublicOnlyRoute() {
  const token = useSelector((s: RootState) => s.auth.accessToken);
  const user = useSelector((s: RootState) => s.auth.user) as any;
  const role = user?.role;
  if (token && (role === "admin" || role === "super_admin")) {
    return <Navigate to={ROUTES.ADMIN.HOME} replace />;
  }
  return <Outlet />;
}
