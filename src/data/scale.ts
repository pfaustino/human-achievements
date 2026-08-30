/** Piecewise-linear axis that compresses deep time and expands recent centuries. */

export type Breakpoint = {
  year: number
  weight: number
}

export const BREAKPOINTS: Breakpoint[] = [
  { year: -3_300_000, weight: 7 },
  { year: -300_000, weight: 5 },
  { year: -40_000, weight: 5 },
  { year: -10_000, weight: 8 },
  { year: -3_300, weight: 7 },
  { year: -800, weight: 6 },
  { year: 500, weight: 6 },
  { year: 1450, weight: 8 },
  { year: 1760, weight: 10 },
  { year: 1900, weight: 12 },
  { year: 1945, weight: 11 },
  { year: 1990, weight: 10 },
  { year: 2026, weight: 7 },
]

type Segment = {
  year0: number
  year1: number
  axis0: number
  axis1: number
}

const segments: Segment[] = buildSegments(BREAKPOINTS)

function buildSegments(points: Breakpoint[]): Segment[] {
  const total = points.slice(0, -1).reduce((sum, point) => sum + point.weight, 0)
  let axis = 0
  const out: Segment[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const span = points[i].weight / total
    out.push({
      year0: points[i].year,
      year1: points[i + 1].year,
      axis0: axis,
      axis1: axis + span,
    })
    axis += span
  }
  return out
}

export function yearToAxis(year: number): number {
  const y = clampYear(year)
  for (const segment of segments) {
    if (y <= segment.year1) {
      const t = (y - segment.year0) / (segment.year1 - segment.year0)
      return segment.axis0 + t * (segment.axis1 - segment.axis0)
    }
  }
  return 1
}

export function axisToYear(axis: number): number {
  const a = Math.min(1, Math.max(0, axis))
  for (const segment of segments) {
    if (a <= segment.axis1) {
      const t = (a - segment.axis0) / (segment.axis1 - segment.axis0)
      return segment.year0 + t * (segment.year1 - segment.year0)
    }
  }
  return segments[segments.length - 1].year1
}

export function clampYear(year: number): number {
  const first = BREAKPOINTS[0].year
  const last = BREAKPOINTS[BREAKPOINTS.length - 1].year
  return Math.min(last, Math.max(first, year))
}

export function niceTicks(viewStart: number, viewEnd: number, target = 8): number[] {
  const span = Math.max(1, viewEnd - viewStart)
  const raw = span / Math.max(2, target)
  const step = niceStep(raw)
  const first = Math.ceil(viewStart / step) * step
  const ticks: number[] = []
  const maxTicks = 24
  for (let year = first; year <= viewEnd && ticks.length < maxTicks; year += step) {
    ticks.push(year)
  }
  if (ticks.length === 0) ticks.push(Math.round((viewStart + viewEnd) / 2))
  return ticks
}

function niceStep(raw: number): number {
  if (raw >= 1_000_000) return 1_000_000
  if (raw >= 500_000) return 500_000
  if (raw >= 100_000) return 100_000
  if (raw >= 50_000) return 50_000
  if (raw >= 10_000) return 10_000
  if (raw >= 5000) return 5000
  if (raw >= 1000) return 1000
  if (raw >= 500) return 500
  if (raw >= 100) return 100
  if (raw >= 50) return 50
  if (raw >= 10) return 10
  if (raw >= 5) return 5
  return 1
}
