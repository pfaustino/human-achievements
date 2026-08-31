import { describe, expect, it } from 'vitest'
import {
  englishVoices,
  friendlyVoiceName,
  matchVoice,
  pickBestVoice,
  scoreVoice,
  type VoiceLike,
} from './voices.ts'

function voice(partial: Partial<VoiceLike> & Pick<VoiceLike, 'name'>): VoiceLike {
  return {
    voiceURI: partial.voiceURI ?? partial.name,
    lang: partial.lang ?? 'en-US',
    name: partial.name,
  }
}

describe('scoreVoice', () => {
  it('prefers natural/online English voices over desktop David or Zira', () => {
    const aria = scoreVoice(voice({ name: 'Microsoft Aria Online (Natural) - English (United States)' }))
    const jenny = scoreVoice(voice({ name: 'Microsoft Jenny Online (Natural) - English (United States)' }))
    const google = scoreVoice(voice({ name: 'Google US English' }))
    const david = scoreVoice(voice({ name: 'Microsoft David Desktop - English (United States)' }))
    const zira = scoreVoice(voice({ name: 'Microsoft Zira Desktop - English (United States)' }))
    expect(aria).toBeGreaterThan(google)
    expect(jenny).toBeGreaterThan(google)
    expect(google).toBeGreaterThan(david)
    expect(google).toBeGreaterThan(zira)
  })

  it('ranks stock Zira above David and Mark when those are the only voices', () => {
    const david = scoreVoice(voice({ name: 'Microsoft David - English (United States)' }))
    const mark = scoreVoice(voice({ name: 'Microsoft Mark - English (United States)' }))
    const zira = scoreVoice(voice({ name: 'Microsoft Zira - English (United States)' }))
    expect(zira).toBeGreaterThan(mark)
    expect(mark).toBeGreaterThan(david)
  })
})

describe('pickBestVoice', () => {
  it('picks Aria over David when both exist', () => {
    const david = voice({ name: 'Microsoft David Desktop - English (United States)' })
    const aria = voice({ name: 'Microsoft Aria Online (Natural) - English (United States)' })
    expect(pickBestVoice([david, aria])).toEqual(aria)
  })

  it('picks Zira from the stock Windows trio', () => {
    const david = voice({ name: 'Microsoft David - English (United States)' })
    const mark = voice({ name: 'Microsoft Mark - English (United States)' })
    const zira = voice({ name: 'Microsoft Zira - English (United States)' })
    expect(pickBestVoice([david, mark, zira])).toEqual(zira)
  })

  it('still returns the only robotic voice', () => {
    const david = voice({ name: 'Microsoft David Desktop - English (United States)' })
    expect(pickBestVoice([david])).toEqual(david)
  })

  it('returns null when the list is empty', () => {
    expect(pickBestVoice([])).toBeNull()
  })
})

describe('matchVoice', () => {
  it('restores a saved URI before falling back to the best voice', () => {
    const google = voice({ name: 'Google US English', voiceURI: 'google-us' })
    const aria = voice({ name: 'Microsoft Aria Online (Natural)', voiceURI: 'aria' })
    expect(matchVoice([google, aria], 'google-us')).toEqual(google)
    expect(matchVoice([google, aria], null)).toEqual(aria)
  })

  it('falls back when the saved voice is gone', () => {
    const aria = voice({ name: 'Microsoft Aria Online (Natural)', voiceURI: 'aria' })
    expect(matchVoice([aria], 'missing')).toEqual(aria)
  })
})

describe('englishVoices', () => {
  it('keeps en-US / en-GB / en-AU and drops other languages', () => {
    const pool = [
      voice({ name: 'Aria', lang: 'en-US' }),
      voice({ name: 'Sonia', lang: 'en-GB' }),
      voice({ name: 'Natasha', lang: 'en-AU' }),
      voice({ name: 'Hortense', lang: 'fr-FR' }),
    ]
    expect(englishVoices(pool).map((item) => item.name)).toEqual(['Aria', 'Sonia', 'Natasha'])
  })
})

describe('friendlyVoiceName', () => {
  it('strips Microsoft prefix and English locale suffix', () => {
    expect(friendlyVoiceName('Microsoft Aria Online (Natural) - English (United States)')).toBe(
      'Aria Online (Natural)',
    )
    expect(friendlyVoiceName('Google US English')).toBe('Google US English')
  })
})
