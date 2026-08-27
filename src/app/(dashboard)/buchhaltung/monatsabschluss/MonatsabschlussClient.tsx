'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Lock, LockOpen, X } from 'lucide-react'
import { fmtDatum, fmtDatumZeit, fmtEuroMitZeichen, MONATE } from '@/lib/format'
import { schliesseMonatAction, oeffneMonatAction } from '../actions'

export type MonatInfo = {
  monat: number
  abgeschlossenAm: string | null
  vorBeginn: boolean
  zukunft: boolean
  uvaGesperrt: boolean
  anzahl: number
  einnahmen: number
  ausgaben: number
}

export default function MonatsabschlussClient({ jahr, monate, adminOk, betriebsbeginn }: {
  jahr: number
  monate: MonatInfo[]
  adminOk: boolean
  betriebsbeginn: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [aktiv, setAktiv] = useState<number | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  function abschliessen(m: MonatInfo) {
    const name = MONATE[m.monat - 1]
    if (!confirm(`${name} ${jahr} abschließen? Alle ${m.anzahl} Buchung${m.anzahl === 1 ? '' : 'en'} dieses Monats werden gesperrt; neue Buchungen mit diesem Datum sind dann nicht mehr möglich.`)) return
    setFehler(null); setAktiv(m.monat)
    startTransition(async () => {
      const res = await schliesseMonatAction(jahr, m.monat)
      if (!res.ok) setFehler(res.error)
      setAktiv(null)
      router.refresh()
    })
  }

  function oeffnen(m: MonatInfo) {
    const name = MONATE[m.monat - 1]
    if (!confirm(`Abschluss für ${name} ${jahr} aufheben? Die Buchungen dieses Monats werden wieder bearbeitbar.`)) return
    setFehler(null); setAktiv(m.monat)
    startTransition(async () => {
      const res = await oeffneMonatAction(jahr, m.monat)
      if (!res.ok) setFehler(res.error)
      setAktiv(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {fehler && (
        <div className="rounded-lg bg-hs-err-bg border border-hs-err/40 px-3 py-2.5 text-sm text-hs-err-fg flex items-start gap-2">
          <X size={16} strokeWidth={2} className="mt-0.5 shrink-0" /><span>{fehler}</span>
        </div>
      )}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="text-left px-4 py-2.5">Monat</th>
                <th className="text-right px-4 py-2.5">Buchungen</th>
                <th className="text-right px-4 py-2.5">Einnahmen</th>
                <th className="text-right px-4 py-2.5">Ausgaben</th>
                <th className="text-right px-4 py-2.5">Ergebnis</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 w-44" />
              </tr>
            </thead>
            <tbody>
              {monate.map(m => {
                const name = MONATE[m.monat - 1]
                const abgeschlossen = !!m.abgeschlossenAm
                const laeuft = pending && aktiv === m.monat
                const ergebnis = m.einnahmen - m.ausgaben
                return (
                  <tr key={m.monat} className={`border-b border-hs-line last:border-0 ${m.vorBeginn ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2 font-medium">
                        {abgeschlossen
                          ? <Lock size={15} strokeWidth={1.75} className="text-hs-text-2" />
                          : <LockOpen size={15} strokeWidth={1.75} className={m.vorBeginn || m.zukunft ? 'text-hs-tertiary' : 'text-hs-blue-500'} />}
                        <Link href={`/buchhaltung?jahr=${jahr}&monat=${m.monat}`} className="hover:text-hs-blue-700">{name} {jahr}</Link>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 betrag text-hs-text-2">{m.anzahl || '–'}</td>
                    <td className="px-4 py-2.5 betrag text-hs-ok-fg">{m.anzahl ? fmtEuroMitZeichen(m.einnahmen) : '–'}</td>
                    <td className="px-4 py-2.5 betrag">{m.anzahl ? fmtEuroMitZeichen(m.ausgaben) : '–'}</td>
                    <td className={`px-4 py-2.5 betrag font-semibold ${m.anzahl ? (ergebnis >= 0 ? 'text-hs-ok-fg' : 'text-hs-err-fg') : 'text-hs-tertiary'}`}>{m.anzahl ? fmtEuroMitZeichen(ergebnis) : '–'}</td>
                    <td className="px-4 py-2.5">
                      {abgeschlossen ? (
                        <span className="pill bg-hs-bg text-hs-text-1 border border-hs-line" title={`Abgeschlossen am ${fmtDatumZeit(m.abgeschlossenAm)}`}>
                          Abgeschlossen · {fmtDatum(m.abgeschlossenAm)}
                        </span>
                      ) : m.vorBeginn ? (
                        <span className="pill bg-hs-bg text-hs-tertiary" title={`Vor dem Betriebsbeginn ${fmtDatum(betriebsbeginn)} – kein Abschluss nötig`}>vor Betriebsbeginn</span>
                      ) : m.zukunft ? (
                        <span className="pill bg-hs-bg text-hs-tertiary">Zukunft</span>
                      ) : (
                        <span className="pill bg-hs-warn-bg text-hs-warn-fg">Offen</span>
                      )}
                      {m.uvaGesperrt && <span className="pill bg-hs-blue-50 text-hs-blue-700 ml-1.5" title="UVA dieser Periode wurde übermittelt">UVA</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {adminOk && !m.vorBeginn && !m.zukunft && (
                        abgeschlossen ? (
                          m.uvaGesperrt
                            ? <span className="text-xs text-hs-tertiary" title="UVA übermittelt – Aufheben nicht mehr möglich">gesperrt (UVA)</span>
                            : <button type="button" disabled={pending} onClick={() => oeffnen(m)} className="btn-secondary !px-3 !py-1.5 text-xs">{laeuft ? '…' : 'Aufheben'}</button>
                        ) : (
                          <button type="button" disabled={pending} onClick={() => abschliessen(m)} className="btn-primary !px-3 !py-1.5 text-xs">{laeuft ? '…' : 'Monat abschließen'}</button>
                        )
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
