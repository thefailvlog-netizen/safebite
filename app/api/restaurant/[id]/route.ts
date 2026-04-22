import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Validate UUID format before hitting the database
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()

  const { data: establishment, error: estError } = await supabase
    .from('establishments')
    .select('id, external_id, name, address, city, province, category, status')
    .eq('id', id)
    .single()

  if (estError || !establishment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Single query with nested infractions — avoids N+1 round trips
  const { data: inspections, error: inspError } = await supabase
    .from('inspections')
    .select(`
      id,
      inspection_date,
      inspection_type,
      outcome,
      infractions (
        id,
        infraction_text,
        severity,
        action,
        amount
      )
    `)
    .eq('establishment_id', id)
    .order('inspection_date', { ascending: false })

  if (inspError) {
    return NextResponse.json({ error: inspError.message }, { status: 500 })
  }

  return NextResponse.json({
    establishment,
    inspections: inspections ?? [],
  })
}
