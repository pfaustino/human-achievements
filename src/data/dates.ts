import type { DatePrecision } from './types.ts'

/** Integer calendar year. Negative values are BCE with no year 0 (−1 is 1 BCE). */

export const PRESENT_YEAR = 2026
export const TIMELINE_START = -3_300_000

export function formatYear(year: number): string {
  if (!Number.isFinite(year)) return '—'
  const y = Math.trunc(year)
  const ago = PRESENT_YEAR - y
  if (ago >= 1_000_000) {
    const mya = ago / 1_000_000
    const digits = mya >= 10 ? 0 : 1
    return `${trimNumber(mya, digits)} million years ago`
  }
  if (ago >= 10_000 && y < -2000) {
    if (ago >= 100_000) return `${Math.round(ago / 1000).toLocaleString('en-US')} thousand years ago`
    return `${Math.round(ago / 100) * 100} years ago`
  }
  if (y < 0) return `${Math.abs(y).toLocaleString('en-US')} BCE`
  return `${y} CE`
}

export function formatClock(year: number): string {
  if (!Number.isFinite(year)) return '—'
  const y = Math.trunc(year)
  const ago = PRESENT_YEAR - y
  if (ago >= 1_000_000) {
    const mya = ago / 1_000_000
    return `${trimNumber(mya, mya >= 10 ? 0 : 1)} Mya`
  }
  if (ago >= 20_000) return `${Math.round(ago / 1000)} kya`
  if (y < 0) return `${Math.abs(y).toLocaleString('en-US')} BCE`
  return `${y}`
}

export function formatDateDisplay(
  start: number,
  end: number | undefined,
  precision: DatePrecision,
  stored?: string,
): string {
  if (stored && stored.trim()) return stored
  if (end != null && end !== start) {
    if (precision === 'million-years-ago' || Math.abs(start) >= 100_000) {
      return `${formatYear(start)} – ${formatYear(end)}`
    }
    return `${formatYear(start)} – ${formatYear(end)}`
  }
  if (precision === 'approximate' || precision === 'million-years-ago' || precision === 'thousand-years-ago') {
    return `c. ${formatYear(start)}`
  }
  return formatYear(start)
}

export function yearsAgoToYear(yearsAgo: number): number {
  return PRESENT_YEAR - Math.round(yearsAgo)
}

export function myaToYear(mya: number): number {
  return yearsAgoToYear(mya * 1_000_000)
}

export function kyaToYear(kya: number): number {
  return yearsAgoToYear(kya * 1000)
}

export function inferPrecision(start: number, end: number | undefined, raw: string): DatePrecision {
  const text = raw.toLowerCase()
  if (/mya|million years/.test(text)) return 'million-years-ago'
  if (/\bkya\b|thousand years/.test(text)) return 'thousand-years-ago'
  if (/millennium/.test(text)) return 'millennium'
  if (/century/.test(text)) return 'century'
  if (end != null && end !== start) return 'range'
  if (/c\.|circa|about|around|likely|estimated|probably|~/.test(text)) return 'approximate'
  if (start >= 1500 && start === end) return 'year'
  return start < 0 ? 'approximate' : 'year'
}

export function isUncertain(precision: DatePrecision): boolean {
  return precision !== 'exact' && precision !== 'year'
}

function trimNumber(value: number, digits: number): string {
  const fixed = value.toFixed(digits)
  return fixed.replace(/\.0$/, '')
}
