import React, { useEffect, useState } from 'react';

// Fig. 1: how a RAG chatbot answers (indexing lane + answering lane) and the three
// places RAGSeal checks it, plus the replay loop that proves which part failed.

const INK = '#1B1B18';
const MUTED = '#5E5B53';
const RULE = '#C9C2B3';
const BOX = '#FBF9F4';
const AMBER = '#B26B00';
const RED = '#B3261E';
const GREEN = '#1F7A4D';
const BLUE = '#2F5D8A';

const W = 140;
const H = 54;
const col = (i: number) => 24 + i * 196;
const TOP = 44;
const LOW = 236;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

const Box: React.FC<{ x: number; y: number; title: string; sub?: string; stroke?: string; delay: number }> = ({
  x,
  y,
  title,
  sub,
  stroke = '#D6D0C3',
  delay,
}) => (
  <g className="fig-fade" style={{ animationDelay: `${delay}ms` }}>
    <rect x={x} y={y} width={W} height={H} rx={8} fill={BOX} stroke={stroke} strokeWidth={stroke === '#D6D0C3' ? 1 : 1.6} />
    <text x={x + W / 2} y={sub ? y + 23 : y + 32} textAnchor="middle" fontSize={13.5} fontWeight={600} fill={INK}>
      {title}
    </text>
    {sub && (
      <text x={x + W / 2} y={y + 40} textAnchor="middle" fontSize={11} fill={MUTED}>
        {sub}
      </text>
    )}
  </g>
);

const Edge: React.FC<{ d: string; delay: number; color?: string }> = ({ d, delay, color = RULE }) => (
  <path
    d={d}
    pathLength={1}
    className="fig-draw"
    style={{ animationDelay: `${delay}ms` }}
    fill="none"
    stroke={color}
    strokeWidth={1.4}
    markerEnd="url(#fig1-arrow)"
  />
);

const Check: React.FC<{ cx: number; cy: number; n: string; color: string; delay: number }> = ({ cx, cy, n, color, delay }) => (
  <g className="fig-fade" style={{ animationDelay: `${delay}ms` }}>
    <circle cx={cx} cy={cy} r={11} fill={BOX} stroke={color} strokeWidth={2} />
    <text x={cx} y={cy + 4.5} textAnchor="middle" fontSize={12} fontWeight={700} fill={color}>
      {n}
    </text>
  </g>
);

export const RagFigure: React.FC<{ caption?: boolean }> = ({ caption = true }) => {
  const reduced = usePrefersReducedMotion();
  const mid = (i: number) => col(i) + W / 2;
  const lowY = LOW + H / 2;

  return (
    <figure className="m-0">
      <svg viewBox="0 0 1170 400" className="h-auto w-full" role="img" aria-label="How a RAG chatbot answers, and where RAGSeal checks it">
        <defs>
          <marker id="fig1-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={RULE} />
          </marker>
          <marker id="fig1-arrow-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={BLUE} />
          </marker>
        </defs>

        {/* Lane labels */}
        <text x={24} y={30} fontSize={11} letterSpacing={1.4} fill={MUTED}>
          INDEXING · DONE ONCE PER DOCUMENT SET
        </text>
        <text x={24} y={222} fontSize={11} letterSpacing={1.4} fill={MUTED}>
          ANSWERING · FOR EVERY QUESTION
        </text>

        {/* Indexing lane */}
        <Box x={col(0)} y={TOP} title="Documents" sub="policies, fee lists" delay={0} />
        <Box x={col(1)} y={TOP} title="Split into chunks" sub="short passages" delay={80} />
        <Box x={col(2)} y={TOP} title="Embeddings" sub="meaning as numbers" delay={160} />
        <Box x={col(3)} y={TOP} title="Vector index" sub="searchable store" delay={240} />
        <Edge d={`M${col(0) + W} ${TOP + H / 2} H${col(1) - 2}`} delay={120} />
        <Edge d={`M${col(1) + W} ${TOP + H / 2} H${col(2) - 2}`} delay={200} />
        <Edge d={`M${col(2) + W} ${TOP + H / 2} H${col(3) - 2}`} delay={280} />

        {/* Known answer from the test set */}
        <Box x={col(4)} y={TOP} title="Known answer" sub="from the test set" delay={320} />

        {/* Index feeds the retriever */}
        <Edge d={`M${mid(3)} ${TOP + H} V150 H${mid(1)} V${LOW - 2}`} delay={360} />
        <text x={(mid(1) + mid(3)) / 2} y={143} textAnchor="middle" fontSize={11} fill={MUTED}>
          searched for each question
        </text>

        {/* Answering lane */}
        <Box x={col(0)} y={LOW} title="Question" sub="from a user or test" delay={420} />
        <Box x={col(1)} y={LOW} title="Retriever" sub="finds relevant text" stroke={AMBER} delay={500} />
        <Box x={col(2)} y={LOW} title="Top chunks" sub="the text it found" delay={580} />
        <Box x={col(3)} y={LOW} title="Bot (generator)" sub="writes the answer" stroke={RED} delay={660} />
        <Box x={col(4)} y={LOW} title="Answer" sub="with citations" delay={740} />
        <Box x={col(5)} y={LOW} title="Verdict" sub="who is to blame" stroke={INK} delay={820} />
        <Edge d={`M${col(0) + W} ${lowY} H${col(1) - 2}`} delay={480} />
        <Edge d={`M${col(1) + W} ${lowY} H${col(2) - 2}`} delay={560} />
        <Edge d={`M${col(2) + W} ${lowY} H${col(3) - 2}`} delay={640} />
        <Edge d={`M${col(3) + W} ${lowY} H${col(4) - 2}`} delay={720} />
        <Edge d={`M${col(4) + W} ${lowY} H${col(5) - 2}`} delay={800} />

        {/* Known answer compared with the answer */}
        <path
          d={`M${mid(4)} ${TOP + H} V${LOW - 2}`}
          fill="none"
          stroke={GREEN}
          strokeWidth={1.4}
          strokeDasharray="3 4"
          className="fig-fade"
          style={{ animationDelay: '880ms' }}
        />

        {/* RAGSeal's three checks */}
        <Check cx={mid(2)} cy={LOW - 18} n="1" color={AMBER} delay={940} />
        <text x={mid(2) + 16} y={LOW - 14} fontSize={12} fontWeight={600} fill={AMBER} className="fig-fade" style={{ animationDelay: '940ms' }}>
          Found the right text?
        </text>
        <Check cx={(col(2) + W + col(3)) / 2} cy={lowY + 30} n="2" color={RED} delay={1020} />
        <text
          x={(col(2) + W + col(3)) / 2}
          y={lowY + 58}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          fill={RED}
          className="fig-fade"
          style={{ animationDelay: '1020ms' }}
        >
          Stuck to the text?
        </text>
        <Check cx={mid(4)} cy={175} n="3" color={GREEN} delay={1100} />
        <text x={mid(4) + 16} y={179} fontSize={12} fontWeight={600} fill={GREEN} className="fig-fade" style={{ animationDelay: '1100ms' }}>
          Correct answer?
        </text>

        {/* Replay loop: verdict back to the bot with only the correct text */}
        <path
          d={`M${mid(5)} ${LOW + H} V352 H${mid(3)} V${LOW + H + 2}`}
          fill="none"
          stroke={BLUE}
          strokeWidth={1.6}
          strokeDasharray="6 5"
          markerEnd="url(#fig1-arrow-blue)"
          className="fig-fade"
          style={{ animationDelay: '1200ms' }}
        />
        <text x={(mid(3) + mid(5)) / 2} y={374} textAnchor="middle" fontSize={12} fontWeight={600} fill={BLUE} className="fig-fade" style={{ animationDelay: '1200ms' }}>
          Replay: rerun the bot with only the correct text. Fixed → retriever at fault. Still wrong → bot at fault.
        </text>

        {/* A question travelling the answering lane */}
        {!reduced && (
          <circle r={4.5} fill={INK}>
            <animateMotion dur="5s" begin="1.4s" repeatCount="indefinite" path={`M${col(0) + W} ${lowY} H${col(5)}`} />
          </circle>
        )}
      </svg>
      {caption && (
        <figcaption className="mt-3 text-[13px] leading-relaxed text-[#33322D]">
          <span className="font-report text-[14px] italic text-[#1B1B18]">Fig. 1 — How a RAG chatbot answers, and where RAGSeal checks it.</span>{' '}
          Documents are indexed once. For each question the retriever pulls a few chunks and the bot writes an answer from them. RAGSeal
          checks the retriever (1), the bot (2) and the final answer (3) separately, then replays a wrong answer with only the correct text
          to prove which part caused it.
        </figcaption>
      )}
    </figure>
  );
};
