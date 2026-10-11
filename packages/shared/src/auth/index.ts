/**
 * Auth Utilities - Token storage abstraction for web, mobile, desktop
 * Platform-agnostic interface; consumers provide their own storage implementation
 */

export interface TokenStorage {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setTokens(accessToken: string, refreshToken: string): void;
  clearTokens(): void;
  getUser(): User | null;
  setUser(user: User): void;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  isEmailVerified: boolean;
  role?: 'user' | 'admin' | 'super_admin';
  adminPrivileges?: string[];
  tenantId?: string;
}

/**
 * Web implementation using localStorage
 */
export function createWebTokenStorage(): TokenStorage {
  const STORAGE_KEY = 'pl_auth';
  
  return {
    getAccessToken() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw).accessToken || null : null;
      } catch { return null; }
    },
    getRefreshToken() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw).refreshToken || null : null;
      } catch { return null; }
    },
    setTokens(accessToken, refreshToken) {
      try {
        const existing = localStorage.getItem(STORAGE_KEY);
        const parsed = existing ? JSON.parse(existing) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          ...parsed,
          accessToken,
          refreshToken,
        }));
      } catch {}
    },
    clearTokens() {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
    },
    getUser() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw).user || null : null;
      } catch { return null; }
    },
    setUser(user) {
      try {
        const existing = localStorage.getItem(STORAGE_KEY);
        const parsed = existing ? JSON.parse(existing) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          ...parsed,
          user,
        }));
      } catch {}
    },
  };
}

/**
 * Factory to create appropriate storage based on platform
 * For React Native and Electron main process, consumers should implement their own
 */
export function createTokenStorage(platform: 'web' | 'electron-renderer'): TokenStorage {
  switch (platform) {
    case 'web':
    case 'electron-renderer':
      return createWebTokenStorage();
    default:
      return createWebTokenStorage();
  }
}