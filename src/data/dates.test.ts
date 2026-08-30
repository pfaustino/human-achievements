import { describe, expect, it } from 'vitest'
import { formatClock, formatYear, inferPrecision, kyaToYear, myaToYear } from './dates.ts'
import { axisToYear, yearToAxis } from './scale.ts'
import { loadInventions } from './catalog.ts'
import { Playback } from '../timeline/Playback.ts'
import { loadEras } from './catalog.ts'

describe('formatYear', () => {
  it('formats BCE and CE without a year zero', () => {
    expect(formatYear(-3500)).toBe('3,500 BCE')
    expect(formatYear(-1)).toBe('1 BCE')
    expect(formatYear(1440)).toContain('1440')
  })

  it('uses million-year language for deep time', () => {
    expect(formatYear(-3_300_000)).toMatch(/million years ago/)
    expect(formatClock(-3_300_000)).toMatch(/Mya/)
  })
})

describe('prehistoric conversion', () => {
  it('converts mya and kya to negative years', () => {
    expect(myaToYear(3.3)).toBeLessThan(-3_000_000)
    expect(kyaToYear(500)).toBeLessThan(-400_000)
    expect(kyaToYear(10)).toBeLessThan(-7000)
  })
})

describe('precision', () => {
  it('keeps archaeological language approximate', () => {
    expect(inferPrecision(-2_600_000, undefined, '2.6 Mya')).toBe('million-years-ago')
    expect(inferPrecision(-500_000, undefined, '500 kya')).toBe('thousand-years-ago')
    expect(inferPrecision(-3500, -3000, '3500–3000 BC')).toBe('range')
    expect(inferPrecision(1876, 1876, '1876')).toBe('year')
  })
})

describe('nonlinear scale', () => {
  it('maps the full span onto 0–1 and back', () => {
    expect(yearToAxis(-3_300_000)).toBeCloseTo(0, 3)
    expect(yearToAxis(2026)).toBeCloseTo(1, 3)
    expect(axisToYear(0)).toBe(-3_300_000)
    expect(axisToYear(1)).toBe(2026)
  })

  it('gives the industrial era more axis than an equal prehistoric span', () => {
    const paleo = yearToAxis(-10_000) - yearToAxis(-20_000)
    const industrial = yearToAxis(1900) - yearToAxis(1760)
    expect(industrial).toBeGreaterThan(paleo)
  })
})

describe('catalog', () => {
  const all = loadInventions()

  it('has unique ids and spans prehistory to the present', () => {
    expect(all.length).toBeGreaterThan(80)
    const ids = all.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(all[0].dateStart).toBeLessThan(-1_000_000)
    expect(all[all.length - 1].dateStart).toBeGreaterThan(1990)
  })

  it('does not flip BCE into positive years', () => {
    for (const item of all) {
      if (/BCE|BC|Mya|kya|million years|thousand years/i.test(item.dateDisplay)) {
        expect(item.dateStart).toBeLessThan(0)
      }
      if (item.dateEnd != null) expect(item.dateEnd).toBeGreaterThanOrEqual(item.dateStart)
      expect(item.dateStart).toBeLessThanOrEqual(2026)
    }
  })

  it('keeps Gutenberg and the transistor as named inventions', () => {
    expect(all.some((item) => item.title === 'Printing press' && item.inventor?.includes('Johannes Gutenberg'))).toBe(true)
    expect(all.some((item) => item.title === 'Transistor' && item.dateStart === 1947)).toBe(true)
    expect(all.some((item) => item.title === 'World Wide Web')).toBe(true)
  })

  it('keeps Wikipedia links and does not invent exact prehistoric years', () => {
    for (const item of all) {
      if (item.wikipediaUrl) {
        expect(item.wikipediaUrl.startsWith('https://en.wikipedia.org/wiki/')).toBe(true)
      }
      if (item.dateStart < -20_000) {
        expect(['million-years-ago', 'thousand-years-ago', 'range', 'approximate', 'millennium']).toContain(
          item.datePrecision,
        )
        expect(item.dateDisplay).not.toMatch(/^\d{7}/)
      }
    }
  })
})

describe('Playback', () => {
  const events = loadInventions().filter((item) => item.tier <= 2).slice(0, 12)
  const eras = loadEras()

  it('emits the first featured invention while playing forward', () => {
    const playback = new Playback()
    playback.setEvents(events, eras, 12_000)
    playback.playing = true
    const seen: string[] = []
    playback.tick(40, (event) => seen.push(event.id))
    expect(seen[0]).toBe(events[0].id)
    expect(playback.focused?.id).toBe(events[0].id)
  })

  it('holds the playhead during dwell', () => {
    const playback = new Playback()
    playback.setEvents(events, eras, 12_000)
    playback.playing = true
    playback.tick(20, () => {})
    const year = playback.playhead
    const remain = playback.focusRemain
    playback.tick(40, () => {})
    expect(playback.playhead).toBe(year)
    expect(playback.focusRemain).toBeLessThan(remain)
  })

  it('steps through featured inventions', () => {
    const playback = new Playback()
    playback.setEvents(events, eras, 12_000)
    playback.playing = true
    playback.tick(20, () => {})
    const second = playback.step(1)
    expect(second?.id).toBe(events[1].id)
    const back = playback.step(-1)
    expect(back?.id).toBe(events[0].id)
  })
})
