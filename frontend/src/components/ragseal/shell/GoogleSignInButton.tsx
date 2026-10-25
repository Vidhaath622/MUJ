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
}

/** Follows the site theme, so the button is re-rendered dark or light when the toggle flips. */
function useSiteTheme(): 'dark' | 'light' {
  const read = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const [theme, setTheme] = useState<'dark' | 'light'>(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

/**
 * Renders nothing when VITE_GOOGLE_CLIENT_ID is unset, so the sign-in screens stay as they were.
 * The button takes the full width of its box (GIS allows 200–400 px) and sits flush: the host is
 * light colour-scheme, see .gsi-host in index.css.
 */
export const GoogleSignInButton: React.FC<Props> = ({ onSignedIn, onError }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);
  const theme = useSiteTheme();
  const handlers = useRef({ onSignedIn, onError });
  handlers.current = { onSignedIn, onError };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!CLIENT_ID || !width) return;
    let cancelled = false;
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
        ref.current.replaceChildren();
        window.google.accounts.id.renderButton(ref.current, {
          type: 'standard',
          theme: theme === 'dark' ? 'filled_black' : 'outline',
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
  }, [width, theme]);

  if (!CLIENT_ID) return null;
  if (failed) {
    return <p className="text-center text-[0.8125rem] text-[var(--muted)]">Google sign-in couldn’t load. Use email instead.</p>;
  }
  return <div ref={ref} data-testid="google-signin" className="gsi-host flex min-h-[44px] w-full items-center justify-center overflow-hidden rounded-[10px]" />;
};

export const googleSignInEnabled = Boolean(CLIENT_ID);
