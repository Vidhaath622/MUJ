import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { 
  ShieldCheck, 
  X, 
  Lock, 
  Mail, 
  Sparkles, 
  AlertCircle,
  RotateCw 
} from 'lucide-react';
import { AuthUser } from '../../types/ragseal';
import { loginUser, registerUser, ApiError } from '../../lib/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  onLogin: (user: AuthUser, token?: string) => void;
  onLogout: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLogin,
  onLogout,
}) => {
  const [email, setEmail] = useState('demo@ragseal.dev');
  const [password, setPassword] = useState('demo1234');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleUseDemoAccount = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const auth = await loginUser('demo@ragseal.dev', 'demo1234');
      onLogin(auth.user, auth.access_token);
      onClose();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.detail : 'Could not sign in with demo user.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError('Please provide both email and password.');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'login') {
        const auth = await loginUser(email.trim(), password.trim());
        onLogin(auth.user, auth.access_token);
        onClose();
      } else {
        const auth = await registerUser(email.trim(), password.trim());
        onLogin(auth.user, auth.access_token);
        onClose();
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError(err.message || 'Authentication request failed.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#F6F3EC] backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="w-full max-w-md bg-[#F6F3EC] border border-[#E3DED3] shadow-2xl overflow-hidden text-[#1B1B18]">
        <CardHeader className="border-b border-[#E3DED3] bg-[#FBF9F4] p-5 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#E2EFEC] border border-[#1F6F6A]/40 text-[#1F6F6A]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">
                  {currentUser ? 'User Account & Session' : mode === 'login' ? 'Sign in to RAGSeal' : 'Create Account'}
                </CardTitle>
                <Badge variant="neon" size="sm">
                  v2 Auth
                </Badge>
              </div>
              <p className="text-[11px] text-[#5E5B53] font-mono mt-0.5">
                Local SQLite &amp; JWT session storage
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#FBF9F4] text-[#5E5B53] hover:text-[#1B1B18] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          {currentUser ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#FBF9F4] border border-[#E3DED3] space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#5E5B53]">Logged in as:</span>
                  <Badge variant="success" size="sm" dot>
                    ACTIVE SESSION
                  </Badge>
                </div>
                <div className="text-sm font-bold text-[#1B1B18] font-mono">{currentUser.email}</div>
                <div className="text-[11px] text-[#5E5B53] font-mono">User ID: {currentUser.id}</div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="default"
                  onClick={onLogout}
                  className="w-full border-[#B3261E]/40 text-[#B3261E] hover:bg-[#F6E3E0]"
                >
                  Log out
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Seeded Demo Account Quick Access */}
              <div className="p-3 rounded-xl bg-[#E2EFEC] border border-[#1F6F6A]/40 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#1F6F6A] block">Seeded Pitch Account</span>
                  <span className="text-[10px] font-mono text-[#5E5B53]">demo@ragseal.dev / demo1234</span>
                </div>
                <Button
                  type="button"
                  variant="glow"
                  size="xs"
                  onClick={handleUseDemoAccount}
                  className="text-xs font-mono gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Use Demo</span>
                </Button>
              </div>

              {error && (
                <div className="p-2.5 rounded-lg bg-[#F6E3E0] border border-[#B3261E]/40 text-xs text-[#B3261E] flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-mono text-[#33322D] font-medium flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[#5E5B53]" />
                    <span>Email Address:</span>
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@domain.com"
                    className="text-xs font-mono bg-[#F6F3EC] border-[#E3DED3] text-[#1B1B18]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-mono text-[#33322D] font-medium flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#5E5B53]" />
                    <span>Password:</span>
                  </label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="text-xs font-mono bg-[#F6F3EC] border-[#E3DED3] text-[#1B1B18]"
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="default"
                  size="default"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-[#1F6F6A] to-[#2F5D8A] hover:from-[#1F6F6A] hover:to-[#2F5D8A] text-[#1B1B18] font-mono text-xs gap-1.5"
                >
                  {isLoading ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{mode === 'login' ? 'Signing in...' : 'Registering...'}</span>
                    </>
                  ) : (
                    <span>{mode === 'login' ? 'Sign In to Workspace' : 'Create & Log In'}</span>
                  )}
                </Button>
              </div>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                  className="text-xs font-mono text-[#5E5B53] hover:text-[#1B1B18] transition"
                >
                  {mode === 'login' ? "Don't have an account? Register" : 'Already registered? Sign in'}
                </button>
              </div>
            </form>
          )}
        </CardContent>

        <CardFooter className="bg-[#FBF9F4] p-4 border-t border-[#E3DED3] flex items-center justify-between text-[11px] font-mono text-[#5E5B53]">
          <span>Bearer JWT storage supported</span>
          <Button variant="ghost" size="xs" onClick={onClose} className="text-[#5E5B53] hover:text-[#1B1B18]">
            Cancel
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
