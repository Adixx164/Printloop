import { apiSlice } from "@/store/services/apiSlice";

export const kioskApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    releasePrintCode: builder.mutation<any, { code: string; kioskId?: string }>({
      query: (body) => ({ url: "kiosk/release", method: "POST", body }),
      invalidatesTags: ["Jobs"],
    }),
  }),
});

export const { useReleasePrintCodeMutation } = kioskApi;
