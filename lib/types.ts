export type Establishment = {
  id: string
  external_id: string | null
  name: string
  address: string
  city: string
  province: string
  lat: number | null
  lng: number | null
  category: string | null
  status: string | null
  source: string | null
}

export type Inspection = {
  id: string
  establishment_id: string
  external_id: string | null
  inspection_date: string
  inspection_type: string | null
  outcome: string | null
  source: string | null
}

export type Infraction = {
  id: string
  inspection_id: string
  infraction_text: string | null
  severity: 'M' | 'S' | 'C' | null
  action: string | null
  amount: string | null
  court_date: string | null
  source: string | null
}

export type Operator = {
  id: string
  email: string
  full_name: string | null
  is_admin: boolean
  is_approved: boolean
  created_at: string
}

export type SearchResult = {
  id: string
  name: string
  address: string
  category: string | null
  latest_inspection_date: string | null
  latest_outcome: string | null
}

export type RestaurantDetail = {
  establishment: Establishment
  inspections: (Inspection & { infractions: Infraction[] })[]
}
