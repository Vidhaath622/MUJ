import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ThemeToggle } from './ThemeToggle';
import {
  BookOpen,
  FlaskConical,
  MessagesSquare,
  GitCompareArrows,
  LayoutDashboard,
  ListChecks,
  PlayCircle,
  Radar,
  ScanSearch,
  ShieldCheck,
  Stamp,
  Tags,
  User,
} from 'lucide-react';
import { judgePool } from '../shared/apiExtra';
import { cn } from '../../../lib/utils';
import { AuthUser } from '../../../types/ragseal';
import { HealthResponse } from '../../../lib/api';

export type Route = 'bots' | 'overview' | 'diagnose' | 'runs' | 'testsets' | 'impact' | 'label' | 'trust' | 'compare' | 'seal' | 'learn';

interface NavItem {
  id: Route;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Story order: understand it, try it, dig into one answer, bring your own docs, run at scale,
// then prove the checker itself can be trusted.
const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Use it',
    items: [
      { id: 'overview', label: 'Start here', hint: 'What RAGSeal does, in one picture', icon: LayoutDashboard },
      { id: 'bots', label: 'Try a chatbot', hint: 'Ask a bot; every reply gets checked', icon: MessagesSquare },
      { id: 'diagnose', label: 'Diagnose answers', hint: 'See why a single answer went wrong', icon: ScanSearch },
      { id: 'testsets', label: 'Documents & questions', hint: 'Upload a document, generate test questions', icon: FlaskConical },
      { id: 'impact', label: 'Change impact', hint: 'What a document update breaks for users today', icon: Radar },
      { id: 'runs', label: 'Run a full test', hint: 'Check every question in a pack at once', icon: PlayCircle },
    ],
  },
  {
    group: 'Trust the checker',
    items: [
      { id: 'label', label: 'Label answers', hint: 'Humans mark answers right or wrong', icon: Tags },
      { id: 'trust', label: 'Can you trust the checker?', hint: 'Does RAGSeal agree with humans?', icon: ListChecks },
      { id: 'compare', label: 'Compare versions', hint: 'Did a change make the bot better or worse?', icon: GitCompareArrows },
      { id: 'seal', label: 'The Seal', hint: 'A certificate and badge for a tested bot', icon: Stamp },
    ],
  },
  { group: 'Learn', items: [{ id: 'learn', label: 'How it works', hint: 'The pipeline, step by step', icon: BookOpen }] },
];

export const ROUTE_TITLE: Record<Route, string> = {
  bots: 'Try a chatbot',
  overview: 'Start here',
  diagnose: 'Diagnose answers',
  runs: 'Run a full test',
  testsets: 'Documents & questions',
  impact: 'Change impact',
  label: 'Label answers',
  trust: 'Can you trust the checker?',
  compare: 'Compare versions',
  seal: 'The Seal',
  learn: 'How it works',
};

/** One plain sentence under each page title: what the page is for and what to do. */
export const ROUTE_BLURB: Record<Route, string> = {
  overview: 'RAGSeal tests a chatbot that answers from documents and tells you which part broke when it\u2019s wrong.',
  bots: 'Ask a sample chatbot anything. Each reply is checked: did it find the right text, stick to it, and get it right?',
  diagnose: 'Pick a question on the left to see the text the bot found, its answer, and who is to blame.',
  testsets: 'Upload a document, read it, then generate test questions with known answers and check them.',
  impact: 'Pick an old and a new version of a document. RAGSeal finds what changed, writes a test for each change and shows which answers still give the old fact.',
  runs: 'Run every question in a pack in one go and watch the progress.',
  label: 'Mark the bot\u2019s answers right or wrong yourself. We compare your labels with RAGSeal\u2019s.',
  trust: 'Evidence that RAGSeal\u2019s verdicts can be trusted: agreement with humans, planted failures, and stability.',
  compare: 'Run two versions of the bot on the same questions and see whether the change helped or hurt.',
  seal: 'A certificate for one bot, from its latest full test, with a badge you can paste anywhere.',
  learn: 'The full pipeline, explained step by step.',
};

const ROUTES = new Set<Route>(Object.keys(ROUTE_TITLE) as Route[]);

/** Hash routing: #/diagnose, #/runs?batch=batch_x. No router dependency. */
export function useHashRoute(): { route: Route; params: URLSearchParams; go: (r: Route, params?: Record<string, string>) => void } {
  const parse = () => {
    const raw = window.location.hash.replace(/^#\/?/, '');
    const [path, query] = raw.split('?');
    const route = (ROUTES.has(path as Route) ? path : 'overview') as Route;
    return { route, params: new URLSearchParams(query ?? '') };
  };
  const [state, setState] = useState(parse);
  useEffect(() => {
    const onHash = () => setState(parse());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (r: Route, params?: Record<string, string>) => {
    const qs = params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : '';
    window.location.hash = `#/${r}${qs}`;
  };
  return { ...state, go };
}

const TOP_BAR_SLOT = 'ragseal-topbar-slot';

/** Lets a page put its own controls (pack switcher, primary action) in the shell's top bar. */
export const TopBarControls: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById(TOP_BAR_SLOT)), []);
  return slot ? createPortal(children, slot) : null;
};

interface AppShellProps {
  route: Route;
  onNavigate: (r: Route) => void;
  health: HealthResponse | null;
  live: boolean;
  user: AuthUser | null;
  onOpenAuth: () => void;
  /** Slim per-page bar: title on the left, page controls on the right. */
  topBarControls?: React.ReactNode;
  topBarTitle?: React.ReactNode;
  /** Pages that fit one screen get a fixed-height main area; others scroll. */
  fitScreen?: boolean;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  route,
  onNavigate,
  health,
  live,
  user,
  onOpenAuth,
  topBarControls,
  topBarTitle,
  fitScreen,
  children,
}) => (
  <div className="flex h-screen overflow-hidden bg-[var(--paper)] text-[var(--ink)]">
    <aside className="flex w-[60px] shrink-0 flex-col border-r border-[var(--rule)] bg-[var(--paper)] lg:w-[232px]">
      <div className="flex h-14 items-center gap-2.5 px-[19px] lg:px-5">
        <ShieldCheck className="h-[22px] w-[22px] shrink-0 text-[var(--ink)]" strokeWidth={1.6} />
        <span className="hidden text-[15px] font-semibold tracking-[-0.01em] lg:inline">RAGSeal</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-4 pt-2 lg:px-3">
        {NAV.map((g) => (
          <div key={g.group} className="mb-5">
            <div className="mb-1.5 hidden px-2.5 text-[11px] font-medium text-[var(--muted)] lg:block">{g.group}</div>
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const active = route === item.id;
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <a
                      href={`#/${item.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        onNavigate(item.id);
                      }}
                      aria-current={active ? 'page' : undefined}
                      data-tour={`nav-${item.id}`}
                      title={`${item.label}: ${item.hint}`}
                      className={cn(
                        'flex h-9 items-center justify-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors lg:justify-start',
                        active
                          ? 'bg-[var(--panel-3)] text-[var(--ink)] shadow-[inset_0_1px_0_rgba(27,27,24,0.04)]'
                          : 'text-[var(--ink-2)] hover:bg-[color:color-mix(in_srgb,var(--ink)_3%,transparent)] hover:text-[var(--ink)]'
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-[var(--ink)]' : 'text-[var(--muted)]')} />
                      <span className="hidden truncate lg:inline">{item.label}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--rule)] p-3">
        <ModelStatus live={live} health={health} />
        <ThemeToggle />
        <button
          onClick={() => window.dispatchEvent(new Event('ragseal:tour'))}
          className="flex h-9 w-full items-center justify-center gap-2.5 rounded-lg px-2.5 text-[13px] text-[var(--ink-1)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--ink)_3%,transparent)] lg:justify-start"
          title="Show the guided tour"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--rule)] text-[12px] font-semibold text-[var(--ink)]">?</span>
          <span className="hidden lg:inline">Guided tour</span>
        </button>
        <button
          onClick={onOpenAuth}
          className="flex h-9 w-full items-center justify-center gap-2.5 rounded-lg px-2.5 text-[13px] text-[var(--ink-1)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--ink)_3%,transparent)] lg:justify-start"
          title={user?.email ?? 'Sign in'}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--panel-2)] text-[11px] font-medium text-[var(--ink)]">
            {user ? user.email[0].toUpperCase() : <User className="h-3.5 w-3.5" />}
          </span>
          <span className="hidden truncate lg:inline">{user ? user.email.split('@')[0] : 'Sign in'}</span>
        </button>
      </div>
    </aside>

    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex min-h-14 shrink-0 items-center gap-4 border-b border-[var(--rule)] px-6 py-2">
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--ink)]">{topBarTitle ?? ROUTE_TITLE[route]}</h1>
          <p className="truncate text-xs text-[var(--ink-2)]">{ROUTE_BLURB[route]}</p>
        </div>
        <div id={TOP_BAR_SLOT} className="ml-auto flex min-w-0 items-center gap-3">
          {topBarControls}
        </div>
      </header>
      <main className={cn('min-h-0 flex-1', fitScreen ? 'overflow-hidden' : 'overflow-y-auto')}>{children}</main>
    </div>
  </div>
);

/** Which chatbot and grading model the backend actually has loaded, straight from /api/health. */
const ModelStatus: React.FC<{ live: boolean; health: HealthResponse | null }> = ({ live, health }) => {
  if (!live || !health) {
    return (
      <div className="flex items-center justify-center gap-2 px-2.5 text-xs text-[var(--gen)] lg:justify-start">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gen)]" />
        <span className="hidden lg:inline">Backend offline</span>
      </div>
    );
  }
  const gen = health.models?.generator;
  const judge = health.models?.judge;
  const ready = health.engine_ready && gen?.ready !== false && judge?.ready !== false;
  const judgeName = (judge?.name ?? health.judge_model ?? 'judge').split('/').pop();
  const pool = judgePool(health);
  const poolText = pool.members.map((m) => `${m.name} (${m.role ?? 'judge'})`).join(', ');
  return (
    <div
      className="flex items-start justify-center gap-2.5 px-2.5 text-xs lg:justify-start"
      title={
        [gen?.error, judge?.error, health.engine_error].filter(Boolean).join(' · ') ||
        `All models ready${poolText ? `. Grading models: ${poolText}` : ''}`
      }
    >
      <span
        className={cn(
          'mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full',
          ready ? 'bg-[var(--ok)] shadow-[0_0_0_3px_rgba(61,214,140,0.15)]' : 'bg-[var(--retr)] shadow-[0_0_0_3px_rgba(245,165,36,0.15)]'
        )}
      />
      <div className="hidden min-w-0 leading-relaxed lg:block">
        <div className="truncate text-[var(--ink-2)]">
          Chatbot model <span className="font-mono text-[var(--ink-1)]">{gen?.name ?? health.generator_model ?? '—'}</span>
        </div>
        <div className="truncate text-[var(--ink-2)]">
          Grading model <span className="font-mono text-[var(--ink-1)]">{judgeName}</span>
          {pool.keys != null && pool.keys > 1 && <span className="text-[var(--muted)]"> ×{pool.keys} keys</span>}
        </div>
      </div>
    </div>
  );
};
