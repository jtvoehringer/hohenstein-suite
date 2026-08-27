'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Bell } from 'lucide-react'

export default function SessionTimeout({ timeoutMinuten }: { timeoutMinuten?: number | null }) {
  const router = useRouter()
  const [warnung, setWarnung] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const warnRef  = useRef<NodeJS.Timeout | null>(null)
  const WARN_BEFORE = 2 * 60 * 1000

  const abmelden = useCallback(async () => {
    await createSupabaseBrowserClient().auth.signOut()
    router.push('/login?grund=timeout')
  }, [router])

  const reset = useCallback(() => {
    if (!timeoutMinuten) return
    setWarnung(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (warnRef.current)  clearTimeout(warnRef.current)
    const ms = timeoutMinuten * 60 * 1000
    warnRef.current  = setTimeout(() => setWarnung(true), ms - WARN_BEFORE)
    timerRef.current = setTimeout(abmelden, ms)
  }, [timeoutMinuten, abmelden])

  useEffect(() => {
    if (!timeoutMinuten) return
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      events.forEach(e => window.removeEventListener(e, reset))
      if (timerRef.current) clearTimeout(timerRef.current)
      if (warnRef.current)  clearTimeout(warnRef.current)
    }
  }, [reset, timeoutMinuten])

  if (!timeoutMinuten || !warnung) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 text-center space-y-4">
        <Bell className="w-9 h-9 mx-auto text-hs-warn" strokeWidth={1.75} />
        <h2 className="text-lg">Sitzung läuft ab</h2>
        <p className="text-sm text-hs-text-2">Du wirst in 2 Minuten automatisch abgemeldet.</p>
        <div className="flex gap-3">
          <button onClick={reset} className="btn-primary flex-1">Aktiv bleiben</button>
          <button onClick={abmelden} className="btn-secondary">Abmelden</button>
        </div>
      </div>
    </div>
  )
}
