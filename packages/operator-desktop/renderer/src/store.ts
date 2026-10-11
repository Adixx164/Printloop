import { configureStore } from '@reduxjs/toolkit';
import { operatorApi } from '@printloop/shared/operator-api';
import authReducer from './features/auth/authSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [operatorApi.reducerPath]: operatorApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(operatorApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;