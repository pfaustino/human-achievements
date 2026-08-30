import { catalogSource } from '../data/catalog.ts'
import { formatClock, isUncertain } from '../data/dates.ts'
import type { Category, Era, Invention } from '../data/types.ts'

export type HudHandlers = {
  onSpeed: (speed: number) => void
  onPlayToggle: () => void
  onPlayHistory: () => void
  onDirection: (direction: 1 | -1) => void
  onStep: (direction: -1 | 1) => void
  onSeek: (fraction: number) => void
  onResetView: () => void
  onJumpStart: () => void
  onJumpPresent: () => void
  onEra: (era: Era) => void
  onCategory: (id: string) => void
  onHistorical: (label: string) => void
  onTechnology: (label: string) => void
  onRegion: (region: string) => void
  onSearchSelect: (event: Invention) => void
  onSkipIntro: () => void
}

export class Hud {
  private readonly clockEl: HTMLElement
  private readonly statusEl: HTMLElement
  private readonly cardEl: HTMLElement
  private readonly cardTitleEl: HTMLElement
  private readonly cardPanel: HTMLElement
  private readonly eventsEl: HTMLElement
  private readonly eraEl: HTMLElement
  private readonly scrubber: HTMLInputElement
  private readonly playBtn: HTMLButtonElement
  private readonly searchInput: HTMLInputElement
  private readonly searchResults: HTMLElement
  private readonly eraBanner: HTMLElement
  private readonly introEl: HTMLElement
  private readonly hintEl: HTMLElement
  private seeking = false
  private inventions: Invention[] = []

  constructor(root: HTMLElement, handlers: HudHandlers) {
    const source = catalogSource()
    root.innerHTML = `
      <div class="intro" id="intro">
        <p class="intro-kicker">Human Achievements</p>
        <h1>The History of Human Invention</h1>
        <p class="intro-sub">3.3 million years of human ingenuity</p>
        <p class="intro-hint">Scroll to travel through history. Zoom to explore. Click an invention to discover its story.</p>
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
              <button type="button" id="dir-reverse" title="Play backward">◀ Reverse</button>
              <button type="button" id="play-toggle" title="Space" aria-keyshortcuts="Space">Play</button>
              <button type="button" id="dir-forward" class="active" title="Play forward">Forward ▶</button>
            </div>
            <div class="row" role="group" aria-label="Journey">
              <button type="button" id="play-history">Play history</button>
              <button type="button" id="jump-start">Beginning</button>
              <button type="button" id="jump-now">Present</button>
              <button type="button" id="reset-view">Full span</button>
            </div>
            <div class="row" role="group" aria-label="Step">
              <button type="button" id="step-back" title="Left arrow">‹ Previous</button>
              <button type="button" id="step-fwd" title="Right arrow">Next ›</button>
            </div>
            <div class="row" role="group" aria-label="Playback speed">
              <button type="button" data-speed="0.5">0.5×</button>
              <button type="button" data-speed="1" class="active">1×</button>
              <button type="button" data-speed="2">2×</button>
              <button type="button" data-speed="4">4×</button>
            </div>
            <label class="search-label" for="search">Search</label>
            <input id="search" type="search" placeholder="Printing press, Gutenberg, Bronze Age…" autocomplete="off" />
            <div id="search-results" class="search-results" hidden></div>
            <p class="note keys">Space play/pause. ← → step. Scroll zoom. Drag to pan.</p>
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
          </div>
        </section>
        <section class="panel card" id="details-card">
          <header class="panel-head">
            <h2 id="card-title">Invention</h2>
            <button type="button" class="panel-toggle" aria-expanded="true">Collapse</button>
          </header>
          <div class="panel-body" id="event-card">
            <p class="muted">Click a milestone, or play through history.</p>
          </div>
        </section>
      </div>
      <div class="hud-bottom">
        <div class="panel timeline">
          <header class="panel-head">
            <div>
              <div id="clock">—</div>
              <div class="now-era" id="now-era">Looking across 3.3 million years</div>
            </div>
            <button type="button" class="panel-toggle" aria-expanded="true">Collapse</button>
          </header>
          <div class="panel-body">
            <div class="clock-row">
              <div class="stats">
                <span>Shown <strong id="stat-events">0</strong></span>
                <span id="view-span"></span>
              </div>
            </div>
            <div class="era-nav" id="era-nav" role="navigation" aria-label="Eras"></div>
            <input id="scrubber" type="range" min="0" max="1000" value="0" />
            <p class="status" id="status">Loading catalog…</p>
            <p class="attr">Dataset based on Wikipedia’s <a href="${source.url}" target="_blank" rel="noreferrer">${source.title}</a> (${source.license}). Dates are often archaeological estimates. Retrieved ${source.retrieved}.</p>
          </div>
        </div>
      </div>
      <p class="float-hint" id="float-hint">Scroll to travel · Zoom to explore · Click to read</p>
    `

    this.clockEl = root.querySelector('#clock') as HTMLElement
    this.statusEl = root.querySelector('#status') as HTMLElement
    this.cardEl = root.querySelector('#event-card') as HTMLElement
    this.cardTitleEl = root.querySelector('#card-title') as HTMLElement
    this.cardPanel = root.querySelector('#details-card') as HTMLElement
    this.eventsEl = root.querySelector('#stat-events') as HTMLElement
    this.eraEl = root.querySelector('#now-era') as HTMLElement
    this.scrubber = root.querySelector('#scrubber') as HTMLInputElement
    this.playBtn = root.querySelector('#play-toggle') as HTMLButtonElement
    this.searchInput = root.querySelector('#search') as HTMLInputElement
    this.searchResults = root.querySelector('#search-results') as HTMLElement
    this.eraBanner = root.querySelector('#era-banner') as HTMLElement
    this.introEl = root.querySelector('#intro') as HTMLElement
    this.hintEl = root.querySelector('#float-hint') as HTMLElement

    root.querySelectorAll<HTMLButtonElement>('.panel-toggle').forEach((button) => {
      button.addEventListener('click', () => this.togglePanel(button))
    })
    root.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => {
      button.addEventListener('click', () => {
        this.setToggleGroup('[data-speed]', button)
        handlers.onSpeed(Number(button.dataset.speed))
      })
    })
    this.playBtn.addEventListener('click', () => handlers.onPlayToggle())
    root.querySelector('#play-history')?.addEventListener('click', () => handlers.onPlayHistory())
    root.querySelector('#dir-reverse')?.addEventListener('click', () => handlers.onDirection(-1))
    root.querySelector('#dir-forward')?.addEventListener('click', () => handlers.onDirection(1))
    root.querySelector('#step-back')?.addEventListener('click', () => handlers.onStep(-1))
    root.querySelector('#step-fwd')?.addEventListener('click', () => handlers.onStep(1))
    root.querySelector('#reset-view')?.addEventListener('click', () => handlers.onResetView())
    root.querySelector('#jump-start')?.addEventListener('click', () => handlers.onJumpStart())
    root.querySelector('#jump-now')?.addEventListener('click', () => handlers.onJumpPresent())
    root.querySelector('#intro-play')?.addEventListener('click', () => {
      this.hideIntro()
      handlers.onPlayHistory()
    })
    root.querySelector('#intro-skip')?.addEventListener('click', () => {
      this.hideIntro()
      handlers.onSkipIntro()
    })
    window.addEventListener('keydown', (event) => this.onKeyDown(event, handlers))

    this.scrubber.addEventListener('pointerdown', () => {
      this.seeking = true
    })
    this.scrubber.addEventListener('pointerup', () => {
      this.seeking = false
    })
    this.scrubber.addEventListener('input', () => {
      handlers.onSeek(Number(this.scrubber.value) / 1000)
    })

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

    const nav = document.querySelector('#era-nav')
    if (nav) {
      nav.innerHTML = eras
        .filter((era) => era.featured)
        .map((era) => `<button type="button" data-era-id="${era.id}" style="--era:${era.color}">${escapeHtml(era.shortLabel)}</button>`)
        .join('')
      nav.querySelectorAll<HTMLButtonElement>('[data-era-id]').forEach((button) => {
        button.addEventListener('click', () => {
          const era = eras.find((item) => item.id === button.dataset.eraId)
          if (era) handlers.onEra(era)
        })
      })
    }
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

  setDirection(direction: 1 | -1): void {
    document.querySelector('#dir-reverse')?.classList.toggle('active', direction === -1)
    document.querySelector('#dir-forward')?.classList.toggle('active', direction === 1)
  }

  setStatus(text: string): void {
    this.statusEl.textContent = text
  }

  setClock(year: number, eraLabel: string): void {
    this.clockEl.textContent = formatClock(year)
    this.eraEl.textContent = eraLabel
  }

  setFraction(fraction: number): void {
    if (this.seeking) return
    this.scrubber.value = String(Math.round(fraction * 1000))
  }

  setStats(shown: number, viewLabel: string): void {
    this.eventsEl.textContent = shown.toLocaleString('en-US')
    const span = document.querySelector('#view-span')
    if (span) span.textContent = viewLabel
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
  }

  clearEvent(): void {
    this.cardTitleEl.textContent = 'Invention'
    this.cardPanel.classList.remove('live')
    this.cardEl.innerHTML = `<p class="muted">Click a milestone, or play through history.</p>`
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

  private setToggleGroup(selector: string, active: HTMLButtonElement): void {
    active.parentElement?.querySelectorAll<HTMLButtonElement>(selector).forEach((button) => {
      button.classList.toggle('active', button === active)
    })
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
  return type === 'text' || type === 'search' || type === 'checkbox'
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
