import { apiSlice } from "@/store/services/apiSlice";

export const stationsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listStations: builder.query<any, void>({
      // Real Kiosks (filtered by isPublic), not the legacy mock array.
      // Admin Kiosks tab is the single source of truth.
      query: () => "customer/stations",
      providesTags: ["Stations"],
      transformResponse: (r: any) => r?.response || r?.data || r,
    }),
  }),
});

export const { useListStationsQuery } = stationsApi;
