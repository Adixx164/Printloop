import { Link } from "react-router-dom";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { EditorialFooter } from "@/components/layout/EditorialFooter";
import { useGetBlogPostsQuery } from "@/store/services/blogApi";
import { Reveal } from "@/components/ui/scrollFx";

/**
 * Marketing Blog index (V2-54). Reads published posts from the
 * backend CMS (/api/blog). Editorial-brutalist card grid — no images
 * required, the typography carries the page.
 */

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export default function BlogPage() {
  const { data, isLoading, isError } = useGetBlogPostsQuery({ limit: 24 });
  const posts = data?.posts ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <PublicHeader />
      <main className="flex-1">
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <Reveal variant="rise">
            <div className="editorial-label text-persimmon mb-3">▸ THE PRINTLOOP DISPATCH</div>
            <h1 className="pl-serif font-extrabold text-[38px] leading-[1.02] sm:text-[54px] sm:leading-[0.98] tracking-tight mb-5 max-w-3xl">
              Guides, updates and{" "}
              <em className="italic text-persimmon font-semibold">print-shop truths.</em>
            </h1>
            <p className="pl-serif italic text-ink/60 text-sm sm:text-base max-w-2xl">
              How the loop works, what we're building, and why your lab printer is the way it is.
            </p>
          </Reveal>

          <div className="mt-10">
            {isLoading && (
              <div className="border-4 border-ink p-10 text-center text-fog italic pl-serif">
                Loading the dispatch…
              </div>
            )}
            {isError && (
              <div className="border-4 border-ink border-persimmon p-10 text-center text-persimmon italic pl-serif">
                The dispatch is off press. Try again shortly.
              </div>
            )}
            {!isLoading && !isError && posts.length === 0 && (
              <div className="border-4 border-ink p-10 text-center text-fog italic pl-serif">
                No posts yet — check back soon.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {posts.map((p, i) => (
                <Reveal key={p.id} variant="rise">
                  <Link
                    to={`/blog/${p.slug}`}
                    className={`block border-4 border-ink p-6 transition-all hover:-translate-y-1 hover:shadow-[6px_6px_0_#1A1410] ${
                      i % 3 === 0 ? "bg-ink text-paper" : "bg-paper-light"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <span className="editorial-label text-persimmon">
                        § {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={`pl-mono text-[10px] ${
                          i % 3 === 0 ? "text-paper/50" : "text-ink/40"
                        }`}
                      >
                        {formatDate(p.publishedAt)}
                      </span>
                    </div>
                    <h2
                      className={`pl-serif text-xl sm:text-2xl font-bold tracking-tight mb-3 ${
                        i % 3 === 0 ? "text-paper" : "text-ink"
                      }`}
                    >
                      {p.title}
                    </h2>
                    {p.excerpt && (
                      <p
                        className={`pl-serif italic text-sm leading-relaxed mb-5 ${
                          i % 3 === 0 ? "text-paper/65" : "text-ink/60"
                        }`}
                      >
                        {p.excerpt}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[11px] font-bold ${
                          i % 3 === 0 ? "text-paper/70" : "text-ink/55"
                        }`}
                      >
                        {p.authorName || "PrintLoop"} · {p.tags?.join(" · ") || "printloop"}
                      </span>
                      <span className="text-persimmon font-bold text-xs">READ →</span>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      </main>
      <EditorialFooter />
    </div>
  );
}
