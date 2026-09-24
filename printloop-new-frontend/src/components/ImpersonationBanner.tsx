import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import type { RootState } from "@/store";
import { setCredentials, logOut } from "@/store/features/auth/authSlice";
import { decodeToken } from "@/lib/jwt";

/**
 * Fixed top banner shown while a platform admin is impersonating a
 * tenant. Reads the `impersonating` claim from the current JWT
 * (display-only decode). "Exit" restores the backed-up platform
 * session and returns to the console.
 */
export default function ImpersonationBanner() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const token = useSelector((s: RootState) => s.auth.accessToken);
  const claim = decodeToken(token)?.impersonating;

  if (!claim) return null;

  const exit = () => {
    const platformSession = localStorage.getItem("pl_platform_session");
    if (platformSession) {
      try {
        const parsed = JSON.parse(platformSession);
        dispatch(setCredentials(parsed));
      } catch {
        dispatch(logOut());
      }
      localStorage.removeItem("pl_platform_session");
    } else {
      dispatch(logOut());
    }
    navigate("/platform");
  };

  return (
    <div className="sticky top-0 z-50 bg-amber-500 text-black text-sm px-4 py-2 flex items-center justify-center gap-3">
      <span>
        You are acting as a tenant (impersonation session). Actions are
        audit-logged under your platform account.
      </span>
      <button
        onClick={exit}
        className="bg-black/80 text-white px-3 py-0.5 rounded text-xs font-semibold"
      >
        Exit impersonation
      </button>
    </div>
  );
}
