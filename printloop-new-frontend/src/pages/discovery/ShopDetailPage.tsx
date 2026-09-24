import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "@/store";
import { toast } from "sonner";
import {
  useGetShopDetailQuery,
  useMintHandoffMutation,
  useSubmitShopReviewMutation,
} from "@/store/services/discoveryApi";

/**
 * `/find/:slug` — public shop profile.
 *
 * Shows the full pricing matrix, address, brand colour, online
 * status. The "Print here →" CTA sends the customer into the shop's
 * own tenant portal. In production that's `{slug}.printloop.app`;
 * in local dev we fall back to a path-prefixed route the
 * tenant-resolution middleware also honours via X-Tenant-Slug.
 */
export default function ShopDetailPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { data, isLoading, isError } = useGetShopDetailQuery({ slug });
  const [email, setEmail] = useState("");
  const [mintHandoff, mintState] = useMintHandoffMutation();
  const user = useSelector((s: RootState) => s.auth.user);
  const [formRating, setFormRating] = useState(5);
  const [formComment, setFormComment] = useState("");
  const [submitReview, { isLoading: isSubmittingReview }] = useSubmitShopReviewMutation();

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await submitReview({
        slug,
        rating: formRating,
        comment: formComment.trim() || undefined,
      }).unwrap();
      toast.success("Review submitted successfully!");
      setFormComment("");
      setFormRating(5);
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to submit review");
    }
  };

  if (isLoading)
    return <div className="p-8 text-gray-500">Loading shop…</div>;
  if (isError || !data)
    return (
      <div className="p-8 max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-2">Shop not found</h1>
        <p className="text-gray-600 mb-4">
          This shop isn't available right now. It may not be open to public
          discovery yet.
        </p>
        <Link to="/find" className="text-[#225275] font-semibold">
          ← Back to nearby shops
        </Link>
      </div>
    );

  const { shop, pricing, reviews = [] } = data;
  const brand = shop.brand.primaryColor || "#225275";
  // The "Print here" target. In production: shop's subdomain pointed
  // straight at the upload page so customers don't bounce through a
  // landing. In dev: same-origin with a tenant query param. We choose
  // /print/new because that's the start of the upload flow; LoginPage
  // will pre-fill the email from the handoff if auth is needed first.
  const apex = (import.meta.env.VITE_APEX_DOMAIN as string) || "";
  const baseHref = apex
    ? `https://${shop.slug}.${apex}/print/new`
    : `/print/new?tenantSlug=${encodeURIComponent(shop.slug)}`;

  /**
   * Mint a handoff token (V2-32) and append it to the CTA URL so
   * the tenant portal can pre-fill the login form with the email
   * the customer typed here. Email is optional — without it, the
   * customer just lands at the tenant root with the slug pinned.
   */
  const goPrint = async () => {
    let url = baseHref;
    try {
      const res = await mintHandoff({
        slug: shop.slug,
        email: email.trim() || undefined,
      }).unwrap();
      const sep = url.includes("?") ? "&" : "?";
      url = `${url}${sep}handoff=${encodeURIComponent(res.token)}`;
    } catch {
      // Best-effort: if minting fails (rate limit, network), still
      // navigate so the user isn't stuck.
    }
    window.location.href = url;
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <Link
        to="/find"
        className="text-sm text-gray-500 inline-block mb-4"
      >
        ← All shops
      </Link>

      <div
        className="rounded-lg p-6 text-white"
        style={{ backgroundColor: brand }}
      >
        <h1 className="text-3xl font-bold">
          {shop.brand.wordmark || shop.name}
        </h1>
        {shop.address && (
          <p className="opacity-90 mt-1">{shop.address}</p>
        )}
        {shop.ratingCount > 0 ? (
          <div className="flex items-center gap-1.5 mt-2 text-amber-300 font-semibold text-sm">
            <span>★</span>
            <span className="text-white">{shop.ratingAverage.toFixed(1)} / 5.0</span>
            <span className="opacity-75">({shop.ratingCount} {shop.ratingCount === 1 ? 'review' : 'reviews'})</span>
          </div>
        ) : (
          <p className="text-sm opacity-75 mt-2 italic">No reviews yet</p>
        )}
        <div className="flex flex-wrap gap-3 mt-4 text-sm">
          {shop.distanceKm != null && (
            <span className="bg-white/20 px-3 py-1 rounded">
              {shop.distanceKm.toFixed(1)} km away
            </span>
          )}
          <span
            className={`px-3 py-1 rounded font-medium ${
              shop.agentOnline ? "bg-green-500/30" : "bg-red-500/30 text-red-200"
            }`}
          >
            {shop.agentOnline ? "Open + online" : "Temporarily Offline"}
          </span>
          {shop.queueLength > 0 && (
            <span className="bg-amber-500/30 px-3 py-1 rounded font-medium text-amber-200">
              Queue: {shop.queueLength} ({shop.estimatedWaitMin}m wait)
            </span>
          )}
          {shop.hasColor && (
            <span className="bg-white/20 px-3 py-1 rounded">Colour</span>
          )}
          {shop.paperSizes.map((p) => (
            <span key={p} className="bg-white/20 px-3 py-1 rounded">
              {p}
            </span>
          ))}
        </div>

        {/* Email + CTA — handoff carries the email so the tenant
            portal can pre-fill it (V2-32). Disabled if offline. */}
        <div className="mt-5 flex flex-wrap gap-2 items-stretch max-w-md">
          <input
            type="email"
            placeholder={shop.agentOnline ? "Your email (optional)" : "Shop is offline"}
            value={email}
            disabled={!shop.agentOnline}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 min-w-[180px] rounded px-3 py-2 text-gray-900 text-sm disabled:bg-gray-200 disabled:text-gray-500"
          />
          <button
            type="button"
            onClick={goPrint}
            disabled={mintState.isLoading || !shop.agentOnline}
            className="bg-white px-5 py-2 rounded font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: brand }}
          >
            {mintState.isLoading ? "…" : shop.agentOnline ? "Print here →" : "Offline"}
          </button>
        </div>
      </div>

      {/* Shop Photos Gallery */}
      {shop.photos && shop.photos.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-bold mb-3">Shop Gallery</h2>
          <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-thin scrollbar-thumb-gray-300">
            {shop.photos.map((photoUrl, idx) => (
              <img
                key={idx}
                src={photoUrl}
                alt={`${shop.name} photo ${idx + 1}`}
                className="w-80 h-48 object-cover rounded-lg flex-shrink-0 border-2 border-gray-100 shadow-sm"
              />
            ))}
          </div>
        </section>
      )}

      {/* Pricing matrix */}
      <section className="mt-8">
        <h2 className="text-xl font-bold mb-3">Prices</h2>
        {pricing.length === 0 ? (
          <p className="text-gray-500 text-sm">
            This shop hasn't published a price list yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse bg-white">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-3">Paper</th>
                  <th className="py-2 pr-3">Colour</th>
                  <th className="py-2 pr-3">100dpi</th>
                  <th className="py-2 pr-3">300dpi</th>
                  <th className="py-2 pr-3">600dpi</th>
                  <th className="py-2 pr-3">100dpi (2-sided)</th>
                  <th className="py-2 pr-3">300dpi (2-sided)</th>
                  <th className="py-2 pr-3">600dpi (2-sided)</th>
                </tr>
              </thead>
              <tbody>
                {pricing.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-semibold">
                      {row.paperSize}
                    </td>
                    <td className="py-2 pr-3 capitalize">{row.colorType}</td>
                    <td className="py-2 pr-3">₦{row.price100Simplex}</td>
                    <td className="py-2 pr-3">₦{row.price300Simplex}</td>
                    <td className="py-2 pr-3">₦{row.price600Simplex}</td>
                    <td className="py-2 pr-3">₦{row.price100Duplex}</td>
                    <td className="py-2 pr-3">₦{row.price300Duplex}</td>
                    <td className="py-2 pr-3">₦{row.price600Duplex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-gray-500 mt-6">
        Prices are per page. Final cost depends on page count, copies, and
        any promo discount the shop's running.
      </p>

      {/* Reviews Section */}
      <section className="mt-10 border-t pt-8">
        <h2 className="text-xl font-bold mb-4">Customer Reviews</h2>
        {reviews.length === 0 ? (
          <p className="text-gray-500 text-sm italic">No reviews for this shop yet. Be the first to leave one!</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <div key={r.id} className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-semibold text-gray-900">{r.user.firstName} {r.user.lastName}</span>
                    <div className="flex gap-0.5 text-amber-400 text-sm mt-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i}>{i < r.rating ? "★" : "☆"}</span>
                      ))}
                    </div>
                  </div>
                  <span className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
                {r.comment && <p className="text-sm text-gray-700 mt-2">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Leave a Review Form */}
        <div className="mt-8 bg-gray-50/50 p-5 rounded-lg border border-dashed border-gray-300">
          <h3 className="font-bold text-lg mb-2">Leave a Review</h3>
          {user ? (
            <form onSubmit={handleSubmitReview} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Rating</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFormRating(star)}
                      className={`text-2xl transition-colors ${
                        star <= formRating ? "text-amber-400" : "text-gray-300 hover:text-amber-300"
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="comment" className="block text-xs font-semibold text-gray-600 uppercase mb-1">Comment (Optional)</label>
                <textarea
                  id="comment"
                  rows={3}
                  value={formComment}
                  onChange={(e) => setFormComment(e.target.value)}
                  placeholder="Share your experience printing here..."
                  className="w-full text-sm rounded border border-gray-300 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmittingReview}
                className="bg-[#225275] text-white px-5 py-2 rounded text-sm font-semibold hover:opacity-95 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: brand }}
              >
                {isSubmittingReview ? "Submitting..." : "Submit Review"}
              </button>
            </form>
          ) : (
            <p className="text-sm text-gray-500">
              Please{" "}
              <Link to="/login" className="text-[#225275] font-semibold underline" style={{ color: brand }}>
                log in
              </Link>{" "}
              to leave a review for this shop.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
