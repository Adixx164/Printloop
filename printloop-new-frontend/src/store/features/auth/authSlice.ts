import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type User = {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  isEmailVerified?: boolean;
  role?: 'user' | 'admin' | 'super_admin';
  adminPrivileges?: string[];
} | null;

type AuthState = {
  user: User;
  accessToken: string | null;
  refreshToken: string | null;
};

const persisted = (() => {
  try {
    const raw = localStorage.getItem("pl_auth");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
})();

const initialState: AuthState = {
  user: persisted?.user || null,
  accessToken: persisted?.accessToken || null,
  refreshToken: persisted?.refreshToken || null,
};

function persist(state: AuthState) {
  try {
    localStorage.setItem("pl_auth", JSON.stringify(state));
  } catch {}
}

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<any>) {
      const payload = action.payload || {};
      const tokens = payload.tokens || payload;
      state.accessToken = tokens.accessToken || tokens.access_token || null;
      state.refreshToken = tokens.refreshToken || tokens.refresh_token || null;
      if (payload.user) state.user = payload.user;
      persist(state);
    },
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload;
      persist(state);
    },
    logOut(state) {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      try { localStorage.removeItem("pl_auth"); } catch {}
    },
  },
});

export const { setCredentials, setUser, logOut } = authSlice.actions;
export default authSlice.reducer;
