import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  FlaskConical,
  MessagesSquare,
  GitCompareArrows,
  LayoutDashboard,
  ListChecks,
  PlayCircle,
  ScanSearch,
  ShieldCheck,
  Tags,
  User,
} from 'lucide-react';
import { judgePool } from '../shared/apiExtra';
import { cn } from '../../../lib/utils';
import { AuthUser } from '../../../types/ragseal';
import { HealthResponse } from '../../../lib/api';

export type Route = 'bots' | 'overview' | 'diagnose' | 'runs' | 'testsets' | 'label' | 'trust' | 'compare' | 'learn';

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
      { id: 'runs', label: 'Run a full test', hint: 'Check every question in a pack at once', icon: PlayCircle },
    ],
  },
  {
    group: 'Trust the checker',
    items: [
      { id: 'label', label: 'Label answers', hint: 'Humans mark answers right or wrong', icon: Tags },
      { id: 'trust', label: 'Can you trust the checker?', hint: 'Does RAGSeal agree with humans?', icon: ListChecks },
      { id: 'compare', label: 'Compare versions', hint: 'Did a change make the bot better or worse?', icon: GitCompareArrows },
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
  label: 'Label answers',
  trust: 'Can you trust the checker?',
  compare: 'Compare versions',
  learn: 'How it works',
};

/** One plain sentence under each page title: what the page is for and what to do. */
export const ROUTE_BLURB: Record<Route, string> = {
  overview: 'RAGSeal tests a chatbot that answers from documents and tells you which part broke when it\u2019s wrong.',
  bots: 'Ask a sample chatbot anything. Each reply is checked: did it find the right text, stick to it, and get it right?',
  diagnose: 'Pick a question on the left to see the text the bot found, its answer, and who is to blame.',
  testsets: 'Upload a document, read it, then generate test questions with known answers and check them.',
  runs: 'Run every question in a pack in one go and watch the progress.',
  label: 'Mark the bot\u2019s answers right or wrong yourself. We compare your labels with RAGSeal\u2019s.',
  trust: 'Evidence that RAGSeal\u2019s verdicts can be trusted: agreement with humans, planted failures, and stability.',
  compare: 'Run two versions of the bot on the same questions and see whether the change helped or hurt.',
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
  <div className="flex h-screen overflow-hidden bg-[#F6F3EC] text-[#1B1B18]">
    <aside className="flex w-[60px] shrink-0 flex-col border-r border-[#E3DED3] bg-[#F6F3EC] lg:w-[232px]">
      <div className="flex h-14 items-center gap-2.5 px-[19px] lg:px-5">
        <ShieldCheck className="h-[22px] w-[22px] shrink-0 text-[#1B1B18]" strokeWidth={1.6} />
        <span className="hidden text-[15px] font-semibold tracking-[-0.01em] lg:inline">RAGSeal</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-4 pt-2 lg:px-3">
        {NAV.map((g) => (
          <div key={g.group} className="mb-5">
            <div className="mb-1.5 hidden px-2.5 text-[11px] font-medium text-[#6E6A62] lg:block">{g.group}</div>
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
                      title={`${item.label}: ${item.hint}`}
                      className={cn(
                        'flex h-9 items-center justify-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors lg:justify-start',
                        active
                          ? 'bg-[#EFEBE2] text-[#1B1B18] shadow-[inset_0_1px_0_rgba(27,27,24,0.04)]'
                          : 'text-[#5E5B53] hover:bg-[#1B1B18]/[0.03] hover:text-[#1B1B18]'
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-[#1B1B18]' : 'text-[#6E6A62]')} />
                      <span className="hidden truncate lg:inline">{item.label}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[#E3DED3] p-3">
        <ModelStatus live={live} health={health} />
        <button
          onClick={onOpenAuth}
          className="mt-2 flex h-9 w-full items-center justify-center gap-2.5 rounded-lg px-2.5 text-[13px] text-[#33322D] transition-colors hover:bg-[#1B1B18]/[0.03] lg:justify-start"
          title={user?.email ?? 'Sign in'}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ECE7DC] text-[11px] font-medium text-[#1B1B18]">
            {user ? user.email[0].toUpperCase() : <User className="h-3.5 w-3.5" />}
          </span>
          <span className="hidden truncate lg:inline">{user ? user.email.split('@')[0] : 'Sign in'}</span>
        </button>
      </div>
    </aside>

    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex min-h-14 shrink-0 items-center gap-4 border-b border-[#E3DED3] px-6 py-2">
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-[#1B1B18]">{topBarTitle ?? ROUTE_TITLE[route]}</h1>
          <p className="truncate text-xs text-[#5E5B53]">{ROUTE_BLURB[route]}</p>
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
      <div className="flex items-center justify-center gap-2 px-2.5 text-xs text-[#B3261E] lg:justify-start">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#B3261E]" />
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
          ready ? 'bg-[#1F7A4D] shadow-[0_0_0_3px_rgba(61,214,140,0.15)]' : 'bg-[#B26B00] shadow-[0_0_0_3px_rgba(245,165,36,0.15)]'
        )}
      />
      <div className="hidden min-w-0 leading-relaxed lg:block">
        <div className="truncate text-[#5E5B53]">
          Chatbot model <span className="font-mono text-[#33322D]">{gen?.name ?? health.generator_model ?? '—'}</span>
        </div>
        <div className="truncate text-[#5E5B53]">
          Grading model <span className="font-mono text-[#33322D]">{judgeName}</span>
          {pool.keys != null && pool.keys > 1 && <span className="text-[#6E6A62]"> ×{pool.keys} keys</span>}
        </div>
      </div>
    </div>
  );
};
