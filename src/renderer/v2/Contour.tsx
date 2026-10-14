import { useMemo } from 'react'

/**
 * A mountain drawn as a topographic map: contour rings around the summit, and the trail
 * climbing through them with one waypoint per milestone. The rings are generated from
 * the mountain's id, so each mountain keeps its own shape; the trail fills in as
 * milestones are reached.
 */

type Pt = [number, number]

const W = 1000
const H = 420

/** Small deterministic noise so a mountain looks the same on every visit. */
function rand(seed: number): () => number {
  let s = (seed * 9301 + 49297) % 233280 || 1
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

/** A smooth closed (or open) path through points, as cubic Béziers (Catmull–Rom). */
function smooth(points: Pt[], closed: boolean): string {
  const n = points.length
  const at = (i: number): Pt => (closed ? points[(i + n) % n]! : points[Math.max(0, Math.min(n - 1, i))]!)
  let d = `M${points[0]![0].toFixed(1)},${points[0]![1].toFixed(1)}`
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return closed ? `${d} Z` : d
}

/** Points along the same Catmull–Rom curve, for placing waypoints by distance walked. */
function sample(points: Pt[], perSegment = 24): Pt[] {
  const out: Pt[] = []
  const n = points.length
  const at = (i: number): Pt => points[Math.max(0, Math.min(n - 1, i))]!
  for (let i = 0; i < n - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment
      const t2 = t * t
      const t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  out.push(points[n - 1]!)
  return out
}

function pointAt(line: Pt[], fraction: number): Pt {
  const lengths = [0]
  for (let i = 1; i < line.length; i++) {
    lengths.push(lengths[i - 1]! + Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]))
  }
  const target = lengths[lengths.length - 1]! * Math.max(0, Math.min(1, fraction))
  const i = lengths.findIndex((l) => l >= target)
  if (i <= 0) return line[0]!
  const span = lengths[i]! - lengths[i - 1]! || 1
  const k = (target - lengths[i - 1]!) / span
  return [line[i - 1]![0] + (line[i]![0] - line[i - 1]![0]) * k, line[i - 1]![1] + (line[i]![1] - line[i - 1]![1]) * k]
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
  /** Small, unlabelled — for lists. */
  compact?: boolean
}) {
  const shape = useMemo(() => {
    const r = rand(seed + 7)
    const summit: Pt = [610 + r() * 120, 150 + r() * 40]
    const phase = [r() * 6.28, r() * 6.28, r() * 6.28]
    const rings: { d: string; index: boolean }[] = []
    for (let k = 1; k <= 11; k++) {
      const base = k * 34
      const pts: Pt[] = []
      for (let s = 0; s < 64; s++) {
        const a = (s / 64) * Math.PI * 2
        const wobble = 1 + 0.13 * Math.sin(3 * a + phase[0]!) + 0.07 * Math.sin(5 * a + phase[1]! + k * 0.25) + 0.05 * Math.sin(2 * a + phase[2]!)
        pts.push([summit[0] + Math.cos(a) * base * 1.7 * wobble, summit[1] + Math.sin(a) * base * wobble])
      }
      rings.push({ d: smooth(pts, true), index: k % 5 === 0 })
    }

    // The trail: switchbacks from the trailhead, bottom left, up to the summit.
    const start: Pt = [70, 390]
    const turns: Pt[] = [start]
    const legs = 5
    for (let i = 1; i < legs; i++) {
      const t = i / legs
      const x = start[0] + (summit[0] - start[0]) * t + (i % 2 ? 90 : -60) * (1 - t)
      const y = start[1] + (summit[1] - start[1]) * t + (r() - 0.5) * 30
      turns.push([x, y])
    }
    turns.push(summit)
    return { summit, rings, trail: smooth(turns, false), line: sample(turns) }
  }, [seed])

  const total = waypoints.length
  const reached = waypoints.filter((w) => w.done).length
  // Waypoints sit evenly along the trail; the summit is the last stop.
  const fractionOf = (i: number): number => (i + 1) / (total + 1)
  // You stand on the last waypoint reached; all of them reached means the summit.
  const walked = total > 0 && reached === total ? 1 : reached / (total + 1)
  const you = pointAt(shape.line, walked)
  const next = waypoints.findIndex((w) => !w.done)

  return (
    <svg className={`k2-peak${compact ? ' is-compact' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${reached} of ${total} milestones reached`}>
      {shape.rings.map((ring, i) => (
        <path key={i} className={`contour${ring.index ? ' is-index' : ''}`} d={ring.d} />
      ))}
      <path className="trail" d={shape.trail} />
      {walked > 0 ? <path className="trail is-walked" d={shape.trail} pathLength={1} strokeDasharray={`${walked} 1`} /> : null}
      {waypoints.map((w, i) => {
        const [x, y] = pointAt(shape.line, fractionOf(i))
        return <circle key={i} className={`waypoint${w.done ? ' is-done' : ''}`} cx={x} cy={y} r={compact ? 12 : 7} />
      })}
      <g transform={`translate(${shape.summit[0]},${shape.summit[1]})`}>
        <path d="M-11 9 L0 -11 L11 9 Z" fill="var(--k2-granite)" />
      </g>
      <circle className="you" cx={you[0]} cy={you[1]} r={compact ? 17 : 10} />
      {compact ? null : (
        <>
          <text className="peak-label" x={shape.summit[0]} y={shape.summit[1] - 22} textAnchor="middle" fontWeight={650}>
            {title.length > 40 ? `${title.slice(0, 38)}…` : title}
          </text>
          {next >= 0 ? (
            (() => {
              const [x, y] = pointAt(shape.line, fractionOf(next))
              const label = waypoints[next]!.title
              return (
                <text className="peak-label is-faint" x={x + 20} y={y + 5}>
                  {label.length > 34 ? `${label.slice(0, 32)}…` : label}
                </text>
              )
            })()
          ) : null}
        </>
      )}
    </svg>
  )
}
