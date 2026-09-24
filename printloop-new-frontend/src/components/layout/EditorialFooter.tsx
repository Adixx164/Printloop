import { useInView } from "@/components/ui/scrollFx";

export function EditorialFooter({ inverse = false }: { inverse?: boolean }) {
  const cls = inverse ? "bg-ink text-paper" : "bg-paper border-t-2 border-ink";
  // Rises into place when scrolled to — same press-room reveal as the rest
  // of the page (collapses to static under prefers-reduced-motion).
  const { ref, shown } = useInView();
  return (
    <div
      ref={ref}
      data-shown={shown ? "" : undefined}
      className={`pl-reveal pl-reveal-rise ${cls} px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1.5 sm:gap-3 text-sm`}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span className="editorial-label text-persimmon flex-shrink-0">★ PRINTLOOP</span>
        <span className={`font-serif italic text-xs sm:text-sm ${inverse ? "text-paper/80" : "text-ink/60"}`}>
          Every print, recorded. Every station, ready.
        </span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="pl-mono text-[11px] opacity-55">v1.0 · NG</span>
        <span className="pl-ornament text-ochre text-lg cursor-default" aria-hidden="true">❦</span>
      </div>
    </div>
  );
}
