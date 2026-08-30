import type { Category, CatalogFile, Era, Invention } from './types.ts'
import catalogFile from '../../data/inventions.json' with { type: 'json' }
import erasFile from '../../data/eras.json' with { type: 'json' }
import categoriesFile from '../../data/categories.json' with { type: 'json' }

const catalog = catalogFile as CatalogFile
const eraList = (erasFile as { eras: Era[] }).eras
const categoryList = (categoriesFile as { categories: Category[] }).categories

export function loadInventions(): Invention[] {
  return catalog.inventions.slice().sort((a, b) => a.dateStart - b.dateStart || a.title.localeCompare(b.title))
}

export function loadEras(): Era[] {
  return eraList.slice()
}

export function loadCategories(): Category[] {
  return categoryList.slice()
}

export function catalogSource(): CatalogFile['source'] {
  return catalog.source
}

export function featuredEras(): Era[] {
  return eraList.filter((era) => era.featured)
}

export function erasAt(year: number, layer?: Era['layer']): Era[] {
  return eraList.filter((era) => year >= era.start && year <= era.end && (!layer || era.layer === layer))
}

export function categoryById(id: string): Category | undefined {
  return categoryList.find((category) => category.id === id)
}

export function searchInventions(query: string, inventions: Invention[]): Invention[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return inventions.filter((item) => {
    const hay = [
      item.title,
      item.description,
      item.significance ?? '',
      item.inventor?.join(' ') ?? '',
      item.location?.name ?? '',
      item.categories.join(' '),
      item.archaeologicalPeriod?.join(' ') ?? '',
      item.historicalPeriod?.join(' ') ?? '',
      item.technologyEra?.join(' ') ?? '',
      item.civilization ?? '',
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export function matchesFilters(
  item: Invention,
  filters: { category: string; historical: string; technology: string; region: string },
): boolean {
  if (filters.category !== 'all' && !item.categories.includes(filters.category)) return false
  if (filters.historical !== 'all' && !(item.historicalPeriod ?? []).includes(filters.historical)) return false
  if (filters.technology !== 'all' && !(item.technologyEra ?? []).includes(filters.technology)) return false
  if (filters.region !== 'all' && item.location?.region !== filters.region) return false
  return true
}
