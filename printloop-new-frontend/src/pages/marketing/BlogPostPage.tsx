import { Link, useParams } from "react-router-dom";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { EditorialFooter } from "@/components/layout/EditorialFooter";
import { useGetBlogPostQuery } from "@/store/services/blogApi";
import { markdownToHtml } from "@/lib/markdown";

/**
 * Marketing blog reader (V2-54). Renders the stored post via the
 * tiny markdown renderer; content comes from trusted admins.
 */

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export default function BlogPostPage() {
  const { slug = "" } = useParams();
  const { data: post, isLoading, isError } = useGetBlogPostQuery(slug);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <PublicHeader />
      <main className="flex-1">
        <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          {isLoading && (
            <div className="border-4 border-gray-900 p-10 text-center text-gray-50 italic pl-serif">
              Setting the type…
            </div>
          )}
          {isError && (
            <div className="border-4 border-gray-900 border-indigo-600 p-10 text-center">
              <div className="pl-serif italic text-indigo-600 text-lg mb-3">
                This post isn't on the newsstand.
              </div>
              <Link to="/blog" className="pl-btn-primary px-4 py-2 text-xs inline-block">
                ← BACK TO THE BLOG
              </Link>
            </div>
          )}
          {post && (
            <>
              <Link
                to="/blog"
                className="text-[11px] font-bold tracking-editorial text-gray-50/55 hover:text-indigo-600 uppercase"
              >
                ← THE DISPATCH
              </Link>
              <div className="editorial-label text-indigo-600 mt-6 mb-3">
                ▸ {post.tags?.join(" · ").toUpperCase() || "PRINTLOOP"}
              </div>
              <h1 className="pl-serif font-extrabold text-[32px] leading-[1.05] sm:text-[44px] sm:leading-[1.0] tracking-tight mb-4">
                {post.title}
              </h1>
              <div className="flex items-center gap-3 text-xs pl-mono text-gray-50/55 mb-8 border-b-2 border-gray-900 pb-4">
                <span className="font-bold text-gray-900">{post.authorName || "PrintLoop Team"}</span>
                <span>·</span>
                <span>{formatDate(post.publishedAt)}</span>
                <span>·</span>
                <span>4 min read</span>
              </div>
              <div
                className="prose-printloop space-y-4 text-[15px] leading-relaxed [&_h2]:pl-serif [&_h2]:text-gray-900 [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:pt-2 [&_h3]:pl-serif [&_h3]:text-gray-900 [&_h3]:font-bold [&_ul]:list-none [&_li]:flex [&_li]:gap-2 [&_li]:before:content-['▸'] [&_li]:before:text-indigo-600 [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-600 [&_blockquote]:pl-4 [&_blockquote]:pl-serif [&_blockquote]:italic [&_blockquote]:text-gray-50/70 [&_code]:bg-gray-50/5 [&_code]:border [&_code]:border-gray-900/15 [&_code]:px-1 [&_code]:pl-mono [&_code]:text-[13px]"
                dangerouslySetInnerHTML={{ __html: markdownToHtml(post.content) }}
              />
              <div className="border-t-2 border-ink mt-12 pt-6 flex items-center justify-between">
                <span className="pl-serif italic text-gray-50/55 text-sm">
                  — {post.authorName || "PrintLoop Team"}
                </span>
                <Link to="/find" className="pl-btn-primary px-4 py-2 text-xs">
                  FIND A STATION →
                </Link>
              </div>
            </>
          )}
        </article>
      </main>
      <EditorialFooter />
    </div>
  );
}
