'use client'

import { useState } from 'react'
import type { Inspection, Infraction } from '@/lib/types'

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return null
  const lower = outcome.toLowerCase()
  let cls = 'bg-gray-100 text-gray-700'
  if (lower.includes('conditional')) cls = 'bg-amber-100 text-amber-800'
  else if (lower.includes('closed') || lower.includes('fail')) cls = 'bg-red-100 text-red-800'
  else if (lower.includes('pass')) cls = 'bg-green-100 text-green-800'

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {outcome}
    </span>
  )
}

function SeverityBadge({ severity }: { severity: 'M' | 'S' | 'C' | null }) {
  if (!severity) return null
  const map: Record<string, { label: string; cls: string }> = {
    M: { label: 'Minor', cls: 'bg-yellow-100 text-yellow-800' },
    S: { label: 'Significant', cls: 'bg-orange-100 text-orange-800' },
    C: { label: 'Crucial', cls: 'bg-red-100 text-red-800' },
  }
  const entry = map[severity]
  if (!entry) return null
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${entry.cls}`}>
      {entry.label}
    </span>
  )
}

type Props = {
  inspection: Inspection & { infractions: Infraction[] }
}

export function InspectionAccordion({ inspection }: Props) {
  const [open, setOpen] = useState(false)

  const formattedDate = new Date(inspection.inspection_date).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="w-full text-left px-5 py-4 hover:bg-muted/40 transition-colors flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4 min-w-0">
          <span className="font-medium text-foreground shrink-0">{formattedDate}</span>
          {inspection.inspection_type && (
            <span className="text-sm text-muted-foreground truncate">{inspection.inspection_type}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <OutcomeBadge outcome={inspection.outcome} />
          <span className="text-muted-foreground text-sm">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 bg-muted/20">
          {inspection.infractions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3">No infractions recorded for this inspection.</p>
          ) : (
            <ul className="space-y-3 pt-2">
              {inspection.infractions.map((inf) => (
                <li key={inf.id} className="flex gap-3">
                  <div className="mt-0.5 shrink-0">
                    <SeverityBadge severity={inf.severity} />
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{inf.infraction_text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
