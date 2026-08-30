import type { Era, Invention } from '../data/types.ts'
import { axisToYear, yearToAxis } from '../data/scale.ts'

export type Direction = 1 | -1

export function dwellMs(event: Invention): number {
  if (event.tier === 1) return 1700
  return 0
}

export class Playback {
  events: Invention[] = []
  featured: Invention[] = []
  eras: Era[] = []
  playhead = 0
  playing = false
  direction: Direction = 1
  speed = 1
  playDurationMs = 90_000
  sourceStart = 0
  sourceEnd = 1
  cursor = 0
  focusing = false
  focusRemain = 0
  focused: Invention | null = null
  currentEraId: string | null = null

  setEvents(events: Invention[], eras: Era[], playDurationMs: number): void {
    this.events = events
    const seen = new Set<string>()
    this.featured = events.filter((event) => {
      if (event.tier !== 1) return false
      if (seen.has(event.title)) return false
      seen.add(event.title)
      return true
    })
    this.eras = eras.filter((era) => era.featured)
    this.playDurationMs = playDurationMs
    this.focusing = false
    this.focusRemain = 0
    this.focused = null
    this.direction = 1
    this.playing = false
    this.currentEraId = null
    if (events.length === 0) {
      this.sourceStart = 0
      this.sourceEnd = 1
      this.playhead = 0
      this.cursor = 0
      return
    }
    this.sourceStart = events[0].dateStart
    this.sourceEnd = Math.max(events[events.length - 1].dateStart, this.sourceStart + 1)
    this.playhead = this.sourceStart
    this.cursor = 0
  }

  fraction(): number {
    return yearToAxis(this.playhead)
  }

  seekFraction(fraction: number): Invention | null {
    this.playhead = axisToYear(Math.min(1, Math.max(0, fraction)))
    this.focusing = false
    this.focusRemain = 0
    this.syncCursor()
    this.focused = this.lastAtOrBefore(this.playhead)
    return this.focused
  }

  seekYear(year: number): Invention | null {
    this.playhead = year
    this.focusing = false
    this.focusRemain = 0
    this.syncCursor()
    this.focused = this.lastAtOrBefore(this.playhead)
    return this.focused
  }

  startFromBeginning(durationMs = this.playDurationMs): void {
    this.playDurationMs = durationMs
    this.playhead = this.sourceStart
    this.direction = 1
    this.playing = true
    this.focusing = false
    this.focusRemain = 0
    this.focused = null
    this.cursor = 0
    this.currentEraId = null
  }

  setDirection(direction: Direction): void {
    if (this.direction === direction) return
    this.direction = direction
    this.syncCursorFromFocused()
  }

  selectEvent(event: Invention): void {
    this.focusEvent(event, false)
  }

  step(direction: Direction): Invention | null {
    const list = this.events
    if (list.length === 0) return null
    const current = this.focused
    let index = current ? list.findIndex((event) => event.id === current.id) : -1
    if (index < 0) {
      index = list.findIndex((event) => event.dateStart >= this.playhead)
      if (index < 0) index = list.length
      if (direction === -1) index -= 1
    } else {
      index += direction
    }
    if (index < 0 || index >= list.length) return null
    this.direction = direction
    this.playing = false
    this.focusEvent(list[index], false)
    return list[index]
  }

  tick(
    dtMs: number,
    onFocus: (event: Invention) => void,
    onEra?: (era: Era) => void,
  ): boolean {
    if (!this.playing || this.events.length === 0) return false

    if (this.focusing) {
      this.focusRemain -= dtMs
      if (this.focusRemain <= 0) this.focusing = false
      return false
    }

    const axis = yearToAxis(this.playhead)
    const nextAxis = axis + this.direction * (dtMs / this.playDurationMs) * this.speed
    this.playhead = axisToYear(Math.min(1, Math.max(0, nextAxis)))

    if (onEra) this.emitEra(onEra)

    let emitted = 0
    while (emitted < 6) {
      const next = this.peekFeatured()
      if (!next) break
      const crossed = this.direction === 1 ? this.playhead >= next.dateStart : this.playhead <= next.dateStart
      if (!crossed) break
      this.focusEvent(next, true)
      onFocus(next)
      emitted += 1
      if (this.focusing) break
    }

    if (this.direction === 1 && yearToAxis(this.playhead) >= 0.999) {
      this.playhead = this.sourceEnd
      this.playing = false
      return true
    }
    if (this.direction === -1 && yearToAxis(this.playhead) <= 0.001) {
      this.playhead = this.sourceStart
      this.playing = false
      return true
    }
    return false
  }

  private emitEra(onEra: (era: Era) => void): void {
    const active = this.eras.filter((era) => this.playhead >= era.start && this.playhead <= era.end)
    const newest = active[active.length - 1]
    if (!newest) return
    if (newest.id !== this.currentEraId) {
      this.currentEraId = newest.id
      this.focusRemain = Math.max(this.focusRemain, 1600)
      this.focusing = true
      onEra(newest)
    }
  }

  private focusEvent(event: Invention, autoDwell: boolean): void {
    this.playhead = event.dateStart
    this.focused = event
    const index = this.featured.findIndex((item) => item.id === event.id)
    this.cursor = index + this.direction
    if (autoDwell) {
      const dwell = dwellMs(event) / Math.min(1.6, Math.max(0.7, this.speed))
      this.focusRemain = dwell
      this.focusing = dwell > 0
    } else {
      this.focusing = false
      this.focusRemain = 0
    }
  }

  private peekFeatured(): Invention | null {
    if (this.cursor < 0 || this.cursor >= this.featured.length) return null
    return this.featured[this.cursor]
  }

  private syncCursor(): void {
    if (this.direction === 1) {
      this.cursor = this.featured.findIndex((event) => event.dateStart > this.playhead)
      if (this.cursor < 0) this.cursor = this.featured.length
    } else {
      let index = this.featured.length - 1
      while (index >= 0 && this.featured[index].dateStart > this.playhead) index -= 1
      this.cursor = index
    }
  }

  private syncCursorFromFocused(): void {
    if (this.focused) {
      const index = this.featured.findIndex((event) => event.id === this.focused?.id)
      this.cursor = index + this.direction
      return
    }
    this.syncCursor()
  }

  lastAtOrBefore(year: number): Invention | null {
    let lo = 0
    let hi = this.events.length - 1
    let found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (this.events[mid].dateStart <= year) {
        found = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return found >= 0 ? this.events[found] : null
  }

  revealedCount(): number {
    let lo = 0
    let hi = this.events.length - 1
    let found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (this.events[mid].dateStart <= this.playhead) {
        found = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return found + 1
  }
}
