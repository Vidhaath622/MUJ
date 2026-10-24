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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--paper)] backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="w-full max-w-md bg-[var(--paper)] border border-[var(--rule)] shadow-2xl overflow-hidden text-[var(--ink)]">
        <CardHeader className="border-b border-[var(--rule)] bg-[var(--panel)] p-5 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--teal-tint)] border border-[color:color-mix(in_srgb,var(--teal)_40%,transparent)] text-[var(--teal)]">
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
              <p className="text-[11px] text-[var(--ink-2)] font-mono mt-0.5">
                Local SQLite &amp; JWT session storage
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--panel)] text-[var(--ink-2)] hover:text-[var(--ink)] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          {currentUser ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[var(--panel)] border border-[var(--rule)] space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[var(--ink-2)]">Logged in as:</span>
                  <Badge variant="success" size="sm" dot>
                    ACTIVE SESSION
                  </Badge>
                </div>
                <div className="text-sm font-bold text-[var(--ink)] font-mono">{currentUser.email}</div>
                <div className="text-[11px] text-[var(--ink-2)] font-mono">User ID: {currentUser.id}</div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="default"
                  onClick={onLogout}
                  className="w-full border-[color:color-mix(in_srgb,var(--gen)_40%,transparent)] text-[var(--gen)] hover:bg-[var(--gen-tint)]"
                >
                  Log out
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Seeded Demo Account Quick Access */}
              <div className="p-3 rounded-xl bg-[var(--teal-tint)] border border-[color:color-mix(in_srgb,var(--teal)_40%,transparent)] flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[var(--teal)] block">Seeded Pitch Account</span>
                  <span className="text-[10px] font-mono text-[var(--ink-2)]">demo@ragseal.dev / demo1234</span>
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
                <div className="p-2.5 rounded-lg bg-[var(--gen-tint)] border border-[color:color-mix(in_srgb,var(--gen)_40%,transparent)] text-xs text-[var(--gen)] flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-mono text-[var(--ink-1)] font-medium flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[var(--ink-2)]" />
                    <span>Email Address:</span>
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@domain.com"
                    className="text-xs font-mono bg-[var(--paper)] border-[var(--rule)] text-[var(--ink)]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-mono text-[var(--ink-1)] font-medium flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[var(--ink-2)]" />
                    <span>Password:</span>
                  </label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="text-xs font-mono bg-[var(--paper)] border-[var(--rule)] text-[var(--ink)]"
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="default"
                  size="default"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-[var(--teal)] to-[var(--accent)] hover:from-[var(--teal)] hover:to-[var(--accent)] text-[var(--ink)] font-mono text-xs gap-1.5"
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
                  className="text-xs font-mono text-[var(--ink-2)] hover:text-[var(--ink)] transition"
                >
                  {mode === 'login' ? "Don't have an account? Register" : 'Already registered? Sign in'}
                </button>
              </div>
            </form>
          )}
        </CardContent>

        <CardFooter className="bg-[var(--panel)] p-4 border-t border-[var(--rule)] flex items-center justify-between text-[11px] font-mono text-[var(--ink-2)]">
          <span>Bearer JWT storage supported</span>
          <Button variant="ghost" size="xs" onClick={onClose} className="text-[var(--ink-2)] hover:text-[var(--ink)]">
            Cancel
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
