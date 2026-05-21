import { apiSlice } from "@/store/services/apiSlice";

// Real TypeORM-backed group sessions (/api/groups). Host actions accept a
// client-held guest hostId so no separate login is required.
export const groupApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listGroupSessions: builder.query<any, string | void>({
      query: (hostId) => `groups${hostId ? `?hostId=${encodeURIComponent(hostId)}` : ""}`,
      providesTags: ["GroupSessions"],
      transformResponse: (r: any) => r?.data || r,
    }),
    createGroupSession: builder.mutation<any, any>({
      query: (body) => ({ url: "groups", method: "POST", body }),
      invalidatesTags: ["GroupSessions"],
      transformResponse: (r: any) => r?.data || r,
    }),
    getGroupSession: builder.query<any, { id: string; hostId: string }>({
      query: ({ id, hostId }) => `groups/${id}?hostId=${encodeURIComponent(hostId)}`,
      providesTags: ["GroupSessions"],
      transformResponse: (r: any) => r?.data || r,
    }),
    closeGroupSession: builder.mutation<any, { id: string; hostId: string }>({
      query: ({ id, hostId }) => ({
        url: `groups/${id}/close`,
        method: "POST",
        body: { hostId },
      }),
      invalidatesTags: ["GroupSessions"],
      transformResponse: (r: any) => r?.data || r,
    }),
  }),
});

export const {
  useListGroupSessionsQuery,
  useCreateGroupSessionMutation,
  useGetGroupSessionQuery,
  useCloseGroupSessionMutation,
} = groupApi;
