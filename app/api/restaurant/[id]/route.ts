import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: establishment, error: estError } = await supabase
    .from('establishments')
    .select('*')
    .eq('id', id)
    .single()

  if (estError || !establishment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: inspections, error: inspError } = await supabase
    .from('inspections')
    .select('*')
    .eq('establishment_id', id)
    .order('inspection_date', { ascending: false })

  if (inspError) {
    return NextResponse.json({ error: inspError.message }, { status: 500 })
  }

  const inspectionsWithInfractions = await Promise.all(
    (inspections ?? []).map(async (inspection) => {
      const { data: infractions } = await supabase
        .from('infractions')
        .select('*')
        .eq('inspection_id', inspection.id)

      return { ...inspection, infractions: infractions ?? [] }
    })
  )

  return NextResponse.json({
    establishment,
    inspections: inspectionsWithInfractions,
  })
}
