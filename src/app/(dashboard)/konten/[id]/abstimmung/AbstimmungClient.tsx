'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Lock, Trash2, Pencil, X, Check } from 'lucide-react'
import { fmtDatum, fmtEuroMitZeichen } from '@/lib/format'
import { kontoTypLabel, type KontoOption } from '@/lib/ea/types'
import UmbuchungForm from '@/components/ea/UmbuchungForm'
import KontoForm from '@/components/ea/KontoForm'
import { loescheUmbuchung, setzeAbgeglichen, setzeKontoAktiv, type BewegungQuelle } from '../../actions'

export type Bewegung = {
  id: string
  quelle: BewegungQuelle
  datum: string
  beschreibung: string
  detail: string | null
  betrag: number          // vorzeichenbehaftet: Zugang +, Abgang −
  abgeglichen: boolean
  gesperrt: boolean
  transaktionId?: string
  saldoNachher?: number
}

export type KontoDaten = {
  id: string
  name: string
  typ: string
  iban: string | null
  eroeffnungsdatum: string
  eroeffnungssaldo: number
  aktiv: boolean
  sortierung: number
}

export default function AbstimmungClient({ konto, andereKonten, bewegungen, anzahlVorEroeffnung, saldo, saldoAbgeglichen, writeOk }: {
  konto: KontoDaten
  andereKonten: KontoOption[]
  bewegungen: Bewegung[]
  anzahlVorEroeffnung: number
  saldo: number
  saldoAbgeglichen: number
  writeOk: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)
  const [nurOffene, setNurOffene] = useState(false)
  const [bearbeiten, setBearbeiten] = useState(false)
  const [laufend, setLaufend] = useState<string | null>(null)

  const offen = bewegungen.filter(b => !b.abgeglichen)
  const sichtbar = nurOffene ? offen : bewegungen
  const differenz = Math.round((saldo - saldoAbgeglichen) * 100) / 100

  function toggle(b: Bewegung) {
    setFehler(null); setLaufend(`${b.quelle}-${b.id}`)
    startTransition(async () => {
      const res = await setzeAbgeglichen(konto.id, b.quelle, b.id, !b.abgeglichen)
      if (!res.ok) setFehler(res.error)
      setLaufend(null)
      router.refresh()
    })
  }

  function alleOffenenAbgleichen() {
    if (offen.length === 0) return
    if (!confirm(`Alle ${offen.length} offenen Bewegungen als abgeglichen markieren?`)) return
    setFehler(null)
    startTransition(async () => {
      for (const b of offen) {
        const res = await setzeAbgeglichen(konto.id, b.quelle, b.id, true)
        if (!res.ok) { setFehler(res.error); break }
      }
      router.refresh()
    })
  }

  function umbuchungLoeschen(b: Bewegung) {
    if (!confirm('Diese Umbuchung löschen? Sie wird auf beiden Konten entfernt.')) return
    setFehler(null)
    startTransition(async () => {
      const res = await loescheUmbuchung(b.id)
      if (!res.ok) setFehler(res.error)
      router.refresh()
    })
  }

  function aktivSetzen(aktiv: boolean) {
    if (!aktiv && !confirm(`Konto „${konto.name}" deaktivieren? Es bleibt mit allen Bewegungen erhalten, wird aber nicht mehr zur Auswahl angeboten.`)) return
    setFehler(null)
    startTransition(async () => {
      const res = await setzeKontoAktiv(konto.id, aktiv)
      if (!res.ok) setFehler(res.error)
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <div className="text-sm text-hs-text-2 flex items-center gap-2">
        <Link href="/konten" className="hover:text-hs-blue-700">Konten</Link>
        <span>/</span>
        <span className="text-hs-text font-medium">{konto.name}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl flex items-center gap-2">
            {konto.name}
            {!konto.aktiv && <span className="pill bg-hs-bg text-hs-text-2">inaktiv</span>}
          </h1>
          <p className="text-sm text-hs-text-2 mt-0.5">
            {kontoTypLabel(konto.typ)}{konto.iban ? ` · ${konto.iban}` : ''} · eröffnet {fmtDatum(konto.eroeffnungsdatum)} mit {fmtEuroMitZeichen(konto.eroeffnungssaldo)}
          </p>
          {writeOk && (
            <div className="flex items-center gap-3 mt-2 text-xs">
              <button type="button" onClick={() => setBearbeiten(v => !v)} className="inline-flex items-center gap-1 text-hs-blue-700 hover:underline"><Pencil size={12} strokeWidth={2} /> Konto bearbeiten</button>
              <button type="button" disabled={pending} onClick={() => aktivSetzen(!konto.aktiv)} className="text-hs-text-2 hover:text-hs-text">{konto.aktiv ? 'Deaktivieren' : 'Aktivieren'}</button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="card !p-4 text-right">
            <p className="overline">Saldo gesamt</p>
            <p className={`kpi mt-1 ${saldo < 0 ? 'text-hs-err-fg' : ''}`}>{fmtEuroMitZeichen(saldo)}</p>
          </div>
          <div className="card !p-4 text-right">
            <p className="overline">Saldo abgeglichen</p>
            <p className={`kpi mt-1 ${saldoAbgeglichen < 0 ? 'text-hs-err-fg' : ''}`}>{fmtEuroMitZeichen(saldoAbgeglichen)}</p>
            <p className="text-xs text-hs-text-2 font-mono tabular-nums mt-0.5">
              {differenz === 0 ? 'stimmt mit Gesamtsaldo überein' : `Differenz ${fmtEuroMitZeichen(differenz)} · ${offen.length} offen`}
            </p>
          </div>
        </div>
      </div>

      {bearbeiten && (
        <KontoForm id={konto.id} initial={{
          name: konto.name, typ: konto.typ as 'giro', iban: konto.iban, eroeffnungsdatum: konto.eroeffnungsdatum,
          eroeffnungssaldo: konto.eroeffnungssaldo, sortierung: konto.sortierung,
        }} />
      )}

      {fehler && (
        <div className="rounded-lg bg-hs-err-bg border border-hs-err/40 px-3 py-2.5 text-sm text-hs-err-fg flex items-start gap-2">
          <X size={16} strokeWidth={2} className="mt-0.5 shrink-0" /><span>{fehler}</span>
        </div>
      )}

      {anzahlVorEroeffnung > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-hs-warn-bg border border-hs-warn/40 px-4 py-3 text-sm text-hs-warn-fg">
          <AlertTriangle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>
            {anzahlVorEroeffnung} {anzahlVorEroeffnung === 1 ? 'Bewegung liegt' : 'Bewegungen liegen'} am oder vor dem Eröffnungsdatum ({fmtDatum(konto.eroeffnungsdatum)}) und {anzahlVorEroeffnung === 1 ? 'steckt' : 'stecken'} bereits im Eröffnungssaldo – sie werden hier nicht aufgeführt.
          </span>
        </div>
      )}

      {writeOk && konto.aktiv && andereKonten.length > 0 && (
        <UmbuchungForm konten={[{ id: konto.id, name: konto.name }, ...andereKonten]} festesKonto={{ id: konto.id, name: konto.name }} kompakt />
      )}

      <div className="card !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-hs-line flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Bewegungen <span className="text-hs-text-2 font-normal">({sichtbar.length})</span></h2>
          <div className="flex items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5 text-hs-text-2 cursor-pointer">
              <input type="checkbox" checked={nurOffene} onChange={e => setNurOffene(e.target.checked)} className="accent-hs-teal" />
              Nur offene ({offen.length})
            </label>
            {writeOk && offen.length > 0 && (
              <button type="button" disabled={pending} onClick={alleOffenenAbgleichen} className="inline-flex items-center gap-1 text-hs-blue-700 hover:underline">
                <Check size={13} strokeWidth={2} /> Alle offenen abgleichen
              </button>
            )}
          </div>
        </div>
        {sichtbar.length === 0 ? (
          <p className="text-sm text-hs-text-2 text-center py-10">
            {bewegungen.length === 0 ? 'Noch keine Bewegungen auf diesem Konto seit dem Eröffnungsdatum.' : 'Alle Bewegungen sind abgeglichen.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="text-left px-4 py-2.5">Datum</th>
                  <th className="text-left px-4 py-2.5">Bezeichnung</th>
                  <th className="text-right px-4 py-2.5">Betrag</th>
                  <th className="text-right px-4 py-2.5">Saldo</th>
                  <th className="text-center px-4 py-2.5">Abgeglichen</th>
                  <th className="px-2 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {sichtbar.map(b => {
                  const key = `${b.quelle}-${b.id}`
                  const istUmbuchung = b.quelle !== 'ea_transaktion'
                  return (
                    <tr key={key} className={`border-b border-hs-line last:border-0 hover:bg-hs-bg/60 ${b.abgeglichen ? '' : 'bg-hs-warn-bg/30'}`}>
                      <td className="px-4 py-2.5 whitespace-nowrap font-mono tabular-nums text-[13px] text-hs-text-1">{fmtDatum(b.datum)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {b.transaktionId
                            ? <Link href={`/buchhaltung/${b.transaktionId}`} className="font-medium hover:text-hs-blue-700">{b.beschreibung}</Link>
                            : <span className="font-medium">{b.beschreibung}</span>}
                          {b.gesperrt && <span title="Gesperrt (Monatsabschluss/UVA) – Abgleich bleibt möglich"><Lock size={12} strokeWidth={1.75} className="text-hs-tertiary" /></span>}
                        </div>
                        {b.detail && <p className="text-xs text-hs-text-2">{b.detail}</p>}
                      </td>
                      <td className={`px-4 py-2.5 betrag font-semibold ${b.betrag >= 0 ? 'text-hs-ok-fg' : 'text-hs-text'}`}>{fmtEuroMitZeichen(b.betrag)}</td>
                      <td className="px-4 py-2.5 betrag text-hs-text-2">{b.saldoNachher != null ? fmtEuroMitZeichen(b.saldoNachher) : '–'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <input type="checkbox" checked={b.abgeglichen} disabled={!writeOk || (pending && laufend === key)}
                          onChange={() => toggle(b)} className="accent-hs-teal cursor-pointer disabled:cursor-not-allowed w-4 h-4" title="Gegen Kontoauszug abgeglichen" />
                      </td>
                      <td className="px-2 py-2.5">
                        {writeOk && istUmbuchung && (
                          <button type="button" disabled={pending} onClick={() => umbuchungLoeschen(b)} title="Umbuchung löschen"
                            className="p-1.5 rounded-md text-hs-text-2 hover:text-hs-err-fg hover:bg-hs-err-bg">
                            <Trash2 size={14} strokeWidth={1.75} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
