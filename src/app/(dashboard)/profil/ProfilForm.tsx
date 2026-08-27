'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { profilSpeichernAction } from './actions'

export default function ProfilForm({ email, fullName: initialName, telefon: initialTelefon }: { email: string; fullName: string; telefon: string }) {
  const router = useRouter()
  const [fullName, setFullName] = useState(initialName)
  const [telefon, setTelefon]   = useState(initialTelefon)
  const [saving, setSaving]     = useState(false)
  const [erfolg, setErfolg]     = useState('')
  const [fehler, setFehler]     = useState('')
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')

  async function speichern(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setFehler(''); setErfolg('')
    const res = await profilSpeichernAction({ full_name: fullName, telefon })
    if (res?.fehler) setFehler(res.fehler)
    else { setErfolg('Profil gespeichert'); router.refresh() }
    setSaving(false)
  }

  async function passwortAendern(e: React.FormEvent) {
    e.preventDefault()
    setFehler(''); setErfolg('')
    if (pw1.length < 8) { setFehler('Mindestens 8 Zeichen.'); return }
    if (pw1 !== pw2) { setFehler('Die Passwörter stimmen nicht überein.'); return }
    const { error } = await createSupabaseBrowserClient().auth.updateUser({ password: pw1 })
    if (error) setFehler(error.message)
    else { setErfolg('Passwort geändert'); setPw1(''); setPw2('') }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={speichern} className="card space-y-4">
        <div>
          <label className="form-label">E-Mail</label>
          <input value={email} disabled className="input" />
        </div>
        <div>
          <label className="form-label">Vollständiger Name</label>
          <input value={fullName} onChange={e => setFullName(e.target.value)} className="input" placeholder="Vorname Nachname" />
        </div>
        <div>
          <label className="form-label">Telefon</label>
          <input value={telefon} onChange={e => setTelefon(e.target.value)} placeholder="+43 664 …" className="input" />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Speichern …' : 'Profil speichern'}</button>
        </div>
      </form>

      <form onSubmit={passwortAendern} className="card space-y-4">
        <h2 className="text-base">Passwort ändern</h2>
        <div>
          <label className="form-label">Neues Passwort</label>
          <input type="password" value={pw1} onChange={e => setPw1(e.target.value)} className="input" autoComplete="new-password" minLength={8} />
        </div>
        <div>
          <label className="form-label">Bestätigen</label>
          <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} className="input" autoComplete="new-password" />
        </div>
        <button type="submit" className="btn-secondary">Passwort ändern</button>
      </form>

      {erfolg && <p className="text-sm text-hs-ok-fg inline-flex items-center gap-1"><Check size={14} strokeWidth={2.25} />{erfolg}</p>}
      {fehler && <p className="text-sm text-hs-err-fg inline-flex items-center gap-1"><X size={14} strokeWidth={2.25} />{fehler}</p>}
    </div>
  )
}
