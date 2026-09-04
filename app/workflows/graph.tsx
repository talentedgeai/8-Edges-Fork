import type { CSSProperties, ReactNode } from 'react'

/**
 * Workflow graph engine: a typed node/edge model rendered as on-brand SVG.
 *
 * Pages declare their real control flow as data (decisions, failure paths,
 * loops, converge points) instead of a linear rail. Positions are explicit:
 * ten minutes of authoring buys a diagram that stays legible, which no
 * auto-layout guarantees. All colors come from design tokens.
 */

export type GraphNodeKind =
  | 'trigger' // a schedule or event fires (dark)
  | 'action' // neutral work (white)
  | 'write' // a write to a system of record (green)
  | 'decision' // a branch (blue, chamfered)
  | 'wait' // deferred to a later run (amber pill)
  | 'human' // a human touchpoint (bold dark border)
  | 'terminal' // a quiet end: skip or no-op (tint)
  | 'flag' // ends by telling a human, never guessing (red)
  | 'state' // a lifecycle state, for state machines (pill)

export type GraphNode = {
  id: string
  kind: GraphNodeKind
  /** Node title; use \n for a second line. */
  label: string
  /** Smaller qualifier line under the title. */
  sub?: string
  x: number
  y: number
  w: number
  h: number
}

type Side = 'top' | 'bottom' | 'left' | 'right'

export type GraphEdgeKind =
  | 'normal' // solid grey
  | 'agent' // solid green: a machine-made move
  | 'fail' // red dashed: a failure path
  | 'muted' // grey dashed: human-only or out-of-band

export type GraphEdge = {
  from: string
  to: string
  label?: string
  /** Explicit label position; required whenever the default midpoint would collide. */
  labelAt?: [number, number]
  kind?: GraphEdgeKind
  fromSide?: Side
  toSide?: Side
  /** Shifts the anchor along the node edge to keep parallel arrows apart. */
  fromOffset?: [number, number]
  toOffset?: [number, number]
  /** Absolute waypoints between the two anchors; orthogonal routing. */
  points?: Array<[number, number]>
}

export type WorkflowGraphDef = {
  /** Unique per page: namespaces the SVG marker ids. */
  id: string
  width: number
  height: number
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const EDGE_STROKE: Record<GraphEdgeKind, { stroke: string; dash?: string }> = {
  normal: { stroke: 'var(--input-border)' },
  agent: { stroke: 'var(--color-ok-strong)' },
  fail: { stroke: 'var(--color-err-strong)', dash: '5 4' },
  muted: { stroke: 'var(--input-border)', dash: '4 5' },
}

function anchor(n: GraphNode, side: Side, offset?: [number, number]): [number, number] {
  const [dx, dy] = offset ?? [0, 0]
  switch (side) {
    case 'top':
      return [n.x + dx, n.y - n.h / 2 + dy]
    case 'bottom':
      return [n.x + dx, n.y + n.h / 2 + dy]
    case 'left':
      return [n.x - n.w / 2 + dx, n.y + dy]
    case 'right':
      return [n.x + n.w / 2 + dx, n.y + dy]
  }
}

function defaultSides(from: GraphNode, to: GraphNode): [Side, Side] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom']
  return dx >= 0 ? ['right', 'left'] : ['left', 'right']
}

function NodeShape({ n }: { n: GraphNode }) {
  const { x, y, w, h } = n
  const left = x - w / 2
  const top = y - h / 2
  const lines = n.label.split('\n')
  const lineH = 17
  const blockH = lines.length * lineH + (n.sub ? 15 : 0)
  const firstBaseline = y - blockH / 2 + 13

  let shape: ReactNode
  let titleFill = 'var(--dark)'
  let subFill = 'var(--body-text)'

  switch (n.kind) {
    case 'trigger':
      shape = <rect x={left} y={top} width={w} height={h} rx={10} className="site-wf-g-fill-dark" />
      titleFill = 'var(--white)'
      subFill = 'var(--mint)'
      break
    case 'action':
      shape = (
        <rect x={left} y={top} width={w} height={h} rx={10} className="site-wf-g-node" />
      )
      break
    case 'write':
      shape = (
        <rect x={left} y={top} width={w} height={h} rx={10} className="site-wf-g-node site-wf-g-node--ok" />
      )
      break
    case 'decision': {
      const c = 14
      const pts = [
        [left + c, top],
        [left + w - c, top],
        [left + w, top + c],
        [left + w, top + h - c],
        [left + w - c, top + h],
        [left + c, top + h],
        [left, top + h - c],
        [left, top + c],
      ]
        .map((p) => p.join(','))
        .join(' ')
      shape = <polygon points={pts} className="site-wf-g-node site-wf-g-node--blue" />
      break
    }
    case 'wait':
      shape = (
        <rect x={left} y={top} width={w} height={h} rx={h / 2} className="site-wf-g-node site-wf-g-node--amber" />
      )
      break
    case 'human':
      shape = (
        <rect x={left} y={top} width={w} height={h} rx={10} className="site-wf-g-node site-wf-g-node--strong" />
      )
      break
    case 'terminal':
      shape = <rect x={left} y={top} width={w} height={h} rx={10} className="site-wf-g-node site-wf-g-node--soft" />
      titleFill = 'var(--grey-mid)'
      subFill = 'var(--grey-mid)'
      break
    case 'flag':
      shape = (
        <rect x={left} y={top} width={w} height={h} rx={10} className="site-wf-g-node site-wf-g-node--err" />
      )
      break
    case 'state':
      shape = (
        <rect x={left} y={top} width={w} height={h} rx={h / 2} className="site-wf-g-node site-wf-g-node--dark" />
      )
      break
  }

  return (
    <g>
      {shape}
      {lines.map((line, i) => (
        <text
          key={i}
          x={x}
          y={firstBaseline + i * lineH}
          textAnchor="middle"
          className="site-wf-g-title" style={{ fill: titleFill }} /* layout-ok: fill chosen per node kind at runtime */
        >
          {line}
        </text>
      ))}
      {n.sub ? (
        <text
          x={x}
          y={firstBaseline + lines.length * lineH - 2}
          textAnchor="middle"
          className="site-wf-g-sub" style={{ fill: subFill }} /* layout-ok: fill chosen per node kind at runtime */
        >
          {n.sub}
        </text>
      ) : null}
    </g>
  )
}

export function WorkflowGraph({ graph, caption }: { graph: WorkflowGraphDef; caption?: string }) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))

  return (
    <figure className="u-m-0">
      <div className="site-wf-graph-scroll">
        <svg
          viewBox={`0 0 ${graph.width} ${graph.height}`}
          width="100%"
          role="img"
          aria-label={caption}
          style={{ minWidth: Math.min(graph.width, 720) }} /* layout-ok: width comes from the graph data */
        >
          <defs>
            {(Object.keys(EDGE_STROKE) as GraphEdgeKind[]).map((k) => (
              <marker
                key={k}
                id={`${graph.id}-ah-${k}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6.5"
                markerHeight="6.5"
                orient="auto-start-reverse"
              >
                <path d="M0 0L10 5L0 10z" style={{ fill: EDGE_STROKE[k].stroke }} /* layout-ok: legend swatch mirrors the edge colour table */ />
              </marker>
            ))}
          </defs>
          {graph.edges.map((e, i) => {
            const from = byId.get(e.from)
            const to = byId.get(e.to)
            if (!from || !to) return null
            const [defFrom, defTo] = defaultSides(from, to)
            const a = anchor(from, e.fromSide ?? defFrom, e.fromOffset)
            const b = anchor(to, e.toSide ?? defTo, e.toOffset)
            const pts = [a, ...(e.points ?? []), b]
            const kind = e.kind ?? 'normal'
            const stroke = EDGE_STROKE[kind]
            const mid = pts[Math.floor((pts.length - 1) / 2)]
            const labelPos = e.labelAt ?? [(mid[0] + pts[Math.floor((pts.length - 1) / 2) + 1][0]) / 2 + 8, (mid[1] + pts[Math.floor((pts.length - 1) / 2) + 1][1]) / 2 - 6]
            return (
              <g key={i}>
                <polyline
                  points={pts.map((p) => p.join(',')).join(' ')}
                  fill="none"
                  style={{ stroke: stroke.stroke, strokeWidth: 1.5, strokeDasharray: stroke.dash }} /* layout-ok: edge style comes from the edge kind */
                  markerEnd={`url(#${graph.id}-ah-${kind})`}
                />
                {e.label ? (
                  <text
                    x={labelPos[0]}
                    y={labelPos[1]}
                    textAnchor="middle"
                    className={`site-wf-g-label wf-g-label--${kind === "fail" ? "fail" : kind === "agent" ? "agent" : "plain"}`}
                  >
                    {e.label}
                  </text>
                ) : null}
              </g>
            )
          })}
          {graph.nodes.map((n) => (
            <NodeShape key={n.id} n={n} />
          ))}
        </svg>
      </div>
      {caption ? <figcaption className="site-wf-graph-caption">{caption}</figcaption> : null}
    </figure>
  )
}

const LEGEND_SWATCH: Record<string, CSSProperties> = {
  decision: { background: 'color-mix(in srgb, var(--color-primary-blue) 6%, transparent)', border: '1.5px solid var(--blue)' },
  write: { background: 'color-mix(in srgb, var(--color-ok-strong) 8%, transparent)', border: '1.5px solid var(--color-ok-strong)' },
  action: { background: 'var(--white)', border: '1.5px solid var(--input-border)' },
  wait: { background: 'color-mix(in srgb, var(--color-warn-strong) 8%, transparent)', border: '1.5px dashed var(--color-warn-strong)', borderRadius: 9 },
  human: { background: 'var(--white)', border: '2px solid var(--dark)' },
  terminal: { background: 'var(--white)', border: '1.5px solid var(--tint-deep)' },
  flag: { background: 'color-mix(in srgb, var(--color-err-strong) 6%, transparent)', border: '1.5px solid var(--color-err-strong)' },
  trigger: { background: 'var(--dark)', border: '1.5px solid var(--dark)' },
}

export function GraphLegend({ items }: { items: Array<{ kind: string; label: string }> }) {
  return (
    <div className="site-wf-graph-legend">
      {items.map((it) => (
        <span key={it.kind + it.label}>
          <i
            aria-hidden
            className="site-wf-g-swatch" style={{ ...LEGEND_SWATCH[it.kind] }} /* layout-ok: swatch colours come from the legend table */
          />
          {it.label}
        </span>
      ))}
    </div>
  )
}
