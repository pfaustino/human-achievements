import { describe, expect, it } from 'vitest'
import { estimateSpeechMs, narrationText } from './Narration.ts'

describe('estimateSpeechMs', () => {
  it('scales with word count for description-length copy', () => {
    const trade =
      'The trade and long-distance (up to 50 miles) transportation of resources (e.g. obsidian), use of pigments, and possible making of projectile points in Kenya'
    const short = estimateSpeechMs('Stone tools.')
    const long = estimateSpeechMs(trade)
    expect(long).toBeGreaterThan(short)
    expect(long).toBeGreaterThan(8_000)
  })

  it('never returns below the minimum floor', () => {
    expect(estimateSpeechMs('')).toBeGreaterThanOrEqual(900)
    expect(estimateSpeechMs('Hi')).toBeGreaterThanOrEqual(900)
  })
})

describe('narrationText', () => {
  it('collapses whitespace', () => {
    expect(narrationText('  foo\n bar  ')).toBe('foo bar')
  })
})
