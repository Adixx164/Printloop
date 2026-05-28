export function EditorialFooter({ inverse = false }: { inverse?: boolean }) {
  const cls = inverse ? "bg-ink text-paper" : "bg-paper border-t-2 border-ink";
  return (
    <div className={`${cls} px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1.5 sm:gap-3 text-sm`}>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="editorial-label text-persimmon flex-shrink-0">★ PRINTLOOP</span>
        <span className={`font-serif italic text-xs sm:text-sm ${inverse ? "text-paper/80" : "text-ink/60"}`}>
          Every print, recorded. Every station, ready.
        </span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="pl-mono text-[11px] opacity-55">v1.0 · NG</span>
        <span className="text-ochre text-lg">❦</span>
      </div>
    </div>
  );
}
