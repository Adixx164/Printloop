import { apiSlice } from "@/store/services/apiSlice";

export const walletApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getWallet: builder.query<any, void>({
      query: () => "wallet",
      providesTags: ["Wallet"],
      transformResponse: (r: any) => r?.response || r?.data || r,
    }),
    topUp: builder.mutation<any, { amount: number }>({
      query: (body) => ({ url: "wallet/top-up", method: "POST", body }),
      invalidatesTags: ["Wallet"],
    }),
    initializeTopUp: builder.mutation<any, { amount: number }>({
      query: (body) => ({ url: "wallet/top-up/initialize", method: "POST", body }),
    }),
  }),
});

export const { useGetWalletQuery, useTopUpMutation, useInitializeTopUpMutation } = walletApi;
