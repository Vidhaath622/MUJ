import React, { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { ApiError, loginUser, registerUser } from '../../../lib/api';
import { AuthUser } from '../../../types/ragseal';
import { ThemeToggle } from './ThemeToggle';

interface SignInScreenProps {
  onSignedIn: (user: AuthUser, token: string) => void;
  /** Shown when the backend could not be reached, so the form is not blamed for it. */
  backendDown?: boolean;
}

const DEMO = { email: 'demo@ragseal.dev', password: 'demo1234' };

/** Full-page sign-in, shown whenever there is no session (after sign-out, or if auto-login fails). */
export const SignInScreen: React.FC<SignInScreenProps> = ({ onSignedIn, backendDown }) => {
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'form' | 'demo' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'form' | 'demo', creds: { email: string; password: string }, register = false) => {
    setBusy(kind);
    setError(null);
    try {
      const auth = register ? await registerUser(creds.email, creds.password) : await loginUser(creds.email, creds.password);
      onSignedIn(auth.user, auth.access_token);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 401 ? 'That email and password don’t match.' : err.detail);
      } else {
        setError('Can’t reach the RAGSeal backend at the moment. Check it is running, then try again.');
      }
    } finally {
      setBusy(null);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    run('form', { email: email.trim(), password }, mode === 'register');
  };

  return (
    <div className="flex min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <section className="relative hidden flex-1 flex-col justify-between overflow-hidden border-r border-[var(--rule)] bg-[var(--panel)] p-12 lg:flex">
        <div className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em]">
          <SealMark size={26} />
          RAGSeal
        </div>
        <div className="max-w-[520px]">
          <AnimatedSeal />
          <h1 className="mt-10 text-[44px] leading-[1.08] tracking-[-0.02em] text-[var(--ink)]">
            Find out which half of your RAG bot broke.
          </h1>
          <p className="mt-5 max-w-[440px] text-[15px] leading-relaxed text-[var(--ink-2)]">
            RAGSeal tests the retriever and the generator apart, then replays every wrong answer with the correct text to prove
            who was at fault.
          </p>
        </div>
        <p className="text-xs text-[var(--muted)]">Problem statement AI-04 · Retriever and generator, tested apart</p>
      </section>

      <section className="flex flex-1 flex-col">
        <div className="flex justify-end p-4">
          <div className="w-[170px]">
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-[380px]">
            <div className="mb-8 flex items-center gap-2.5 lg:hidden">
              <SealMark size={24} />
              <span className="text-[15px] font-semibold">RAGSeal</span>
            </div>
            <h2 className="text-[28px] tracking-[-0.015em]">{mode === 'signin' ? 'Sign in' : 'Create an account'}</h2>
            <p className="mt-1.5 text-sm text-[var(--ink-2)]">
              {mode === 'signin' ? 'Your documents, test sets and runs are saved to your account.' : 'Takes ten seconds. Your runs stay private to you.'}
            </p>

            {backendDown && (
              <p className="mt-5 rounded-lg border border-[var(--retr)] bg-[var(--retr-tint)] px-3 py-2 text-[13px] text-[var(--ink-1)]">
                The backend isn’t answering yet. Sign-in will work once it’s up.
              </p>
            )}

            <button
              type="button"
              onClick={() => run('demo', DEMO)}
              disabled={busy !== null}
              className="mt-7 flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--ink)] text-sm font-semibold text-[var(--paper)] transition-colors hover:bg-[var(--ink-1)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === 'demo' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Use the demo account
              {busy !== 'demo' && <ArrowRight className="h-4 w-4" />}
            </button>

            <div className="my-6 flex items-center gap-3 text-xs text-[var(--muted)]">
              <span className="h-px flex-1 bg-[var(--rule)]" />
              or with email
              <span className="h-px flex-1 bg-[var(--rule)]" />
            </div>

            <form onSubmit={submit} className="space-y-3" noValidate>
              <label className="block">
                <span className="mb-1.5 block text-[13px] text-[var(--ink-1)]">Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-[10px] border border-[var(--rule-2)] bg-[var(--panel)] px-3.5 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
                  placeholder="you@team.dev"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] text-[var(--ink-1)]">Password</span>
                <input
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 w-full rounded-[10px] border border-[var(--rule-2)] bg-[var(--panel)] px-3.5 text-sm text-[var(--ink)] outline-none transition-colors focus:border-[var(--accent)]"
                />
              </label>
              {error && (
                <p role="alert" className="text-[13px] text-[var(--gen)]">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={busy !== null}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--rule-2)] bg-[var(--panel)] text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === 'form' && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <p className="mt-6 text-center text-[13px] text-[var(--ink-2)]">
              {mode === 'signin' ? 'New here?' : 'Already have an account?'}{' '}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'signin' ? 'register' : 'signin');
                  setError(null);
                }}
                className="font-medium text-[var(--accent)] underline-offset-4 hover:underline"
              >
                {mode === 'signin' ? 'Create an account' : 'Sign in instead'}
              </button>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

const SealMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 2.5l7.5 3v6c0 4.6-3.2 8.4-7.5 10-4.3-1.6-7.5-5.4-7.5-10v-6l7.5-3z" stroke="var(--ink)" strokeWidth="1.6" />
    <path d="M8.5 12.2l2.4 2.4 4.6-4.8" stroke="var(--ok)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** A rubber-stamp seal that draws its ring, then its tick, then lands. */
const AnimatedSeal: React.FC = () => (
  <svg width="112" height="112" viewBox="0 0 120 120" role="img" aria-label="RAGSeal verified seal" className="signin-seal">
    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--ok)" strokeWidth="3" className="signin-seal-ring" pathLength={1} />
    <circle cx="60" cy="60" r="44" fill="none" stroke="var(--ok)" strokeWidth="1.2" strokeDasharray="2 5" className="signin-seal-dots" />
    <path d="M40 61l13 13 27-28" fill="none" stroke="var(--ok)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="signin-seal-tick" pathLength={1} />
  </svg>
);
