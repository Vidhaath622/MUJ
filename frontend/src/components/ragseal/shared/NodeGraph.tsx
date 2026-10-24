import React, { useEffect, useRef, useState } from 'react';

// Reusable node-graph flowchart: rounded nodes, elbow connectors with arrowheads,
// Yes/No pill labels and dashed decision nodes. Draws in when scrolled into view.
// Colours come only from theme vars (see the --node-* block in index.css).

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string; // '\n' breaks lines
  kind?: 'step' | 'decision' | 'ok' | 'retr' | 'gen' | 'review' | 'store';
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  /** 'v': leave bottom, enter top (default). 'h': leave right/left side, enter the target's side. */
  route?: 'v' | 'h';
  /** y (for 'v') or x (for 'h') where the elbow turns. Defaults to halfway. */
  bend?: number;
  dashed?: boolean;
}

const STATUS: Record<string, string> = {
  ok: 'var(--ok)',
  retr: 'var(--retr)',
  gen: 'var(--gen)',
  review: 'var(--review)',
};

function edgePath(a: GraphNode, b: GraphNode, e: GraphEdge) {
  if (e.route === 'h') {
    const right = b.x > a.x;
    const x1 = right ? a.x + a.w : a.x;
    const y1 = a.y + a.h / 2;
    const x2 = right ? b.x : b.x + b.w;
    const y2 = b.y + b.h / 2;
    const mx = e.bend ?? (x1 + x2) / 2;
    return {
      d: `M${x1} ${y1} H${mx} V${y2} H${x2}`,
      len: Math.abs(mx - x1) + Math.abs(y2 - y1) + Math.abs(x2 - mx),
      lx: mx,
      ly: (y1 + y2) / 2,
    };
  }
  const x1 = a.x + a.w / 2;
  const y1 = a.y + a.h;
  const x2 = b.x + b.w / 2;
  const y2 = b.y;
  const my = e.bend ?? (y1 + y2) / 2;
  return {
    d: `M${x1} ${y1} V${my} H${x2} V${y2}`,
    len: Math.abs(my - y1) + Math.abs(x2 - x1) + Math.abs(y2 - my),
    lx: x2,
    ly: x1 === x2 ? (y1 + y2) / 2 : (my + y2) / 2,
  };
}

export const NodeGraph: React.FC<{
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  title: string;
}> = ({ nodes, edges, width, height, title }) => {
  const ref = useRef<SVGSVGElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  // Reveal order follows the top-to-bottom, left-to-right position of each node.
  const order = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x).map((n) => n.id);
  const delay = (id: string) => `${order.indexOf(id) * 90}ms`;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title}
      className={`h-auto w-full ${on ? 'ng-on' : ''}`}
      style={{ fontFamily: 'inherit' }}
    >
      <defs>
        <marker id="ng-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1L9 5L1 9" fill="none" stroke="var(--node-edge)" strokeWidth="1.6" />
        </marker>
      </defs>

      {edges.map((e, i) => {
        const a = byId[e.from];
        const b = byId[e.to];
        if (!a || !b) return null;
        const p = edgePath(a, b, e);
        return (
          <path
            key={`e${i}`}
            d={p.d}
            fill="none"
            stroke="var(--node-edge)"
            strokeWidth={1.3}
            strokeDasharray={e.dashed ? '5 5' : undefined}
            markerEnd="url(#ng-arrow)"
            className={e.dashed ? undefined : 'ng-edge'}
            style={{ ['--len' as string]: p.len, ['--d' as string]: delay(e.from) } as React.CSSProperties}
          />
        );
      })}

      {nodes.map((n) => {
        const status = n.kind ? STATUS[n.kind] : undefined;
        const decision = n.kind === 'decision';
        const lines = n.label.split('\n');
        return (
          <g key={n.id} className="ng-node" style={{ ['--d' as string]: delay(n.id) } as React.CSSProperties}>
            <rect
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              rx={n.kind === 'store' ? 22 : 14}
              fill={decision ? 'var(--node-decision-bg)' : 'var(--node-bg)'}
              stroke={status ?? 'var(--node-border)'}
              strokeWidth={status ? 1.8 : 1.2}
              strokeDasharray={decision ? '4 3' : undefined}
            />
            <text
              x={n.x + n.w / 2}
              y={n.y + n.h / 2 - ((lines.length - 1) * 17) / 2 + 5}
              textAnchor="middle"
              fontSize={14.5}
              fontWeight={600}
              fill={status ?? 'var(--node-ink)'}
            >
              {lines.map((l, i) => (
                <tspan key={i} x={n.x + n.w / 2} dy={i === 0 ? 0 : 17}>
                  {l}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}

      {edges.map((e, i) => {
        if (!e.label) return null;
        const a = byId[e.from];
        const b = byId[e.to];
        if (!a || !b) return null;
        const p = edgePath(a, b, e);
        const w = e.label.length * 7.4 + 20;
        return (
          <g key={`l${i}`} className="ng-node" style={{ ['--d' as string]: delay(e.to) } as React.CSSProperties}>
            <rect x={p.lx - w / 2} y={p.ly - 11} width={w} height={22} rx={11} fill="var(--node-pill-bg)" />
            <text x={p.lx} y={p.ly + 4.5} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--node-pill-ink)">
              {e.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
