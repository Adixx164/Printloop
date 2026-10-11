import { createSlice, PayloadAction } from '@reduxjs/toolkit';

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
    setUser(state, action: PayloadAction<any>) {
      state.user = action.payload;
    },
    logOut(state) {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
    },
  },
});

export const { setCredentials, setUser, logOut } = authSlice.actions;
export default authSlice.reducer;