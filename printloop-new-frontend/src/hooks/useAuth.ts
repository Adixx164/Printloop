import { useSelector } from 'react-redux';
import type { RootState } from '@/store';

export function useAuth() {
  const accessToken = useSelector((state: RootState) => state.auth.accessToken);
  const user = useSelector((state: RootState) => state.auth.user);
  
  return {
    accessToken,
    user,
    isAuthenticated: !!accessToken,
  };
}