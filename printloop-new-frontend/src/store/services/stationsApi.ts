import { apiSlice } from "@/store/services/apiSlice";

export const stationsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listStations: builder.query<any, void>({
      query: () => "stations",
      providesTags: ["Stations"],
      transformResponse: (r: any) => r?.response || r?.data || r,
    }),
  }),
});

export const { useListStationsQuery } = stationsApi;
