import { Outlet } from "react-router-dom";

/**
 * Standalone shell for the admin console — deliberately carries NONE of the
 * customer chrome (no marquee, nav, or editorial footer). When an admin is
 * signed in, the console is the only thing they see.
 */
export function AdminLayout() {
  return (
    <div className="min-h-screen bg-ink">
      <Outlet />
    </div>
  );
}
