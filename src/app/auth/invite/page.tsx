'use client'
import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { UserPlus } from 'lucide-react'

function InviteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [hasHash, setHasHash] = useState(false)
  const code = searchParams.get('code')

  useEffect(() => {
    if (window.location.hash.includes('access_token')) setHasHash(true)
    setReady(true)
  }, [])

  async function annehmen() {
    setLoading(true); setError(null)
    const supabase = createSupabaseBrowserClient()
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) { setError('Link ungültig oder abgelaufen. Bitte um eine neue Einladung.'); setLoading(false); return }
    } else if (hasHash) {
      const params = new URLSearchParams(window.location.hash.slice(1))
      const access_token = params.get('access_token')
      const refresh_token = params.get('refresh_token') ?? ''
      if (!access_token) { setError('Token nicht gefunden.'); setLoading(false); return }
      const { error } = await supabase.auth.setSession({ access_token, refresh_token })
      if (error) { setError('Sitzung konnte nicht gesetzt werden.'); setLoading(false); return }
    } else {
      setError('Kein gültiger Token gefunden.'); setLoading(false); return
    }
    router.push('/auth/update-password')
  }

  const isValid = code || hasHash
  if (!ready) return <div className="card text-center text-hs-text-2 text-sm">Laden …</div>

  return (
    <div className="card text-center space-y-4">
      <UserPlus className="w-6 h-6 text-hs-blue-700 mx-auto" aria-hidden="true" />
      <h2 className="text-lg">Willkommen</h2>
      <p className="text-sm text-hs-text-2">Du wurdest zur Hohenstein Suite eingeladen. Lege jetzt dein Passwort fest.</p>
      {error && <p className="text-sm text-hs-err-fg">{error}</p>}
      {!isValid && !error && <p className="text-sm text-hs-err-fg">Ungültiger Einladungslink.</p>}
      {isValid && (
        <button onClick={annehmen} disabled={loading} className="btn-primary w-full">
          {loading ? 'Wird verarbeitet …' : 'Einladung annehmen'}
        </button>
      )}
    </div>
  )
}

export default function InviteLandingPage() {
  return (
    <div className="min-h-screen bg-hs-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/logos/hohenstein-farbe.png" alt="hohenstein consulting solutions" width={480} height={165} className="h-12 w-auto mx-auto object-contain" />
          <p className="font-display font-semibold mt-4 text-lg">Hohenstein Suite</p>
        </div>
        <Suspense fallback={<div className="card text-center text-hs-text-2 text-sm">Laden …</div>}>
          <InviteContent />
        </Suspense>
      </div>
    </div>
  )
}
