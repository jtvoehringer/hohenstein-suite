'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Users, Info, Check, X, Send } from 'lucide-react'
import { fmtDatum, fmtDatumZeit } from '@/lib/format'
import { einladenAction, einladungErneutSendenAction, rolleAendernAction, aktivSetzenAction, entfernenAction, type Mitglied } from './actions'

const ROLLEN = [
  { value: 'admin',       label: 'Admin',       pill: 'bg-hs-blue-50 text-hs-blue-700', hinweis: 'Vollzugriff inkl. Benutzer, Einstellungen, Monatsabschluss und UVA' },
  { value: 'mitarbeiter', label: 'Mitarbeiter', pill: 'bg-hs-ok-bg text-hs-ok-fg',       hinweis: 'Anlegen, bearbeiten und löschen in CRM, E&A und Aufgaben' },
  { value: 'leser',       label: 'Nur-Lesen',   pill: 'bg-hs-bg text-hs-text-1',         hinweis: 'Nur lesender Zugriff' },
]
const rolle = (v: string) => ROLLEN.find(r => r.value === v)

export default function BenutzerClient({ mitglieder, domains }: { mitglieder: Mitglied[]; domains: { domain: string; role: string }[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null)
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null)
  const [neueRolle, setNeueRolle] = useState('mitarbeiter')

  const [zeigeEinladen, setZeigeEinladen] = useState(false)
  const [einladung, setEinladung] = useState({ name: '', email: '', role: 'mitarbeiter' })

  const ausfuehren = (fn: () => Promise<{ fehler?: string; hinweis?: string }>, erfolg?: string) => {
    setMeldung(null)
    startTransition(async () => {
      const res = await fn()
      if (res.fehler) setMeldung({ art: 'fehler', text: res.fehler })
      else { if (res.hinweis || erfolg) setMeldung({ art: 'ok', text: res.hinweis ?? erfolg ?? '' }); router.refresh() }
    })
  }

  const rolleSpeichern = (membershipId: string) => {
    setMeldung(null)
    startTransition(async () => {
      const res = await rolleAendernAction(membershipId, neueRolle)
      if (res.fehler) setMeldung({ art: 'fehler', text: res.fehler })
      else { setMeldung({ art: 'ok', text: 'Rolle geändert.' }); setBearbeiteId(null); router.refresh() }
    })
  }

  const einladen = (e: React.FormEvent) => {
    e.preventDefault()
    setMeldung(null)
    startTransition(async () => {
      const res = await einladenAction(einladung)
      if (res.fehler) setMeldung({ art: 'fehler', text: res.fehler })
      else {
        setMeldung({ art: 'ok', text: res.hinweis ?? 'Einladung versandt.' })
        setEinladung({ name: '', email: '', role: 'mitarbeiter' }); setZeigeEinladen(false)
        router.refresh()
      }
    })
  }

  const aktive = mitglieder.filter(m => m.aktiv).length

  return (
    <div className="space-y-5">
      {meldung && (
        <div className={`rounded-lg px-4 py-2.5 text-sm inline-flex items-center gap-2 border ${meldung.art === 'ok' ? 'bg-hs-ok-bg border-hs-ok/30 text-hs-ok-fg' : 'bg-hs-err-bg border-hs-err/30 text-hs-err-fg'}`}>
          {meldung.art === 'ok' ? <Check size={14} strokeWidth={2.25} /> : <X size={14} strokeWidth={2.25} />}{meldung.text}
        </div>
      )}

      {/* ── Mitglieder ───────────────────────────────────────────────────── */}
      <div className="card !p-0 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-hs-line flex items-center justify-between gap-3">
          <h2 className="text-base">Mitglieder <span className="font-mono text-[12px] font-normal text-hs-tertiary ml-1">{aktive} aktiv</span></h2>
          <button type="button" onClick={() => { setZeigeEinladen(v => !v); setMeldung(null) }} className="btn-primary !py-1.5">
            <UserPlus size={15} strokeWidth={1.75} /> Einladen
          </button>
        </div>

        {zeigeEinladen && (
          <form onSubmit={einladen} className="px-5 py-4 bg-hs-bg border-b border-hs-line">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr_160px_auto] gap-3 items-end">
              <div>
                <label className="form-label">Name *</label>
                <input value={einladung.name} onChange={e => setEinladung(s => ({ ...s, name: e.target.value }))} className="input" placeholder="Vorname Nachname" required autoFocus disabled={isPending} />
              </div>
              <div>
                <label className="form-label">E-Mail *</label>
                <input type="email" value={einladung.email} onChange={e => setEinladung(s => ({ ...s, email: e.target.value }))} className="input" placeholder="name@hohenstein-partner.at" required disabled={isPending} />
              </div>
              <div>
                <label className="form-label">Rolle</label>
                <select value={einladung.role} onChange={e => setEinladung(s => ({ ...s, role: e.target.value }))} className="input" disabled={isPending}>
                  {ROLLEN.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button type="submit" disabled={isPending} className="btn-primary"><Send size={14} strokeWidth={1.75} /> {isPending ? 'Wird gesendet …' : 'Einladung senden'}</button>
                <button type="button" onClick={() => setZeigeEinladen(false)} className="btn-secondary">Abbrechen</button>
              </div>
            </div>
            <p className="text-[11.5px] text-hs-text-2 mt-2">
              {rolle(einladung.role)?.hinweis}. Die Person erhält eine E-Mail mit Link zum Festlegen des Passworts; bereits registrierte Konten werden direkt als Mitglied aufgenommen.
            </p>
          </form>
        )}

        {mitglieder.length === 0 ? (
          <div className="py-10 text-center">
            <Users size={28} strokeWidth={1.5} className="mx-auto mb-2 text-hs-tertiary" />
            <p className="text-sm text-hs-text-2">Noch keine Mitglieder.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head">
                  <th className="px-5 py-2.5 text-left">Benutzer</th>
                  <th className="px-3 py-2.5 text-left">Rolle</th>
                  <th className="px-3 py-2.5 text-left">Zugriff</th>
                  <th className="px-3 py-2.5 text-left">Letzte Anmeldung</th>
                  <th className="px-5 py-2.5 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {mitglieder.map(m => (
                  <tr key={m.id} className={`border-b border-hs-line last:border-0 ${!m.aktiv ? 'opacity-60' : ''}`}>
                    <td className="px-5 py-3">
                      <span className="block font-medium text-hs-text">{m.name || <span className="text-hs-tertiary">Kein Name</span>}{m.ist_ich && <span className="ml-1.5 text-[11px] text-hs-tertiary">(ich)</span>}</span>
                      <span className="block text-[12px] text-hs-text-2">{m.email}</span>
                      {!m.bestaetigt && <span className="pill bg-hs-warn-bg text-hs-warn-fg mt-1" title="Einladung verschickt, Passwort noch nicht festgelegt">Einladung ausstehend</span>}
                    </td>
                    <td className="px-3 py-3">
                      {bearbeiteId === m.id ? (
                        <div className="flex items-center gap-2">
                          <select value={neueRolle} onChange={e => setNeueRolle(e.target.value)} className="input !w-auto !py-1 !text-xs" disabled={isPending}>
                            {ROLLEN.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                          <button type="button" disabled={isPending} className="text-xs font-semibold text-hs-blue-700 hover:underline"
                            onClick={() => rolleSpeichern(m.id)}>Speichern</button>
                          <button type="button" className="text-xs text-hs-text-2 hover:text-hs-text" onClick={() => setBearbeiteId(null)}>Abbrechen</button>
                        </div>
                      ) : (
                        <span className={`pill ${rolle(m.role)?.pill ?? 'bg-hs-bg text-hs-text-1'}`}>{rolle(m.role)?.label ?? m.role}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <button type="button" disabled={isPending || m.ist_ich}
                        title={m.ist_ich ? 'Die eigene Mitgliedschaft kann nicht deaktiviert werden' : m.aktiv ? 'Zugriff deaktivieren' : 'Zugriff aktivieren'}
                        onClick={() => {
                          if (m.aktiv && !confirm(`Zugriff für ${m.email} auf diesen Mandanten deaktivieren?`)) return
                          ausfuehren(() => aktivSetzenAction(m.id, !m.aktiv), m.aktiv ? 'Zugriff deaktiviert.' : 'Zugriff aktiviert.')
                        }}
                        className={`pill gap-1.5 disabled:cursor-default ${m.aktiv ? 'bg-hs-ok-bg text-hs-ok-fg hover:bg-hs-ok/20' : 'bg-hs-err-bg text-hs-err-fg hover:bg-hs-err/20'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${m.aktiv ? 'bg-hs-ok' : 'bg-hs-err'}`} />
                        {m.aktiv ? 'Aktiv' : 'Inaktiv'}
                      </button>
                    </td>
                    <td className="px-3 py-3 font-mono text-[11.5px] text-hs-text-2 tabular-nums whitespace-nowrap">
                      {m.letzte_anmeldung ? fmtDatumZeit(m.letzte_anmeldung) : <span className="text-hs-tertiary">noch nie</span>}
                      <span className="block text-hs-tertiary">dabei seit {fmtDatum(m.created_at)}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {!m.ist_ich && bearbeiteId !== m.id && (
                        <div className="inline-flex items-center gap-3 text-xs">
                          {!m.bestaetigt && (
                            <button type="button" disabled={isPending} className="text-hs-blue-700 hover:underline font-medium"
                              onClick={() => ausfuehren(() => einladungErneutSendenAction(m.user_id))}>Einladung erneut senden</button>
                          )}
                          <button type="button" className="text-hs-blue-700 hover:underline font-medium"
                            onClick={() => { setBearbeiteId(m.id); setNeueRolle(m.role); setMeldung(null) }}>Rolle ändern</button>
                          <button type="button" disabled={isPending} className="text-hs-err-fg/80 hover:text-hs-err-fg"
                            onClick={() => { if (confirm(`${m.email} aus diesem Mandanten entfernen? Das Benutzerkonto bleibt bestehen.`)) ausfuehren(() => entfernenAction(m.id), 'Mitglied entfernt.') }}>Entfernen</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Hinweis: automatische Freischaltung ──────────────────────────── */}
      <div className="bg-hs-blue-50 border border-hs-blue-100 rounded-lg px-4 py-3 text-[12.5px] text-hs-blue-700 flex items-start gap-2.5">
        <Info size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Neue Benutzer mit @hohenstein-partner.at werden automatisch als Admin freigeschaltet.</p>
          <p className="mt-0.5 opacity-90">
            Die Rolle wird beim ersten Anmelden anhand der E-Mail-Domain vergeben
            {domains.length > 0 && <> ({domains.map(d => `@${d.domain} → ${rolle(d.role)?.label ?? d.role}`).join(', ')})</>}.
            Für alle anderen Adressen legt die Einladung die gewählte Rolle fest. Rollen lassen sich hier jederzeit ändern; die eigene Mitgliedschaft ist geschützt.
          </p>
        </div>
      </div>
    </div>
  )
}
