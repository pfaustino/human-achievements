/** Browser SpeechSynthesis narrator for invention descriptions. */

export const NARRATION_WPM = 140
export const NARRATION_TAIL_MS = 450
export const NARRATION_MIN_MS = 900
export const NARRATION_HOLD_PAD = 1.2

export function estimateSpeechMs(
  text: string,
  wordsPerMinute = NARRATION_WPM,
): number {
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  if (words === 0) return NARRATION_MIN_MS
  const ms = (words / wordsPerMinute) * 60_000 + NARRATION_TAIL_MS
  return Math.max(NARRATION_MIN_MS, Math.round(ms))
}

export function narrationText(description: string): string {
  return description.replace(/\s+/g, ' ').trim()
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

type SpeakHandlers = {
  onEnd?: () => void
  onError?: () => void
}

export class Narration {
  private utterance: SpeechSynthesisUtterance | null = null
  private generation = 0
  enabled = true

  speak(text: string, handlers: SpeakHandlers = {}): number {
    const cleaned = narrationText(text)
    const estimated = estimateSpeechMs(cleaned)
    this.cancel()
    if (!cleaned || !this.enabled || !isSpeechSupported()) {
      handlers.onEnd?.()
      return estimated
    }

    const generation = ++this.generation
    const utterance = new SpeechSynthesisUtterance(cleaned)
    utterance.rate = 1
    utterance.pitch = 1
    utterance.lang = 'en-US'
    this.utterance = utterance

    const finish = (fn?: () => void) => {
      if (generation !== this.generation) return
      this.utterance = null
      fn?.()
    }

    utterance.onend = () => finish(handlers.onEnd)
    utterance.onerror = () => finish(handlers.onError ?? handlers.onEnd)

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    return estimated
  }

  cancel(): void {
    this.generation += 1
    this.utterance = null
    if (isSpeechSupported()) window.speechSynthesis.cancel()
  }

  speaking(): boolean {
    return isSpeechSupported() && window.speechSynthesis.speaking
  }
}
