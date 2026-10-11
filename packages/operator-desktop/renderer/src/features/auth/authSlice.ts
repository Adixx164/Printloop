import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { operatorApi } from '@printloop/shared/operator-api';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  isEmailVerified: boolean;
  role?: 'owner' | 'admin' | 'staff';
  tenantId: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<any>) {
      const payload = action.payload || {};
      const tokens = payload.tokens || payload;
      state.accessToken = tokens.accessToken || tokens.access_token || null;
      state.refreshToken = tokens.refreshToken || tokens.refresh_token || null;
      if (payload.user) state.user = payload.user;
    },
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload;
    },
    logOut(state) {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(
      operatorApi.endpoints.login.matchFulfilled,
      (state, { payload }) => {
        const data = payload?.data || payload;
        if (data?.tokens) {
          state.accessToken = data.tokens.accessToken || data.tokens.access_token;
          state.refreshToken = data.tokens.refreshToken || data.tokens.refresh_token;
        }
        if (data?.user) state.user = data.user;
      }
    );
  },
});

export const { setCredentials, setUser, logOut } = authSlice.actions;
export default authSlice.reducer;