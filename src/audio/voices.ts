/** Rank and persist Web Speech voices. Quality varies by OS/browser. */

export const VOICE_STORAGE_KEY = 'human-achievements-voice'

export type VoiceLike = {
  voiceURI: string
  name: string
  lang: string
}

const PREFERRED_LANGS = [/^en-us\b/i, /^en-gb\b/i, /^en-au\b/i]
const QUALITY = /\b(natural|neural|online|premium|enhanced)\b/i
const NAMED = /\b(samantha|alex|aria|jenny)\b/i
const GUY_NATURAL = /\bguy\b/i
const GOOGLE = /\bgoogle\b/i
const MICROSOFT = /\bmicrosoft\b/i
const DESKTOP = /\bdesktop\b/i
const STOCK_DAVID = /\bdavid\b/i
const STOCK_MARK = /\bmark\b/i
const STOCK_ZIRA = /\bzira\b/i

export function isEnglishVoice(voice: VoiceLike): boolean {
  return /^en([-_]|$)/i.test(voice.lang)
}

/** Chrome's "Google UK English Male", or any Google en-GB male voice. */
export function isGoogleUkEnglishMale(voice: VoiceLike): boolean {
  const name = voice.name.toLowerCase()
  if (name.includes('google uk english male')) return true
  const lang = voice.lang.replace('_', '-').toLowerCase()
  return lang.startsWith('en-gb') && name.includes('google') && /\bmale\b/.test(name)
}

export function englishVoices<T extends VoiceLike>(voices: T[]): T[] {
  return voices.filter(isEnglishVoice)
}

export function voiceId(voice: VoiceLike): string {
  return voice.voiceURI || voice.name
}

export function friendlyVoiceName(name: string): string {
  const trimmed = name.trim()
  const short = trimmed
    .replace(/\s*[-–—]\s*English\s*\([^)]*\)\s*$/i, '')
    .replace(/^Microsoft\s+/i, '')
    .trim()
  return short || trimmed
}

export function scoreVoice(voice: VoiceLike): number {
  const { name, lang } = voice
  let score = 0
  if (QUALITY.test(name)) score += 50
  if (/\bnatural\b/i.test(name)) score += 8
  if (/\bneural\b/i.test(name)) score += 8
  if (/\bonline\b/i.test(name)) score += 10
  if (GOOGLE.test(name)) score += 24
  if (MICROSOFT.test(name) && /\bonline\b/i.test(name)) score += 16
  if (NAMED.test(name)) score += 20
  if (GUY_NATURAL.test(name) && QUALITY.test(name)) score += 16
  if (STOCK_ZIRA.test(name) && !QUALITY.test(name)) score += 6
  if (DESKTOP.test(name)) score -= 45
  if (STOCK_DAVID.test(name) && !QUALITY.test(name)) score -= 40
  if (STOCK_MARK.test(name) && MICROSOFT.test(name) && !QUALITY.test(name)) score -= 25
  const langKey = lang.replace('_', '-')
  const langBonus = PREFERRED_LANGS.findIndex((re) => re.test(langKey))
  if (langBonus === 0) score += 8
  else if (langBonus === 1) score += 7
  else if (langBonus === 2) score += 6
  else if (isEnglishVoice(voice)) score += 3
  return score
}

export function pickBestVoice<T extends VoiceLike>(voices: T[]): T | null {
  if (voices.length === 0) return null
  const preferred = voices.find(isGoogleUkEnglishMale)
  if (preferred) return preferred
  return voices.slice().sort((a, b) => {
    const diff = scoreVoice(b) - scoreVoice(a)
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name)
  })[0]
}

export function matchVoice<T extends VoiceLike>(voices: T[], saved: string | null): T | null {
  if (saved) {
    const found = voices.find((voice) => voice.voiceURI === saved || voice.name === saved)
    if (found) return found
  }
  return pickBestVoice(voices)
}

export function listSpeechVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return []
  return window.speechSynthesis.getVoices()
}

export function subscribeVoices(onChange: (voices: SpeechSynthesisVoice[]) => void): () => void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onChange([])
    return () => {}
  }
  const emit = () => onChange(window.speechSynthesis.getVoices())
  emit()
  window.speechSynthesis.addEventListener('voiceschanged', emit)
  return () => window.speechSynthesis.removeEventListener('voiceschanged', emit)
}
