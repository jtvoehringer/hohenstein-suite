'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Fingerprint, Loader2 } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { passkeyFehlerText, passkeyMoeglich } from '@/lib/auth/passkey'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const grund = params.get('grund')
  const fehler = params.get('error')

  // Passkey-Knopf erst nach dem Laden zeigen (Browser-Fähigkeit, kein Hydration-Unterschied)
  const [passkeyOk, setPasskeyOk] = useState(false)
  const [passkeyLaeuft, setPasskeyLaeuft] = useState(false)
  useEffect(() => { setPasskeyOk(passkeyMoeglich()) }, [])

  const mitPasskey = async () => {
    setLoading(true); setPasskeyLaeuft(true); setError(null)
    let erfolg = false
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithPasskey()
      if (error) { setError(passkeyFehlerText(error)); return }
      erfolg = true
      router.push('/mandant-waehlen')
      router.refresh()
    } catch (e) { setError(passkeyFehlerText(e)) }
    // nach Erfolg bleibt der Kreisel stehen, bis die nächste Seite da ist
    finally { if (!erfolg) { setLoading(false); setPasskeyLaeuft(false) } }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message === 'Invalid login credentials' ? 'E-Mail oder Passwort falsch.' : error.message)
      setLoading(false)
    } else {
      router.push('/mandant-waehlen')
      router.refresh()
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg mb-5">Anmelden</h2>
      {grund === 'timeout' && (
        <p className="mb-4 text-[12.5px] text-hs-warn-fg bg-hs-warn-bg rounded-lg px-3 py-2">Die Sitzung ist abgelaufen. Bitte erneut anmelden.</p>
      )}
      {fehler === 'auth_callback_failed' && (
        <p className="mb-4 text-[12.5px] text-hs-err-fg bg-hs-err-bg rounded-lg px-3 py-2">Der Link ist ungültig oder abgelaufen.</p>
      )}
      <form onSubmit={handleLogin} autoComplete="on" className="space-y-4">
        <div>
          <label htmlFor="email" className="form-label">E-Mail</label>
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
            autoComplete="username" className="input" placeholder="name@hohenstein-partner.at" />
        </div>
        <div>
          <label htmlFor="password" className="form-label">Passwort</label>
          <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required
            autoComplete="current-password" className="input" placeholder="••••••••" />
        </div>
        {error && <div className="bg-hs-err-bg text-hs-err-fg text-[12.5px] px-3 py-2 rounded-lg">{error}</div>}
        <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
          {loading && !passkeyLaeuft ? 'Anmelden …' : 'Anmelden'}
        </button>
        <div className="text-center">
          <Link href="/login/reset" className="text-xs text-hs-blue-700 hover:underline">Passwort vergessen?</Link>
        </div>
      </form>
      {/* Anmeldung per Passkey – eingerichtet im Profil */}
      {passkeyOk && (
        <div className="mt-4 pt-4 border-t border-hs-line">
          <button type="button" onClick={mitPasskey} disabled={loading} aria-busy={passkeyLaeuft} className="btn-secondary w-full justify-center">
            {passkeyLaeuft ? <Loader2 size={16} className="animate-spin" /> : <Fingerprint size={16} strokeWidth={1.75} />}
            {passkeyLaeuft ? 'Anmeldung läuft … (am Gerät bestätigen)' : 'Mit Passkey anmelden'}
          </button>
          <p className="text-[11.5px] text-hs-tertiary text-center mt-1.5">Fingerabdruck, Gesicht oder Windows Hello</p>
        </div>
      )}
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="card text-center text-sm text-hs-text-2">Laden …</div>}>
      <LoginForm />
    </Suspense>
  )
}
