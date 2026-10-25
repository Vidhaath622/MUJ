import React, { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { ApiError, loginUser, registerUser } from '../../../lib/api';
import { AuthUser } from '../../../types/ragseal';
import { ThemeToggle } from './ThemeToggle';
import { GoogleSignInButton } from './GoogleSignInButton';
import { FitStage, LivingBackdrop, SignInTrace } from './SignInTrace';

interface SignInScreenProps {
  onSignedIn: (user: AuthUser, token: string) => void;
  /** Shown when the backend could not be reached, so the form is not blamed for it. */
  backendDown?: boolean;
  /** A real account remembered on this device: offered as one click instead of signing in again. */
  remembered?: { user: AuthUser; token: string } | null;
  onForget?: () => void;
}

// Verified figures only (README and RESULTS.md): the pack total, and agreement with the human consensus.
const PROOF = [
  { value: '509', label: 'test questions' },
  { value: '95%', label: 'agreement with humans' },
  { value: '0', label: 'false passes' },
];

const DEMO = { email: 'demo@ragseal.dev', password: 'demo1234' };

/** Full-page sign-in: the first screen of every new browser session, and where signing out lands. */
export const SignInScreen: React.FC<SignInScreenProps> = ({ onSignedIn, backendDown, remembered, onForget }) => {
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

  // Staggered entrance: each block's --i sets its delay (see .signin-rise in index.css).
  const rise = (i: number) => ({ style: { '--i': i } as React.CSSProperties });
  const inputClass =
    'signin-input h-11 w-full rounded-[10px] border border-[var(--rule-2)] bg-[var(--panel)] px-3.5 text-sm text-[var(--ink)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[var(--muted)] focus:border-[var(--accent)]';

  return (
    <div className="flex min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <section className="sticky top-0 hidden h-screen min-w-0 flex-[1.15] flex-col overflow-hidden border-r border-[var(--rule)] bg-[var(--panel)] px-12 py-10 lg:flex">
        <LivingBackdrop />
        <div className="relative flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em]">
          <SealMark size={26} />
          RAGSeal
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col justify-center gap-7 py-6 xl:gap-9">
          <div className="max-w-[560px]">
            <h1 className="signin-rise text-[44px] leading-[1.06] tracking-[-0.02em] text-[var(--ink)] xl:text-[50px]">
              Find out which half of your RAG bot broke.
            </h1>
            <p className="signin-rise mt-5 max-w-[460px] text-[15px] leading-relaxed text-[var(--ink-2)]" style={{ '--i': 1 } as React.CSSProperties}>
              RAGSeal tests the retriever and the generator apart, then replays every wrong answer with the correct text to prove
              who was at fault.
            </p>
            <dl className="signin-rise mt-7 flex gap-7" style={{ '--i': 2 } as React.CSSProperties}>
              {PROOF.map((p, i) => (
                <div key={p.label} className={i ? 'border-l border-[var(--rule-2)] pl-7' : ''}>
                  <dt className="font-report text-[26px] leading-none text-[var(--ink)]">{p.value}</dt>
                  <dd className="mt-1.5 text-[12px] text-[var(--ink-2)]">{p.label}</dd>
                </div>
              ))}
            </dl>
          </div>
          <FitStage align="start" className="max-h-[420px] min-h-[200px] flex-1">
            <SignInTrace />
          </FitStage>
        </div>
        <p className="relative text-xs text-[var(--muted)]">Problem statement AI-04 · Retriever and generator, tested apart</p>
      </section>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex justify-end p-4">
          <div className="w-[170px]">
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full min-w-0 max-w-[380px]">
            <div className="mb-6 lg:hidden">
              <div className="mb-5 flex items-center gap-2.5">
                <SealMark size={24} />
                <span className="text-[15px] font-semibold">RAGSeal</span>
              </div>
              <div className="relative overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--panel)] p-4">
                <LivingBackdrop />
                <FitStage className="h-[190px]">
                  <SignInTrace />
                </FitStage>
              </div>
              <p className="mt-4 font-report text-[22px] leading-snug">Find out which half of your RAG bot broke.</p>
            </div>
            <h2 {...rise(0)} className="signin-rise text-[28px] tracking-[-0.015em]">
              {remembered ? 'Welcome back' : mode === 'signin' ? 'Sign in' : 'Create an account'}
            </h2>
            <p {...rise(1)} className="signin-rise mt-1.5 text-sm text-[var(--ink-2)]">
              {mode === 'signin' ? 'Your documents, test sets and runs are saved to your account.' : 'Takes ten seconds. Your runs stay private to you.'}
            </p>

            {backendDown && (
              <p className="mt-5 rounded-lg border border-[var(--retr)] bg-[var(--retr-tint)] px-3 py-2 text-[13px] text-[var(--ink-1)]">
                The backend isn’t answering yet. Sign-in will work once it’s up.
              </p>
            )}

            {remembered && (
              <div {...rise(2)} className="signin-rise mt-7">
                <button
                  type="button"
                  onClick={() => onSignedIn(remembered.user, remembered.token)}
                  disabled={busy !== null}
                  className="group flex h-14 w-full items-center gap-3 rounded-[12px] bg-[var(--ink)] px-4 text-left text-[var(--paper)] transition-colors hover:bg-[var(--ink-1)] disabled:opacity-60"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--paper)] text-[13px] font-semibold uppercase text-[var(--ink)]">
                    {remembered.user.email.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] opacity-70">Continue as</span>
                    <span className="block truncate text-sm font-semibold">{remembered.user.email}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </button>
                <p className="mt-2 text-right text-[12px] text-[var(--ink-2)]">
                  Not you?{' '}
                  <button type="button" onClick={onForget} className="font-medium text-[var(--accent)] underline-offset-4 hover:underline">
                    Sign out
                  </button>
                </p>
              </div>
            )}

            <div {...rise(3)} className={`signin-rise ${remembered ? 'mt-4' : 'mt-7'}`}>
              <button
                type="button"
                onClick={() => run('demo', DEMO)}
                disabled={busy !== null}
                className={`flex h-11 w-full items-center justify-center gap-2 rounded-[10px] text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  remembered
                    ? 'border border-[var(--rule-2)] bg-[var(--panel)] text-[var(--ink)] hover:border-[var(--ink-2)]'
                    : 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink-1)]'
                }`}
              >
                {busy === 'demo' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Use the demo account
                {busy !== 'demo' && <ArrowRight className="h-4 w-4" />}
              </button>
            </div>

            <div {...rise(4)} className="signin-rise mt-3">
              <GoogleSignInButton onSignedIn={onSignedIn} onError={setError} />
            </div>

            <div {...rise(5)} className="signin-rise my-6 flex items-center gap-3 text-xs text-[var(--muted)]">
              <span className="h-px flex-1 bg-[var(--rule)]" />
              or with email
              <span className="h-px flex-1 bg-[var(--rule)]" />
            </div>

            <form {...rise(6)} onSubmit={submit} className="signin-rise space-y-3" noValidate>
              <label className="block">
                <span className="mb-1.5 block text-[13px] text-[var(--ink-1)]">Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
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
                  className={inputClass}
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

            <p {...rise(7)} className="signin-rise mt-6 text-center text-[13px] text-[var(--ink-2)]">
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
