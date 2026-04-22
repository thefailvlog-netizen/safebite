import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Inspection, Infraction } from '@/lib/types'
import { InspectionAccordion } from './inspection-accordion'

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return null
  const lower = outcome.toLowerCase()
  let cls = 'bg-gray-100 text-gray-700'
  if (lower.includes('conditional')) cls = 'bg-amber-100 text-amber-800'
  else if (lower.includes('closed') || lower.includes('fail')) cls = 'bg-red-100 text-red-800'
  else if (lower.includes('pass')) cls = 'bg-green-100 text-green-800'

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${cls}`}>
      {outcome}
    </span>
  )
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function RestaurantPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: establishment, error: estError } = await supabase
    .from('establishments')
    .select('*')
    .eq('id', id)
    .single()

  if (estError || !establishment) {
    notFound()
  }

  const { data: inspectionsRaw } = await supabase
    .from('inspections')
    .select('*')
    .eq('establishment_id', id)
    .order('inspection_date', { ascending: false })

  const inspections: (Inspection & { infractions: Infraction[] })[] = []

  for (const inspection of (inspectionsRaw ?? [])) {
    const { data: infractions } = await supabase
      .from('infractions')
      .select('*')
      .eq('inspection_id', inspection.id)

    inspections.push({
      ...inspection,
      infractions: infractions ?? [],
    })
  }

  const latestOutcome = inspections[0]?.outcome ?? null

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-border bg-background">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight text-foreground">
            SafeBite
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors border border-border rounded-lg px-3 py-1.5">
              Sign in
            </Link>
            <Link href="/signup" className="text-sm bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:bg-primary/90 transition-colors">
              Get access
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Back link */}
        <Link href="/search" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          ← Search results
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
            <h1 className="text-3xl font-bold text-foreground">{establishment.name}</h1>
            {latestOutcome && <OutcomeBadge outcome={latestOutcome} />}
          </div>
          <p className="text-muted-foreground">{establishment.address}, {establishment.city}</p>
          {establishment.category && (
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground mt-2">
              {establishment.category}
            </span>
          )}
        </div>

        {/* Owner CTA */}
        <div className="rounded-lg border border-border bg-muted/40 px-5 py-4 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-sm text-foreground">
            Are you the owner of this restaurant? Get notified of new inspections.
          </p>
          <Link
            href="/signup"
            className="shrink-0 text-sm font-medium text-primary hover:underline underline-offset-4"
          >
            Get notified →
          </Link>
        </div>

        {/* Inspection history */}
        <h2 className="text-xl font-semibold text-foreground mb-4">Inspection history</h2>

        {inspections.length === 0 ? (
          <div className="rounded-xl border border-border px-6 py-10 text-center text-muted-foreground">
            No inspections on record.
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
            {inspections.map((inspection) => (
              <InspectionAccordion key={inspection.id} inspection={inspection} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
