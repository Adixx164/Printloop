import { configureStore } from "@reduxjs/toolkit";
import authReducer from "@/store/features/auth/authSlice";
import { apiSlice } from "@/store/services/apiSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [apiSlice.reducerPath]: apiSlice.reducer,
  },
  middleware: (getDefault) => getDefault().concat(apiSlice.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
