import { formatClock } from '../data/dates.ts'
import { axisToYear, niceTicks, yearToAxis } from '../data/scale.ts'
import type { Category, Era, Invention } from '../data/types.ts'

export type TimelineHandlers = {
  onSelect: (event: Invention | null) => void
  onViewChange: (yearStart: number, yearEnd: number) => void
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
  private pinchDist = 0
  private laid: { event: Invention; x: number; y: number; r: number }[] = []
  private readonly observer: ResizeObserver
  private eraPulse = 0
  private eraPulseId: string | null = null

  constructor(container: HTMLElement, handlers: TimelineHandlers) {
    this.handlers = handlers
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'timeline-canvas'
    this.canvas.setAttribute('aria-label', 'Zoomable invention timeline')
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

  zoomToYears(start: number, end: number, pad = 0.04): void {
    const a0 = yearToAxis(start)
    const a1 = yearToAxis(end)
    const span = Math.max(0.008, a1 - a0)
    const extra = span * pad
    this.viewAxis0 = Math.max(0, a0 - extra)
    this.viewAxis1 = Math.min(1, a1 + extra)
    this.emitView()
    this.draw()
  }

  resetView(): void {
    this.viewAxis0 = 0
    this.viewAxis1 = 1
    this.emitView()
    this.draw()
  }

  followPlayhead(): void {
    const axis = yearToAxis(this.playhead)
    const span = this.viewAxis1 - this.viewAxis0
    const target = Math.min(1 - span, Math.max(0, axis - span * 0.72))
    this.viewAxis0 = target
    this.viewAxis1 = target + span
    this.draw()
  }

  zoomAt(screenX: number, factor: number): void {
    const t = this.xToAxis(screenX)
    const span = (this.viewAxis1 - this.viewAxis0) * factor
    const minSpan = 0.004
    const next = Math.min(1, Math.max(minSpan, span))
    this.viewAxis0 = Math.min(1 - next, Math.max(0, t - (t - this.viewAxis0) * (next / (this.viewAxis1 - this.viewAxis0 || 1))))
    this.viewAxis1 = this.viewAxis0 + next
    this.emitView()
    this.draw()
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
      const factor = event.deltaY > 0 ? 1.12 : 0.88
      this.zoomAt(event.offsetX, factor)
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
        const dx = event.clientX - this.dragLastX
        this.dragLastX = event.clientX
        if (Math.abs(dx) > 2) this.moved = true
        const span = this.viewAxis1 - this.viewAxis0
        const shift = (-dx / Math.max(1, this.canvas.clientWidth)) * span
        this.viewAxis0 = Math.min(1 - span, Math.max(0, this.viewAxis0 + shift))
        this.viewAxis1 = this.viewAxis0 + span
        this.emitView()
        this.draw()
        return
      }
      const hit = this.hit(x, y)
      const next = hit?.event.id ?? null
      if (next !== this.hoverId) {
        this.hoverId = next
        this.canvas.style.cursor = next ? 'pointer' : 'grab'
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
    this.canvas.addEventListener('touchstart', (event) => {
      if (event.touches.length === 2) {
        this.pinchDist = pinch(event.touches)
      }
    }, { passive: true })
    this.canvas.addEventListener('touchmove', (event) => {
      if (event.touches.length === 2) {
        event.preventDefault()
        const next = pinch(event.touches)
        const mid = (event.touches[0].clientX + event.touches[1].clientX) / 2
        const rect = this.canvas.getBoundingClientRect()
        if (this.pinchDist > 0) this.zoomAt(mid - rect.left, this.pinchDist / next)
        this.pinchDist = next
      }
    }, { passive: false })
  }

  private emitView(): void {
    this.handlers.onViewChange(axisToYear(this.viewAxis0), axisToYear(this.viewAxis1))
  }

  private xToAxis(x: number): number {
    const pad = this.pad()
    const t = (x - pad.left) / Math.max(1, this.canvas.clientWidth - pad.left - pad.right)
    return this.viewAxis0 + Math.min(1, Math.max(0, t)) * (this.viewAxis1 - this.viewAxis0)
  }

  private axisToX(axis: number, width: number, padLeft: number, padRight: number): number {
    const t = (axis - this.viewAxis0) / (this.viewAxis1 - this.viewAxis0)
    return padLeft + t * (width - padLeft - padRight)
  }

  private pad() {
    return { left: 88, right: 28, top: 72, bottom: 42 }
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
    const bandH = 16
    const gap = 3
    layers.forEach((layer, index) => {
      const y = 16 + index * (bandH + gap)
      for (const era of this.eras) {
        if (era.layer !== layer) continue
        const x0 = this.axisToX(yearToAxis(era.start), width, pad.left, pad.right)
        const x1 = this.axisToX(yearToAxis(era.end), width, pad.left, pad.right)
        if (x1 < pad.left || x0 > width - pad.right) continue
        const inside = this.playhead >= era.start && this.playhead <= era.end
        const pulse = this.eraPulseId === era.id ? this.eraPulse : 0
        const alpha = (inside ? 0.28 : 0.12) + pulse * 0.28
        ctx.fillStyle = hexAlpha(era.color, alpha)
        ctx.fillRect(Math.max(pad.left, x0), y, Math.max(2, Math.min(width - pad.right, x1) - Math.max(pad.left, x0)), bandH)
        const w = x1 - x0
        if (w > 64) {
          ctx.fillStyle = hexAlpha('#e8e4d9', inside ? 0.85 : 0.45)
          ctx.font = `${inside ? 600 : 500} 10px "Segoe UI", system-ui, sans-serif`
          ctx.textBaseline = 'middle'
          ctx.fillText(era.shortLabel, Math.max(pad.left, x0) + 6, y + bandH / 2)
        }
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
    for (const year of ticks) {
      const x = this.axisToX(yearToAxis(year), width, pad.left, pad.right)
      if (x < pad.left || x > width - pad.right) continue
      ctx.beginPath()
      ctx.moveTo(x, pad.top - 8)
      ctx.lineTo(x, bandBottom + 8)
      ctx.stroke()
      ctx.fillText(formatClock(year), x, bandBottom + 14)
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

function laneY(index: number, padTop: number): number {
  return padTop + (index + 0.5) * LANE_H
}

function pinch(touches: TouchList): number {
  return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
}

function hexAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const n = Number.parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`
}
