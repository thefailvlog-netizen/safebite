import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Use service role to bypass RLS — same pattern as middleware
  const admin = serviceClient()
  const { data: operator } = await admin
    .from('operators')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!operator?.is_admin) return null
  return user
}

export async function GET() {
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = serviceClient()
  const { data, error } = await admin
    .from('operators')
    .select('id, full_name, email, is_approved, is_admin, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { action, userId } = body as { action: string; userId: string }

  if (!action || !userId) {
    return NextResponse.json({ error: 'Missing action or userId' }, { status: 400 })
  }

  // Validate UUID format before hitting the database
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: 'Invalid userId' }, { status: 400 })
  }

  const admin = serviceClient()

  if (action === 'approve') {
    const { error } = await admin
      .from('operators')
      .update({ is_approved: true })
      .eq('id', userId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  if (action === 'remove') {
    // Delete the operators row first
    const { error: opError } = await admin
      .from('operators')
      .delete()
      .eq('id', userId)

    if (opError) {
      return NextResponse.json({ error: opError.message }, { status: 500 })
    }

    // Also delete the Supabase Auth user so they can't log in with a zombie session
    const { error: authError } = await admin.auth.admin.deleteUser(userId)
    if (authError) {
      // Non-fatal — operators row is already gone; log and continue
      console.error(`Warning: operators row deleted but auth user removal failed: ${authError.message}`)
    }

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
