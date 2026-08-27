'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Calculator, Lock, Trash2, X, Check } from 'lucide-react'
import { fmtDatumZeit, fmtEuroMitZeichen, MONATE, MONATE_KURZ } from '@/lib/format'
import { uvaPeriodeLabel } from '@/lib/ea/types'
import { berechneUndSpeichereUvaAction, markiereUvaUebermitteltAction, loescheUvaEntwurfAction } from '../actions'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default function UvaClient({ jahr, zeitraeume, vorschlag, uvaListe, fehlendeMonate, writeOk, adminOk, kleinunternehmer }: {
  jahr: number
  /** Berechenbare (noch nicht übermittelte) Perioden */
  zeitraeume: string[]
  vorschlag: string
  uvaListe: R[]
  /** je Zeitraum: Monate ohne Monatsabschluss (Voraussetzung für Übermittlung) */
  fehlendeMonate: Record<string, number[]>
  writeOk: boolean
  adminOk: boolean
  kleinunternehmer: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [zeitraum, setZeitraum] = useState(zeitraeume.includes(vorschlag) ? vorschlag : (zeitraeume[0] ?? ''))
  const [fehler, setFehler] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)

  const label = (z: string) => uvaPeriodeLabel(z, jahr, MONATE)

  function berechnen(e: React.FormEvent) {
    e.preventDefault()
    if (!zeitraum) return
    setFehler(null); setMeldung(null)
    startTransition(async () => {
      const res = await berechneUndSpeichereUvaAction(jahr, zeitraum)
      if (!res.ok) { setFehler(res.error); return }
      setMeldung(`UVA ${label(zeitraum)} berechnet und gespeichert.`)
      router.refresh()
    })
  }

  function uebermitteln(uva: R) {
    if (!confirm(`UVA ${label(uva.zeitraum)} als übermittelt markieren? Alle Buchungen dieses Zeitraums werden endgültig gesperrt – das kann nicht rückgängig gemacht werden.`)) return
    setFehler(null); setMeldung(null)
    startTransition(async () => {
      const res = await markiereUvaUebermitteltAction(uva.id)
      if (!res.ok) { setFehler(res.error); return }
      setMeldung(`UVA ${label(uva.zeitraum)} als übermittelt markiert.`)
      router.refresh()
    })
  }

  function entwurfLoeschen(uva: R) {
    if (!confirm(`Entwurf ${label(uva.zeitraum)} löschen? Die Buchungen bleiben unverändert.`)) return
    setFehler(null); setMeldung(null)
    startTransition(async () => {
      const res = await loescheUvaEntwurfAction(uva.id)
      if (!res.ok) { setFehler(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      {kleinunternehmer && (
        <div className="rounded-xl bg-hs-warn-bg border border-hs-warn/40 px-4 py-3 text-sm text-hs-warn-fg">
          <strong>Kleinunternehmerregelung aktiv</strong> (§ 6 Abs. 1 Z 27 UStG): Es wird keine Umsatzsteuer in Rechnung gestellt und keine Vorsteuer abgezogen –
          eine UVA ist in der Regel nicht abzugeben. Die Berechnung hier dient nur der Kontrolle (z. B. Überschreiten der Umsatzgrenze).
        </div>
      )}

      {/* Berechnen */}
      <form onSubmit={berechnen} className="card space-y-3">
        <h2 className="text-base">Periode berechnen</h2>
        {zeitraeume.length > 0 ? (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="form-label">Zeitraum</label>
              <select value={zeitraum} onChange={e => setZeitraum(e.target.value)} className="input min-w-[12rem]">
                {zeitraeume.map(z => <option key={z} value={z}>{label(z)}</option>)}
              </select>
            </div>
            <button type="submit" disabled={pending || !writeOk} className="btn-primary">
              <Calculator size={16} strokeWidth={1.75} /> {pending ? 'Berechnen …' : 'Berechnen & speichern'}
            </button>
            <p className="text-xs text-hs-text-2 basis-full">
              Ermittelt Bemessungsgrundlagen, USt und (anteilig abzugsfähige) Vorsteuer aus den Buchungen und speichert die Meldung. Kann beliebig oft wiederholt werden, solange die Meldung nicht als übermittelt markiert ist.
            </p>
          </div>
        ) : (
          <p className="text-sm text-hs-text-2">Alle Perioden für {jahr} sind bereits als übermittelt markiert.</p>
        )}
      </form>

      {meldung && <p className="text-sm text-hs-ok-fg inline-flex items-center gap-1"><Check size={14} strokeWidth={2.25} />{meldung}</p>}
      {fehler && (
        <div className="rounded-lg bg-hs-err-bg border border-hs-err/40 px-3 py-2.5 text-sm text-hs-err-fg flex items-start gap-2">
          <X size={16} strokeWidth={2} className="mt-0.5 shrink-0" /><span>{fehler}</span>
        </div>
      )}

      {/* Liste */}
      {uvaListe.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-sm text-hs-text-2">Noch keine UVA-Meldungen für {jahr}. Oben eine Periode berechnen.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-hs-text-2">
            Nachbildung der Kennzahlen des Formulars U30 zur Kontrolle vor der Eingabe in FinanzOnline – keine elektronische Übermittlung.
          </p>
          {uvaListe.map(uva => {
            const kz000 = Number(uva.bmgl_ust_0 ?? 0) + Number(uva.bmgl_ust_10 ?? 0) + Number(uva.bmgl_ust_13 ?? 0) + Number(uva.bmgl_ust_20 ?? 0)
            const zahllast = Number(uva.zahllast ?? 0)
            const fehlend = uva.gesperrt ? [] : (fehlendeMonate[uva.zeitraum] ?? [])
            return (
              <div key={uva.id} className="card !p-0 overflow-hidden">
                <div className="px-5 py-3 border-b border-hs-line bg-hs-bg/60 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">{label(uva.zeitraum)}</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {uva.gesperrt ? (
                      <span className="pill bg-hs-bg text-hs-text-1 border border-hs-line inline-flex items-center gap-1">
                        <Lock size={12} strokeWidth={2} /> Übermittelt{uva.gesperrt_am ? ` am ${fmtDatumZeit(uva.gesperrt_am)}` : ''}
                      </span>
                    ) : (
                      <>
                        <span className="pill bg-hs-warn-bg text-hs-warn-fg">Entwurf</span>
                        {adminOk && (
                          fehlend.length > 0 ? (
                            <span className="text-xs text-hs-warn-fg inline-flex items-center gap-1.5" title="Die UVA kann erst übermittelt werden, wenn alle Monate der Periode abgeschlossen sind">
                              Monatsabschluss fehlt: {fehlend.map(m => MONATE_KURZ[m - 1]).join(', ')}
                              <Link href={`/buchhaltung/monatsabschluss?jahr=${jahr}`} className="underline font-medium">abschließen</Link>
                            </span>
                          ) : (
                            <button type="button" disabled={pending} onClick={() => uebermitteln(uva)} className="btn-primary !px-3 !py-1.5 text-xs">
                              Als übermittelt markieren
                            </button>
                          )
                        )}
                        {adminOk && (
                          <button type="button" disabled={pending} onClick={() => entwurfLoeschen(uva)} title="Entwurf löschen"
                            className="p-1.5 rounded-md text-hs-text-2 hover:text-hs-err-fg hover:bg-hs-err-bg">
                            <Trash2 size={15} strokeWidth={1.75} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="p-5 space-y-5 text-sm">
                  <div>
                    <p className="overline mb-2">1. Umsätze</p>
                    <div className="flex items-center justify-between py-1">
                      <span>Gesamtbetrag der Bemessungsgrundlagen für Lieferungen und sonstige Leistungen <span className="text-hs-tertiary">(Kz 000)</span></span>
                      <span className="betrag font-semibold">{fmtEuroMitZeichen(kz000)}</span>
                    </div>
                    <p className="text-xs text-hs-text-2 mt-2 mb-1">Davon steuerpflichtig:</p>
                    <table className="w-full">
                      <tbody>
                        {[
                          { label: '20 % Normalsteuersatz',      kz: 'Kz 022', bmgl: uva.bmgl_ust_20, ust: uva.ust_20 },
                          { label: '10 % ermäßigter Steuersatz', kz: 'Kz 029', bmgl: uva.bmgl_ust_10, ust: uva.ust_10 },
                          { label: '13 % ermäßigter Steuersatz', kz: 'Kz 006', bmgl: uva.bmgl_ust_13, ust: uva.ust_13 },
                        ].map(row => (
                          <tr key={row.kz}>
                            <td className="py-1 text-hs-text-1">{row.label} <span className="text-hs-tertiary text-xs">({row.kz})</span></td>
                            <td className="py-1 betrag text-hs-text-2">{fmtEuroMitZeichen(row.bmgl)}</td>
                            <td className="py-1 betrag font-medium w-40">USt {fmtEuroMitZeichen(row.ust)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex items-center justify-between py-1 mt-2 pt-2 border-t border-hs-line">
                      <span className="text-hs-text-1">Steuerfreie Umsätze / Reverse Charge (0 %) <span className="text-hs-tertiary text-xs">(Kz 011/021)</span></span>
                      <span className="betrag">{fmtEuroMitZeichen(uva.bmgl_ust_0)}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-hs-line">
                    <p className="overline mb-2">2. Vorsteuer</p>
                    <table className="w-full text-xs text-hs-text-2 mb-1">
                      <tbody>
                        {[
                          { label: 'Vorsteuer 20 %', vst: uva.vst_20 },
                          { label: 'Vorsteuer 10 %', vst: uva.vst_10 },
                          { label: 'Vorsteuer 13 %', vst: uva.vst_13 },
                        ].map(row => (
                          <tr key={row.label}>
                            <td className="py-0.5">{row.label}</td>
                            <td className="py-0.5 betrag">{fmtEuroMitZeichen(row.vst)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex items-center justify-between py-1">
                      <span>Gesamtbetrag der abziehbaren Vorsteuer <span className="text-hs-tertiary">(Kz 060)</span></span>
                      <span className="betrag font-semibold text-hs-blue-700">{fmtEuroMitZeichen(uva.vst_gesamt)}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t-2 border-hs-line-str flex items-center justify-between">
                    <span className="font-semibold">
                      {zahllast >= 0 ? 'Vorauszahlung (Zahllast)' : 'Überschuss (Gutschrift)'} <span className="text-hs-tertiary font-normal text-xs">(Kz 095)</span>
                    </span>
                    <span className={`kpi ${zahllast >= 0 ? 'text-hs-text' : 'text-hs-ok-fg'}`}>{fmtEuroMitZeichen(Math.abs(zahllast))}</span>
                  </div>
                  <p className="text-xs text-hs-text-2">USt gesamt {fmtEuroMitZeichen(uva.ust_gesamt)} − Vorsteuer {fmtEuroMitZeichen(uva.vst_gesamt)}{uva.erstellt_am ? ` · berechnet ${fmtDatumZeit(uva.erstellt_am)}` : ''}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
