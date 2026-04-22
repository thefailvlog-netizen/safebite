'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

type NavProps = {
  userEmail?: string | null
  userName?: string | null
}

export function Nav({ userEmail, userName }: NavProps) {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <nav className="border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold tracking-tight text-foreground">
          SafeBite
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/search" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Search
          </Link>
          {userEmail ? (
            <>
              <span className="text-sm text-muted-foreground hidden sm:inline">{userName || userEmail}</span>
              <Link href="/dashboard">
                <Button variant="outline" size="sm">Dashboard</Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="outline" size="sm">Sign in</Button>
              </Link>
              <Link href="/signup">
                <Button size="sm">Get access</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
