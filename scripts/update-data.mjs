/**
 * Refresh the invention catalog from Wikipedia's Timeline of historic inventions
 * via the MediaWiki API (wikitext), then normalize dates and merge curated metadata.
 *
 *   npm run update-data
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RELATED, SIGNIFICANCE, TIER1, TIER2_TITLES, TITLE_FIXES } from './overrides.mjs'
import { attachSummaries } from './wiki-summaries.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = join(ROOT, 'scripts', 'cache')
const CACHE_FILE = join(CACHE_DIR, 'timeline-api.json')
const OUT_FILE = join(ROOT, 'data', 'inventions.json')
const ERAS_FILE = join(ROOT, 'data', 'eras.json')

const PAGE = 'Timeline_of_historic_inventions'
const API =
  'https://en.wikipedia.org/w/api.php?action=parse&page=' +
  PAGE +
  '&prop=wikitext&format=json&formatversion=2'
const SOURCE_URL = 'https://en.wikipedia.org/wiki/Timeline_of_historic_inventions'
const PRESENT = 2026

const SKIP_SECTIONS = new Set(['See also', 'Notes', 'Footnotes', 'References', 'External links'])
const JUNK_TITLES =
  /^(lawsuit|time magazine|time \(magazine\)|bell labs|bell telephone laboratories|holy roman empire|mainz|germany|france|italy|china|japan|india|kenya|ethiopia|africa|europe|asia|united states|england|britain|npr|bbc|bbc news|reuters|new york times|the new york times|cnn|the guardian|washington post|the washington post|associated press|cbc radio|cbc|usa today|british broadcasting corporation|elsevier|science|science \(journal\)|nature|nature \(journal\)|proceedings of the national academy of sciences|deutsches archäologisches institut|archaeological survey of india)$/i
const JUNK_TITLE_HINT = /\bjournal\b|^proceedings of the |magazine$/i
const PERSON_NAME = /^[A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){1,3}$/
const GENERIC_TITLES = new Set([
  'Internet',
  'Telephone',
  'Transistor',
  'Writing',
  'Paper',
  'City',
  'Satellite',
  'Wheel',
  'Agriculture',
  'Cooking',
])

const CATEGORY_RULES = [
  ['computing', /computer|transistor|internet|software|algorithm|microprocessor|digital|semiconductor|cpu|program|unix|linux|packet|ethernet|smartphone|bluetooth|gpt|neural|deep learning|machine learning|ai\b|compiler|graphical user|search engine|email|arpanet|www|web\b|chip|integrated circuit|data|pixel|gpu/i],
  ['medicine', /vaccin|surg|antibiotic|penicillin|anesthes|medical|dna|gene|hospital|anatomy|dentist|amputation|crispr|x-ray|pasteur|microscope|anatomy|pharmacy|capsule endoscopy/i],
  ['energy', /steam|electric|nuclear|oil|coal|dynamo|generator|battery|turbine|engine|power|photovoltaic|solar|windmill|watermill|fire|light bulb|led\b|reactor|petroleum/i],
  ['transportation', /wheel|boat|ship|sail|rail|locomotive|car\b|auto|airplane|aircraft|rocket|satellite|chariot|canoe|road|bicycle|jet|balloon|zeppelin|tram|subway|gps|navigation|compass|bridge/i],
  ['communication', /writ|paper|print|telegraph|telephone|radio|television|alphabet|book|newspaper|postal|type|press|phonograph|cinema|film|internet|web|email|beacon/i],
  ['agriculture', /agricult|farm|domestication|irrigation|plough|plow|crop|rice|wheat|potato|sheep|cattle|horse|saddle|stirrup|mill|thresh|fermentation|wine|beer|bread/i],
  ['construction', /architect|building|city|brick|concrete|aqueduct|dam|pyramid|temple|road|bridge|cement|arch|dome|skyscraper|well|latrine|toilet|reservoir/i],
  ['materials', /bronze|iron|steel|copper|tin|glass|pottery|ceramic|plastic|vinyl|concrete|alloy|smelt|metall|textile|cloth|silk|cotton|leather|hide|rubber|paper|kiln|sword/i],
  ['science', /telescope|microscope|clock|calendar|zero|algebra|mathematic|thermometer|barometer|periodic|relativity|quantum|astronomy|map|compass|number|abacus|astrolabe/i],
  ['survival', /stone tool|fire|spear|bow|arrow|needle|clothing|bed|shoe|cook|haft|harpoon|flint|axe|weapon|hunt/i],
]

const REGION_RULES = [
  ['Africa', /africa|kenya|ethiopia|egypt|zambia|congo|eswatini|south africa|sahara|nubia|maghreb|algeria/i],
  ['Middle East', /mesopotamia|sumer|iraq|iran|syria|levant|canaan|palestine|israel|anatolia|turkey|arabia|persia|fertile crescent|southwest asia|levantine/i],
  ['Asia', /china|japan|india|korea|indonesia|siberia|central asia|indus|mongolia|vietnam|thailand|cambodia/i],
  ['Europe', /europe|greece|rome|italy|germany|france|spain|britain|england|slovenia|cyprus|scandinavia|russia|poland|greece/i],
  ['Americas', /america|peru|bolivia|mexico|andes|mississippi|olmec|maya|aztec|inca|great lakes/i],
  ['Oceania', /australia|oceania|polynesia|new zealand|pacific/i],
]

const today = new Date().toISOString().slice(0, 10)

const wikitext = await loadWikitext()
const eras = JSON.parse(await readFile(ERAS_FILE, 'utf8')).eras
const parsed = parseWikitext(wikitext)
const inventions = parsed
  .map((row) => enrich(row, eras))
  .filter((row) => Number.isFinite(row.dateStart) && row.title.length > 1)

dedupe(inventions)
validate(inventions)
const { filled, failed } = await attachSummaries(inventions)

const catalog = {
  source: {
    title: 'Timeline of historic inventions',
    url: SOURCE_URL,
    retrieved: today,
    license: 'CC BY-SA 4.0',
  },
  inventions,
}

await writeFile(OUT_FILE, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
console.log(`Wrote ${inventions.length} inventions to data/inventions.json`)
console.log(`Summaries: ${filled} filled, ${failed} empty`)

async function loadWikitext() {
  try {
    const response = await fetch(API, {
      headers: { 'User-Agent': 'HumanAchievements/0.1 (educational timeline; local rebuild)' },
    })
    if (!response.ok) throw new Error(`Wikipedia API ${response.status}`)
    const json = await response.json()
    await mkdir(CACHE_DIR, { recursive: true })
    await writeFile(CACHE_FILE, JSON.stringify(json), 'utf8')
    return json.parse.wikitext
  } catch (error) {
    try {
      const cached = JSON.parse(await readFile(CACHE_FILE, 'utf8'))
      console.warn(`Live Wikipedia fetch failed (${error.message}); using cache.`)
      return cached.parse.wikitext
    } catch {
      throw new Error(`Could not fetch Wikipedia and no cache exists: ${error.message}`)
    }
  }
}

function parseWikitext(text) {
  const lines = text.replaceAll('\r\n', '\n').split('\n')
  const rows = []
  let section = 'Paleolithic'
  let pendingDate = null

  for (const rawLine of lines) {
    const heading = rawLine.match(/^(={2,})\s*(.+?)\s*\1\s*$/)
    if (heading) {
      const name = heading[2].replaceAll("'", '').trim()
      if (SKIP_SECTIONS.has(name)) break
      section = name
      pendingDate = null
      continue
    }

    const list = rawLine.match(/^(\*+)\s*(.*)$/)
    if (!list) continue
    const depth = list[1].length
    const body = list[2]
    if (!body || body.startsWith('[[File:') || body.startsWith('[[Image:')) continue
    if (/^\{\{\s*cite/i.test(body) || /^<ref/i.test(body)) continue

    const dateChunk = extractDateChunk(body)
    if (dateChunk) pendingDate = dateChunk
    else if (depth > 1 && pendingDate) {
      // inherit parent date onto nested inventions only
    } else if (!dateChunk && !pendingDate) {
      const inferred = inferDateFromSection(section)
      if (!inferred) continue
      pendingDate = inferred
    } else if (!dateChunk) {
      const inferred = inferDateFromSection(section)
      if (inferred) pendingDate = inferred
    }

    const visible = stripCitations(body)
    const clean = cleanWikitext(visible.replace(/^'''[^']+'''\s*:?\s*/, ''))
    if (!clean || clean.length < 3) continue
    // Date-only headers such as "70 kya in Sibudu Cave:" introduce nested inventions.
    if (depth === 1 && /:\s*$/.test(clean)) continue
    const links = wikiLinks(visible)
    const wiki = pickWiki(links, clean)
    if (!wiki || isJunkTitle(wiki.title) || isJunkTitle(wiki.text)) continue

    const parsedDate = parseDate(pendingDate?.raw ?? '', section)
    if (!Number.isFinite(parsedDate.start)) continue

    rows.push({
      wikipediaTitle: wiki.title,
      title: wiki.text,
      rawDate: pendingDate?.raw ?? '',
      dateStart: parsedDate.start,
      dateEnd: parsedDate.end,
      dateDisplay: parsedDate.display,
      datePrecision: parsedDate.precision,
      description: clean.slice(0, 420),
      section,
      locationName: pickLocation(clean, links),
      inventors: pickInventors(clean, links),
    })
  }

  return rows
}

function extractDateChunk(body) {
  const bold = body.match(/^'''\s*([^']+?)\s*'''/)
  if (bold) return { raw: bold[1].replace(/:$/, '').trim() }
  const lead = body.match(/^(\d{3,4}|c\.\s*\d{3,4})/)
  if (lead) return { raw: lead[1] }
  return null
}

function inferDateFromSection(section) {
  const decade = section.match(/(\d{3,4})s/)
  if (decade) {
    const start = Number(decade[1])
    return { raw: `${start}–${start + 9}` }
  }
  const century = section.match(/(\d{1,2})(?:st|nd|rd|th)\s+century\s*(BC|BCE)?/i)
  if (century) {
    return { raw: `${century[1]}th century${century[2] ? ` ${century[2]}` : ''}` }
  }
  const range = section.match(/(\d{4})\s*[–-]\s*(\d{4}|\d{2})/)
  if (range) return { raw: `${range[1]}–${range[2]}` }
  return null
}

function parseDate(raw, section) {
  const text = raw.replaceAll('–', '-').replaceAll('—', '-').replaceAll(',', '').trim()
  if (!text) return { start: NaN, end: undefined, display: '', precision: 'approximate' }

  const mya = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:Mya|mya|MYA|Ma)\b/g)].map((m) => Number(m[1]))
  if (mya.length) {
    const start = myaToYear(Math.max(...mya))
    const end = mya.length > 1 ? myaToYear(Math.min(...mya)) : undefined
    return {
      start,
      end,
      display: formatMya(mya),
      precision: 'million-years-ago',
    }
  }

  const kya = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:kya|Kya|Kya|ka|kyr)\b/g)].map((m) => Number(m[1]))
  if (kya.length) {
    const start = kyaToYear(Math.max(...kya))
    const end = kya.length > 1 ? kyaToYear(Math.min(...kya)) : undefined
    return {
      start,
      end,
      display: formatKya(kya),
      precision: 'thousand-years-ago',
    }
  }

  if (/millennium/i.test(text)) {
    const n = Number((text.match(/(\d+)/) || [])[1])
    const bc = /BC|BCE/i.test(text)
    if (n) {
      const start = bc ? -n * 1000 : (n - 1) * 1000 + 1
      const end = bc ? -(n - 1) * 1000 - 1 : n * 1000
      return {
        start,
        end,
        display: `c. ${ordinal(n)} millennium${bc ? ' BCE' : ''}`,
        precision: 'millennium',
      }
    }
  }

  if (/century/i.test(text)) {
    const n = Number((text.match(/(\d+)/) || [])[1])
    const bc = /BC|BCE/i.test(text)
    if (n) {
      const start = bc ? -n * 100 : (n - 1) * 100 + 1
      const end = bc ? -(n - 1) * 100 - 1 : n * 100
      return {
        start,
        end,
        display: `c. ${ordinal(n)} century${bc ? ' BCE' : ''}`,
        precision: 'century',
      }
    }
  }

  const years = [...text.matchAll(/(\d{1,7})\s*(BC|BCE|AD|CE)?/gi)]
  if (years.length) {
    const parsed = years.map((match) => {
      const n = Number(match[1])
      const era = (match[2] || '').toUpperCase()
      const sectionBc = /BC|BCE/i.test(section) || /BC|BCE/i.test(text)
      if (era === 'BC' || era === 'BCE' || (sectionBc && !era)) return -n
      return n
    })
    let start = parsed[0]
    let end = parsed.length > 1 ? parsed[1] : undefined
    if (end != null && /BC|BCE/i.test(text) && start > 0 && end > 0) {
      start = -Math.max(start, end)
      end = -Math.min(Math.abs(parsed[0]), Math.abs(parsed[1]))
    }
    if (end != null && start > end) {
      const swap = start
      start = end
      end = swap
    }
    const precision =
      /c\.|circa|about|around|~|late|early|mid/i.test(text) || start < 0
        ? end != null
          ? 'range'
          : 'approximate'
        : end != null
          ? 'range'
          : start >= 1500
            ? 'year'
            : 'approximate'
    return {
      start,
      end,
      display: formatYearPair(start, end, precision),
      precision,
    }
  }

  return { start: NaN, end: undefined, display: raw, precision: 'approximate' }
}

function myaToYear(mya) {
  return -Math.round(mya * 1_000_000)
}

function kyaToYear(kya) {
  return -Math.round(kya * 1000)
}

function formatMya(values) {
  const fmt = (n) => (n >= 10 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, ''))
  if (values.length === 1) return `c. ${fmt(values[0])} million years ago`
  return `c. ${fmt(Math.max(...values))}–${fmt(Math.min(...values))} million years ago`
}

function formatKya(values) {
  const fmt = (n) => Math.round(n).toLocaleString('en-US')
  if (values.length === 1) return `c. ${fmt(values[0])} thousand years ago`
  return `c. ${fmt(Math.max(...values))}–${fmt(Math.min(...values))} thousand years ago`
}

function formatYearPair(start, end, precision) {
  const a = formatYear(start)
  if (end == null || end === start) return precision === 'year' ? a.replace(' CE', '') : `c. ${a}`
  return `${a.replace(/^c\. /, '')} – ${formatYear(end)}`
}

function formatYear(year) {
  if (year < 0) return `${Math.abs(year).toLocaleString('en-US')} BCE`
  return `${year} CE`
}

function ordinal(n) {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  if (n % 10 === 1) return `${n}st`
  if (n % 10 === 2) return `${n}nd`
  if (n % 10 === 3) return `${n}rd`
  return `${n}th`
}

function stripCitations(text) {
  let out = text.replace(/<ref[^/]*>[\s\S]*?<\/ref>/gi, '')
  out = out.replace(/<ref[^>]*\/>/gi, '')
  out = out.replace(/<ref[^/]*>[\s\S]*$/gi, '')
  let prev
  do {
    prev = out
    out = out.replace(/\{\{[^{}]*\}\}/g, '')
  } while (out !== prev)
  return out
}

function isJunkTitle(title) {
  return JUNK_TITLES.test(title) || JUNK_TITLE_HINT.test(title)
}

function cleanWikitext(text) {
  let out = text
  let prev
  do {
    prev = out
    out = out.replace(/\{\{[^{}]*\}\}/g, '')
  } while (out !== prev)
  out = out.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, title, label) => label || title)
  out = out.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1')
  out = out.replace(/'''|''/g, '')
  out = out.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
  out = out.replace(/<[^>]+>/g, '')
  out = out.replace(/\s+/g, ' ').trim()
  out = out.replace(/^[:.\-–—]\s*/, '')
  return out
}

function wikiLinks(text) {
  const links = []
  const re = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g
  let match
  while ((match = re.exec(text))) {
    const title = match[1].trim()
    if (title.startsWith('File:') || title.startsWith('Image:') || title.startsWith('Category:')) continue
    links.push({ title, text: (match[2] || title).trim() })
  }
  return links
}

function includesTitle(text, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (GENERIC_TITLES.has(title)) {
    return new RegExp(
      `\\b(?:the|first|invents|invented|patent(?:ed)?|develops|developed)\\b[^.]{0,40}\\b${escaped}\\b`,
      'i',
    ).test(text)
  }
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
}

function pickWiki(links, clean) {
  const known = []
  for (const title of TIER1.keys()) {
    const linked = links.some((link) => link.title === title || link.text === title)
    if (linked || includesTitle(clean, title)) {
      known.push({ title, text: TIER1.get(title)?.title ?? TITLE_FIXES.get(title) ?? title, score: (linked ? 40 : 20) + title.length })
    }
  }
  for (const title of TIER2_TITLES) {
    const linked = links.some((link) => link.title === title || link.text === title)
    if (linked || includesTitle(clean, title)) {
      known.push({ title, text: TITLE_FIXES.get(title) ?? title, score: (linked ? 20 : 10) + title.length })
    }
  }
  known.sort((a, b) => b.score - a.score)
  if (known[0]) return known[0]

  const useful = links.filter(
    (link) => !isJunkTitle(link.title) && !isJunkTitle(link.text) && !PERSON_NAME.test(link.text),
  )
  // Invention is usually the first content link; later links are places or leftover cites.
  if (useful.length) return useful[0]
  if (links.length >= 2 && PERSON_NAME.test(links[0].text)) return links[1]
  return useful[0] ?? null
}

function pickLocation(clean, links) {
  const found = clean.match(/\bin (?:modern-?day )?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})/)
  if (found) return found[1].trim()
  const place = links.find((link) =>
    /kenya|ethiopia|egypt|china|india|iraq|iran|turkey|greece|rome|italy|france|germany|japan|africa|america|sumer|mesopotamia/i.test(
      link.title,
    ),
  )
  return place?.text
}

function pickInventors(clean, links) {
  if (!/\b(invents|invented|patents|develops|developed|builds|built|creates|created|crafts)\b/i.test(clean)) {
    return []
  }
  return links
    .slice(0, 2)
    .map((link) => link.text)
    .filter((name) => /[A-Z][a-z]+ [A-Z]/.test(name) || /brothers|Cai Lun|Bell|Edison|Gutenberg|Berners/i.test(name))
}

function enrich(row, eras) {
  const override = TIER1.get(row.wikipediaTitle)
  const title = override?.title ?? TITLE_FIXES.get(row.wikipediaTitle) ?? row.title
  const categories = unique(override?.categories ?? guessCategories(`${row.title} ${row.description} ${row.section}`))
  const periods = assignPeriods(row.dateStart, row.dateEnd ?? row.dateStart, eras, row.section)
  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(row.wikipediaTitle.replaceAll(' ', '_'))}`
  const locationKind = row.dateStart < -1000 ? 'earliest-evidence' : 'invented-in'
  const region = guessRegion(`${row.locationName ?? ''} ${row.description}`)

  return {
    id: slug(`${title}-${row.dateStart}`),
    title,
    dateStart: row.dateStart,
    ...(row.dateEnd != null && row.dateEnd !== row.dateStart ? { dateEnd: row.dateEnd } : {}),
    dateDisplay: row.dateDisplay,
    datePrecision: row.datePrecision,
    description: override?.description ?? row.description,
    ...(override?.significance || SIGNIFICANCE.get(row.wikipediaTitle) || SIGNIFICANCE.get(title)
      ? { significance: override?.significance || SIGNIFICANCE.get(row.wikipediaTitle) || SIGNIFICANCE.get(title) }
      : {}),
    ...(row.locationName
      ? {
          location: {
            name: row.locationName,
            kind: locationKind,
            ...(region ? { region } : {}),
          },
        }
      : {}),
    inventor: unique(override?.inventor ?? row.inventors),
    archaeologicalPeriod: periods.archaeological,
    historicalPeriod: periods.historical,
    technologyEra: periods.technology,
    categories: categories.length ? categories : ['survival'],
    wikipediaTitle: row.wikipediaTitle,
    wikipediaUrl: wikiUrl,
    sources: [
      { name: 'Wikipedia', url: wikiUrl },
      { name: 'Wikipedia: Timeline of historic inventions', url: SOURCE_URL },
    ],
    relatedInventions: override?.related ?? RELATED.get(row.wikipediaTitle) ?? [],
    tier: override?.tier ?? (TIER2_TITLES.has(row.wikipediaTitle) || TIER2_TITLES.has(title) ? 2 : 3),
    section: row.section,
  }
}

function assignPeriods(start, end, eras, section) {
  const mid = (start + end) / 2
  const archaeological = []
  const historical = []
  const technology = []
  for (const era of eras) {
    if (mid < era.start || mid > era.end) continue
    if (era.layer === 'archaeological') archaeological.push(era.label)
    if (era.layer === 'historical') historical.push(era.label)
    if (era.layer === 'technology') technology.push(era.label)
  }
  if (/Paleolithic|Mesolithic|Neolithic|Bronze|Iron/i.test(section) && archaeological.length === 0) {
    archaeological.push(section.replace(/ and .*/, ''))
  }
  return { archaeological, historical, technology }
}

function guessCategories(text) {
  const hits = []
  for (const [id, re] of CATEGORY_RULES) {
    if (re.test(text)) hits.push(id)
  }
  return hits.slice(0, 3)
}

function guessRegion(text) {
  for (const [region, re] of REGION_RULES) {
    if (re.test(text)) return region
  }
  return undefined
}

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))]
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

function dedupe(inventions) {
  const seen = new Set()
  for (let i = inventions.length - 1; i >= 0; i -= 1) {
    const key = `${inventions[i].wikipediaTitle}::${inventions[i].dateStart}`
    if (seen.has(key)) inventions.splice(i, 1)
    else seen.add(key)
  }
  inventions.sort((a, b) => a.dateStart - b.dateStart || a.title.localeCompare(b.title))
}

function validate(inventions) {
  const ids = new Set()
  let errors = 0
  for (const item of inventions) {
    if (ids.has(item.id)) {
      item.id = `${item.id}-${Math.abs(item.dateStart)}`
    }
    ids.add(item.id)
    if (item.dateStart > PRESENT) {
      console.warn(`Future date: ${item.title} ${item.dateStart}`)
      errors += 1
    }
    if (item.dateEnd != null && item.dateEnd < item.dateStart) {
      console.warn(`Inverted range: ${item.title}`)
      errors += 1
    }
    if (item.dateStart < 0 && item.dateDisplay.includes('CE') && !item.dateDisplay.includes('BCE')) {
      console.warn(`BCE stored as CE display: ${item.title} ${item.dateDisplay}`)
      errors += 1
    }
    if (isJunkTitle(item.title) || isJunkTitle(item.wikipediaTitle ?? '')) {
      console.warn(`Junk title: ${item.title} (${item.wikipediaTitle}) ${item.dateDisplay}`)
      errors += 1
    }
    if (
      item.dateStart < -10_000 &&
      /\b(19th|20th|21st) century\b|\b(radio|television|website|broadcast)\b/i.test(item.description)
    ) {
      console.warn(`Date vs description: ${item.title} ${item.dateDisplay}`)
      errors += 1
    }
  }
  if (inventions.length < 80) throw new Error(`Too few inventions parsed: ${inventions.length}`)
  if (errors) console.warn(`Validation warnings: ${errors}`)
}
