import React, { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../story/useScrollStory';

// The sign-in story: one wrong answer followed through RAGSeal in an ~8 s loop. The stale fee
// schedule is retrieved, the bot repeats it, the three checks score it, a replay with only the
// correct passage fixes it, and the verdict stamps in. Everything moves with opacity and
// transform only; the clock re-renders at most 20 times a second and only when a step changes.
const STAGE_W = 520;
const STAGE_H = 340;
const LOOP_MS = 8400;
const FADE_OUT = 7600; // the whole stage fades, then every step resets while it is invisible
const RESET = 8200;
const END_STATE = 7000; // reduced motion and the static fallback show this moment

const T = {
  question: 150,
  toRetriever: 650,
  retriever: 900,
  chunks: [1050, 1200, 1350],
  pick: 1700,
  toGenerator: 2000,
  generator: 2250,
  answer: 2450,
  checks: [3100, 3500, 3900],
  replay: 4500,
  correctChunk: 4650,
  replayToGenerator: 4950,
  fixed: 5350,
  stamp: 5900,
};

/** ?trace=<ms> freezes the loop at that moment (for screenshots and demos). */
function frozenAt(): number | null {
  const raw = new URLSearchParams(window.location.search).get('trace');
  const v = raw == null ? NaN : Number(raw);
  return Number.isFinite(v) ? Math.max(0, Math.min(LOOP_MS - 1, v)) : null;
}

function useLoopClock(): number {
  const reduced = usePrefersReducedMotion();
  const [frozen] = useState(frozenAt);
  const [t, setT] = useState(() => frozen ?? (reduced ? END_STATE : 0));
  useEffect(() => {
    if (frozen != null) return setT(frozen);
    if (reduced) return setT(END_STATE);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setT(Math.floor(((now - start) % LOOP_MS) / 50) * 50);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frozen, reduced]);
  return t;
}

/** Scales the fixed-size stage to fit its box, so the story keeps its proportions at any width. */
export const FitStage: React.FC<{ className?: string; maxScale?: number; align?: 'start' | 'center'; children: React.ReactNode }> = ({
  className,
  maxScale = 1.2,
  align = 'center',
  children,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const s = Math.min(width / STAGE_W, height > 0 ? height / STAGE_H : Infinity, maxScale);
      setScale(Math.max(0.3, s));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxScale]);
  return (
    <div ref={ref} className={`relative flex min-h-0 w-full min-w-0 items-center ${align === 'start' ? 'justify-start' : 'justify-center'} ${className ?? ''}`}>
      {/* The scaled box has no intrinsic width, so it never props its container open. */}
      <div className="shrink-0" style={{ width: STAGE_W * scale, height: STAGE_H * scale, maxWidth: '100%' }}>
        <div style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
      </div>
    </div>
  );
};

/** Slow drifting dot grid and two soft glows behind the story. */
export const LivingBackdrop: React.FC = () => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
    <div className="trace-grid" />
    <div className="trace-glow trace-glow-ok" />
    <div className="trace-glow trace-glow-retr" />
  </div>
);

const shown = (t: number, at: number) => t >= at && t < RESET;

/** Fades and lifts in once its moment arrives. */
const Step: React.FC<{ t: number; at: number; className?: string; style?: React.CSSProperties; dim?: boolean; children: React.ReactNode }> = ({
  t,
  at,
  className,
  style,
  dim,
  children,
}) => {
  const on = shown(t, at);
  return (
    <div
      className={`absolute transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] ${className ?? ''}`}
      style={{ ...style, opacity: on ? (dim ? 0.32 : 1) : 0, transform: on ? 'none' : 'translateY(8px)' }}
    >
      {children}
    </div>
  );
};

const Chunk: React.FC<{ file: string; text: string; tone?: 'stale' | 'gold'; tag?: string; lit?: boolean }> = ({ file, text, tone, tag, lit }) => {
  const color = tone === 'stale' ? 'var(--retr)' : tone === 'gold' ? 'var(--ok)' : 'var(--rule-3)';
  return (
    <div
      className="flex h-[32px] w-[212px] items-center gap-2 rounded-md border px-2.5 text-[0.75rem] transition-[box-shadow] duration-500"
      style={{
        borderColor: tone ? `color-mix(in srgb, ${color} 55%, transparent)` : 'var(--rule)',
        background: tone ? `color-mix(in srgb, ${color} 9%, var(--paper))` : 'var(--paper)',
        boxShadow: lit ? `0 0 0 3px color-mix(in srgb, ${color} 22%, transparent)` : 'none',
      }}
    >
      <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-mono text-[0.71875rem] text-[var(--muted)]">{file}</span>
        <span className="ml-1.5 text-[var(--ink-1)]">{text}</span>
      </span>
      {tag && (
        <span className="shrink-0 rounded px-1 font-mono text-[0.6875rem]" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
          {tag}
        </span>
      )}
    </div>
  );
};

const Node: React.FC<{ title: string; meta: string; active: boolean; children?: React.ReactNode }> = ({ title, meta, active, children }) => (
  <div
    className="relative h-full w-full rounded-xl border p-3 transition-[border-color,box-shadow] duration-500"
    style={{
      background: 'color-mix(in srgb, var(--panel) 82%, transparent)',
      borderColor: active ? 'var(--rule-3)' : 'var(--rule)',
      boxShadow: active ? '0 10px 30px -18px color-mix(in srgb, var(--ink) 45%, transparent)' : 'none',
    }}
  >
    <div className="flex items-baseline justify-between">
      <span className="text-[0.84375rem] font-semibold text-[var(--ink)]">{title}</span>
      <span className="font-mono text-[0.71875rem] text-[var(--muted)]">{meta}</span>
    </div>
    {children}
  </div>
);

const Check: React.FC<{ label: string; pass: boolean; on: boolean }> = ({ label, pass, on }) => {
  const color = pass ? 'var(--ok)' : 'var(--gen)';
  return (
    <div
      className="flex h-[34px] items-center gap-2 rounded-lg border px-2.5 text-[0.78125rem] transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)]"
      style={{
        opacity: on ? 1 : 0,
        transform: on ? 'none' : 'translateY(6px) scale(0.98)',
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        background: `color-mix(in srgb, ${color} 8%, var(--paper))`,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
        <circle cx="8" cy="8" r="7" fill={color} opacity="0.16" />
        {pass ? (
          <path d="M4.6 8.3l2.2 2.2 4.6-4.8" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className={on ? 'trace-tick' : undefined} />
        ) : (
          <path d="M5.4 5.4l5.2 5.2M10.6 5.4l-5.2 5.2" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" pathLength={1} className={on ? 'trace-tick' : undefined} />
        )}
      </svg>
      <span className="text-[var(--ink-1)]">{label}</span>
    </div>
  );
};

/** A dot that runs along a short path once, in the colour of what it carries. */
const Packet: React.FC<{ t: number; from: number; className: string; color: string }> = ({ t, from, className, color }) =>
  t >= from && t < from + 700 ? (
    <span
      className={`absolute h-2.5 w-2.5 rounded-full ${className}`}
      style={{ background: color, boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 22%, transparent)` }}
    />
  ) : null;

/** The looping story. Fixed 520×340 stage; wrap it in <FitStage> to size it. */
export const SignInTrace: React.FC = () => {
  const t = useLoopClock();
  const replaying = shown(t, T.replay);
  return (
    <div
      role="img"
      aria-label="A question about an ATM fee: the retriever fetches last year's fee schedule, the bot answers $3.00, two of three checks fail, a replay with the current schedule answers $2.50, and RAGSeal stamps the verdict: retriever at fault, proved by replay."
      className="relative h-full w-full transition-opacity duration-500"
      style={{ opacity: t < FADE_OUT ? 1 : 0 }}
    >
      {/* Question */}
      <Step t={t} at={T.question} style={{ left: 0, top: 0 }}>
        <div className="flex h-[40px] items-center gap-2.5 rounded-full border border-[var(--rule-2)] bg-[var(--paper)] pl-1.5 pr-4 text-[0.875rem] text-[var(--ink)] shadow-[0_8px_24px_-16px_rgba(0,0,0,0.5)]">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--ink)] font-mono text-[0.75rem] text-[var(--paper)]">Q</span>
          What’s the ATM withdrawal fee?
        </div>
      </Step>
      <Packet t={t} from={T.toRetriever} className="trace-run-down" color="var(--ink-2)" />

      {/* Retriever */}
      <Step t={t} at={T.retriever} style={{ left: 0, top: 62, width: 236, height: 196 }}>
        <Node title="Retriever" meta="top 3 passages" active={shown(t, T.retriever) && !shown(t, T.generator)}>
          <div className="mt-2.5 flex flex-col gap-1.5">
            <Step t={t} at={T.chunks[0]} className="!relative" dim={replaying}>
              <Chunk file="fees_v1" text="fee $3.00" tone="stale" tag={shown(t, T.pick) ? 'outdated' : undefined} lit={shown(t, T.pick) && !replaying} />
            </Step>
            <Step t={t} at={T.chunks[1]} className="!relative" dim={replaying}>
              <Chunk file="savings" text="Monthly fee waived above…" />
            </Step>
            <Step t={t} at={T.chunks[2]} className="!relative" dim={replaying}>
              <Chunk file="hours" text="Branches open 9–5" />
            </Step>
            <Step t={t} at={T.correctChunk} className="!relative">
              <Chunk file="fees_v2" text="fee $2.50" tone="gold" tag="current" lit />
            </Step>
          </div>
        </Node>
      </Step>

      {/* Retriever → generator */}
      <svg className="absolute" style={{ left: 236, top: 150 }} width="48" height="20" aria-hidden="true">
        <path
          d="M2 10H44M38 5l6 5-6 5"
          fill="none"
          stroke="var(--rule-3)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: shown(t, T.toGenerator) ? 1 : 0, transition: 'opacity 400ms' }}
        />
      </svg>
      <Packet t={t} from={T.toGenerator} className="trace-run-across" color="var(--retr)" />
      <Packet t={t} from={T.replayToGenerator} className="trace-run-across" color="var(--ok)" />

      {/* Generator */}
      <Step t={t} at={T.generator} style={{ left: 284, top: 62, width: 236, height: 196 }}>
        <Node title="Generator" meta="the chatbot" active={shown(t, T.generator) && !shown(t, T.checks[0])}>
          <Step t={t} at={T.answer} className="!relative mt-2.5" dim={shown(t, T.fixed)}>
            <div className="rounded-lg rounded-tl-sm border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-[0.84375rem] text-[var(--ink)]">
              The ATM fee is <span className="font-semibold" style={{ color: 'var(--gen)' }}>$3.00</span>.
            </div>
          </Step>
          <Step t={t} at={T.replay} className="!relative mt-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[0.71875rem]" style={{ color: 'var(--ok)', background: 'var(--ok-tint)' }}>
              <span className={`h-1.5 w-1.5 rounded-full bg-[var(--ok)] ${replaying && !shown(t, T.fixed) ? 'animate-ping' : ''}`} />
              replay · correct text only
            </span>
          </Step>
          <Step t={t} at={T.fixed} className="!relative mt-2">
            <div
              className="rounded-lg rounded-tl-sm border px-3 py-2 text-[0.84375rem] text-[var(--ink)]"
              style={{ borderColor: 'color-mix(in srgb, var(--ok) 45%, transparent)', background: 'color-mix(in srgb, var(--ok) 8%, var(--paper))' }}
            >
              The ATM fee is <span className="font-semibold" style={{ color: 'var(--ok)' }}>$2.50</span>. ✓
            </div>
          </Step>
        </Node>
      </Step>

      {/* The three checks */}
      <div className="absolute grid grid-cols-3 gap-2.5" style={{ left: 0, top: 274, width: STAGE_W }}>
        <Check label="Found the right text" pass={false} on={shown(t, T.checks[0])} />
        <Check label="Stuck to the text" pass on={shown(t, T.checks[1])} />
        <Check label="Answer correct" pass={false} on={shown(t, T.checks[2])} />
      </div>

      {/* Verdict stamp */}
      <div
        className={`absolute ${shown(t, T.stamp) ? 'trace-stamp' : ''}`}
        style={{ right: 4, top: -2, opacity: shown(t, T.stamp) ? 1 : 0, transform: 'rotate(-7deg)' }}
      >
        <div
          className="flex items-center gap-2.5 rounded-xl border-2 py-1.5 pl-1.5 pr-3.5 backdrop-blur-[2px]"
          style={{ borderColor: 'var(--retr)', background: 'color-mix(in srgb, var(--paper) 88%, transparent)', boxShadow: '0 12px 30px -14px rgba(0,0,0,0.45)' }}
        >
          <svg width="34" height="34" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--retr)" strokeWidth="7" />
            <circle cx="60" cy="60" r="40" fill="none" stroke="var(--retr)" strokeWidth="3" strokeDasharray="3 8" />
            <path d="M40 61l13 13 27-28" fill="none" stroke="var(--ok)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="leading-tight">
            <span className="block text-[0.875rem] font-semibold text-[var(--ink)]">Retriever at fault</span>
            <span className="block text-[0.71875rem] text-[var(--ink-2)]">proved by replay</span>
          </span>
        </div>
      </div>
    </div>
  );
};
