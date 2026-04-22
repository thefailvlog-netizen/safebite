import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Operator } from '@/lib/types'
import { AdminActions } from './admin-actions'

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Server-side auth check — don't rely solely on middleware
  if (!user) redirect('/login')

  const admin = serviceClient()
  const { data: currentOperator } = await admin
    .from('operators')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!currentOperator?.is_admin) redirect('/dashboard')

  const { data: operators } = await admin
    .from('operators')
    .select('id, full_name, email, is_approved, is_admin, created_at')
    .order('created_at', { ascending: false })

  const allOperators: Operator[] = operators ?? []
  const pending = allOperators.filter((o) => !o.is_approved)
  const approved = allOperators.filter((o) => o.is_approved)

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-border bg-background">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight text-foreground">
            SafeBite
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{user.email}</span>
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Dashboard
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-bold text-foreground mb-2">Admin panel</h1>

        {/* Stats */}
        <div className="flex gap-6 mb-8">
          <div className="text-sm">
            <span className="font-semibold text-foreground">{pending.length}</span>
            <span className="text-muted-foreground ml-1">pending</span>
          </div>
          <div className="text-sm">
            <span className="font-semibold text-foreground">{approved.length}</span>
            <span className="text-muted-foreground ml-1">approved</span>
          </div>
          <div className="text-sm">
            <span className="font-semibold text-foreground">{allOperators.length}</span>
            <span className="text-muted-foreground ml-1">total</span>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Signed up</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {allOperators.map((op) => (
                <tr key={op.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {op.full_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{op.email}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {new Date(op.created_at).toLocaleDateString('en-CA', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {op.is_approved ? (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800">
                        Approved
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AdminActions userId={op.id} isApproved={op.is_approved} />
                  </td>
                </tr>
              ))}
              {allOperators.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
