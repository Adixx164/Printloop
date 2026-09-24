import { useState } from "react";
import { toast } from "sonner";
import {
  useGetBlogPostsQuery,
  useCreateBlogPostMutation,
  useUpdateBlogPostMutation,
  useDeleteBlogPostMutation,
} from "@/store/services/adminApi";

/**
 * Admin blog manager (V2-54). Full CRUD over the shop's posts:
 * write in the same markdown-ish dialect the public reader renders.
 */

const EMPTY = {
  title: "",
  excerpt: "",
  content: "",
  authorName: "",
  tags: "",
  coverImageUrl: "",
};

export default function BlogTab({ canManage }: { canManage: boolean }) {
  const { data, isLoading } = useGetBlogPostsQuery();
  const [createPost, { isLoading: creating }] = useCreateBlogPostMutation();
  const [updatePost] = useUpdateBlogPostMutation();
  const [deletePost] = useDeleteBlogPostMutation();

  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const posts: any[] = data || [];

  const resetForm = () => {
    setForm({ ...EMPTY });
    setEditing(null);
  };

  const openEdit = (p: any) => {
    setEditing(p.id);
    setForm({
      title: p.title || "",
      excerpt: p.excerpt || "",
      content: p.content || "",
      authorName: p.authorName || "",
      tags: (p.tags || []).join(", "),
      coverImageUrl: p.coverImageUrl || "",
    });
  };

  const handleSave = async (e: React.FormEvent, publish: boolean) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("Title and content are required.");
      return;
    }
    const body = {
      title: form.title,
      excerpt: form.excerpt || null,
      content: form.content,
      authorName: form.authorName || null,
      coverImageUrl: form.coverImageUrl || null,
      tags: form.tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10),
      status: publish ? "published" : "draft",
    };
    try {
      if (editing) {
        await updatePost({ id: editing, ...body }).unwrap();
        toast.success(publish ? "Post updated and published." : "Post updated.");
      } else {
        await createPost(body).unwrap();
        toast.success(publish ? "Post created and published." : "Draft saved.");
      }
      resetForm();
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to save post");
    }
  };

  const togglePublish = async (p: any) => {
    try {
      const next = p.status === "published" ? "draft" : "published";
      await updatePost({ id: p.id, status: next }).unwrap();
      toast.success(next === "published" ? `"${p.title}" is live.` : `"${p.title}" → draft.`);
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to toggle status");
    }
  };

  const handleDelete = async (p: any) => {
    if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    try {
      await deletePost(p.id).unwrap();
      toast.success("Post deleted.");
      if (editing === p.id) resetForm();
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to delete post");
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <div className="editorial-label text-persimmon mb-1">ADMIN CONSOLE</div>
          <h1 className="pl-serif text-4xl font-bold text-ink mb-1">Blog</h1>
          <p className="pl-serif italic text-ink/60">
            Write guides for your customers. Published posts appear on the public blog.
          </p>
        </div>
        {canManage && !editing && (
          <button onClick={resetForm} className="pl-btn-primary px-4 py-2 text-xs font-bold">
            + NEW POST
          </button>
        )}
      </div>

      {(editing || (canManage && !isLoading && !posts.length)) && (
        <form onSubmit={(e) => handleSave(e, false)} className="border-4 border-ink bg-paper-light p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="editorial-label text-persimmon">
              {editing ? "EDIT POST" : "NEW POST"}
            </span>
            {editing && (
              <button type="button" onClick={resetForm} className="text-xs font-bold text-ink/55 hover:text-persimmon">
                CANCEL ✕
              </button>
            )}
          </div>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Title — e.g. How exam-week printing works"
            className="pl-input font-bold"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={form.authorName}
              onChange={(e) => setForm({ ...form, authorName: e.target.value })}
              placeholder="Author (defaults to PrintLoop Team)"
              className="pl-input"
            />
            <input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="Tags, comma separated (e.g. guide, students)"
              className="pl-input"
            />
          </div>
          <input
            value={form.excerpt}
            onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
            placeholder="Excerpt — one teaser line for the blog grid"
            className="pl-input"
          />
          <input
            value={form.coverImageUrl}
            onChange={(e) => setForm({ ...form, coverImageUrl: e.target.value })}
            placeholder="Cover image URL (optional)"
            className="pl-input"
          />
          <textarea
            rows={12}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            placeholder={"Body — markdown-ish:\n## Heading\n\nParagraph with **bold** text.\n\n- bullet one\n- bullet two"}
            className="pl-input resize-y pl-mono text-[13px] leading-relaxed"
          />
          <div className="flex gap-2 justify-end flex-wrap">
            <button
              type="submit"
              className="pl-btn-ghost px-4 py-2 text-xs font-bold"
            >
              SAVE DRAFT
            </button>
            <button
              type="button"
              onClick={(e) => handleSave(e as any, true)}
              className="pl-btn-primary px-4 py-2 text-xs font-bold"
              disabled={creating}
            >
              PUBLISH →
            </button>
          </div>
        </form>
      )}

      <div className="border-2 border-ink overflow-hidden">
        <div className="bg-ink text-paper px-5 py-3">
          <div className="editorial-label">
            {isLoading ? "LOADING…" : `POSTS — ${posts.length} TOTAL`}
          </div>
        </div>
        <div className="overflow-x-auto bg-paper-light">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink/20 bg-ink/5 text-ink/70">
                <th className="p-3 font-semibold">Title</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold">Updated</th>
                <th className="p-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && posts.length === 0 && !editing && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-fog italic">
                    No posts yet{canManage ? " — write the first one." : "."}
                  </td>
                </tr>
              )}
              {posts.map((p) => (
                <tr key={p.id} className="border-b border-ink/10 last:border-0 hover:bg-ink/5">
                  <td className="p-3">
                    <div className="font-bold text-xs">{p.title}</div>
                    <div className="text-[11px] text-fog pl-mono mt-0.5">/{p.slug}</div>
                  </td>
                  <td className="p-3">
                    <span
                      className={`pl-pill text-[10px] font-bold uppercase ${
                        p.status === "published"
                          ? "bg-sage/15 text-sage border border-sage/30"
                          : "bg-ochre/15 text-ochre border border-ochre/30"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-fog whitespace-nowrap">
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {canManage && (
                      <>
                        <button onClick={() => togglePublish(p)} className="text-xs font-bold text-ochre hover:underline mr-3">
                          {p.status === "published" ? "UNPUBLISH" : "PUBLISH"}
                        </button>
                        <button onClick={() => openEdit(p)} className="text-xs font-bold text-ink hover:underline mr-3">
                          EDIT
                        </button>
                        <button onClick={() => handleDelete(p)} className="text-xs font-bold text-persimmon hover:underline">
                          DELETE
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
