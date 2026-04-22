import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DashboardSignOut } from './sign-out-button'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: operator } = await supabase
    .from('operators')
    .select('full_name, email')
    .eq('id', user!.id)
    .single()

  const name = operator?.full_name ?? operator?.email ?? user?.email ?? 'there'

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-border bg-background">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight text-foreground">
            SafeBite
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {operator?.email ?? user?.email}
            </span>
            <DashboardSignOut />
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-bold text-foreground mb-8">
          Welcome back, {name.split(' ')[0]}
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Your Restaurants</CardTitle>
              <CardDescription>
                Claim your restaurant to start tracking inspections.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button disabled size="sm" variant="outline">
                Claim a restaurant → (coming soon)
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Inspections</CardTitle>
              <CardDescription>
                No inspections to show yet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Coming soon</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Alerts</CardTitle>
              <CardDescription>
                Set up alerts to get notified when new inspections drop.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Coming soon</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
