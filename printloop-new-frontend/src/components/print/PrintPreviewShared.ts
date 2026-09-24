/** Expand "2-3,10-20,5" into a sorted, unique page list clamped to [1,total]. */
export function parsePageRange(input: string, total: number): number[] {
  if (!input?.trim()) return [];
  const out = new Set<number>();
  for (const chunk of input.split(",")) {
    const part = chunk.trim();
    if (!part) continue;
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = parseInt(m[1], 10);
      let b = parseInt(m[2], 10);
      if (a > b) [a, b] = [b, a];
      for (let p = a; p <= b; p++) if (p >= 1 && p <= total) out.add(p);
    } else if (/^\d+$/.test(part)) {
      const p = parseInt(part, 10);
      if (p >= 1 && p <= total) out.add(p);
    }
  }
  return [...out].sort((x, y) => x - y);
}

export type PreviewMeta = {
  pageCount: number;
  rangeable: boolean;
  orientation?: "portrait" | "landscape";
};