import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { LucideIcons } from '@/components/LucideIcons';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

export function Login({ onLogin }: { onLogin: (email: string, password: string) => Promise<any> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const result = await onLogin(email, password);
      if (result.success) {
        // Login successful - auth state will update via Redux
      } else if (result.requires2FA) {
        setShow2FA(true);
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="font-serif font-extrabold text-3xl tracking-tight mb-2">
            PrintLoop<span className="text-persimmon">.</span>
          </div>
          <p className="text-ink/50">Operator Console</p>
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {!show2FA && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@printshop.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
              </div>
            </>
          }
          
          {show2FA && (
            <div>
              <p className="text-sm text-ink/50 mb-2">Enter the 6-digit code from your authenticator app</p>
              <div className="flex gap-2">
                {[1,2,3,4,5,6].map((i) => (
                  <input
                    key={i}
                    type="text"
                    maxLength={1}
                    className="w-10 h-12 text-center text-2xl font-bold border-2 border-ink rounded-lg bg-paper focus:border-persimmon focus:outline-none"
                  />
                ))}
              </div>
            </div>
          )}
          
          <Button type="submit" className="w-full" variant="primary" disabled={loading}>
            {loading ? (
              <>
                <LucideIcons name="loader" size={18} className="mr-2 animate-spin" />
                Signing in...
              </>
            ) : show2FA ? (
              'Verify'
            ) : (
              'Sign In'
            )}
          </Button>
        </form>
        
        <div className="mt-6 text-center text-sm text-ink/50">
          <p>Don't have an account? <a href="/saas/signup" className="text-persimmon hover:underline font-medium">Create one</a></p>
          <p className="mt-2"><a href="/auth/forgot-password" className="text-persimmon hover:underline">Forgot password?</a></p>
        </div>
      </Card>
    </div>
  );
}

export default Login;