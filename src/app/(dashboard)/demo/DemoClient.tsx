'use client'

// ── Vorführ-Zugänge des Teams: Liste, Anlegen-Dialog, Zugangsdaten, Reset ─────
// Nur fürs Management-Team – es werden keine Zugänge an Interessenten vergeben.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { RotateCcw, Plus, Copy, Check, KeyRound, Lock, Unlock, CalendarPlus, Trash2, X, ExternalLink } from 'lucide-react'
import { fmtDatum, fmtDatumZeit } from '@/lib/format'
import {
  demoZuruecksetzenAction, zugangAnlegenAction, zugangVerlaengernAction, zugangSperrenAction,
  zugangPasswortNeuAction, zugangLoeschenAction, zugangRolleAction,
} from './actions'

export type ZugangRow = {
  id: string; name: string; email: string; rolle: 'winzer' | 'leser'; gueltig_bis: string | null
  status: 'aktiv' | 'gesperrt' | 'abgelaufen' | 'geloescht'; notizen: string | null; erstellt_am: string
  letzte_anmeldung: string | null
  /** gesetzt, wenn der Zugang zu einer Firma im CRM gehört (Website-Trial) – sonst interner Team-Zugang */
  firma: { id: string; name: string } | null
}

const STATUS: Record<ZugangRow['status'], { label: string; cls: string }> = {
  aktiv:      { label: 'aktiv',      cls: 'bg-hs-ok-bg text-hs-ok-fg' },
  gesperrt:   { label: 'gesperrt',   cls: 'bg-hs-err-bg text-hs-err-fg' },
  abgelaufen: { label: 'abgelaufen', cls: 'bg-hs-warn-bg text-hs-warn-fg' },
  geloescht:  { label: 'gelöscht',   cls: 'bg-gray-100 text-gray-600' },
}

function plusTage(tage: number) {
  const d = new Date(); d.setDate(d.getDate() + tage)
  return d.toISOString().slice(0, 10)
}

function CopyButton({ text, label = 'Kopieren' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" className="btn-secondary !px-2.5 !py-1.5 text-[12px]" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500) } catch { /* ignore */ }
    }}>
      {ok ? <Check size={13} /> : <Copy size={13} />} {ok ? 'Kopiert' : label}
    </button>
  )
}

/** Zugangsdaten einmalig anzeigen (nach Anlegen / Passwort neu) */
function Zugangsdaten({ name, email, passwort, appUrl, onClose }: { name: string; email: string; passwort: string; appUrl: string; onClose: () => void }) {
  const text = `Vorführ-Zugang software:112 (Demo-Mandant „Weingut Musterhof")\n\nAdresse: ${appUrl}\nBenutzer: ${email}\nPasswort: ${passwort}\n\nNur für interne Vorführungen – bitte nicht an Interessenten weitergeben.`
  return (
    <div className="fixed inset-0 z-[90] bg-[rgba(29,31,36,.5)] flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-xl border border-hs-line shadow-xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base">Zugangsdaten für {name}</h3>
            <p className="text-[12.5px] text-hs-text-2">Das Passwort wird nur jetzt angezeigt – gleich kopieren und sicher ablegen.</p>
          </div>
          <button type="button" onClick={onClose} className="text-hs-tertiary hover:text-hs-text"><X size={18} /></button>
        </div>
        <dl className="rounded-lg border border-hs-line bg-hs-bg/60 divide-y divide-hs-line text-[13px]">
          {[['Adresse', appUrl], ['Benutzer', email], ['Passwort', passwort]].map(([k, v]) => (
            <div key={k} className="flex items-center gap-3 px-3 py-2">
              <dt className="w-24 text-hs-text-2 shrink-0">{k}</dt>
              <dd className="font-mono flex-1 min-w-0 truncate">{v}</dd>
              <CopyButton text={v} />
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton text={text} label="Alles kopieren" />
          <button type="button" onClick={onClose} className="btn-secondary ml-auto">Schließen</button>
        </div>
      </div>
    </div>
  )
}

export function ResetButton({ aktiv }: { aktiv: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)
  return (
    <span className="inline-flex items-center gap-3">
      <button type="button" disabled={!aktiv || pending} className="btn-danger" onClick={() => {
        if (!confirm('Demo-Daten zurücksetzen? Alle Änderungen im Demo-Mandanten gehen verloren und werden durch frische Beispieldaten ersetzt.')) return
        setFehler(null)
        start(async () => {
          const res = await demoZuruecksetzenAction()
          if (!res.ok) setFehler(res.fehler); else router.refresh()
        })
      }}>
        <RotateCcw size={14} strokeWidth={1.75} className={pending ? 'animate-spin' : ''} /> {pending ? 'Wird zurückgesetzt …' : 'Demo-Daten zurücksetzen'}
      </button>
      {fehler && <span className="text-[12px] text-hs-err-fg">{fehler}</span>}
    </span>
  )
}

function NeuDialog({ onClose, onAngelegt, appUrl }: { onClose: () => void; onAngelegt: (d: { name: string; email: string; passwort: string }) => void; appUrl: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [rolle, setRolle] = useState<'winzer' | 'leser'>('winzer')
  const [befristet, setBefristet] = useState(false)
  const [gueltig, setGueltig] = useState(plusTage(30))
  const [notizen, setNotizen] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setFehler(null)
    start(async () => {
      const res = await zugangAnlegenAction({ name, email, rolle, gueltig_bis: befristet ? gueltig : null, notizen })
      if (!res.ok) { setFehler(res.fehler); return }
      onAngelegt({ name, email, passwort: res.data!.passwort })
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-[90] bg-[rgba(29,31,36,.5)] flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={submit} className="bg-white rounded-xl border border-hs-line shadow-xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base">Vorführ-Zugang anlegen</h3>
            <p className="text-[12.5px] text-hs-text-2">Interner Zugang für ein Teammitglied zum software:112-Demo-Mandanten. Das Startpasswort wird anschließend einmalig angezeigt.</p>
          </div>
          <button type="button" onClick={onClose} className="text-hs-tertiary hover:text-hs-text"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="form-label" htmlFor="dz-name">Name *</label><input id="dz-name" value={name} onChange={e => setName(e.target.value)} required className="input" placeholder="Vorname Nachname" /></div>
          <div><label className="form-label" htmlFor="dz-email">E-Mail (= Benutzername) *</label><input id="dz-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="input" placeholder="name@hohenstein-partner.at" /></div>
          <div>
            <label className="form-label" htmlFor="dz-rolle">Rolle in software:112</label>
            <select id="dz-rolle" value={rolle} onChange={e => setRolle(e.target.value as 'winzer' | 'leser')} className="input">
              <option value="winzer">Winzer – darf alles erfassen</option>
              <option value="leser">Nur-Lesen</option>
            </select>
          </div>
          <div>
            <label className="form-label">Gültigkeit</label>
            <label className="flex items-center gap-2 text-[13px] text-hs-text h-[38px] cursor-pointer">
              <input type="checkbox" checked={befristet} onChange={e => setBefristet(e.target.checked)} className="accent-hs-teal" />
              befristen (Standard: unbefristet)
            </label>
          </div>
          {befristet && (
            <div className="sm:col-span-2">
              <label className="form-label" htmlFor="dz-gueltig">Gültig bis</label>
              <div className="flex gap-1.5">
                <input id="dz-gueltig" type="date" value={gueltig} onChange={e => setGueltig(e.target.value)} required className="input" />
                <button type="button" className="btn-secondary !px-2 text-[11.5px]" onClick={() => setGueltig(plusTage(14))}>14 T</button>
                <button type="button" className="btn-secondary !px-2 text-[11.5px]" onClick={() => setGueltig(plusTage(30))}>30 T</button>
              </div>
            </div>
          )}
        </div>
        <div><label className="form-label" htmlFor="dz-notiz">Notiz</label><input id="dz-notiz" value={notizen} onChange={e => setNotizen(e.target.value)} className="input" placeholder="z.B. Vorführ-Laptop, Messe-Gerät" /></div>

        {fehler && <p className="text-[12.5px] text-hs-err-fg">{fehler}</p>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">Abbrechen</button>
          <button type="submit" disabled={pending} className="btn-primary"><Plus size={14} strokeWidth={2} /> {pending ? 'Wird angelegt …' : 'Zugang anlegen'}</button>
        </div>
        <p className="text-[11px] text-hs-tertiary">Der Zugang gilt nur für den Demo-Mandanten „Weingut Musterhof (Demo)" unter {appUrl}. Bitte nicht an Interessenten weitergeben.</p>
      </form>
    </div>
  )
}

export function NeuButton({ aktiv, appUrl }: { aktiv: boolean; appUrl: string }) {
  const [offen, setOffen] = useState(false)
  const [daten, setDaten] = useState<{ name: string; email: string; passwort: string } | null>(null)
  return (
    <>
      <button type="button" disabled={!aktiv} className="btn-primary" onClick={() => setOffen(true)}><Plus size={14} strokeWidth={2} /> Zugang anlegen</button>
      {offen && <NeuDialog appUrl={appUrl} onClose={() => setOffen(false)} onAngelegt={d => { setOffen(false); setDaten(d) }} />}
      {daten && <Zugangsdaten {...daten} appUrl={appUrl} onClose={() => setDaten(null)} />}
    </>
  )
}

export function Liste({ zugaenge, darfSchreiben, appUrl }: { zugaenge: ZugangRow[]; darfSchreiben: boolean; appUrl: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)
  const [daten, setDaten] = useState<{ name: string; email: string; passwort: string } | null>(null)
  const heute = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const run = (fn: () => Promise<{ ok: boolean; fehler?: string }>) => {
    setFehler(null)
    start(async () => { const r = await fn(); if (!r.ok) setFehler(r.fehler ?? 'Fehler'); else router.refresh() })
  }

  if (zugaenge.length === 0) {
    return <p className="py-6 text-center text-[13px] text-hs-text-2">Noch keine Vorführ-Zugänge. Lege für jedes Teammitglied einen eigenen Zugang zum Musterhof an.</p>
  }

  return (
    <div className="overflow-x-auto -mx-5 sm:-mx-6">
      {fehler && <p className="px-5 pb-2 text-[12.5px] text-hs-err-fg">{fehler}</p>}
      <table className="w-full text-[13px]">
        <thead className="table-head">
          <tr>
            <th className="text-left px-5 sm:px-6 py-2">Person</th>
            <th className="text-left px-3 py-2">Herkunft</th>
            <th className="text-left px-3 py-2">Rolle</th>
            <th className="text-left px-3 py-2">Gültig bis</th>
            <th className="text-left px-3 py-2">Letzte Anmeldung</th>
            <th className="text-left px-3 py-2">Status</th>
            {darfSchreiben && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-hs-line">
          {zugaenge.map(z => {
            const st = STATUS[z.status]
            const tage = z.gueltig_bis === null ? null
              : Math.round((new Date(z.gueltig_bis + 'T00:00:00').getTime() - new Date(heute + 'T00:00:00').getTime()) / 86400000)
            return (
              <tr key={z.id} className="hover:bg-hs-bg/60">
                <td className="px-5 sm:px-6 py-2.5">
                  <p className="font-medium text-hs-text">{z.name}</p>
                  <p className="font-mono text-[11.5px] text-hs-text-2">{z.email}</p>
                  {z.notizen && <p className="text-[11.5px] text-hs-tertiary">{z.notizen}</p>}
                </td>
                <td className="px-3 py-2.5">
                  {z.firma ? (
                    <Link href={`/crm/firmen/${z.firma.id}`} className="pill bg-hs-blue-50 text-hs-blue-700 hover:underline">{z.firma.name}</Link>
                  ) : (
                    <span className="pill bg-gray-100 text-gray-600">Team</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {darfSchreiben ? (
                    <select value={z.rolle} disabled={pending} onChange={e => run(() => zugangRolleAction(z.id, e.target.value as 'winzer' | 'leser'))} className="input !py-1 !px-2 text-[12px] w-auto">
                      <option value="winzer">Winzer</option><option value="leser">Nur-Lesen</option>
                    </select>
                  ) : (z.rolle === 'winzer' ? 'Winzer' : 'Nur-Lesen')}
                </td>
                <td className="px-3 py-2.5 font-mono text-[12.5px]">
                  {z.gueltig_bis === null ? (
                    <span className="text-hs-text-2">unbefristet</span>
                  ) : (
                    <>
                      {fmtDatum(z.gueltig_bis)}
                      <span className={`block text-[11px] ${tage! < 0 ? 'text-hs-err-fg' : tage! <= 3 ? 'text-hs-warn-fg' : 'text-hs-tertiary'}`}>
                        {tage! < 0 ? `seit ${-tage!} T abgelaufen` : tage === 0 ? 'heute' : `noch ${tage} T`}
                      </span>
                    </>
                  )}
                </td>
                <td className="px-3 py-2.5 text-hs-text-2 text-[12.5px]">{z.letzte_anmeldung ? fmtDatumZeit(z.letzte_anmeldung) : 'noch nie'}</td>
                <td className="px-3 py-2.5"><span className={`pill ${st.cls}`}>{st.label}</span></td>
                {darfSchreiben && (
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {z.gueltig_bis !== null && (
                        <button type="button" title="Auf unbefristet stellen" disabled={pending} className="p-1.5 rounded hover:bg-hs-bg text-hs-text-2"
                          onClick={() => run(() => zugangVerlaengernAction(z.id, null))}><CalendarPlus size={15} strokeWidth={1.75} /></button>
                      )}
                      {z.status === 'gesperrt' ? (
                        <button type="button" title="Entsperren" disabled={pending} className="p-1.5 rounded hover:bg-hs-bg text-hs-text-2"
                          onClick={() => run(() => zugangSperrenAction(z.id, false))}><Unlock size={15} strokeWidth={1.75} /></button>
                      ) : (
                        <button type="button" title="Sperren" disabled={pending} className="p-1.5 rounded hover:bg-hs-bg text-hs-text-2"
                          onClick={() => run(() => zugangSperrenAction(z.id, true))}><Lock size={15} strokeWidth={1.75} /></button>
                      )}
                      <button type="button" title="Neues Passwort erzeugen" disabled={pending} className="p-1.5 rounded hover:bg-hs-bg text-hs-text-2"
                        onClick={() => { setFehler(null); start(async () => { const r = await zugangPasswortNeuAction(z.id); if (!r.ok) setFehler(r.fehler); else setDaten({ name: z.name, email: z.email, passwort: r.data!.passwort }) }) }}>
                        <KeyRound size={15} strokeWidth={1.75} /></button>
                      <button type="button" title="Zugang löschen" disabled={pending} className="p-1.5 rounded hover:bg-hs-err-bg text-hs-text-2 hover:text-hs-err-fg"
                        onClick={() => { if (confirm(`Zugang für ${z.name} endgültig löschen? Der Benutzer wird in software:112 entfernt.`)) run(() => zugangLoeschenAction(z.id)) }}>
                        <Trash2 size={15} strokeWidth={1.75} /></button>
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="px-5 sm:px-6 pt-3 text-[11px] text-hs-tertiary flex items-center gap-1">
        <ExternalLink size={11} /> Login-Adresse: <span className="font-mono">{appUrl}</span> · nur für interne Vorführungen
      </p>
      {daten && <Zugangsdaten {...daten} appUrl={appUrl} onClose={() => setDaten(null)} />}
    </div>
  )
}
