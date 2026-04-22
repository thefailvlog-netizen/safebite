import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from './sign-out-button'

export default async function PendingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="text-2xl font-bold tracking-tight text-foreground inline-block mb-8">
          SafeBite
        </Link>

        <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
          <div className="text-4xl mb-4">⏳</div>
          <h1 className="text-xl font-bold text-foreground mb-3">
            Your request is pending review
          </h1>
          <p className="text-muted-foreground text-sm mb-2">
            We&apos;ll email you at{' '}
            <span className="font-medium text-foreground">{user?.email ?? 'your address'}</span>{' '}
            once your account is approved.
          </p>
          <p className="text-muted-foreground text-sm mb-8">
            In the meantime, you can still search for any Toronto restaurant.
          </p>

          <Link
            href="/search"
            className="inline-flex items-center justify-center w-full h-9 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors px-4 mb-4"
          >
            Search restaurants →
          </Link>

          <SignOutButton />
        </div>
      </div>
    </div>
  )
}
