'use client'

// Passkeys des angemeldeten Benutzers – einrichten, anzeigen, entfernen (Karte im Profil)
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Fingerprint, Loader2, Trash2, X } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { passkeyFehlerText, passkeyMoeglich, passkeyName, type PasskeyEintrag } from '@/lib/auth/passkey'

export default function PasskeyVerwaltung() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [moeglich, setMoeglich] = useState(false)
  const [liste, setListe]       = useState<PasskeyEintrag[] | null>(null)
  const [laeuft, setLaeuft]     = useState(false)
  const [fehler, setFehler]     = useState('')
  const [erfolg, setErfolg]     = useState('')
  const [entfernen, setEntfernen] = useState<string | null>(null)

  const laden = useCallback(async () => {
    const { data, error } = await supabase.auth.passkey.list()
    if (error) { setFehler(passkeyFehlerText(error)); setListe([]); return }
    setListe((data ?? []) as PasskeyEintrag[])
  }, [supabase])

  useEffect(() => {
    const ok = passkeyMoeglich()
    setMoeglich(ok)
    if (ok) void laden()
  }, [laden])

  async function einrichten() {
    setLaeuft(true); setFehler(''); setErfolg('')
    try {
      const { data, error } = await supabase.auth.registerPasskey()
      if (error) { setFehler(passkeyFehlerText(error)); return }
      // sprechender Name statt der Vorgabe des Browsers
      if (data?.id) await supabase.auth.passkey.update({ passkeyId: data.id, friendlyName: passkeyName(navigator.userAgent, new Date().toLocaleDateString('de-AT')) })
      setErfolg('Passkey eingerichtet – ab jetzt „Mit Passkey anmelden“ auf der Anmeldeseite.')
      await laden()
    } catch (e) { setFehler(passkeyFehlerText(e)) }
    finally { setLaeuft(false) }
  }

  async function loeschen(id: string) {
    setLaeuft(true); setFehler(''); setErfolg('')
    try {
      const { error } = await supabase.auth.passkey.delete({ passkeyId: id })
      if (error) { setFehler(passkeyFehlerText(error)); return }
      setEntfernen(null)
      await laden()
    } catch (e) { setFehler(passkeyFehlerText(e)) }
    finally { setLaeuft(false) }
  }

  if (!moeglich) return null
  return (
    <div className="card space-y-3">
      <div>
        <h2 className="text-base">Passkeys</h2>
        <p className="text-[12.5px] text-hs-text-2">Mit Fingerabdruck, Gesicht oder Windows Hello auf diesem Gerät ohne Passwort anmelden.</p>
      </div>

      {liste === null ? (
        <p className="text-[12.5px] text-hs-tertiary inline-flex items-center gap-1"><Loader2 size={14} className="animate-spin" /> Laden …</p>
      ) : liste.length === 0 ? (
        <p className="text-[12.5px] text-hs-tertiary">Noch kein Passkey eingerichtet.</p>
      ) : (
        <ul className="divide-y divide-hs-line border border-hs-line rounded-lg">
          {liste.map(p => (
            <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <Fingerprint size={16} strokeWidth={1.75} className="text-hs-tertiary shrink-0" />
              <span className="flex-1 min-w-0 truncate">
                {p.friendly_name || 'Passkey'}
                <span className="text-xs text-hs-tertiary"> · seit {new Date(p.created_at).toLocaleDateString('de-AT')}</span>
              </span>
              {entfernen === p.id ? (
                <span className="inline-flex items-center gap-2 text-xs">
                  <button type="button" onClick={() => loeschen(p.id)} disabled={laeuft} className="text-hs-err-fg font-semibold hover:underline">Entfernen</button>
                  <button type="button" onClick={() => setEntfernen(null)} className="text-hs-text-2 hover:underline">Abbrechen</button>
                </span>
              ) : (
                <button type="button" onClick={() => setEntfernen(p.id)} disabled={laeuft} title="Passkey entfernen" className="text-hs-tertiary hover:text-hs-err p-1">
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={einrichten} disabled={laeuft} className="btn-secondary">
        {laeuft ? <Loader2 size={16} className="animate-spin" /> : <Fingerprint size={16} strokeWidth={1.75} />}
        {laeuft ? 'Bitte am Gerät bestätigen …' : 'Passkey für dieses Gerät einrichten'}
      </button>

      {erfolg && <p className="text-sm text-hs-ok-fg inline-flex items-center gap-1"><Check size={14} strokeWidth={2.25} />{erfolg}</p>}
      {fehler && <p role="alert" className="text-sm text-hs-err-fg inline-flex items-center gap-1"><X size={14} strokeWidth={2.25} />{fehler}</p>}
    </div>
  )
}
