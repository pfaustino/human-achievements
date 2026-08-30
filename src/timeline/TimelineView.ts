import { formatClock } from '../data/dates.ts'
import { axisToYear, niceTicks, yearToAxis } from '../data/scale.ts'
import type { Category, Era, Invention } from '../data/types.ts'

export type TimelineHandlers = {
  onSelect: (event: Invention | null) => void
}

const LANE_ORDER = [
  'survival',
  'agriculture',
  'materials',
  'construction',
  'transportation',
  'communication',
  'energy',
  'science',
  'medicine',
  'computing',
]

const LANE_H = 24
const LANE_BAND = LANE_ORDER.length * LANE_H
const ERA_BAND_H = 16
const ERA_BAND_GAP = 3
const ERA_LAYERS = 3
const ERA_BLOCK = ERA_LAYERS * ERA_BAND_H + (ERA_LAYERS - 1) * ERA_BAND_GAP
const TICK_LABEL_H = 26
const BOTTOM_PAD = 18
const ERA_LABEL_MIN_W = 56
const ERA_LABEL_GAP = 10
const TICK_LABEL_GAP = 60
const PARENT_ERA_IDS = new Set([
  'paleolithic',
  'neolithic',
  'bronze-age',
  'first-industrial',
  'digital-revolution',
])

export class TimelineView {
  readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly handlers: TimelineHandlers
  private events: Invention[] = []
  private eras: Era[] = []
  private categories: Category[] = []
  private viewAxis0 = 0
  private viewAxis1 = 1
  private playhead = -3_300_000
  private selectedId: string | null = null
  private hoverId: string | null = null
  private filterCategory = 'all'
  private revealOnly = false
  private dragging = false
  private moved = false
  private dragLastX = 0
  private laid: { event: Invention; x: number; y: number; r: number }[] = []
  private readonly observer: ResizeObserver
  private eraPulse = 0
  private eraPulseId: string | null = null

  constructor(container: HTMLElement, handlers: TimelineHandlers) {
    this.handlers = handlers
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'timeline-canvas'
    this.canvas.setAttribute('aria-label', 'Invention timeline')
    container.appendChild(this.canvas)
    const ctx = this.canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Could not create timeline canvas')
    this.ctx = ctx
    this.observer = new ResizeObserver(() => this.draw())
    this.observer.observe(this.canvas)
    this.bind()
  }

  setData(events: Invention[], eras: Era[], categories: Category[]): void {
    this.events = events
    this.eras = eras
    this.categories = categories
    this.draw()
  }

  setPlayhead(year: number): void {
    this.playhead = year
    this.draw()
  }

  setSelected(id: string | null): void {
    this.selectedId = id
    this.draw()
  }

  setFilterCategory(id: string): void {
    this.filterCategory = id
    this.draw()
  }

  setRevealOnly(on: boolean): void {
    this.revealOnly = on
    this.draw()
  }

  pulseEra(id: string): void {
    this.eraPulseId = id
    this.eraPulse = 1
  }

  viewYears(): { start: number; end: number } {
    return { start: axisToYear(this.viewAxis0), end: axisToYear(this.viewAxis1) }
  }

  zoomToYears(_start: number, _end: number, _pad = 0.04): void {
    this.resetView()
  }

  resetView(): void {
    this.viewAxis0 = 0
    this.viewAxis1 = 1
    this.draw()
  }

  followPlayhead(): void {
    this.resetView()
  }

  zoomAt(_screenX: number, _factor: number): void {
    this.resetView()
  }

  tick(dt: number): void {
    if (this.eraPulse > 0) {
      this.eraPulse = Math.max(0, this.eraPulse - dt * 0.35)
      this.draw()
    }
  }

  private bind(): void {
    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault()
    }, { passive: false })

    this.canvas.addEventListener('pointerdown', (event) => {
      this.canvas.setPointerCapture(event.pointerId)
      this.dragging = true
      this.moved = false
      this.dragLastX = event.clientX
    })
    this.canvas.addEventListener('pointermove', (event) => {
      const rect = this.canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      if (this.dragging) {
        if (Math.abs(event.clientX - this.dragLastX) > 2) this.moved = true
        return
      }
      const hit = this.hit(x, y)
      const next = hit?.event.id ?? null
      if (next !== this.hoverId) {
        this.hoverId = next
        this.canvas.style.cursor = next ? 'pointer' : 'default'
        this.draw()
      }
    })
    this.canvas.addEventListener('pointerup', (event) => {
      const wasClick = this.dragging && !this.moved
      this.dragging = false
      if (!wasClick) return
      const rect = this.canvas.getBoundingClientRect()
      const hit = this.hit(event.clientX - rect.left, event.clientY - rect.top)
      this.handlers.onSelect(hit?.event ?? null)
    })
    this.canvas.addEventListener('pointerleave', () => {
      this.dragging = false
      this.hoverId = null
      this.draw()
    })
    this.canvas.addEventListener('touchmove', (event) => {
      if (event.touches.length === 2) event.preventDefault()
    }, { passive: false })
  }

  private axisToX(axis: number, width: number, padLeft: number, padRight: number): number {
    const t = (axis - this.viewAxis0) / (this.viewAxis1 - this.viewAxis0)
    return padLeft + t * (width - padLeft - padRight)
  }

  private pad() {
    const height = Math.max(1, Math.floor(this.canvas.clientHeight))
    const bottom = BOTTOM_PAD + TICK_LABEL_H
    const top = Math.max(ERA_BLOCK + 12, height - bottom - LANE_BAND)
    return { left: 88, right: 28, top, bottom }
  }

  draw(): void {
    const cssW = Math.max(1, Math.floor(this.canvas.clientWidth))
    const cssH = Math.max(1, Math.floor(this.canvas.clientHeight))
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const width = Math.max(1, Math.round(cssW * dpr))
    const height = Math.max(1, Math.round(cssH * dpr))
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
    const ctx = this.ctx
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0b1018'
    ctx.fillRect(0, 0, cssW, cssH)

    const pad = this.pad()
    this.drawEraBands(cssW, cssH, pad, dpr)
    this.drawTicks(cssW, cssH, pad)
    this.drawLanes(cssW, cssH, pad)
    this.drawEvents(cssW, cssH, pad)
    this.drawPlayhead(cssW, cssH, pad)
  }

  private drawEraBands(
    width: number,
    height: number,
    pad: { left: number; right: number; top: number; bottom: number },
    _dpr: number,
  ): void {
    const ctx = this.ctx
    const layers: Era['layer'][] = ['historical', 'archaeological', 'technology']
    const bandH = ERA_BAND_H
    const gap = ERA_BAND_GAP
    const eraY0 = pad.top - 8 - ERA_BLOCK
    layers.forEach((layer, index) => {
      const y = eraY0 + index * (bandH + gap)
      const row: { era: Era; left: number; right: number; inside: boolean }[] = []
      for (const era of this.eras) {
        if (era.layer !== layer) continue
        const x0 = this.axisToX(yearToAxis(era.start), width, pad.left, pad.right)
        const x1 = this.axisToX(yearToAxis(era.end), width, pad.left, pad.right)
        if (x1 < pad.left || x0 > width - pad.right) continue
        const inside = this.playhead >= era.start && this.playhead <= era.end
        const pulse = this.eraPulseId === era.id ? this.eraPulse : 0
        const alpha = (inside ? 0.28 : 0.12) + pulse * 0.28
        ctx.fillStyle = hexAlpha(era.color, alpha)
        const left = Math.max(pad.left, x0)
        const right = Math.min(width - pad.right, x1)
        ctx.fillRect(left, y, Math.max(2, right - left), bandH)
        row.push({ era, left, right, inside })
      }
      row.sort((a, b) => {
        const pa = eraLabelPriority(a.era)
        const pb = eraLabelPriority(b.era)
        if (pa !== pb) return pb - pa
        return a.left - b.left
      })
      const occupied: { left: number; right: number }[] = []
      for (const item of row) {
        const w = item.right - item.left
        if (w < ERA_LABEL_MIN_W) continue
        ctx.font = `${item.inside ? 600 : 500} 10px "Segoe UI", system-ui, sans-serif`
        ctx.textBaseline = 'middle'
        const textW = ctx.measureText(item.era.shortLabel).width
        const lx = item.left + 6
        const rx = lx + textW
        if (rx > item.right - 2) continue
        if (occupied.some((box) => bandsOverlap(item, box, ERA_LABEL_GAP))) continue
        ctx.fillStyle = hexAlpha('#e8e4d9', item.inside ? 0.85 : 0.45)
        ctx.fillText(item.era.shortLabel, lx, y + bandH / 2)
        occupied.push({ left: item.left, right: item.right })
      }
    })
    void height
  }

  private drawTicks(
    width: number,
    height: number,
    pad: { left: number; right: number; top: number; bottom: number },
  ): void {
    const ctx = this.ctx
    const start = axisToYear(this.viewAxis0)
    const end = axisToYear(this.viewAxis1)
    const ticks = niceTicks(start, end, 9)
    const bandBottom = pad.top + LANE_BAND
    ctx.strokeStyle = 'rgba(232, 228, 217, 0.08)'
    ctx.lineWidth = 1
    ctx.font = '11px "Segoe UI", system-ui, sans-serif'
    ctx.fillStyle = 'rgba(232, 228, 217, 0.45)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    let lastLabelRight = -Infinity
    let lastLabel = ''
    for (const year of ticks) {
      const x = this.axisToX(yearToAxis(year), width, pad.left, pad.right)
      if (x < pad.left || x > width - pad.right) continue
      ctx.beginPath()
      ctx.moveTo(x, pad.top - 8)
      ctx.lineTo(x, bandBottom + 8)
      ctx.stroke()
      const label = formatClock(year)
      const textW = ctx.measureText(label).width
      const labelLeft = x - textW / 2
      const labelRight = x + textW / 2
      if (label === lastLabel && labelLeft < lastLabelRight + TICK_LABEL_GAP) continue
      if (labelLeft < lastLabelRight + TICK_LABEL_GAP) continue
      ctx.fillText(label, x, bandBottom + 14)
      lastLabelRight = labelRight
      lastLabel = label
    }
    ctx.textAlign = 'left'
    void height
  }

  private drawLanes(
    width: number,
    height: number,
    pad: { left: number; right: number; top: number; bottom: number },
  ): void {
    const ctx = this.ctx
    ctx.font = '11px "Segoe UI", system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    LANE_ORDER.forEach((id, index) => {
      const y = laneY(index, pad.top)
      const cat = this.categories.find((item) => item.id === id)
      const active = this.filterCategory === 'all' || this.filterCategory === id
      ctx.fillStyle = active ? 'rgba(232, 228, 217, 0.4)' : 'rgba(232, 228, 217, 0.15)'
      ctx.textAlign = 'right'
      ctx.fillText(cat?.label ?? id, pad.left - 10, y)
      ctx.strokeStyle = 'rgba(232, 228, 217, 0.04)'
      ctx.beginPath()
      ctx.moveTo(pad.left, y)
      ctx.lineTo(width - pad.right, y)
      ctx.stroke()
    })
    ctx.textAlign = 'left'
    void height
  }

  private drawEvents(
    width: number,
    height: number,
    pad: { left: number; right: number; top: number; bottom: number },
  ): void {
    const ctx = this.ctx
    const zoom = 1 / (this.viewAxis1 - this.viewAxis0)
    this.laid = []
    const labels: { x: number; y: number; text: string; color: string }[] = []

    for (const event of this.events) {
      if (this.revealOnly && event.dateStart > this.playhead) continue
      const axis = yearToAxis(event.dateStart)
      if (axis < this.viewAxis0 - 0.01 || axis > this.viewAxis1 + 0.01) continue
      const dim = this.filterCategory !== 'all' && !event.categories.includes(this.filterCategory)
      const lane = LANE_ORDER.indexOf(event.categories[0] ?? 'survival')
      const x = this.axisToX(axis, width, pad.left, pad.right)
      const y = laneY(Math.max(0, lane), pad.top)
      const r = event.tier === 1 ? 8.5 : event.tier === 2 ? 6 : 4.2
      const cat = this.categories.find((item) => item.id === event.categories[0])
      const color = cat?.color ?? '#d4b06a'
      const selected = event.id === this.selectedId
      const hover = event.id === this.hoverId
      ctx.beginPath()
      ctx.fillStyle = dim ? hexAlpha(color, 0.16) : hexAlpha(color, selected || hover ? 1 : event.tier === 3 ? 0.55 : 0.9)
      ctx.arc(x, y, selected ? r + 2 : r, 0, Math.PI * 2)
      ctx.fill()
      if (selected) {
        ctx.strokeStyle = '#e8e4d9'
        ctx.lineWidth = 1.4
        ctx.stroke()
      }
      this.laid.push({ event, x, y, r: r + 6 })
      const showLabel =
        !dim &&
        (selected || hover || (event.tier === 1 && zoom > 1.15) || (event.tier === 2 && zoom > 3.2) || zoom > 8)
      if (showLabel) {
        labels.push({ x: x + 8, y: y - 8, text: event.title, color })
      }
    }

    ctx.font = '12px "Segoe UI", system-ui, sans-serif'
    ctx.textBaseline = 'bottom'
    const used: { x: number; y: number }[] = []
    for (const label of labels) {
      if (used.some((point) => Math.abs(point.x - label.x) < 86 && Math.abs(point.y - label.y) < 12)) continue
      ctx.fillStyle = 'rgba(11, 16, 24, 0.7)'
      const w = Math.min(220, ctx.measureText(label.text).width + 8)
      ctx.fillRect(label.x - 3, label.y - 13, w, 16)
      ctx.fillStyle = hexAlpha('#e8e4d9', 0.92)
      ctx.fillText(label.text, label.x, label.y)
      used.push(label)
    }
    void height
  }

  private drawPlayhead(
    width: number,
    height: number,
    pad: { left: number; right: number; top: number; bottom: number },
  ): void {
    const x = this.axisToX(yearToAxis(this.playhead), width, pad.left, pad.right)
    if (x < pad.left || x > width - pad.right) return
    const bandBottom = pad.top + LANE_BAND
    const ctx = this.ctx
    ctx.strokeStyle = 'rgba(126, 200, 196, 0.85)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x, pad.top - 10)
    ctx.lineTo(x, bandBottom + 6)
    ctx.stroke()
    ctx.fillStyle = '#7ec8c4'
    ctx.beginPath()
    ctx.moveTo(x, pad.top - 12)
    ctx.lineTo(x - 5, pad.top - 22)
    ctx.lineTo(x + 5, pad.top - 22)
    ctx.closePath()
    ctx.fill()
    void height
  }

  private hit(x: number, y: number) {
    let best: (typeof this.laid)[number] | null = null
    let bestD = 16
    for (const point of this.laid) {
      const d = Math.hypot(point.x - x, point.y - y)
      if (d < Math.max(bestD, point.r) && d < 18) {
        best = point
        bestD = d
      }
    }
    return best
  }
}

function eraLabelPriority(era: Era): number {
  if (PARENT_ERA_IDS.has(era.id)) return 2
  if (era.featured) return 1
  return 0
}

function bandsOverlap(
  a: { left: number; right: number },
  b: { left: number; right: number },
  gap: number,
): boolean {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > gap
}

function laneY(index: number, padTop: number): number {
  return padTop + (index + 0.5) * LANE_H
}

function hexAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const n = Number.parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`
}
