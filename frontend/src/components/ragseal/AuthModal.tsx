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
  AlertCircle 
} from 'lucide-react';
import { AuthUser } from '../../types/ragseal';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  onLogin: (user: AuthUser) => void;
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

  if (!isOpen) return null;

  const handleUseDemoAccount = () => {
    setEmail('demo@ragseal.dev');
    setPassword('demo1234');
    onLogin({
      id: 'usr_seeded_demo',
      email: 'demo@ragseal.dev',
      name: 'RAGSeal Lead Judge Demo',
    });
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please provide both email and password.');
      return;
    }

    onLogin({
      id: `usr_${Date.now()}`,
      email: email.trim(),
      name: email.split('@')[0],
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="w-full max-w-md bg-[#090d16] border border-neutral-800 shadow-2xl overflow-hidden text-neutral-100">
        <CardHeader className="border-b border-neutral-800/80 bg-neutral-950/80 p-5 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-950/60 border border-teal-800/40 text-teal-400">
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
              <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
                Local SQLite &amp; JWT session storage
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          {currentUser ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-neutral-400">Logged in as:</span>
                  <Badge variant="success" size="sm" dot>
                    ACTIVE SESSION
                  </Badge>
                </div>
                <div className="text-sm font-bold text-white font-mono">{currentUser.email}</div>
                <div className="text-[11px] text-neutral-400 font-mono">User ID: {currentUser.id}</div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="default"
                  onClick={onLogout}
                  className="w-full border-rose-900/60 text-rose-300 hover:bg-rose-950/30"
                >
                  Log out
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Seeded Demo Account Quick Access */}
              <div className="p-3 rounded-xl bg-teal-950/30 border border-teal-800/60 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-teal-300 block">Seeded Pitch Account</span>
                  <span className="text-[10px] font-mono text-neutral-400">demo@ragseal.dev / demo1234</span>
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
                <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800 text-xs text-rose-300 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-mono text-neutral-300 font-medium flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Email Address:</span>
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@domain.com"
                    className="text-xs font-mono bg-black/60 border-neutral-800 text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-mono text-neutral-300 font-medium flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Password:</span>
                  </label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="text-xs font-mono bg-black/60 border-neutral-800 text-white"
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="default"
                  size="default"
                  className="w-full bg-gradient-to-r from-teal-500 to-sky-600 hover:from-teal-600 hover:to-sky-700 text-white font-mono text-xs"
                >
                  {mode === 'login' ? 'Sign In to Workspace' : 'Create & Log In'}
                </Button>
              </div>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                  className="text-xs font-mono text-neutral-400 hover:text-white transition"
                >
                  {mode === 'login' ? "Don't have an account? Register" : 'Already registered? Sign in'}
                </button>
              </div>
            </form>
          )}
        </CardContent>

        <CardFooter className="bg-neutral-950/80 p-4 border-t border-neutral-800/80 flex items-center justify-between text-[11px] font-mono text-neutral-400">
          <span>Bearer JWT storage supported</span>
          <Button variant="ghost" size="xs" onClick={onClose} className="text-neutral-400 hover:text-white">
            Cancel
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
