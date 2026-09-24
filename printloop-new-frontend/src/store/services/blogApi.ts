import { apiSlice } from "@/store/services/apiSlice";

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  coverImageUrl: string | null;
  authorName: string | null;
  tags: string[];
  publishedAt: string | null;
  updatedAt: string;
}

export const blogApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getBlogPosts: builder.query<
      { posts: BlogPost[]; total: number },
      { limit?: number; offset?: number } | void
    >({
      query: (p) => {
        const params = (p ?? {}) as { limit?: number; offset?: number };
        const qs = new URLSearchParams();
        if (params.limit) qs.set("limit", String(params.limit));
        if (params.offset) qs.set("offset", String(params.offset));
        const q = qs.toString();
        return `blog${q ? `?${q}` : ""}`;
      },
      transformResponse: (r: any) => r?.data || r,
      providesTags: ["Blog"],
    }),
    getBlogPost: builder.query<BlogPost, string>({
      query: (slug) => `blog/${encodeURIComponent(slug)}`,
      transformResponse: (r: any) => r?.data || r,
      providesTags: (_r, _e, slug) => [{ type: "Blog", id: slug }],
    }),
  }),
});

export const { useGetBlogPostsQuery, useGetBlogPostQuery } = blogApi;
