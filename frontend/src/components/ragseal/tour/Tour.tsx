import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';

// First-visit guided tour: the page dims, the step's target is cut out of the dim layer,
// and a card explains it. Targets are found by data-tour attributes; a step whose target
// isn't on screen falls back to a centred card, so the tour never gets stuck.

interface Step {
  target: string;
  route?: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    target: 'nav-bots',
    title: 'This is a chatbot under test',
    body: 'RAGSeal tests chatbots that answer from documents. Start here to talk to one.',
  },
  {
    target: 'tricks',
    route: 'bots',
    title: 'Ask it a trick question',
    body: 'These questions hide traps: an outdated document, a look-alike one, or no answer at all. Try one, or type your own.',
  },
  {
    target: 'xray',
    route: 'bots',
    title: 'The X-ray shows what it read',
    body: 'Every reply is checked three ways: did it find the right text, did it stick to that text, and is the answer correct?',
  },
  {
    target: 'verdict',
    route: 'bots',
    title: 'The stamp says who is to blame',
    body: 'Retriever or bot. Then the replay proves it: the same bot gets only the correct text. Fixed means the retriever was at fault.',
  },
  {
    target: 'nav-testsets',
    title: 'Bring your own documents',
    body: 'Upload your own policy or manual, generate test questions with known answers, and check your bot the same way.',
  },
  {
    target: 'nav-diagnose',
    route: 'diagnose',
    title: 'Diagnose answers',
    body: 'Every answer in a test, with the retrieved text beside it, three colour-coded checks and the replay proof.',
  },
  {
    target: 'nav-impact',
    route: 'impact',
    title: 'Change impact',
    body: 'Updated a document? RAGSeal finds what changed and shows which answers would still give users the old fact.',
  },
  {
    target: 'nav-trust',
    route: 'trust',
    title: 'Checker trust',
    body: 'Why you can believe the verdict: agreement with human labels, planted failures it caught, and stability when the grading model changes.',
  },
  {
    target: '__none__',
    route: 'overview',
    title: 'You’re set',
    body: 'Test a bot, find what broke, trust the verdict. Reopen this tour any time from “Guided tour” in the sidebar.',
  },
];

const SEEN_KEY = 'ragseal.tour.seen';
const PAD = 8;

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // storage unavailable: the tour just shows again next visit
  }
}

export const Tour: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Auto-open once, on the first visit after sign-in.
  useEffect(() => {
    if (enabled && !seen()) {
      setStep(0);
      setOpen(true);
    }
  }, [enabled]);

  // The sidebar's "Guided tour" button re-opens it.
  useEffect(() => {
    const reopen = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener('ragseal:tour', reopen);
    return () => window.removeEventListener('ragseal:tour', reopen);
  }, []);

  const close = useCallback(() => {
    markSeen();
    setOpen(false);
  }, []);

  const current = STEPS[step];

  // Navigate to the step's page if it needs one, then find its target (pages render async).
  useLayoutEffect(() => {
    if (!open) return;
    if (current.route && !window.location.hash.startsWith(`#/${current.route}`)) {
      window.location.hash = `#/${current.route}`;
    }
    let tries = 0;
    let timer = 0;
    const find = () => {
      const el = document.querySelector(`[data-tour="${current.target}"]`);
      if (el) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        setRect(el.getBoundingClientRect());
      } else if (tries++ < 20) {
        timer = window.setTimeout(find, 150);
      } else {
        setRect(null);
      }
    };
    setRect(null);
    find();
    const onResize = () => {
      const el = document.querySelector(`[data-tour="${current.target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [open, step, current]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        if (step < STEPS.length - 1) setStep(step + 1);
        else close();
      } else if (e.key === 'ArrowLeft' && step > 0) setStep(step - 1);
      e.stopPropagation();
    };
    // Capture phase so page shortcuts (e.g. Label studio's keys) don't fire under the tour.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, step, close]);

  if (!open) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const hole = rect
    ? { x: rect.left - PAD, y: rect.top - PAD, w: rect.width + PAD * 2, h: rect.height + PAD * 2 }
    : null;

  // Card beside the hole: right of it if there's room, else left, else below; centred without a target.
  const CARD_W = 340;
  let cardStyle: React.CSSProperties;
  if (!hole) {
    cardStyle = { left: vw / 2 - CARD_W / 2, top: vh / 2 - 110 };
  } else if (hole.x + hole.w + 16 + CARD_W < vw) {
    cardStyle = { left: hole.x + hole.w + 16, top: Math.min(Math.max(16, hole.y), vh - 240) };
  } else if (hole.x - 16 - CARD_W > 0) {
    cardStyle = { left: hole.x - 16 - CARD_W, top: Math.min(Math.max(16, hole.y), vh - 240) };
  } else {
    cardStyle = { left: Math.min(Math.max(16, hole.x), vw - CARD_W - 16), top: Math.min(hole.y + hole.h + 16, vh - 240) };
  }

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Guided tour">
      <svg className="tour-dim absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <mask id="tour-hole">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {hole && <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx="12" fill="black" />}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgb(12, 12, 10)" fillOpacity="0.62" mask="url(#tour-hole)" />
        {hole && (
          <rect
            x={hole.x}
            y={hole.y}
            width={hole.w}
            height={hole.h}
            rx="12"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            className="tour-ring"
          />
        )}
      </svg>

      <div
        key={step}
        className="tour-card absolute rounded-2xl border border-[var(--rule)] bg-[var(--panel)] p-5 shadow-2xl"
        style={{ ...cardStyle, width: CARD_W }}
      >
        <div className="text-[12px] text-[var(--ink-2)]">
          Step {step + 1} of {STEPS.length}
        </div>
        <h3 className="mt-1.5 text-[17px] font-semibold leading-snug text-[var(--ink)]">{current.title}</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-1)]">{current.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className="h-1.5 rounded-full transition-all"
                style={{ width: i === step ? 16 : 6, background: i === step ? 'var(--ink)' : 'var(--rule)' }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={close} className="px-2 py-1 text-[12px] text-[var(--ink-2)] hover:text-[var(--ink)]">
              Skip
            </button>
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="rounded-lg border border-[var(--rule)] px-3 py-1.5 text-[12px] text-[var(--ink)] hover:bg-[var(--panel-2)]"
              >
                Back
              </button>
            )}
            <button
              onClick={() => (step < STEPS.length - 1 ? setStep(step + 1) : close())}
              className="rounded-lg bg-[var(--ink)] px-3 py-1.5 text-[12px] font-medium text-[var(--paper)]"
            >
              {step < STEPS.length - 1 ? 'Next' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
