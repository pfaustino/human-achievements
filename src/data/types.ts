export type DatePrecision =
  | 'exact'
  | 'year'
  | 'range'
  | 'century'
  | 'millennium'
  | 'approximate'
  | 'thousand-years-ago'
  | 'million-years-ago'

export type SignificanceTier = 1 | 2 | 3

export type PeriodLayer = 'archaeological' | 'historical' | 'technology'

export type LocationKind = 'invented-in' | 'earliest-evidence' | 'developed-in'

export type Source = {
  name: string
  url: string
}

export type InventionLocation = {
  name: string
  kind: LocationKind
  region?: string
  latitude?: number
  longitude?: number
}

export type Invention = {
  id: string
  title: string
  dateStart: number
  dateEnd?: number
  dateDisplay: string
  datePrecision: DatePrecision
  description: string
  significance?: string
  location?: InventionLocation
  inventor?: string[]
  civilization?: string
  archaeologicalPeriod?: string[]
  historicalPeriod?: string[]
  technologyEra?: string[]
  categories: string[]
  wikipediaTitle?: string
  wikipediaUrl?: string
  sources: Source[]
  enabledBy?: string[]
  relatedInventions?: string[]
  tier: SignificanceTier
  section: string
}

export type Era = {
  id: string
  label: string
  shortLabel: string
  layer: PeriodLayer
  start: number
  end: number
  color: string
  blurb: string
  featured: boolean
}

export type Category = {
  id: string
  label: string
  color: string
}

export type CatalogFile = {
  source: {
    title: string
    url: string
    retrieved: string
    license: string
  }
  inventions: Invention[]
}
