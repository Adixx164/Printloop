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

    login: builder.mutation<
      any,
      { email: string; password: string; totpCode?: string }
    >({
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

    updateProfile: builder.mutation<any, { firstName: string; lastName: string; phoneNumber: string }>({
      query: (body) => ({
        url: "customer/auth/me",
        method: "PUT",
        body,
      }),
      invalidatesTags: ["Auth"],
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          const payload = data?.response || data?.data || data;
          if (payload?.user) {
            dispatch(setCredentials(payload));
          }
        } catch {}
      },
    }),

    changePassword: builder.mutation<any, { oldPassword?: string; newPassword?: string }>({
      query: (body) => ({
        url: "customer/auth/password",
        method: "PUT",
        body,
      }),
    }),
  }),
});

export const {
  useRegisterMutation,
  useLoginMutation,
  useVerifyEmailMutation,
  useResendVerificationMutation,
  useForgotPasswordMutation,
  useUpdateProfileMutation,
  useChangePasswordMutation,
} = authApi;
