import { useEffect, useRef, useState } from 'react';

/** Nearest ancestor that scrolls vertically (the app shell's <main>), else the document. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if (oy === 'auto' || oy === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

// The scene eases toward the scroll position instead of jumping with it: a trackpad flick
// moves the scroll hundreds of pixels in a few frames, which made the motion (the retriever's
// sideways sweep especially) snap. SMOOTH_MS is the easing time constant; MAX_CHAPTERS_PER_S
// caps how fast the story can play however hard the user scrolls.
const SMOOTH_MS = 200;
const MAX_CHAPTERS_PER_S = 3;

/**
 * Scroll-driven story: a tall section with a sticky stage inside that stays pinned. Returns the
 * stage height (the scroll viewport) and the current chapter position as a float,
 * 0 → chapters, eased toward the scroll position once per animation frame.
 */
export function useScrollStory(chapters: number) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState(() => (typeof window !== 'undefined' ? window.innerHeight - 56 : 800));
  const [chapter, setChapter] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const scroller = scrollParent(section);
    const target: HTMLElement | Window = scroller ?? window;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let frame = 0;
    let ease = 0;
    let goal = 0;
    let shown = 0;
    let last = 0;
    let first = true;

    const tick = (now: number) => {
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      const diff = goal - shown;
      if (Math.abs(diff) < 0.002) {
        shown = goal;
        setChapter(shown);
        ease = 0;
        last = 0;
        return;
      }
      const maxStep = (MAX_CHAPTERS_PER_S * dt) / 1000;
      const step = diff * (1 - Math.exp(-dt / SMOOTH_MS));
      shown += Math.max(-maxStep, Math.min(maxStep, step));
      setChapter(shown);
      ease = requestAnimationFrame(tick);
    };

    const measure = () => {
      const vh = scroller ? scroller.clientHeight : window.innerHeight;
      setViewport(vh);
      const top = scroller
        ? section.getBoundingClientRect().top - scroller.getBoundingClientRect().top
        : section.getBoundingClientRect().top;
      const travel = section.offsetHeight - vh;
      const p = travel > 0 ? Math.min(1, Math.max(0, -top / travel)) : 0;
      goal = p * chapters;
      // First paint (and deep links) land directly; reduced motion never animates.
      if (first || reduced) {
        first = false;
        shown = goal;
        setChapter(shown);
        return;
      }
      if (!ease) ease = requestAnimationFrame(tick);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    // Deep link: #/overview?chapter=3.5 opens the story at that chapter (handy for demos).
    const wanted = Number(new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('chapter'));
    if (scroller && Number.isFinite(wanted) && wanted > 0) {
      const vh = scroller.clientHeight;
      const top = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTop = top + (Math.min(wanted, chapters) / chapters) * (section.offsetHeight - vh);
    }

    measure();
    target.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    if (scroller) ro.observe(scroller);
    ro.observe(section);
    return () => {
      target.removeEventListener('scroll', onScroll);
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
      if (ease) cancelAnimationFrame(ease);
    };
  }, [chapters]);

  return { sectionRef, viewport, chapter };
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** 0 before `start`, 1 after `end`, linear in between. */
export const seg = (c: number, start: number, end: number) => Math.min(1, Math.max(0, (c - start) / (end - start)));

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
