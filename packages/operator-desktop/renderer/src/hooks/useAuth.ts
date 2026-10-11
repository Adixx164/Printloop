import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '@/store';
import { logOut, setCredentials } from './features/auth/authSlice';
import { operatorApi } from '@printloop/shared/operator-api';

export function useAuth() {
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((state: RootState) => state.auth.user);
  const accessToken = useSelector((state: RootState) => state.auth.accessToken);
  const refreshToken = useSelector((state: RootState) => state.auth.refreshToken);
  
  const isAuthenticated = !!accessToken && !!user;
  
  const login = async (email: string, password: string) => {
    try {
      const result = await dispatch(operatorApi.endpoints.login.initiate({ email, password })).unwrap();
      const data = result?.data || result;
      if (data?.tokens) {
        dispatch(setCredentials(data));
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.data?.message || 'Login failed' };
    }
  };
  
  const logout = () => {
    dispatch(logOut());
  };
  
  return {
    user,
    accessToken,
    refreshToken,
    isAuthenticated,
    login,
    logout,
  };
}