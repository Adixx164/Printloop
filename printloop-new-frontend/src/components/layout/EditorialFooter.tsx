export function EditorialFooter({ inverse = false }: { inverse?: boolean }) {
  const cls = inverse ? "bg-ink text-paper" : "bg-paper border-t-2 border-ink";
  return (
    <div className={`${cls} px-8 py-3 flex justify-between items-center text-sm`}>
      <div className="flex items-center gap-3">
        <span className="editorial-label text-persimmon">★ PRINTLOOP</span>
        <span className={`font-serif italic ${inverse ? "text-paper/80" : "text-ink/60"}`}>
          Every print, recorded. Every station, ready.
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="pl-mono text-[11px] opacity-55">v1.0 · NG</span>
        <span className="text-ochre text-lg">❦</span>
      </div>
    </div>
  );
}
