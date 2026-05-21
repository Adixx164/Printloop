export function Marquee({ items }: { items: { text: string; accent?: boolean }[] }) {
  const tape = [...items, ...items];
  return (
    <div className="bg-ink text-paper py-2 overflow-hidden border-b-2 border-persimmon">
      <div className="flex gap-12 whitespace-nowrap animate-marquee">
        {tape.map((item, i) => (
          <span
            key={i}
            className={`text-[10px] tracking-editorial font-bold ${item.accent ? "text-persimmon" : ""}`}
          >
            {item.text}
          </span>
        ))}
      </div>
    </div>
  );
}
