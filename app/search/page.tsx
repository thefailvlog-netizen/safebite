'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import type { SearchResult } from '@/lib/types'

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
        No inspection
      </span>
    )
  }
  const lower = outcome.toLowerCase()
  if (lower.includes('conditional')) {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
        {outcome}
      </span>
    )
  }
  if (lower.includes('closed') || lower.includes('fail')) {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-100 text-red-800">
        {outcome}
      </span>
    )
  }
  if (lower.includes('pass')) {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800">
        {outcome}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
      {outcome}
    </span>
  )
}

function SkeletonRow() {
  return (
    <div className="border-b border-border px-6 py-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-4 bg-muted rounded w-48" />
          <div className="h-3 bg-muted rounded w-64" />
        </div>
        <div className="h-5 bg-muted rounded-full w-20" />
      </div>
    </div>
  )
}

export default function SearchPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (query.length < 2) {
      setResults([])
      setSearched(false)
      setLoading(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(data)
        setSearched(true)
      } catch {
        setResults([])
        setSearched(true)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query])

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-border bg-background">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
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

      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-foreground mb-6">Search Toronto restaurants</h1>

        <div className="mb-6">
          <Input
            type="text"
            placeholder="Search Toronto restaurants..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-12 text-base px-4"
            autoFocus
          />
        </div>

        {/* Results container */}
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          {loading && (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          )}

          {!loading && searched && results.length === 0 && (
            <div className="px-6 py-12 text-center text-muted-foreground">
              No restaurants found for &ldquo;{query}&rdquo;
            </div>
          )}

          {!loading && !searched && query.length < 2 && query.length > 0 && (
            <div className="px-6 py-8 text-center text-muted-foreground text-sm">
              Keep typing to search...
            </div>
          )}

          {!loading && results.length > 0 && results.map((r) => (
            <button
              key={r.id}
              onClick={() => router.push(`/restaurant/${r.id}`)}
              className="w-full text-left border-b border-border last:border-0 px-6 py-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{r.name}</p>
                  <p className="text-sm text-muted-foreground truncate">{r.address}</p>
                  {r.latest_inspection_date && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Last inspected: {new Date(r.latest_inspection_date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  )}
                </div>
                <div className="shrink-0 mt-0.5">
                  <OutcomeBadge outcome={r.latest_outcome} />
                </div>
              </div>
            </button>
          ))}
        </div>

        {!loading && !searched && query.length === 0 && (
          <p className="text-sm text-muted-foreground text-center mt-8">
            Start typing to search 18,000+ Toronto restaurants
          </p>
        )}
      </div>
    </div>
  )
}
