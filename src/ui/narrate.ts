import type { Invention, InventionLocation } from '../data/types.ts'

/** Keep slides from rambling; still long enough for a few spoken sentences. */
export const NARRATION_MAX_CHARS = 560

export type NarrationFields = Pick<
  Invention,
  'title' | 'dateDisplay' | 'description' | 'inventor' | 'significance' | 'location'
>

export function buildNarration(event: NarrationFields): string {
  const sentences: string[] = []

  const title = cleanSpoken(event.title)
  const date = spokenDate(event.dateDisplay)
  if (title) sentences.push(asSentence(title))
  if (date) sentences.push(asSentence(date))

  const spokenSoFar = () => sentences.join(' ')

  const inventors = (event.inventor ?? []).map((name) => name.trim()).filter(Boolean)
  const inventorLine = spokenInventor(inventors, spokenSoFar())
  if (inventorLine) sentences.push(inventorLine)

  const description = spokenDescription(event.description, event.title)
  if (description) sentences.push(description)

  const why = spokenSignificance(event.significance, spokenSoFar())
  if (why) sentences.push(why)

  const place = spokenLocation(event.location, spokenSoFar())
  if (place) sentences.push(place)

  return boundNarration(sentences.join(' '))
}

export function cleanSpoken(text: string): string {
  return text
    .replace(/\[\d+[a-z]?\]/gi, '')
    .replace(/\[citation needed\]/gi, '')
    .replace(/\[nb \d+\]/gi, '')
    .replace(/\s*according to [^.]+(?:\.)?/gi, '')
    .replace(/\s*\([^)]{0,80}\b(?:1[6-9]\d{2}|20\d{2})\b[^)]*\)/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+,/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/,\s*$/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
}

export function spokenDate(dateDisplay: string): string {
  return cleanSpoken(dateDisplay)
    .replace(/^c\.\s*/i, 'Circa ')
    .replace(/–|—/g, ' to ')
    .replace(/\s+/g, ' ')
    .trim()
}

function spokenInventor(inventors: string[], already: string): string {
  if (inventors.length === 0) return ''
  const hay = already.toLowerCase()
  const missing = inventors.filter((name) => !hay.includes(name.toLowerCase()))
  if (missing.length === 0) return ''
  if (missing.length === 1) return asSentence(`By ${missing[0]}`)
  if (missing.length === 2) return asSentence(`By ${missing[0]} and ${missing[1]}`)
  const last = missing[missing.length - 1]
  return asSentence(`By ${missing.slice(0, -1).join(', ')}, and ${last}`)
}

function spokenDescription(description: string, title: string): string {
  let text = cleanSpoken(description)
  if (!text) return ''
  const titlePattern = escapeRegExp(title.trim())
  if (titlePattern) {
    text = text.replace(new RegExp(`^${titlePattern}\\b(?:[^:]{0,80})?:\\s*`, 'i'), '')
  }
  text = text.trim()
  if (!text) return ''
  return asSentence(capitalize(text))
}

function spokenSignificance(significance: string | undefined, already: string): string {
  const text = cleanSpoken(significance ?? '')
  if (!text) return ''
  const snippet = text.slice(0, 48).toLowerCase()
  if (snippet && already.toLowerCase().includes(snippet)) return ''
  return asSentence(text)
}

function spokenLocation(location: InventionLocation | undefined, already: string): string {
  if (!location) return ''
  const name = location.name.trim()
  if (!name) return ''
  if (already.toLowerCase().includes(name.toLowerCase())) return ''
  if (location.kind === 'earliest-evidence') return asSentence(`Earliest known evidence in ${name}`)
  if (location.kind === 'developed-in') return asSentence(`Developed in ${name}`)
  return asSentence(`Invented in ${name}`)
}

function boundNarration(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= NARRATION_MAX_CHARS) return cleaned
  const slice = cleaned.slice(0, NARRATION_MAX_CHARS)
  const stop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '))
  if (stop >= 180) return slice.slice(0, stop + 1).trim()
  const space = slice.lastIndexOf(' ')
  return (space > 0 ? slice.slice(0, space) : slice).trim()
}

function asSentence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
