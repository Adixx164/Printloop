import { apiSlice } from "@/store/services/apiSlice";

export const jobsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPrintOptions: builder.query<any, void>({
      query: () => "customer/print-jobs/options",
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
    uploadFile: builder.mutation<any, FormData>({
      query: (formData) => ({
        url: "files/upload",
        method: "POST",
        body: formData,
      }),
    }),
  }),
});

export const {
  useGetPrintOptionsQuery,
  useListJobsQuery,
  useCreateJobMutation,
  useCreateBatchJobMutation,
  useUploadFileMutation,
} = jobsApi;
