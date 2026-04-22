import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <nav className="border-b border-white/10 bg-slate-900">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight text-white">SafeBite</span>
          <div className="flex items-center gap-3">
            <Link href="/search" className="text-sm text-slate-300 hover:text-white transition-colors">
              Search
            </Link>
            <Link
              href="/login"
              className="text-sm text-slate-300 hover:text-white border border-slate-600 rounded-lg px-3 py-1.5 transition-colors hover:border-slate-400"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="text-sm bg-white text-slate-900 font-medium rounded-lg px-3 py-1.5 transition-colors hover:bg-slate-100"
            >
              Get access
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-slate-900 text-white py-24 px-4">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-5xl font-bold tracking-tight mb-6 leading-tight">
            Stay ahead of your next inspection.
          </h1>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">
            Track violations, benchmark your locations, and never be caught off guard. SafeBite pulls live Toronto inspection data so you don&apos;t have to.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/search"
              className="bg-white text-slate-900 font-semibold text-base rounded-lg px-6 py-3 hover:bg-slate-100 transition-colors"
            >
              Search a restaurant →
            </Link>
            <Link
              href="/signup"
              className="border border-slate-500 text-white font-semibold text-base rounded-lg px-6 py-3 hover:bg-slate-800 transition-colors"
            >
              Get early access
            </Link>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-slate-800 text-slate-300 py-4 px-4">
        <div className="mx-auto max-w-6xl text-center text-sm font-medium tracking-wide">
          18,000+ Toronto restaurants · Updated nightly · Free during beta
        </div>
      </section>

      {/* Features */}
      <section className="bg-white py-20 px-4">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">
            Everything you need to stay compliant
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <div className="text-3xl mb-2">📋</div>
                <CardTitle>Your inspection record</CardTitle>
                <CardDescription>
                  See every inspection, every infraction, and your full history in one place.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <div className="text-3xl mb-2">📊</div>
                <CardTitle>Benchmark your locations</CardTitle>
                <CardDescription>
                  See how you compare to similar restaurants in your area.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <div className="text-3xl mb-2">🔔</div>
                <CardTitle>Never be surprised</CardTitle>
                <CardDescription>
                  Get notified the moment a new inspection drops for your restaurant.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="bg-slate-900 text-white py-16 px-4">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold mb-6">
            Ready to take control of your compliance?
          </h2>
          <Link
            href="/signup"
            className="inline-block bg-white text-slate-900 font-semibold text-base rounded-lg px-8 py-3 hover:bg-slate-100 transition-colors"
          >
            Get early access
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-500 py-6 px-4 text-sm text-center mt-auto">
        © 2026 SafeBite · Toronto, ON · Data sourced from Toronto Public Health (DineSafe)
      </footer>
    </div>
  )
}
