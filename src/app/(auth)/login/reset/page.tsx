'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Mail } from 'lucide-react'

export default function ResetPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password&type=recovery`,
    })
    if (error) { setError(error.message); setLoading(false) }
    else setDone(true)
  }

  return (
    <div className="card">
      {done ? (
        <div className="text-center space-y-3">
          <Mail className="w-6 h-6 text-hs-blue-700 mx-auto" aria-hidden="true" />
          <p className="font-semibold">E-Mail gesendet</p>
          <p className="text-sm text-hs-text-2">
            Wir haben eine E-Mail an <strong>{email}</strong> geschickt. Über den Link darin kannst du ein neues Passwort setzen.
          </p>
          <Link href="/login" className="text-sm text-hs-blue-700 hover:underline block mt-4">← Zurück zur Anmeldung</Link>
        </div>
      ) : (
        <>
          <h2 className="text-lg mb-2">Passwort vergessen?</h2>
          <p className="text-sm text-hs-text-2 mb-5">Gib deine E-Mail-Adresse ein – wir schicken dir einen Link zum Zurücksetzen.</p>
          <form onSubmit={handleReset} className="space-y-4">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"
              placeholder="name@hohenstein-partner.at" className="input" />
            {error && <p className="text-hs-err-fg text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Senden …' : 'Link senden'}</button>
          </form>
          <Link href="/login" className="text-xs text-hs-text-2 hover:text-hs-text block text-center mt-4">← Zurück zur Anmeldung</Link>
        </>
      )}
    </div>
  )
}
