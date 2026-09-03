/**
 * Fetch Wikipedia article leads and attach them as `summary` on inventions.
 * Batches MediaWiki extracts; caches under scripts/cache/ (gitignored).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = join(ROOT, 'scripts', 'cache')
const CACHE_FILE = join(CACHE_DIR, 'summaries.json')

const USER_AGENT = 'HumanAchievements/0.1 (educational timeline; local rebuild)'
const BATCH_SIZE = 20
const BATCH_GAP_MS = 700
const SHORT_EXTRACT = 280
const SUMMARY_MAX_CHARS = 1800
const API = 'https://en.wikipedia.org/w/api.php'

export async function attachSummaries(inventions, options = {}) {
  const refresh = Boolean(options.refresh)
  const cache = refresh ? { version: 1, pages: {} } : await loadCache()
  dropRetryableEmpties(cache)
  const titles = uniqueTitles(inventions)
  const needed = titles.filter((title) => refresh || !cache.pages[title])

  if (needed.length) {
    console.log(`Fetching Wikipedia leads for ${needed.length} titles (${titles.length} unique)…`)
    const extracts = await fetchExtracts(needed, { introOnly: true })
    const short = []
    for (const title of needed) {
      const result = extracts.get(title)
      if (!result) continue
      if (result.missing) {
        cache.pages[title] = { summary: '', ok: false, missing: true, fetched: new Date().toISOString() }
        continue
      }
      if (result.extract && result.extract.length < SHORT_EXTRACT) short.push(title)
      else cache.pages[title] = entry(result.extract)
    }
    if (short.length) {
      console.log(`Expanding ${short.length} short leads…`)
      const longer = await fetchExtracts(short, { introOnly: false })
      for (const title of short) {
        const first = extracts.get(title)?.extract ?? ''
        const next = longer.get(title)?.extract ?? ''
        cache.pages[title] = entry(next.length > first.length ? next : first)
      }
    }
    await saveCache(cache)
  } else {
    console.log(`Using cached Wikipedia leads for ${titles.length} titles.`)
  }

  let filled = 0
  let failed = 0
  for (const item of inventions) {
    const title = normalizeTitle(item.wikipediaTitle ?? '')
    if (!title) {
      delete item.summary
      failed += 1
      continue
    }
    const summary = cache.pages[title]?.summary ?? ''
    if (summary) {
      item.summary = summary
      filled += 1
    } else {
      delete item.summary
      failed += 1
    }
  }
  return { filled, failed, unique: titles.length }
}

function uniqueTitles(inventions) {
  const titles = new Set()
  for (const item of inventions) {
    const title = normalizeTitle(item.wikipediaTitle ?? '')
    if (title) titles.add(title)
  }
  return [...titles]
}

function normalizeTitle(title) {
  const spaced = title.replaceAll('_', ' ').trim()
  try {
    return decodeURIComponent(spaced)
  } catch {
    return spaced
  }
}

function entry(extract) {
  const summary = capExtract(extract)
  return {
    summary,
    ok: Boolean(summary),
    fetched: new Date().toISOString(),
  }
}

function capExtract(text) {
  const cleaned = String(text ?? '')
    .replaceAll('\r\n', '\n')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n{3,}/g, '\n\n')
  if (!cleaned) return ''
  if (cleaned.length <= SUMMARY_MAX_CHARS) return cleaned

  const paragraphs = cleaned.split(/\n\s*\n/)
  let out = ''
  for (const paragraph of paragraphs) {
    const next = out ? `${out}\n\n${paragraph}` : paragraph
    if (next.length > SUMMARY_MAX_CHARS) break
    out = next
  }
  if (out.length >= 200) return out.trim()

  const slice = cleaned.slice(0, SUMMARY_MAX_CHARS)
  const stop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '))
  if (stop >= 200) return slice.slice(0, stop + 1).trim()
  const space = slice.lastIndexOf(' ')
  return (space > 0 ? slice.slice(0, space) : slice).trim()
}

async function fetchExtracts(titles, { introOnly }) {
  const results = new Map()
  for (let i = 0; i < titles.length; i += BATCH_SIZE) {
    const batch = titles.slice(i, i + BATCH_SIZE)
    const query = await queryExtracts(batch, introOnly)
    if (query) {
      for (const [title, result] of mapExtracts(query, batch)) results.set(title, result)
    }
    const done = Math.min(i + BATCH_SIZE, titles.length)
    console.log(`  ${done}/${titles.length} titles`)
    if (done < titles.length) await sleep(BATCH_GAP_MS)
  }
  return results
}

async function queryExtracts(titles, introOnly) {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'extracts',
    explaintext: '1',
    exlimit: '20',
    redirects: '1',
    format: 'json',
    formatversion: '2',
    titles: titles.join('|'),
  })
  if (introOnly) params.set('exintro', '1')
  else params.set('exsentences', '12')

  const url = `${API}?${params}`
  let lastError
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after'))
        const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 4000 * (attempt + 1)
        console.warn(`  Rate limited; waiting ${Math.round(waitMs / 1000)}s…`)
        await sleep(waitMs)
        continue
      }
      if (!response.ok) throw new Error(`Wikipedia API ${response.status}`)
      return await response.json()
    } catch (error) {
      lastError = error
      await sleep(BATCH_GAP_MS * (attempt + 2))
    }
  }
  console.warn(`Extract batch failed (${lastError?.message}); will retry those titles later.`)
  return null
}

function mapExtracts(payload, requested) {
  const query = payload.query ?? {}
  const pages = Array.isArray(query.pages) ? query.pages : Object.values(query.pages ?? {})
  const byTitle = new Map()
  const missingTitles = new Set()
  for (const page of pages) {
    if (!page) continue
    const title = normalizeTitle(page.title)
    if (page.missing || page.invalid) {
      missingTitles.add(title)
      continue
    }
    const extract = typeof page.extract === 'string' ? page.extract.trim() : ''
    byTitle.set(title, extract)
  }

  const aliases = new Map()
  for (const item of query.normalized ?? []) {
    aliases.set(normalizeTitle(item.from), normalizeTitle(item.to))
  }
  for (const item of query.redirects ?? []) {
    aliases.set(normalizeTitle(item.from), normalizeTitle(item.to))
  }

  const resolve = (title) => {
    let current = normalizeTitle(title)
    const seen = new Set()
    while (aliases.has(current) && !seen.has(current)) {
      seen.add(current)
      current = aliases.get(current)
    }
    return current
  }

  const mapped = new Map()
  for (const title of requested) {
    const resolved = resolve(title)
    if (missingTitles.has(resolved)) mapped.set(title, { extract: '', missing: true })
    else if (byTitle.has(resolved)) mapped.set(title, { extract: byTitle.get(resolved) ?? '', missing: false })
  }
  return mapped
}

function dropRetryableEmpties(cache) {
  for (const [title, page] of Object.entries(cache.pages)) {
    if (page?.ok) continue
    if (page?.missing) continue
    delete cache.pages[title]
  }
}

async function loadCache() {
  try {
    const json = JSON.parse(await readFile(CACHE_FILE, 'utf8'))
    if (json?.version === 1 && json.pages && typeof json.pages === 'object') return json
  } catch {
    // first run or corrupt cache
  }
  return { version: 1, pages: {} }
}

async function saveCache(cache) {
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(CACHE_FILE, `${JSON.stringify(cache)}\n`, 'utf8')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
