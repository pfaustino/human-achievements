import { catalogSource } from '../data/catalog.ts'
import { clampHoldSeconds } from '../timeline/Playback.ts'
import { formatClock, isUncertain } from '../data/dates.ts'
import type { Category, Era, Invention } from '../data/types.ts'

export type HudHandlers = {
  onPlayToggle: () => void
  onPlayHistory: () => void
  onDirection: (direction: 1 | -1) => void
  onStep: (direction: -1 | 1) => void
  onCategory: (id: string) => void
  onHistorical: (label: string) => void
  onTechnology: (label: string) => void
  onRegion: (region: string) => void
  onSearchSelect: (event: Invention) => void
  onSkipIntro: () => void
  onHoldChange: (seconds: number) => void
}

export class Hud {
  private readonly clockEl: HTMLElement
  private readonly cardEl: HTMLElement
  private readonly cardTitleEl: HTMLElement
  private readonly cardPanel: HTMLElement
  private readonly eraEl: HTMLElement
  private readonly playBtn: HTMLButtonElement
  private readonly holdInput: HTMLInputElement
  private readonly searchInput: HTMLInputElement
  private readonly searchResults: HTMLElement
  private readonly eraBanner: HTMLElement
  private readonly introEl: HTMLElement
  private readonly hintEl: HTMLElement
  private inventions: Invention[] = []
  private wikiImageRequest = 0
  private wikiZoomEl: HTMLElement | null = null

  constructor(root: HTMLElement, handlers: HudHandlers) {
    const source = catalogSource()
    root.innerHTML = `
      <div class="intro" id="intro">
        <p class="intro-kicker">Human Achievements</p>
        <h1>The History of Human Invention</h1>
        <p class="intro-sub">3.3 million years of human ingenuity</p>
        <p class="intro-hint">Play through history, or click an invention to discover its story.</p>
        <div class="intro-actions">
          <button type="button" id="intro-play">Play through history</button>
          <button type="button" id="intro-skip" class="ghost">Skip</button>
        </div>
      </div>
      <div class="era-banner" id="era-banner" hidden>
        <p class="era-kicker" id="era-kicker"></p>
        <h2 id="era-title"></h2>
        <p id="era-blurb"></p>
      </div>
      <div class="hud-top">
        <section class="panel controls">
          <header class="panel-head">
            <h1>Human Achievements</h1>
            <button type="button" class="panel-toggle" aria-expanded="true">Collapse</button>
          </header>
          <div class="panel-body">
            <p class="lede">A visual journey from the earliest stone tools to artificial intelligence. Time is compressed in deep prehistory and expands toward the present, so acceleration becomes visible.</p>
            <div class="row" role="group" aria-label="Playback">
              <button type="button" id="dir-reverse" title="Play backward, or step back when paused">◀ Reverse</button>
              <button type="button" id="play-toggle" title="Space" aria-keyshortcuts="Space">Play</button>
              <button type="button" id="dir-forward" class="active" title="Play forward, or step ahead when paused">Forward ▶</button>
            </div>
            <label class="hold-control" for="hold-seconds">Hold
              <input id="hold-seconds" type="number" min="0.1" max="10" step="0.1" value="0.4" />
              <span>s</span>
            </label>
            <div class="clock-compact">
              <div id="clock">—</div>
              <div class="now-era" id="now-era">Looking across 3.3 million years</div>
            </div>
            <label class="search-label" for="search">Search</label>
            <input id="search" type="search" placeholder="Printing press, Gutenberg, Bronze Age…" autocomplete="off" />
            <div id="search-results" class="search-results" hidden></div>
            <p class="note keys">Space play/pause. ← → step.</p>
            <div class="filter-block">
              <p class="filter-label">Category</p>
              <div class="row wrap" id="category-filters" role="group" aria-label="Category"></div>
            </div>
            <details class="more-filters">
              <summary>More filters</summary>
              <div class="filter-block">
                <p class="filter-label">Historical period</p>
                <div class="row wrap" id="historical-filters" role="group" aria-label="Historical period"></div>
              </div>
              <div class="filter-block">
                <p class="filter-label">Technological era</p>
                <div class="row wrap" id="tech-filters" role="group" aria-label="Technological era"></div>
              </div>
              <div class="filter-block">
                <p class="filter-label">Geography</p>
                <div class="row wrap" id="region-filters" role="group" aria-label="Geography"></div>
              </div>
            </details>
            <p class="attr">Dataset based on Wikipedia’s <a href="${source.url}" target="_blank" rel="noreferrer">${source.title}</a> (${source.license}). Dates are often archaeological estimates. Retrieved ${source.retrieved}.</p>
          </div>
        </section>
        <section class="panel card" id="details-card">
          <header class="panel-head">
            <h2 id="card-title">Invention</h2>
            <button type="button" class="panel-toggle" aria-expanded="true">Collapse</button>
          </header>
          <div class="panel-body" id="event-card">
            <p class="muted">Play through history or use Left and Arrow keys + Spacebar to navigate the timeline</p>
          </div>
        </section>
      </div>
      <p class="float-hint" id="float-hint">Play through history · Click to read</p>
    `

    this.clockEl = root.querySelector('#clock') as HTMLElement
    this.cardEl = root.querySelector('#event-card') as HTMLElement
    this.cardTitleEl = root.querySelector('#card-title') as HTMLElement
    this.cardPanel = root.querySelector('#details-card') as HTMLElement
    this.eraEl = root.querySelector('#now-era') as HTMLElement
    this.playBtn = root.querySelector('#play-toggle') as HTMLButtonElement
    this.holdInput = root.querySelector('#hold-seconds') as HTMLInputElement
    this.searchInput = root.querySelector('#search') as HTMLInputElement
    this.searchResults = root.querySelector('#search-results') as HTMLElement
    this.eraBanner = root.querySelector('#era-banner') as HTMLElement
    this.introEl = root.querySelector('#intro') as HTMLElement
    this.hintEl = root.querySelector('#float-hint') as HTMLElement

    root.querySelectorAll<HTMLButtonElement>('.panel-toggle').forEach((button) => {
      button.addEventListener('click', () => this.togglePanel(button))
    })
    this.playBtn.addEventListener('click', () => handlers.onPlayToggle())
    this.holdInput.addEventListener('input', () => {
      const seconds = Number(this.holdInput.value)
      if (!Number.isFinite(seconds)) return
      handlers.onHoldChange(seconds)
    })
    this.holdInput.addEventListener('change', () => {
      const seconds = clampHoldSeconds(Number(this.holdInput.value))
      handlers.onHoldChange(seconds)
      this.setHoldSeconds(seconds)
    })
    root.querySelector('#dir-reverse')?.addEventListener('click', () => handlers.onDirection(-1))
    root.querySelector('#dir-forward')?.addEventListener('click', () => handlers.onDirection(1))
    root.querySelector('#intro-play')?.addEventListener('click', () => {
      this.hideIntro()
      handlers.onPlayHistory()
    })
    root.querySelector('#intro-skip')?.addEventListener('click', () => {
      this.hideIntro()
      handlers.onSkipIntro()
    })
    window.addEventListener('keydown', (event) => this.onKeyDown(event, handlers))

    this.searchInput.addEventListener('input', () => this.renderSearch(this.searchInput.value))
    this.searchResults.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-id]')
      if (!button) return
      const found = this.inventions.find((item) => item.id === button.dataset.id)
      if (found) {
        handlers.onSearchSelect(found)
        this.searchResults.hidden = true
        this.searchInput.value = found.title
      }
    })
  }

  setCatalog(inventions: Invention[], eras: Era[], categories: Category[], handlers: HudHandlers): void {
    this.inventions = inventions
    this.fillChips('#category-filters', ['all', ...categories.map((item) => item.id)], (id) => {
      const cat = categories.find((item) => item.id === id)
      return id === 'all' ? 'All' : cat?.label ?? id
    }, (id) => handlers.onCategory(id))
    const historical = unique(eras.filter((era) => era.layer === 'historical').map((era) => era.label))
    this.fillChips('#historical-filters', ['all', ...historical], (id) => (id === 'all' ? 'All' : id), (id) =>
      handlers.onHistorical(id),
    )
    const tech = unique(eras.filter((era) => era.layer === 'technology').map((era) => era.label))
    this.fillChips('#tech-filters', ['all', ...tech], (id) => (id === 'all' ? 'All' : id), (id) => handlers.onTechnology(id))
    this.fillChips(
      '#region-filters',
      ['all', 'Africa', 'Europe', 'Asia', 'Americas', 'Middle East', 'Oceania'],
      (id) => (id === 'all' ? 'All' : id),
      (id) => handlers.onRegion(id),
    )
  }

  hideIntro(): void {
    this.introEl.classList.add('gone')
    this.introEl.hidden = true
    this.hintEl.classList.add('gone')
    this.hintEl.hidden = true
  }

  setPlaying(playing: boolean): void {
    this.playBtn.textContent = playing ? 'Pause' : 'Play'
  }

  setHoldSeconds(seconds: number): void {
    const display = String(seconds)
    if (this.holdInput.value !== display) this.holdInput.value = display
  }

  setDirection(direction: 1 | -1): void {
    document.querySelector('#dir-reverse')?.classList.toggle('active', direction === -1)
    document.querySelector('#dir-forward')?.classList.toggle('active', direction === 1)
  }

  setClock(year: number, eraLabel: string): void {
    this.clockEl.textContent = formatClock(year)
    this.eraEl.textContent = eraLabel
  }

  showEra(era: Era): void {
    this.eraBanner.hidden = false
    this.eraBanner.style.setProperty('--era', era.color)
    const kicker = this.eraBanner.querySelector('#era-kicker')
    const title = this.eraBanner.querySelector('#era-title')
    const blurb = this.eraBanner.querySelector('#era-blurb')
    if (kicker) kicker.textContent = era.layer === 'technology' ? 'Technological era' : era.layer === 'archaeological' ? 'Archaeological period' : 'Historical period'
    if (title) title.textContent = era.label
    if (blurb) blurb.textContent = era.blurb
    window.setTimeout(() => {
      if (this.eraBanner.querySelector('#era-title')?.textContent === era.label) {
        this.eraBanner.hidden = true
      }
    }, 4200)
  }

  showEvent(event: Invention): void {
    this.hideWikiZoom()
    const requestId = ++this.wikiImageRequest
    this.cardTitleEl.textContent = event.title
    this.cardPanel.classList.add('live')
    const inventors = event.inventor?.length ? event.inventor.join(', ') : ''
    const location = event.location
      ? `${event.location.kind === 'earliest-evidence' ? 'Earliest known evidence: ' : ''}${event.location.name}`
      : 'Location uncertain'
    const periods = [
      ...(event.archaeologicalPeriod ?? []),
      ...(event.historicalPeriod ?? []),
      ...(event.technologyEra ?? []),
    ]
    const related = (event.relatedInventions ?? [])
      .map((name) => `<li>${escapeHtml(name)}</li>`)
      .join('')
    const dateClass = isUncertain(event.datePrecision) ? 'approx' : 'exact'
    this.cardEl.innerHTML = `
      <p class="mag ${dateClass}">${escapeHtml(event.dateDisplay)}</p>
      ${inventors ? `<p class="who">${escapeHtml(inventors)}</p>` : ''}
      <p class="what">${escapeHtml(event.description)}</p>
      ${event.significance ? `<div class="why"><h3>Why it matters</h3><p>${escapeHtml(event.significance)}</p></div>` : ''}
      <dl>
        <div><dt>Era</dt><dd>${escapeHtml(periods.slice(0, 4).join(' · ') || '—')}</dd></div>
        <div><dt>Category</dt><dd>${escapeHtml(event.categories.join(', ') || '—')}</dd></div>
        <div><dt>Place</dt><dd>${escapeHtml(location)}</dd></div>
        <div><dt>Date</dt><dd>${escapeHtml(precisionLabel(event.datePrecision))}</dd></div>
      </dl>
      ${related ? `<div class="related"><h3>Related milestones</h3><ul>${related}</ul></div>` : ''}
      ${
        event.wikipediaUrl
          ? `<p class="wiki">Source: Wikipedia · <a href="${escapeHtml(event.wikipediaUrl)}" target="_blank" rel="noreferrer">Read on Wikipedia →</a></p>`
          : ''
      }
    `
    void this.loadWikiImage(event, requestId)
  }

  clearEvent(): void {
    this.hideWikiZoom()
    this.wikiImageRequest += 1
    this.cardTitleEl.textContent = 'Invention'
    this.cardPanel.classList.remove('live')
    this.cardEl.innerHTML = `<p class="muted">Play through history or use Left and Arrow keys + Spacebar to navigate the timeline</p>`
  }

  private showWikiZoom(src: string, alt: string): void {
    this.hideWikiZoom()
    const overlay = document.createElement('div')
    overlay.className = 'wiki-image-zoom'
    overlay.setAttribute('aria-hidden', 'true')
    const zoomImg = document.createElement('img')
    zoomImg.src = src
    zoomImg.alt = alt
    overlay.appendChild(zoomImg)
    document.body.appendChild(overlay)
    this.wikiZoomEl = overlay
  }

  private hideWikiZoom(): void {
    this.wikiZoomEl?.remove()
    this.wikiZoomEl = null
  }

  private async loadWikiImage(event: Invention, requestId: number): Promise<void> {
    const title = wikipediaPageTitle(event)
    if (!title) return
    try {
      const encoded = encodeURIComponent(title.replaceAll(' ', '_'))
      const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`)
      if (!response.ok || requestId !== this.wikiImageRequest) return
      const data = (await response.json()) as WikiSummary
      if (requestId !== this.wikiImageRequest) return
      const src = wikiImageSource(data)
      if (!src) return
      const img = document.createElement('img')
      img.className = 'card-wiki-image'
      img.src = src
      img.alt = event.title
      img.addEventListener('error', () => {
        this.hideWikiZoom()
        img.remove()
      })
      img.addEventListener('mouseenter', () => this.showWikiZoom(src, event.title))
      img.addEventListener('mouseleave', () => this.hideWikiZoom())
      this.cardEl.prepend(img)
    } catch {
      // Missing or blocked Wikipedia image should not break the card.
    }
  }

  private renderSearch(query: string): void {
    const q = query.trim().toLowerCase()
    if (q.length < 2) {
      this.searchResults.hidden = true
      this.searchResults.innerHTML = ''
      return
    }
    const hits = this.inventions
      .filter((item) => {
        const hay = `${item.title} ${item.description} ${item.inventor?.join(' ') ?? ''} ${item.location?.name ?? ''} ${item.categories.join(' ')} ${item.historicalPeriod?.join(' ') ?? ''} ${item.technologyEra?.join(' ') ?? ''} ${item.archaeologicalPeriod?.join(' ') ?? ''}`.toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 12)
    this.searchResults.hidden = hits.length === 0
    this.searchResults.innerHTML = hits
      .map(
        (item) =>
          `<button type="button" data-id="${item.id}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.dateDisplay)}</span></button>`,
      )
      .join('')
  }

  private fillChips(
    selector: string,
    values: string[],
    label: (id: string) => string,
    onPick: (id: string) => void,
  ): void {
    const root = document.querySelector(selector)
    if (!root) return
    root.innerHTML = values
      .map((id, index) => `<button type="button" data-chip="${escapeHtml(id)}" class="${index === 0 ? 'active' : ''}">${escapeHtml(label(id))}</button>`)
      .join('')
    root.querySelectorAll<HTMLButtonElement>('[data-chip]').forEach((button) => {
      button.addEventListener('click', () => {
        root.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button))
        onPick(button.dataset.chip ?? 'all')
      })
    })
  }

  private onKeyDown(event: KeyboardEvent, handlers: HudHandlers): void {
    if (isEditableTarget(event.target)) return
    if (event.code === 'Space') {
      if (event.repeat) return
      event.preventDefault()
      handlers.onPlayToggle()
      return
    }
    if (event.code === 'Escape') {
      this.hideIntro()
      handlers.onSkipIntro()
      return
    }
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      if (event.repeat) return
      event.preventDefault()
      handlers.onStep(event.code === 'ArrowLeft' ? -1 : 1)
    }
  }

  private togglePanel(button: HTMLButtonElement): void {
    const panel = button.closest('.panel')
    if (!panel) return
    const collapsed = panel.classList.toggle('collapsed')
    button.textContent = collapsed ? 'Expand' : 'Collapse'
    button.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
  }
}

function precisionLabel(precision: Invention['datePrecision']): string {
  if (precision === 'exact') return 'Exact date'
  if (precision === 'year') return 'Year'
  if (precision === 'range') return 'Date range'
  if (precision === 'century') return 'Century estimate'
  if (precision === 'millennium') return 'Millennium estimate'
  if (precision === 'million-years-ago') return 'Archaeological estimate (millions of years)'
  if (precision === 'thousand-years-ago') return 'Archaeological estimate (thousands of years)'
  return 'Approximate'
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag !== 'INPUT') return false
  const type = (target as HTMLInputElement).type
  return type === 'text' || type === 'search' || type === 'number' || type === 'checkbox' || type === 'range'
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

type WikiSummary = {
  thumbnail?: { source?: string }
  originalimage?: { source?: string }
}

function wikipediaPageTitle(event: Invention): string | null {
  const titled = event.wikipediaTitle?.trim()
  if (titled) return titled
  const url = event.wikipediaUrl
  if (!url) return null
  try {
    const path = new URL(url).pathname
    const slug = path.startsWith('/wiki/') ? path.slice('/wiki/'.length) : ''
    if (!slug) return null
    return decodeURIComponent(slug)
  } catch {
    return null
  }
}

function wikiImageSource(data: WikiSummary): string | null {
  const src = data.originalimage?.source ?? data.thumbnail?.source
  if (!src) return null
  try {
    const parsed = new URL(src)
    const host = parsed.hostname
    const allowed = host === 'upload.wikimedia.org' || host.endsWith('.wikipedia.org')
    if (parsed.protocol !== 'https:' || !allowed) return null
    return src
  } catch {
    return null
  }
}
