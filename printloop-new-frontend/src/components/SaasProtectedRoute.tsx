import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "@/store";

/**
 * Guards the shop console (/saas/*). No access token → the shop
 * sign-in page, remembering where they were headed.
 */
export function SaasProtectedRoute() {
  const accessToken = useSelector((s: RootState) => s.auth.accessToken);
  const location = useLocation();
  if (!accessToken) {
    return <Navigate to={`/saas/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <Outlet />;
}
