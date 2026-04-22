'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

type Props = {
  userId: string
  isApproved: boolean
}

export function AdminActions({ userId, isApproved }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleAction(action: 'approve' | 'remove') {
    setLoading(true)
    await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, userId }),
    })
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {!isApproved && (
        <Button
          size="xs"
          variant="secondary"
          disabled={loading}
          onClick={() => handleAction('approve')}
        >
          Approve
        </Button>
      )}
      <Button
        size="xs"
        variant="destructive"
        disabled={loading}
        onClick={() => handleAction('remove')}
      >
        Remove
      </Button>
    </div>
  )
}
