import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";

export function Masthead({ rightContent }: { rightContent?: React.ReactNode }) {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).toUpperCase();

  return (
    <div className="bg-paper border-b-2 border-ink px-8 py-4 flex justify-between items-baseline">
      <Link to={ROUTES.ROOT} className="font-serif font-extrabold text-[28px] tracking-tight">
        PrintLoop<span className="text-persimmon">.</span>
      </Link>
      <div className="flex items-center gap-3 text-[10px] tracking-editorial font-bold">
        <span className="editorial-folio not-italic">
          <span className="italic">Vol. I</span>
        </span>
        <span className="text-ink/40">·</span>
        <span>ISSUE 09</span>
        <span className="text-ink/40">·</span>
        <span>{today}</span>
        {rightContent ? (
          <>
            <span className="text-ink/40">·</span>
            {rightContent}
          </>
        ) : null}
      </div>
    </div>
  );
}
