/**
 * Authentication Types
 * Extracted from printloop-new-frontend/src/store/services/authApi.ts and authSlice.ts
 */

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  isEmailVerified: boolean;
  role?: "user" | "admin" | "super_admin";
  adminPrivileges?: string[];
  tenantId?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
}

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string;
}

export interface RegisterResponse {
  user: User;
  tokens: AuthTokens;
}

export interface LoginPayload {
  email: string;
  password: string;
  totpCode?: string;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

export interface VerifyEmailPayload {
  email: string;
  token: string;
}

export interface ResendVerificationPayload {
  email: string;
}

export interface ForgotPasswordPayload {
  email: string;
  modeOfReset?: "email" | "phone";
}

export interface UpdateProfilePayload {
  firstName: string;
  lastName: string;
  phoneNumber: string;
}

export interface ChangePasswordPayload {
  oldPassword?: string;
  newPassword?: string;
}

export interface SetCredentialsPayload {
  user?: User;
  tokens?: AuthTokens;
  accessToken?: string;
  refreshToken?: string;
  access_token?: string;
  refresh_token?: string;
}