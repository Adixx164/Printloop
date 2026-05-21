import { createApi, fetchBaseQuery, BaseQueryFn, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import { CONFIG } from "@/constants/config";
import type { RootState } from "@/store";
import { logOut, setCredentials } from "@/store/features/auth/authSlice";

const rawBase = fetchBaseQuery({
  baseUrl: CONFIG.apiBaseUrl,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  },
});

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extraOptions) => {
  let result = await rawBase(args, api, extraOptions);

  if (result.error && (result.error.status === 401 || result.error.status === 403)) {
    const refreshToken = (api.getState() as RootState).auth.refreshToken;
    if (!refreshToken) {
      api.dispatch(logOut());
      return result;
    }

    const refreshRes = await rawBase(
      { url: "auth/refresh", method: "POST", body: { refreshToken } },
      api,
      extraOptions
    );
    const refreshed: any = refreshRes.data;
    if (refreshed) {
      const payload = refreshed.response || refreshed.data || refreshed;
      api.dispatch(setCredentials(payload));
      result = await rawBase(args, api, extraOptions);
    } else {
      api.dispatch(logOut());
    }
  }
  return result;
};

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    "Auth", "Jobs", "Wallet", "Stations", "GroupSessions",
    "AdminStats", "AdminJobs", "AdminUsers", "AdminKiosks", "AdminPricing",
    "AdminPromotions", "AdminTransactions", "AdminReports", "AdminSettings",
    "AdminAudit",
  ],
  endpoints: () => ({}),
});
