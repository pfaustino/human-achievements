import { describe, expect, it } from 'vitest'
import { formatClock, formatYear, inferPrecision, kyaToYear, myaToYear } from './dates.ts'
import { axisToYear, niceTicks, yearToAxis } from './scale.ts'
import { loadEras, loadInventions } from './catalog.ts'
import type { Invention } from './types.ts'
import { Playback, dwellMs } from '../timeline/Playback.ts'

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

  it('keeps full-span ticks readable instead of a 3.x Mya cluster', () => {
    const ticks = niceTicks(-3_300_000, 2026, 9)
    const mya = ticks.filter((year) => formatClock(year).includes('Mya'))
    expect(mya.length).toBeLessThanOrEqual(2)
    expect(ticks[0]).toBe(-3_300_000)
    expect(ticks).toContain(-10_000)
    expect(ticks).not.toContain(-300_000)
    expect(ticks).not.toContain(-40_000)
    expect(ticks.some((year) => year >= 1400 && year <= 1600)).toBe(true)
    expect(ticks.some((year) => year >= 1900)).toBe(true)
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

  it('does not treat news orgs or journals as inventions', () => {
    const junk =
      /^(NPR|BBC|BBC News|CBC Radio|Reuters|Elsevier|Science|Science \(journal\)|Nature|Time Magazine|Proceedings of the National Academy of Sciences)$/i
    const bad = all.filter((item) => junk.test(item.title) || junk.test(item.wikipediaTitle ?? ''))
    expect(bad.map((item) => `${item.title} (${item.dateDisplay})`)).toEqual([])
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

  it('uses one hold duration for every slide', () => {
    const playback = new Playback()
    playback.setHoldSeconds(0.5)
    expect(playback.dwellMs()).toBe(500)
    expect(dwellMs(0.5)).toBe(500)
  })

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

  it('steps through every same-year invention without skipping', () => {
    const sameYear = [
      fakeInvention('same-a', 1876, 'Alpha', 3),
      fakeInvention('same-b', 1876, 'Bravo', 2),
      fakeInvention('same-c', 1876, 'Charlie', 1),
    ]
    const playback = new Playback()
    playback.setEvents(sameYear, [], 12_000)
    expect(playback.step(1)?.id).toBe('same-a')
    expect(playback.step(1)?.id).toBe('same-b')
    expect(playback.step(1)?.id).toBe('same-c')
    expect(playback.step(-1)?.id).toBe('same-b')
    expect(playback.step(-1)?.id).toBe('same-a')
    playback.selectEvent(sameYear[0])
    expect(playback.focused?.id).toBe('same-a')
    expect(playback.step(1)?.id).toBe('same-b')
  })

  it('steps from Acheulean to origin of language, not Bone tools', () => {
    const all = loadInventions()
    const playback = new Playback()
    playback.setEvents(all, loadEras(), 12_000)
    const acheulean = all.find((item) => item.title === 'Acheulean')
    expect(acheulean).toBeTruthy()
    const index = all.findIndex((item) => item.id === acheulean?.id)
    const after = all.slice(index + 1, index + 6)
    expect(after.map((item) => item.title)).toEqual([
      'origin of language',
      'Bone tool',
      'Control of fire',
      'Cooking',
      'Rafts',
    ])
    playback.selectEvent(acheulean!)
    const next = playback.step(1)
    expect(next?.title).toMatch(/language/i)
    expect(next?.title).not.toBe('Bone tool')
    expect(playback.step(1)?.title).toBe('Bone tool')
    expect(playback.step(-1)?.title).toMatch(/language/i)
  })

  it('plays every event from Acheulean including origin of language', () => {
    const all = loadInventions()
    const playback = new Playback()
    playback.setEvents(all, loadEras(), 12_000)
    const acheulean = all.find((item) => item.title === 'Acheulean')
    expect(acheulean).toBeTruthy()
    playback.selectEvent(acheulean!)
    playback.playing = true
    const seen = collectPlayTitles(playback, 4)
    expect(seen[0]).toMatch(/language/i)
    expect(seen[1]).toBe('Bone tool')
    expect(seen[2]).toBe('Control of fire')
    expect(seen[3]).toBe('Cooking')
  })

  it('plays each same-year invention without skipping', () => {
    const sameYear = [
      fakeInvention('same-a', 1876, 'Alpha', 3),
      fakeInvention('same-b', 1876, 'Bravo', 2),
      fakeInvention('same-c', 1876, 'Charlie', 1),
    ]
    const playback = new Playback()
    playback.setEvents(sameYear, [], 12_000)
    playback.startFromBeginning(12_000)
    expect(collectPlayIds(playback, 3)).toEqual(['same-a', 'same-b', 'same-c'])
  })

  it('plays every event in reverse including origin of language', () => {
    const all = loadInventions()
    const playback = new Playback()
    playback.setEvents(all, loadEras(), 12_000)
    const bone = all.find((item) => item.title === 'Bone tool' && item.dateStart === -1_500_000)
    expect(bone).toBeTruthy()
    playback.selectEvent(bone!)
    playback.setDirection(-1)
    playback.playing = true
    const seen = collectPlayTitles(playback, 2)
    expect(seen[0]).toMatch(/language/i)
    expect(seen[1]).toBe('Acheulean')
  })
})

function collectPlayTitles(playback: Playback, count: number): string[] {
  const seen: string[] = []
  for (let i = 0; i < 8000 && seen.length < count; i += 1) {
    playback.tick(50, (event) => seen.push(event.title))
  }
  return seen
}

function collectPlayIds(playback: Playback, count: number): string[] {
  const seen: string[] = []
  for (let i = 0; i < 8000 && seen.length < count; i += 1) {
    playback.tick(50, (event) => seen.push(event.id))
  }
  return seen
}

function fakeInvention(id: string, year: number, title: string, tier: 1 | 2 | 3): Invention {
  return {
    id,
    title,
    dateStart: year,
    dateDisplay: String(year),
    datePrecision: 'year',
    description: title,
    categories: [],
    sources: [],
    tier,
    section: String(year),
  }
}
