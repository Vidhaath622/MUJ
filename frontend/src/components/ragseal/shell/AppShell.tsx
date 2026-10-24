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
  icon: React.ComponentType<{ className?: string }>;
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Evaluate',
    items: [
      { id: 'bots', label: 'Bots', icon: MessagesSquare },
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'diagnose', label: 'Diagnose', icon: ScanSearch },
      { id: 'runs', label: 'Runs', icon: PlayCircle },
      { id: 'testsets', label: 'Test sets', icon: FlaskConical },
    ],
  },
  {
    group: 'Trust',
    items: [
      { id: 'label', label: 'Label studio', icon: Tags },
      { id: 'trust', label: 'Evaluator trust', icon: ListChecks },
      { id: 'compare', label: 'Compare versions', icon: GitCompareArrows },
    ],
  },
  { group: 'Learn', items: [{ id: 'learn', label: 'How it works', icon: BookOpen }] },
];

export const ROUTE_TITLE: Record<Route, string> = {
  bots: 'Bots under test',
  overview: 'Overview',
  diagnose: 'Diagnose',
  runs: 'Runs',
  testsets: 'Test sets',
  label: 'Label studio',
  trust: 'Evaluator trust',
  compare: 'Compare versions',
  learn: 'How it works',
};

const ROUTES = new Set<Route>(Object.keys(ROUTE_TITLE) as Route[]);

/** Hash routing: #/diagnose, #/runs?batch=batch_x. No router dependency. */
export function useHashRoute(): { route: Route; params: URLSearchParams; go: (r: Route, params?: Record<string, string>) => void } {
  const parse = () => {
    const raw = window.location.hash.replace(/^#\/?/, '');
    const [path, query] = raw.split('?');
    const route = (ROUTES.has(path as Route) ? path : 'diagnose') as Route;
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
  <div className="flex h-screen overflow-hidden bg-[#08090B] text-[#E8EAED]">
    <aside className="flex w-[60px] shrink-0 flex-col border-r border-[#17191D] bg-[#0A0B0D] lg:w-[232px]">
      <div className="flex h-14 items-center gap-2.5 px-[19px] lg:px-5">
        <ShieldCheck className="h-[22px] w-[22px] shrink-0 text-[#E8EAED]" strokeWidth={1.6} />
        <span className="hidden text-[15px] font-semibold tracking-[-0.01em] lg:inline">RAGSeal</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-4 pt-2 lg:px-3">
        {NAV.map((g) => (
          <div key={g.group} className="mb-5">
            <div className="mb-1.5 hidden px-2.5 text-[11px] font-medium text-[#6F757E] lg:block">{g.group}</div>
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
                      title={item.label}
                      className={cn(
                        'flex h-9 items-center justify-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors lg:justify-start',
                        active
                          ? 'bg-[#16181C] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                          : 'text-[#8A9099] hover:bg-white/[0.03] hover:text-[#E8EAED]'
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-[#6F757E]')} />
                      <span className="hidden lg:inline">{item.label}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[#17191D] p-3">
        <ModelStatus live={live} health={health} />
        <button
          onClick={onOpenAuth}
          className="mt-2 flex h-9 w-full items-center justify-center gap-2.5 rounded-lg px-2.5 text-[13px] text-[#C9CDD3] transition-colors hover:bg-white/[0.03] lg:justify-start"
          title={user?.email ?? 'Sign in'}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1C1F24] text-[11px] font-medium text-white">
            {user ? user.email[0].toUpperCase() : <User className="h-3.5 w-3.5" />}
          </span>
          <span className="hidden truncate lg:inline">{user ? user.email.split('@')[0] : 'Sign in'}</span>
        </button>
      </div>
    </aside>

    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[#17191D] px-6">
        <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-white">{topBarTitle ?? ROUTE_TITLE[route]}</h1>
        <div id={TOP_BAR_SLOT} className="ml-auto flex min-w-0 items-center gap-3">
          {topBarControls}
        </div>
      </header>
      <main className={cn('min-h-0 flex-1', fitScreen ? 'overflow-hidden' : 'overflow-y-auto')}>{children}</main>
    </div>
  </div>
);

/** Which generator and judge the backend actually has loaded, straight from /api/health. */
const ModelStatus: React.FC<{ live: boolean; health: HealthResponse | null }> = ({ live, health }) => {
  if (!live || !health) {
    return (
      <div className="flex items-center justify-center gap-2 px-2.5 text-xs text-[#F47783] lg:justify-start">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#F47783]" />
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
        `All models ready${poolText ? `. Judge pool: ${poolText}` : ''}`
      }
    >
      <span
        className={cn(
          'mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full',
          ready ? 'bg-[#3DD68C] shadow-[0_0_0_3px_rgba(61,214,140,0.15)]' : 'bg-[#F5A524] shadow-[0_0_0_3px_rgba(245,165,36,0.15)]'
        )}
      />
      <div className="hidden min-w-0 leading-relaxed lg:block">
        <div className="truncate text-[#8A9099]">
          Generator <span className="font-mono text-[#C9CDD3]">{gen?.name ?? health.generator_model ?? '—'}</span>
        </div>
        <div className="truncate text-[#8A9099]">
          Judge <span className="font-mono text-[#C9CDD3]">{judgeName}</span>
          {pool.keys != null && pool.keys > 1 && <span className="text-[#6F757E]"> ×{pool.keys} keys</span>}
        </div>
      </div>
    </div>
  );
};
