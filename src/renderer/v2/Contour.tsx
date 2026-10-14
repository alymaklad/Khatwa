import { useMemo } from 'react'

/**
 * The climb, seen from the side: a mountain with a switchback trail from base camp to
 * the summit flag, one stop per milestone at the turns of the trail. The ridge line is
 * generated from the mountain's id, so each mountain keeps its own profile; the trail is
 * inked in as milestones are reached, and the climber stands at the last stop reached.
 */

type Pt = [number, number]

const W = 1000
const H = 560
const PEAK: Pt = [560, 70]
const FOOT: Pt = [250, 528]

/** Small deterministic noise so a mountain looks the same on every visit. */
function rand(seed: number): () => number {
  let s = (seed * 9301 + 49297) % 233280 || 1
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

/**
 * A smooth open path through points, as cubic Béziers (Catmull–Rom). `stretches` stops it
 * early on the very same curve, which is how the walked part follows the trail exactly.
 */
function smooth(points: Pt[], stretches = points.length - 1): string {
  const n = points.length
  const at = (i: number): Pt => points[Math.max(0, Math.min(n - 1, i))]!
  let d = `M${points[0]![0].toFixed(1)},${points[0]![1].toFixed(1)}`
  for (let i = 0; i < Math.min(stretches, n - 1); i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

/** The tent sits beside the start of the trail, so the climber never hides it. */
const CAMP: Pt = [FOOT[0] - 58, FOOT[1] + 6]

const poly = (pts: Pt[]): string => `M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L')} Z`

/** The points strictly between a and b, nudged off the straight line: the edge of a ridge. */
function ridge(a: Pt, b: Pt, steps: number, rough: number, r: () => number): Pt[] {
  const out: Pt[] = []
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    out.push([a[0] + (b[0] - a[0]) * t + (r() - 0.5) * rough, a[1] + (b[1] - a[1]) * t + (r() - 0.5) * rough])
  }
  return out
}

export interface Waypoint {
  title: string
  done: boolean
}

export function ContourMountain({
  seed,
  title,
  waypoints,
  compact = false
}: {
  seed: number
  title: string
  waypoints: Waypoint[]
  /** Small and unlabelled, for cards. */
  compact?: boolean
}) {
  const n = waypoints.length

  const land = useMemo(() => {
    const r = rand(seed + 7)
    const leftBase: Pt = [-20, H]
    const rightBase: Pt = [W + 20, H]
    const left = ridge(leftBase, PEAK, 7, 46, r)
    const right = ridge(PEAK, rightBase, 8, 46, r)
    // The shadowed face: down a spur from the summit, then back up the right flank.
    const spurFoot: Pt = [PEAK[0] + 130, H]
    const spur = ridge(PEAK, spurFoot, 5, 34, r)
    const snowLine = PEAK[1] + 92
    const snow: Pt[] = [
      PEAK,
      [PEAK[0] + 160, PEAK[1] - 20],
      [PEAK[0] + 160, snowLine - 6],
      [PEAK[0] + 80, snowLine - 6],
      [PEAK[0] + 46, snowLine - 30 + r() * 12],
      [PEAK[0] + 18, snowLine + r() * 14],
      [PEAK[0] - 14, snowLine - 34 + r() * 12],
      [PEAK[0] - 42, snowLine - 4 + r() * 10],
      [PEAK[0] - 74, snowLine - 10],
      [PEAK[0] - 160, snowLine - 10],
      [PEAK[0] - 160, PEAK[1] - 20]
    ]
    const back: Pt[] = [
      [-20, H],
      [-20, 300],
      [140, 220 + r() * 30],
      [270, 300],
      [390, 250 + r() * 30],
      [480, 330],
      [730, 190 + r() * 40],
      [870, 270],
      [W + 20, 230 + r() * 30],
      [W + 20, H]
    ]
    return {
      back: poly(back),
      mountain: poly([leftBase, ...left, PEAK, ...right, rightBase]),
      shade: poly([PEAK, ...spur, spurFoot, rightBase, ...[...right].reverse()]),
      snow: poly(snow)
    }
  }, [seed])

  // The trail switches back across the face; each turn is a milestone, tighter as it climbs.
  const stops: Pt[] = waypoints.map((_, i) => {
    const t = (i + 1) / (n + 1)
    const side = i % 2 === 0 ? -1 : 1
    const spread = 250 * (1 - t * 0.72)
    return [PEAK[0] + side * spread * 0.85 + (1 - t) * (FOOT[0] - PEAK[0]) * 0.35, FOOT[1] - t * (FOOT[1] - PEAK[1])]
  })
  const trail: Pt[] = [FOOT, ...stops, PEAK]
  const reached = waypoints.filter((w) => w.done).length
  const next = waypoints.findIndex((w) => !w.done)
  // trail[k] is where the climber stands: the foot, the last stop reached, or the summit.
  const at = next === -1 ? (n > 0 ? n + 1 : 0) : next
  const you = trail[at]!
  const top = (p: Pt): string => `${(p[1] / H) * 100}%`

  return (
    <div className={`k2-climb${compact ? ' is-compact' : ''}`}>
      <svg className="k2-peak" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${reached} of ${n} milestones reached`}>
        <path className="range" d={land.back} />
        <path className="rock" d={land.mountain} />
        <path className="rock-shade" d={land.shade} />
        <clipPath id={`k2-rock-${seed}`}>
          <path d={land.mountain} />
        </clipPath>
        <path className="snowcap" d={land.snow} clipPath={`url(#k2-rock-${seed})`} />

        <path className="trail" d={smooth(trail)} />
        {at > 0 ? <path className="trail is-walked" d={smooth(trail, at)} /> : null}

        <path className="camp" d={`M${CAMP[0] - 22},${CAMP[1] + 14} L${CAMP[0]},${CAMP[1] - 16} L${CAMP[0] + 22},${CAMP[1] + 14} Z`} />

        {stops.map((p, i) => (
          <circle key={i} className={`waypoint${waypoints[i]!.done ? ' is-done' : i === next ? ' is-next' : ''}`} cx={p[0]} cy={p[1]} r={9} />
        ))}

        <g transform={`translate(${PEAK[0]},${PEAK[1]})`}>
          <path className="flag-pole" d="M0,0 V-48" />
          <path className={`flag-cloth${next === -1 && n > 0 ? ' is-reached' : ''}`} d="M0,-48 L36,-39 L0,-30 Z" />
        </g>

        <circle className="you" cx={you[0]} cy={you[1]} r={13} />
      </svg>

      {compact ? null : (
        <>
          {stops.map((p, i) => {
            const w = waypoints[i]!
            const onLeft = i % 2 === 0
            const x = (p[0] / W) * 100
            return (
              <span
                key={i}
                className={`k2-climb-label${w.done ? ' is-done' : ''}${i === next ? ' is-next' : ''}${onLeft ? ' is-left' : ''}`}
                style={onLeft ? { right: `${100 - x + 2.4}%`, top: top(p) } : { left: `${x + 2.4}%`, top: top(p) }}
              >
                {i === next ? <b>Next</b> : null}
                {w.title}
              </span>
            )
          })}
          <span className="k2-climb-label is-summit" style={{ left: `${(PEAK[0] / W) * 100 + 5.2}%`, top: top([0, PEAK[1] - 40]) }}>
            {title}
          </span>
          <span className="k2-climb-label is-camp" style={{ left: `${(FOOT[0] / W) * 100 + 3.4}%`, top: top(FOOT) }}>
            Base camp
          </span>
        </>
      )}
    </div>
  )
}
