import { describe, expect, it } from 'vitest'
import { NARRATION_MAX_CHARS, buildNarration, cleanSpoken, spokenDate } from './narrate.ts'
import type { NarrationFields } from './narrate.ts'

function fields(partial: Partial<NarrationFields> & Pick<NarrationFields, 'title' | 'dateDisplay'>): NarrationFields {
  return {
    description: '',
    inventor: [],
    ...partial,
  }
}

describe('buildNarration', () => {
  it('includes title and date', () => {
    const script = buildNarration(
      fields({
        title: 'Ceramics',
        dateDisplay: 'c. 28 thousand years ago',
        description: 'Ceramics (direct evidence) and weaving (impressions left in the ceramics) in Moravia.',
      }),
    )
    expect(script).toMatch(/Ceramics/)
    expect(script).toMatch(/Circa 28 thousand years ago/)
  })

  it('omits empty inventor', () => {
    const script = buildNarration(
      fields({
        title: 'Ceramics',
        dateDisplay: 'c. 28 thousand years ago',
        description: 'Direct evidence of ceramics and weaving impressions from Moravia.',
        inventor: [],
      }),
    )
    expect(script).not.toMatch(/\bBy\b/)
    expect(script).not.toMatch(/inventor/i)
  })

  it('names an inventor when present and not already in the copy', () => {
    const script = buildNarration(
      fields({
        title: 'Phonograph',
        dateDisplay: '1877',
        description: 'The first working phonograph records sound onto a cylinder.',
        inventor: ['Thomas Edison'],
      }),
    )
    expect(script).toMatch(/Thomas Edison/)
  })

  it('stays bounded', () => {
    const script = buildNarration(
      fields({
        title: 'Printing press',
        dateDisplay: 'c. 1439 CE',
        description:
          'Printing press in Mainz, Germany: The printing press is invented in the Holy Roman Empire by Johannes Gutenberg before 1440, based on existing screw presses. The first confirmed record of a press appeared in a 1439 lawsuit against Gutenberg. Additional commentary repeats the same story with more names and places so the builder must trim. '.repeat(
            8,
          ),
        inventor: ['Johannes Gutenberg'],
        significance:
          'Movable-type printing multiplied texts and accelerated the spread of knowledge, religion, science, and news in Europe, then the world, then every later medium that copied its logic.',
        location: { name: 'Mainz', kind: 'invented-in' },
      }),
    )
    expect(script.length).toBeGreaterThan(40)
    expect(script.length).toBeLessThanOrEqual(NARRATION_MAX_CHARS)
  })

  it('adds earliest-evidence location only when the name is new', () => {
    const withPlace = buildNarration(
      fields({
        title: 'Stone tools',
        dateDisplay: 'c. 3.3 million years ago',
        description: 'Earliest known flaked stone tools.',
        location: { name: 'Kenya', kind: 'earliest-evidence' },
      }),
    )
    expect(withPlace).toMatch(/Earliest known evidence in Kenya/)

    const alreadyNamed = buildNarration(
      fields({
        title: 'Stone tools',
        dateDisplay: 'c. 3.3 million years ago',
        description: 'Earliest known flaked stone tools from Kenya.',
        location: { name: 'Kenya', kind: 'earliest-evidence' },
      }),
    )
    expect(alreadyNamed).not.toMatch(/Earliest known evidence in Kenya/)
  })
})

describe('spoken helpers', () => {
  it('expands circa dates for speech', () => {
    expect(spokenDate('c. 28 thousand years ago')).toBe('Circa 28 thousand years ago')
    expect(spokenDate('c. 3.3–2.6 million years ago')).toBe('Circa 3.3 to 2.6 million years ago')
  })

  it('strips citation crumbs', () => {
    expect(cleanSpoken('Hafting stone tools,[1] according to Elis Kvavadze et al.')).toBe(
      'Hafting stone tools.',
    )
  })
})
