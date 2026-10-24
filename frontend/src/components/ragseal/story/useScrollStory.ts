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

/**
 * Scroll-driven story: the section is `chapters + 1` viewports tall and a sticky stage
 * inside it stays pinned. Returns the stage height (the scroll viewport) and the current
 * chapter position as a float, 0 → chapters. Updates at most once per animation frame.
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
    let frame = 0;

    const measure = () => {
      const vh = scroller ? scroller.clientHeight : window.innerHeight;
      setViewport(vh);
      const top = scroller
        ? section.getBoundingClientRect().top - scroller.getBoundingClientRect().top
        : section.getBoundingClientRect().top;
      const travel = section.offsetHeight - vh;
      const p = travel > 0 ? Math.min(1, Math.max(0, -top / travel)) : 0;
      setChapter(p * chapters);
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
