import { useEffect, useState } from "react";

export function Loader() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper/95 backdrop-blur-sm" aria-label="Loading page">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-persimmon border-t-transparent rounded-full animate-spin" />
        <p className="pl-serif italic text-ink/60 text-sm">Loading…</p>
      </div>
    </div>
  );
}

export function InlineLoader() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-persimmon border-t-transparent rounded-full animate-spin" />
        <p className="pl-serif italic text-ink/50 text-sm">Loading…</p>
      </div>
    </div>
  );
}