import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";

export const PUBLIC_LINKS = [
  { label: "Features", to: "/features" },
  { label: "Pricing", to: "/pricing" },
  { label: "About", to: "/about" },
  { label: "Blog", to: "/blog" },
  { label: "Contact", to: "/contact" },
] as const;

/**
 * Shared masthead for the marketing pages (V2-54): wordmark, page
 * links, and the auth CTAs — same editorial-brutalist language as the
 * landing page masthead.
 */
export function PublicHeader({ onDark = false }: { onDark?: boolean }) {
  return (
    <div className={`border-b-2 ${onDark ? "border-gray-900/20" : "border-gray-900"}`}>
      <div
        className={`px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 ${
          onDark ? "bg-gray-900 text-gray-50" : "bg-gray-50 text-gray-900"
        }`}
      >
        <Link
          to={ROUTES.ROOT}
          className={`font-serif font-extrabold text-[22px] sm:text-[24px] tracking-tight ${
            onDark ? "text-gray-50" : "text-gray-900"
          }`}
        >
          PrintLoop<span className="text-indigo-600">.</span>
        </Link>

        <nav className="order-3 sm:order-none w-full sm:w-auto flex items-center gap-1 overflow-x-auto">
          {PUBLIC_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`text-[11px] sm:text-xs font-bold tracking-editorial uppercase px-2.5 py-1.5 whitespace-nowrap border-2 transition-all hover:-translate-y-0.5 hover:border-indigo-600 ${
                onDark
                  ? "border-transparent text-gray-50/80 hover:text-gray-50"
                  : "border-transparent text-gray-900/70 hover:text-gray-900"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex gap-2">
          <Link
            to={ROUTES.AUTH.LOGIN}
            className={`text-[11px] sm:text-xs font-bold px-3 sm:px-4 py-2 border-2 ${
              onDark
                ? "border-gray-900/30 text-gray-50 hover:border-gray-900"
                : "border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-gray-50"
            }`}
          >
            SIGN IN
          </Link>
          <Link
            to={ROUTES.AUTH.REGISTER}
            className="pl-btn-primary text-[11px] sm:text-xs px-3 sm:px-4 py-2"
          >
            REGISTER <span className="hidden sm:inline">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
