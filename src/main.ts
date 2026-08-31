import './style.css'
import { Narration, NARRATION_HOLD_PAD } from './audio/Narration.ts'
import {
  erasAt,
  loadCategories,
  loadEras,
  loadInventions,
  matchesFilters,
} from './data/catalog.ts'
import { formatClock } from './data/dates.ts'
import type { Era, Invention } from './data/types.ts'
import { HOLD_SECONDS_DEFAULT, Playback, clampHoldSeconds } from './timeline/Playback.ts'
import { TimelineView } from './timeline/TimelineView.ts'
import { Hud, type HudHandlers } from './ui/Hud.ts'

const PLAY_MS = 92_000
const HOLD_STORAGE_KEY = 'human-achievements-hold-seconds'
const NARRATION_STORAGE_KEY = 'human-achievements-narrate'

function loadHoldSeconds(): number {
  try {
    const raw = localStorage.getItem(HOLD_STORAGE_KEY)
    if (raw == null) return HOLD_SECONDS_DEFAULT
    return clampHoldSeconds(Number(raw))
  } catch {
    return HOLD_SECONDS_DEFAULT
  }
}

function saveHoldSeconds(seconds: number): void {
  try {
    localStorage.setItem(HOLD_STORAGE_KEY, String(seconds))
  } catch {
    // Private mode or blocked storage should not stop playback.
  }
}

function loadNarrationEnabled(): boolean {
  try {
    const raw = localStorage.getItem(NARRATION_STORAGE_KEY)
    if (raw == null) return true
    return raw === '1' || raw === 'true'
  } catch {
    return true
  }
}

function saveNarrationEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(NARRATION_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // ignore
  }
}

const stage = document.querySelector<HTMLElement>('#stage')
const hudRoot = document.querySelector<HTMLElement>('#hud')
if (!stage || !hudRoot) throw new Error('Missing #stage or #hud')

const allInventions = loadInventions()
const allEras = loadEras()
const categories = loadCategories()
const playback = new Playback()
const narration = new Narration()
narration.enabled = loadNarrationEnabled()

let filters = { category: 'all', historical: 'all', technology: 'all', region: 'all' }

const timeline = new TimelineView(stage, {
  onSelect: (event) => {
    if (!event) {
      narration.cancel()
      hud.clearEvent()
      timeline.setSelected(null)
      return
    }
    focusEvent(event)
  },
})

const handlers: HudHandlers = {
  onPlayToggle: () => {
    playback.playing = !playback.playing
    if (!playback.playing) {
      narration.cancel()
      playback.releaseHold()
    }
    hud.setPlaying(playback.playing)
    timeline.setRevealOnly(playback.playing)
  },
  onPlayHistory: () => startJourney(PLAY_MS),
  onDirection: (direction) => {
    if (!playback.playing) {
      stepEvent(direction)
      return
    }
    playback.setDirection(direction)
    timeline.setRevealOnly(true)
    hud.setDirection(direction)
  },
  onStep: (direction) => stepEvent(direction),
  onCategory: (id) => {
    filters = { ...filters, category: id }
    applyCatalog()
    timeline.setFilterCategory(id)
  },
  onHistorical: (label) => {
    filters = { ...filters, historical: label }
    applyCatalog()
  },
  onTechnology: (label) => {
    filters = { ...filters, technology: label }
    applyCatalog()
  },
  onRegion: (region) => {
    filters = { ...filters, region }
    applyCatalog()
  },
  onSearchSelect: (event) => focusEvent(event),
  onHoldChange: (seconds) => {
    playback.setHoldSeconds(seconds)
    saveHoldSeconds(playback.holdSeconds)
  },
  onNarrationChange: (enabled) => {
    narration.enabled = enabled
    saveNarrationEnabled(enabled)
    if (!enabled) {
      narration.cancel()
      if (playback.focusing && playback.playing) {
        playback.holdForMs(playback.dwellMs())
      }
    }
  },
  onSkipIntro: () => {
    narration.cancel()
    timeline.setRevealOnly(false)
    playback.playing = false
    hud.setPlaying(false)
  },
}

const hud = new Hud(hudRoot, handlers)
playback.setHoldSeconds(loadHoldSeconds())
hud.setHoldSeconds(playback.holdSeconds)
hud.setNarrationEnabled(narration.enabled)

function applyCatalog(): void {
  narration.cancel()
  const filtered = allInventions.filter((item) => matchesFilters(item, filters))
  playback.setEvents(filtered, allEras, PLAY_MS)
  timeline.setData(filtered, allEras, categories)
  timeline.setSelected(null)
  hud.clearEvent()
  hud.setPlaying(playback.playing)
  hud.setDirection(playback.direction)
  hud.setClock(playback.playhead, eraCaption(playback.playhead))
}

function startJourney(duration: number): void {
  hud.hideIntro()
  narration.cancel()
  playback.startFromBeginning(duration)
  timeline.resetView()
  timeline.setRevealOnly(true)
  hud.setPlaying(true)
  hud.setDirection(1)
}

function focusEvent(event: Invention): void {
  narration.cancel()
  playback.selectEvent(event)
  playback.playing = false
  timeline.setRevealOnly(false)
  timeline.setPlayhead(event.dateStart)
  timeline.setSelected(event.id)
  hud.showEvent(event)
  hud.setPlaying(false)
  hud.setClock(event.dateStart, eraCaption(event.dateStart))
  speakDescription(event, false)
}

function stepEvent(direction: -1 | 1): void {
  const event = playback.step(direction)
  hud.setPlaying(false)
  hud.setDirection(direction)
  timeline.setRevealOnly(false)
  if (!event) return
  focusEvent(event)
}

function speakDescription(event: Invention, holdPlayback: boolean): void {
  if (!narration.enabled) {
    if (holdPlayback) playback.holdForMs(playback.dwellMs())
    return
  }
  const eventId = event.id
  const estimated = narration.speak(event.description, {
    onEnd: () => {
      if (!holdPlayback) return
      if (playback.focused?.id !== eventId) return
      playback.releaseHold()
    },
  })
  if (holdPlayback) playback.holdForMs(Math.round(estimated * NARRATION_HOLD_PAD))
}

function eraCaption(year: number): string {
  const featured = erasAt(year).filter((era) => era.featured)
  if (featured.length) return featured.map((era) => era.label).join(' · ')
  return erasAt(year)
    .slice(0, 2)
    .map((era) => era.label)
    .join(' · ') || formatClock(year)
}

function onFocus(event: Invention): void {
  timeline.setSelected(event.id)
  timeline.setPlayhead(event.dateStart)
  hud.showEvent(event)
  speakDescription(event, true)
}

function onEra(era: Era): void {
  narration.cancel()
  timeline.pulseEra(era.id)
  hud.showEra(era)
}

let last = performance.now()
function frame(now: number): void {
  const dt = Math.min(100, now - last)
  last = now
  const ended = playback.tick(dt, onFocus, onEra)
  timeline.setPlayhead(playback.playhead)
  timeline.tick(dt / 1000)
  hud.setClock(playback.playhead, eraCaption(playback.playhead))
  if (ended) {
    narration.cancel()
    timeline.setRevealOnly(false)
    hud.setPlaying(false)
  }
  requestAnimationFrame(frame)
}

hud.setCatalog(allInventions, allEras, categories, handlers)
applyCatalog()
timeline.resetView()
requestAnimationFrame(frame)
