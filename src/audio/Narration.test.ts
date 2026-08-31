import { afterEach, describe, expect, it } from 'vitest'
import { NARRATION_PITCH, NARRATION_RATE, Narration, estimateSpeechMs, narrationText } from './Narration.ts'

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

describe('Narration speak/cancel', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis as object, 'window')
    Reflect.deleteProperty(globalThis as object, 'SpeechSynthesisUtterance')
  })

  it('cancels before starting the next card', () => {
    const spoken: string[] = []
    let cancels = 0
    const utterance = class {
      text = ''
      rate = 1
      pitch = 1
      lang = ''
      voice: object | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(text: string) {
        this.text = text
      }
    }
    const spokenUtterances: InstanceType<typeof utterance>[] = []
    ;(globalThis as { window?: object }).window = {
      speechSynthesis: {
        cancel: () => {
          cancels += 1
        },
        speak: (next: InstanceType<typeof utterance>) => {
          spoken.push(next.text)
          spokenUtterances.push(next)
        },
        speaking: false,
      },
    }
    ;(globalThis as { SpeechSynthesisUtterance?: typeof utterance }).SpeechSynthesisUtterance = utterance

    const voice = new Narration()
    voice.speak('First invention')
    const cancelsAfterFirst = cancels
    voice.speak('Second invention')
    expect(cancelsAfterFirst).toBeGreaterThan(0)
    expect(cancels).toBeGreaterThan(cancelsAfterFirst)
    expect(spoken).toEqual(['First invention', 'Second invention'])
    expect(spokenUtterances[0]?.rate).toBe(NARRATION_RATE)
    expect(spokenUtterances[0]?.pitch).toBe(NARRATION_PITCH)
  })
})
