/**
 * Attach Wikipedia lead summaries to the existing catalog without re-parsing the timeline.
 *
 *   npm run update-summaries
 *   npm run update-summaries -- --refresh
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { attachSummaries } from './wiki-summaries.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_FILE = join(ROOT, 'data', 'inventions.json')
const refresh = process.argv.includes('--refresh')

const catalog = JSON.parse(await readFile(OUT_FILE, 'utf8'))
const { filled, failed, unique } = await attachSummaries(catalog.inventions, { refresh })
await writeFile(OUT_FILE, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
console.log(`Summaries: ${filled} filled, ${failed} empty, ${unique} unique Wikipedia titles`)
