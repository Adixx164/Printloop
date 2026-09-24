/**
 * Tiny markdown-ish renderer for blog posts (V2-54). No deps — the
 * backend stores a deliberately small dialect:
 *   ## / ### headings, **bold**, *italic*, - lists, blank-line
 *   paragraphs, > quotes. Everything else is escaped so raw HTML in
 *   a post can never inject markup. Returns an HTML string for
 *   dangerouslySetInnerHTML — content comes from trusted admins.
 */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string): string {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let list: string[] | null = null;

  const flushList = () => {
    if (list) {
      out.push(`<ul>${list.map((li) => `<li>${li}</li>`).join("")}</ul>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList();
      continue;
    }
    const m = line.match(/^(#{2,3})\s+(.*)$/);
    if (m) {
      flushList();
      const level = m[1].length === 2 ? 2 : 3;
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
      continue;
    }
    if (line.startsWith("> ")) {
      flushList();
      out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
      continue;
    }
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      list = list || [];
      list.push(inline(li[1]));
      continue;
    }
    flushList();
    out.push(`<p>${inline(line)}</p>`);
  }
  flushList();
  return out.join("\n");
}
