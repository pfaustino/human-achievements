import './style.css'
import {
  catalogSource,
  erasAt,
  loadCategories,
  loadEras,
  loadInventions,
  matchesFilters,
} from './data/catalog.ts'
import { formatClock } from './data/dates.ts'
import type { Era, Invention } from './data/types.ts'
import { Playback } from './timeline/Playback.ts'
import { TimelineView } from './timeline/TimelineView.ts'
import { Hud, type HudHandlers } from './ui/Hud.ts'

const PLAY_MS = 92_000

const stage = document.querySelector<HTMLElement>('#stage')
const hudRoot = document.querySelector<HTMLElement>('#hud')
if (!stage || !hudRoot) throw new Error('Missing #stage or #hud')

const allInventions = loadInventions()
const allEras = loadEras()
const categories = loadCategories()
const playback = new Playback()
const source = catalogSource()

let filters = { category: 'all', historical: 'all', technology: 'all', region: 'all' }
let followPlayhead = false
let catalogStatus = ''

const timeline = new TimelineView(stage, {
  onSelect: (event) => {
    if (!event) {
      hud.clearEvent()
      timeline.setSelected(null)
      return
    }
    focusEvent(event, false)
  },
  onViewChange: () => syncStats(),
})

const handlers: HudHandlers = {
  onPlayToggle: () => {
    playback.playing = !playback.playing
    followPlayhead = playback.playing
    hud.setPlaying(playback.playing)
    timeline.setRevealOnly(playback.playing)
    if (playback.playing) hud.setStatus(catalogStatus)
  },
  onPlayHistory: () => startJourney(PLAY_MS),
  onDirection: (direction) => {
    if (!playback.playing) {
      stepEvent(direction)
      return
    }
    playback.setDirection(direction)
    followPlayhead = true
    timeline.setRevealOnly(true)
    hud.setDirection(direction)
    hud.setStatus(catalogStatus)
  },
  onStep: (direction) => stepEvent(direction),
  onSeek: (fraction) => {
    const event = playback.seekFraction(fraction)
    timeline.setPlayhead(playback.playhead)
    hud.setClock(playback.playhead, eraCaption(playback.playhead))
    if (event) {
      timeline.setSelected(event.id)
      hud.showEvent(event)
    } else {
      hud.clearEvent()
    }
    syncStats()
  },
  onEra: (era) => {
    followPlayhead = false
    playback.seekYear(era.start)
    timeline.zoomToYears(era.start, era.end)
    timeline.setPlayhead(era.start)
    hud.setClock(era.start, era.label)
    hud.showEra(era)
    syncStats()
  },
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
  onSearchSelect: (event) => focusEvent(event, true),
  onSkipIntro: () => {
    followPlayhead = false
    timeline.setRevealOnly(false)
    playback.playing = false
    hud.setPlaying(false)
  },
}

const hud = new Hud(hudRoot, handlers)

function applyCatalog(): void {
  const filtered = allInventions.filter((item) => matchesFilters(item, filters))
  playback.setEvents(filtered, allEras, PLAY_MS)
  timeline.setData(filtered, allEras, categories)
  timeline.setSelected(null)
  hud.clearEvent()
  hud.setPlaying(playback.playing)
  hud.setDirection(playback.direction)
  hud.setClock(playback.playhead, eraCaption(playback.playhead))
  hud.setFraction(playback.fraction())
  catalogStatus = `${filtered.length.toLocaleString('en-US')} inventions · Wikipedia timeline · ${source.license}`
  hud.setStatus(catalogStatus)
  syncStats()
}

function startJourney(duration: number): void {
  hud.hideIntro()
  playback.startFromBeginning(duration)
  followPlayhead = true
  timeline.resetView()
  timeline.setRevealOnly(true)
  hud.setPlaying(true)
  hud.setDirection(1)
  hud.setStatus('Playing through 3.3 million years…')
}

function focusEvent(event: Invention, zoom: boolean): void {
  playback.selectEvent(event)
  playback.playing = false
  followPlayhead = false
  timeline.setRevealOnly(false)
  timeline.setPlayhead(event.dateStart)
  timeline.setSelected(event.id)
  if (zoom) {
    const pad = event.dateStart < -10_000 ? Math.abs(event.dateStart) * 0.08 : 60
    timeline.zoomToYears(event.dateStart - pad, event.dateStart + pad)
  }
  hud.showEvent(event)
  hud.setPlaying(false)
  hud.setClock(event.dateStart, eraCaption(event.dateStart))
  hud.setFraction(playback.fraction())
  syncStats()
}

function stepEvent(direction: -1 | 1): void {
  const event = playback.step(direction)
  hud.setPlaying(false)
  hud.setDirection(direction)
  followPlayhead = false
  timeline.setRevealOnly(false)
  if (!event) return
  focusEvent(event, true)
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
  syncStats()
}

function onEra(era: Era): void {
  timeline.pulseEra(era.id)
  hud.showEra(era)
}

function syncStats(): void {
  const view = timeline.viewYears()
  hud.setStats(playback.revealedCount(), `${formatClock(view.start)} – ${formatClock(view.end)}`)
}

let last = performance.now()
function frame(now: number): void {
  const dt = Math.min(100, now - last)
  last = now
  const ended = playback.tick(dt, onFocus, onEra)
  timeline.setPlayhead(playback.playhead)
  if (followPlayhead && playback.playing) timeline.followPlayhead()
  timeline.tick(dt / 1000)
  hud.setClock(playback.playhead, eraCaption(playback.playhead))
  hud.setFraction(playback.fraction())
  syncStats()
  if (ended) {
    followPlayhead = false
    timeline.setRevealOnly(false)
    hud.setPlaying(false)
    hud.setStatus(
      playback.direction === 1
        ? 'Arrived at the present — explore, reverse, or play again'
        : 'Returned to the beginning — play forward to continue',
    )
  }
  requestAnimationFrame(frame)
}

hud.setCatalog(allInventions, allEras, categories, handlers)
applyCatalog()
timeline.resetView()
requestAnimationFrame(frame)
