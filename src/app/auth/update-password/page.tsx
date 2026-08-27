'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Die Passwörter stimmen nicht überein.'); return }
    if (password.length < 8)  { setError('Mindestens 8 Zeichen erforderlich.'); return }
    setLoading(true); setError(null)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false) }
    else { router.push('/mandant-waehlen'); router.refresh() }
  }

  return (
    <div className="min-h-screen bg-hs-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/logos/hohenstein-farbe.png" alt="hohenstein consulting solutions" width={480} height={165} className="h-12 w-auto mx-auto object-contain" />
          <p className="font-display font-semibold mt-4 text-lg">Hohenstein Suite</p>
        </div>
        <div className="card">
          <h2 className="text-lg mb-2">Passwort festlegen</h2>
          <p className="text-sm text-hs-text-2 mb-4">Lege ein sicheres Passwort fest, um dich künftig anzumelden.</p>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="form-label">Neues Passwort</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" minLength={8} placeholder="Mind. 8 Zeichen" className="input" />
            </div>
            <div>
              <label className="form-label">Bestätigen</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" placeholder="Passwort wiederholen" className="input" />
            </div>
            {error && <p className="text-hs-err-fg text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Speichern …' : 'Passwort speichern'}</button>
          </form>
        </div>
      </div>
    </div>
  )
}
