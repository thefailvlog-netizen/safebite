import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')

  if (!q || q.trim().length < 2) {
    return NextResponse.json([])
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('establishments')
    .select(`
      id,
      name,
      address,
      category,
      inspections (
        inspection_date,
        outcome
      )
    `)
    .ilike('name', `%${q.trim()}%`)
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type RawRow = {
    id: string
    name: string
    address: string
    category: string | null
    inspections: { inspection_date: string; outcome: string | null }[]
  }

  const results = (data as RawRow[]).map((row) => {
    const sorted = (row.inspections ?? []).sort(
      (a, b) => new Date(b.inspection_date).getTime() - new Date(a.inspection_date).getTime()
    )
    const latest = sorted[0] ?? null

    return {
      id: row.id,
      name: row.name,
      address: row.address,
      category: row.category,
      latest_inspection_date: latest?.inspection_date ?? null,
      latest_outcome: latest?.outcome ?? null,
    }
  })

  return NextResponse.json(results)
}
