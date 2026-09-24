import { apiSlice } from './apiSlice';

export const preflightApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    analyzePreflight: builder.mutation<any, FormData>({
      query: (formData) => ({
        url: '/api/preflight/analyze',
        method: 'POST',
        body: formData,
        formData: true,
      }),
    }),
    fixPreflight: builder.mutation<Blob, FormData>({
      query: (formData) => ({
        url: '/api/preflight/fix',
        method: 'POST',
        body: formData,
        formData: true,
      }),
      transformResponse: (response: Blob) => response,
    }),
    applyFix: builder.mutation<Blob, { file: File; fixType: string }>({
      query: ({ file, fixType }) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('fixType', fixType);
        return {
          url: '/api/preflight/apply-fix',
          method: 'POST',
          body: formData,
          formData: true,
        };
      },
      transformResponse: (response: Blob) => response,
    }),
    getQuote: builder.mutation<any, { printConfig: any; pageCount: number }>({
      query: ({ printConfig, pageCount }) => ({
        url: '/api/preflight/quote',
        method: 'POST',
        body: { printConfig, pageCount },
      }),
    }),
    getCapabilities: builder.query<any, void>({
      query: () => '/api/preflight/capabilities',
    }),
  }),
});

export const {
  useAnalyzePreflightMutation,
  useFixPreflightMutation,
  useApplyFixMutation,
  useGetQuoteMutation,
  useGetCapabilitiesQuery,
} = preflightApi;