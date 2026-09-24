import { apiSlice } from "@/store/services/apiSlice";

export const jobsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Live pricing matrix — what the admin sets is what's displayed.
     * Hits the PUBLIC `/api/pricing` so anonymous flows (group-participant
     * join) can use the same hook too. Authenticated customer pages also
     * just call this — auth isn't needed to *read* prices.
     */
    getPricing: builder.query<any, void>({
      query: () => "pricing",
      providesTags: ["Pricing"],
      transformResponse: (r: any) => r?.response || r?.data || r,
    }),
    listJobs: builder.query<any, void>({
      query: () => "customer/print-jobs",
      providesTags: ["Jobs"],
      transformResponse: (r: any) => r?.response || r?.data || r,
    }),
    // FormData → real customer endpoint (file persisted, real PrintJob the
    // kiosk can print). Plain object → legacy mock (still used by Batch).
    createJob: builder.mutation<any, any>({
      query: (arg) =>
        arg instanceof FormData
          ? { url: "customer/print-jobs", method: "POST", body: arg }
          : { url: "print-jobs", method: "POST", body: arg },
      invalidatesTags: ["Jobs"],
    }),
    // Real multi-file / ONE-code batch (FormData: files[] + items JSON).
    createBatchJob: builder.mutation<any, FormData>({
      query: (fd) => ({ url: "customer/print-jobs/batch", method: "POST", body: fd }),
      invalidatesTags: ["Jobs"],
    }),
    // V2-53: wallet is gone — every job pays via the Paystack hosted
    // checkout. Returns { authorizationUrl, reference } to open.
    initializeJobPayment: builder.mutation<any, { jobId: string }>({
      query: (body) => ({ url: "payments/initialize-job-payment", method: "POST", body }),
      transformResponse: (r: any) => {
        const unwrapped = r?.response || r?.data || r;
        if (unwrapped?.authorization_url && !unwrapped?.authorizationUrl) {
          return { ...unwrapped, authorizationUrl: unwrapped.authorization_url };
        }
        return unwrapped;
      },
    }),
    uploadFile: builder.mutation<any, FormData>({
      query: (formData) => ({
        url: "files/upload",
        method: "POST",
        body: formData,
      }),
    }),
    submitDispute: builder.mutation<any, { printJobId: string; reason: string }>({
      query: (body) => ({ url: "customer/disputes", method: "POST", body }),
    }),
  }),
});

export const {
  useGetPricingQuery,
  useListJobsQuery,
  useCreateJobMutation,
  useCreateBatchJobMutation,
  useInitializeJobPaymentMutation,
  useUploadFileMutation,
  useSubmitDisputeMutation,
} = jobsApi;
