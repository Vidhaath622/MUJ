import React, { useCallback, useEffect, useRef, useState } from 'react';

// Tabs that split a dense page into one idea at a time. Click a tab, use ←/→ while the
// pointer is over the panel, or keep scrolling down past the end of a tab's content:
// a few deliberate wheel ticks at the bottom advance to the next tab (never mid-content).

export interface Pane {
  id: string;
  label: string;
  content: React.ReactNode;
}

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let n = el?.parentElement ?? null;
  while (n) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
    n = n.parentElement;
  }
  return null;
}

function atBottom(el: HTMLElement | null): boolean {
  if (el) return el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
  return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
}

function atTop(el: HTMLElement | null): boolean {
  return el ? el.scrollTop <= 4 : window.scrollY <= 4;
}

export const TabbedPanes: React.FC<{ panes: Pane[]; initial?: number; fill?: boolean }> = ({ panes, initial = 0, fill = false }) => {
  const [index, setIndex] = useState(initial);
  const rootRef = useRef<HTMLDivElement>(null);
  const hover = useRef(false);
  const push = useRef({ dir: 0, count: 0, at: 0 });

  const go = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(panes.length - 1, i));
      setIndex(next);
      push.current = { dir: 0, count: 0, at: 0 };
    },
    [panes.length]
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      const sp = scrollParent(root);
      const dir = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
      if (!dir) return;
      // An inner scroll box (a passage list, say) that can still scroll owns the wheel.
      for (let n = e.target as HTMLElement | null; n && n !== root; n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 2) {
          if (dir > 0 ? !atBottom(n) : !atTop(n)) {
            push.current = { dir: 0, count: 0, at: 0 };
            return;
          }
        }
      }
      const edge = dir > 0 ? atBottom(sp) : atTop(sp);
      if (!edge) {
        push.current = { dir: 0, count: 0, at: 0 };
        return;
      }
      const now = Date.now();
      const p = push.current;
      if (p.dir !== dir || now - p.at > 700) push.current = { dir, count: 1, at: now };
      else push.current = { dir, count: p.count + 1, at: now };
      // Several ticks at the edge means the user wants more: move to the next or previous tab.
      if (push.current.count >= 4) {
        if (dir > 0 && index < panes.length - 1) {
          go(index + 1);
          (sp ?? document.scrollingElement)?.scrollTo({ top: 0 });
        } else if (dir < 0 && index > 0) {
          go(index - 1);
        }
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (!hover.current) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
    };
    root.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [index, panes.length, go]);

  return (
    <div
      ref={rootRef}
      className={`flex min-h-0 flex-col gap-4 ${fill ? 'flex-1' : ''}`}
      onMouseEnter={() => (hover.current = true)}
      onMouseLeave={() => (hover.current = false)}
    >
      <div className="flex items-center justify-between gap-4 border-b border-[var(--rule)]">
        <div role="tablist" className="flex gap-1">
          {panes.map((p, i) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={i === index}
              onClick={() => go(i)}
              className={`-mb-px border-b-2 px-3.5 py-2.5 text-[13.5px] transition-colors ${
                i === index
                  ? 'border-[var(--ink)] text-[var(--ink)]'
                  : 'border-transparent text-[var(--ink-2)] hover:text-[var(--ink)]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 pb-1" aria-hidden="true">
          {panes.map((p, i) => (
            <span
              key={p.id}
              className="h-1.5 rounded-full transition-all"
              style={{ width: i === index ? 16 : 6, background: i === index ? 'var(--ink)' : 'var(--rule-3)' }}
            />
          ))}
        </div>
      </div>
      <div role="tabpanel" key={panes[index]?.id} className={`lab-fade-up min-h-0 ${fill ? 'flex flex-1 flex-col' : ''}`}>
        {panes[index]?.content}
      </div>
      {!fill && index < panes.length - 1 && (
        <button
          onClick={() => go(index + 1)}
          className="self-center text-[12px] text-[var(--ink-2)] transition-opacity hover:opacity-70"
        >
          Next: {panes[index + 1].label} → <span className="opacity-70">(or keep scrolling)</span>
        </button>
      )}
    </div>
  );
};
