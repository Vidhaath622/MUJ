import React, { useEffect, useRef, useState } from 'react';
import { ApiError, loginWithGoogle } from '../../../lib/api';
import { AuthUser } from '../../../types/ragseal';

// Google Identity Services: the official "Sign in with Google" button. It hands back an ID token
// (the credential), which the backend verifies before issuing our own session token.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || '';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

interface GoogleId {
  initialize: (config: { client_id: string; callback: (r: { credential?: string }) => void; ux_mode?: 'popup' }) => void;
  renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let loading: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('gsi'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

function friendly(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Google couldn’t confirm that sign-in. Please try again.';
    if (err.status === 409) return 'This email is already linked to a different Google account.';
    if (err.status === 503) return 'Google sign-in isn’t set up on this server yet. Use email or the demo account.';
    return err.detail;
  }
  return 'Can’t reach the RAGSeal backend at the moment. Check it is running, then try again.';
}

interface Props {
  onSignedIn: (user: AuthUser, token: string) => void;
  onError: (message: string | null) => void;
  /** Pixel width of the button; GIS accepts 200–400. */
  width?: number;
}

/** Renders nothing when VITE_GOOGLE_CLIENT_ID is unset, so the sign-in screens stay as they were. */
export const GoogleSignInButton: React.FC<Props> = ({ onSignedIn, onError, width = 380 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const handlers = useRef({ onSignedIn, onError });
  handlers.current = { onSignedIn, onError };

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    const theme = document.documentElement.dataset.theme === 'dark' ? 'filled_black' : 'outline';
    loadGsi()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          ux_mode: 'popup',
          callback: async ({ credential }) => {
            if (!credential) return;
            handlers.current.onError(null);
            try {
              const auth = await loginWithGoogle(credential);
              handlers.current.onSignedIn(auth.user, auth.access_token);
            } catch (err) {
              handlers.current.onError(friendly(err));
            }
          },
        });
        window.google.accounts.id.renderButton(ref.current, {
          type: 'standard',
          theme,
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          width: Math.min(400, Math.max(200, width)),
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [width]);

  if (!CLIENT_ID) return null;
  if (failed) {
    return <p className="text-center text-[12px] text-[var(--muted)]">Google sign-in couldn’t load. Use email instead.</p>;
  }
  return <div ref={ref} data-testid="google-signin" className="flex min-h-[44px] w-full justify-center" />;
};

export const googleSignInEnabled = Boolean(CLIENT_ID);
