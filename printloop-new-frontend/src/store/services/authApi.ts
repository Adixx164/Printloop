import { apiSlice } from "@/store/services/apiSlice";
import { setCredentials } from "@/store/features/auth/authSlice";

export const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    register: builder.mutation<any, {
      firstName: string;
      lastName: string;
      email: string;
      phoneNumber: string;
      password: string;
    }>({
      query: (body) => ({
        url: "customer/auth/register",
        method: "POST",
        body,
      }),
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          const payload = data?.response || data?.data || data;
          if (payload?.tokens) dispatch(setCredentials(payload));
        } catch {}
      },
    }),

    login: builder.mutation<any, { email: string; password: string }>({
      query: (body) => ({
        url: "customer/auth/login",
        method: "POST",
        body,
      }),
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          const payload = data?.response || data?.data || data;
          dispatch(setCredentials(payload));
        } catch {}
      },
    }),

    verifyEmail: builder.mutation<any, { email: string; token: string }>({
      query: (body) => ({
        url: "auth/verify-email",
        method: "POST",
        body,
      }),
    }),

    resendVerification: builder.mutation<any, { email: string }>({
      query: (body) => ({
        url: "auth/send-verification-email",
        method: "POST",
        body,
      }),
    }),

    forgotPassword: builder.mutation<any, { email: string }>({
      query: (body) => ({
        url: "auth/forgot-password",
        method: "POST",
        body: { ...body, modeOfReset: "email" },
      }),
    }),

    resetPassword: builder.mutation<any, { email: string; token: string; password: string }>({
      query: (body) => ({
        url: "auth/reset-password",
        method: "POST",
        body,
      }),
    }),

    me: builder.query<any, void>({
      query: () => "customer/auth/me",
      providesTags: ["Auth"],
      transformResponse: (r: any) => r?.response || r?.data || r,
    }),
  }),
});

export const {
  useRegisterMutation,
  useLoginMutation,
  useVerifyEmailMutation,
  useResendVerificationMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useMeQuery,
} = authApi;
