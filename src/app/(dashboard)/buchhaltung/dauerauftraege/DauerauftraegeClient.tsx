'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Pencil, Plus, Play, Check, X } from 'lucide-react'
import { fmtDatum, fmtDatumZeit, fmtEuroMitZeichen, heuteIso } from '@/lib/format'
import {
  UST_SAETZE, INTERVALLE, intervallLabel, typLabel, typPillKlasse, betragKlasse, nettoZuBrutto, parseBetrag,
  type KategorieOption, type KontoOption,
} from '@/lib/ea/types'
import { speichereDauerauftrag, setzeDauerauftragAktiv, fuehreDauerauftraegeAusAction, type DauerauftragInput } from '../actions'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

type FormState = Omit<DauerauftragInput, 'betrag_netto'> & { id?: string; betrag_text: string }

export default function DauerauftraegeClient({ dauerauftraege, log, kategorien, konten, writeOk, adminOk }: {
  dauerauftraege: R[]
  log: R[]
  kategorien: KategorieOption[]
  konten: KontoOption[]
  writeOk: boolean
  adminOk: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState<FormState | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [zeigeInaktive, setZeigeInaktive] = useState(false)

  const aktive   = dauerauftraege.filter(d => d.aktiv)
  const inaktive = dauerauftraege.filter(d => !d.aktiv)
  const faellig  = aktive.filter(d => d.naechste_faelligkeit <= heuteIso()).length

  function neu() {
    setFehler(null); setMeldung(null)
    setForm({ typ: 'ausgabe', beschreibung: '', kategorie_id: null, konto_id: null, betrag_text: '', ust_satz: 20, intervall: 'monatlich', tag_im_monat: 1, naechste_faelligkeit: heuteIso(), notizen: null })
  }
  function bearbeiten(d: R) {
    setFehler(null); setMeldung(null)
    setForm({
      id: d.id, typ: d.typ, beschreibung: d.beschreibung, kategorie_id: d.kategorie_id ?? null, konto_id: d.konto_id ?? null,
      betrag_text: Number(d.betrag_netto).toFixed(2).replace('.', ','), ust_satz: Number(d.ust_satz),
      intervall: d.intervall, tag_im_monat: Number(d.tag_im_monat ?? 1), naechste_faelligkeit: d.naechste_faelligkeit, notizen: d.notizen ?? null,
    })
  }

  function kategorieWaehlen(id: string) {
    if (!form) return
    const k = kategorien.find(x => x.id === id)
    setForm({ ...form, kategorie_id: id || null, ust_satz: k ? k.ust_satz_std : form.ust_satz })
  }

  function speichern(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setFehler(null)
    const betrag = parseBetrag(form.betrag_text)
    if (!Number.isFinite(betrag) || betrag <= 0) { setFehler('Bitte einen Nettobetrag größer 0 eingeben.'); return }
    const { id, typ, beschreibung, kategorie_id, konto_id, ust_satz, intervall, tag_im_monat, naechste_faelligkeit, notizen } = form
    startTransition(async () => {
      const res = await speichereDauerauftrag({ typ, beschreibung, kategorie_id, konto_id, ust_satz, intervall, tag_im_monat, naechste_faelligkeit, notizen, betrag_netto: betrag }, id)
      if (!res.ok) { setFehler(res.error); return }
      setForm(null); setMeldung(id ? 'Dauerauftrag gespeichert.' : 'Dauerauftrag angelegt.')
      router.refresh()
    })
  }

  function aktivSetzen(d: R, aktiv: boolean) {
    if (!aktiv && !confirm(`„${d.beschreibung}" deaktivieren? Es werden dann keine Buchungen mehr automatisch erzeugt.`)) return
    setFehler(null)
    startTransition(async () => {
      const res = await setzeDauerauftragAktiv(d.id, aktiv)
      if (!res.ok) { setFehler(res.error); return }
      router.refresh()
    })
  }

  function jetztAusfuehren() {
    setFehler(null); setMeldung(null)
    startTransition(async () => {
      const res = await fuehreDauerauftraegeAusAction()
      if (!res.ok) { setFehler(res.error); return }
      const d = res.data!
      setMeldung(`Lauf abgeschlossen: ${d.verarbeitet} fällig · ${d.erstellt} Buchung${d.erstellt === 1 ? '' : 'en'} erstellt · ${d.uebersprungen} übersprungen · ${d.fehler} Fehler.`)
      router.refresh()
    })
  }

  const passendeKategorien = form ? kategorien.filter(k => k.typ === 'beides' || k.typ === form.typ) : []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-hs-text-2">
          {aktive.length} aktiv{faellig > 0 ? ` · ${faellig} fällig` : ''}
          {inaktive.length > 0 && (
            <label className="ml-3 inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={zeigeInaktive} onChange={e => setZeigeInaktive(e.target.checked)} className="accent-hs-teal" />
              Inaktive anzeigen ({inaktive.length})
            </label>
          )}
        </p>
        <div className="flex items-center gap-2">
          {adminOk && (
            <button type="button" onClick={jetztAusfuehren} disabled={pending} className="btn-secondary" title="Alle fälligen Daueraufträge jetzt verbuchen (sonst täglich per Cron)">
              <Play size={15} strokeWidth={1.75} /> Jetzt ausführen
            </button>
          )}
          {writeOk && <button type="button" onClick={neu} className="btn-primary"><Plus size={16} strokeWidth={2} /> Dauerauftrag</button>}
        </div>
      </div>

      {meldung && <p className="text-sm text-hs-ok-fg inline-flex items-center gap-1"><Check size={14} strokeWidth={2.25} />{meldung}</p>}
      {fehler && <p className="text-sm text-hs-err-fg inline-flex items-center gap-1"><X size={14} strokeWidth={2.25} />{fehler}</p>}

      {form && (
        <form onSubmit={speichern} className="card space-y-4 border-hs-blue-300">
          <h2 className="text-base">{form.id ? 'Dauerauftrag bearbeiten' : 'Neuer Dauerauftrag'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="form-label">Typ *</label>
              <select value={form.typ} onChange={e => setForm({ ...form, typ: e.target.value as 'einnahme' | 'ausgabe', kategorie_id: null })} className="input">
                <option value="einnahme">Einnahme</option>
                <option value="ausgabe">Ausgabe</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="form-label">Bezeichnung *</label>
              <input required value={form.beschreibung} onChange={e => setForm({ ...form, beschreibung: e.target.value })} className="input" placeholder="z. B. Büromiete, Software-Abo, Wartungspauschale Kunde X" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="form-label">Betrag netto (€) *</label>
              <input inputMode="decimal" required value={form.betrag_text} onChange={e => setForm({ ...form, betrag_text: e.target.value })} className="input font-mono text-right" placeholder="0,00" />
              {Number.isFinite(parseBetrag(form.betrag_text)) && (
                <p className="text-xs text-hs-text-2 mt-1 font-mono tabular-nums">brutto {fmtEuroMitZeichen(nettoZuBrutto(parseBetrag(form.betrag_text), form.ust_satz))}</p>
              )}
            </div>
            <div>
              <label className="form-label">USt-Satz</label>
              <select value={form.ust_satz} onChange={e => setForm({ ...form, ust_satz: Number(e.target.value) })} className="input">
                {UST_SAETZE.map(u => <option key={u.value} value={u.value}>{u.value} %</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Intervall *</label>
              <select value={form.intervall} onChange={e => setForm({ ...form, intervall: e.target.value as FormState['intervall'] })} className="input">
                {INTERVALLE.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Tag im Monat</label>
              <input type="number" min={1} max={28} value={form.tag_im_monat} onChange={e => setForm({ ...form, tag_im_monat: Number(e.target.value) })} className="input font-mono text-right" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="form-label">Nächste Fälligkeit *</label>
              <input type="date" required value={form.naechste_faelligkeit} onChange={e => setForm({ ...form, naechste_faelligkeit: e.target.value })} className="input" />
            </div>
            <div>
              <label className="form-label">Kategorie</label>
              <select value={form.kategorie_id ?? ''} onChange={e => kategorieWaehlen(e.target.value)} className="input">
                <option value="">– keine –</option>
                {passendeKategorien.map(k => <option key={k.id} value={k.id}>{k.konto_nr ? `${k.konto_nr} · ` : ''}{k.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Konto</label>
              <select value={form.konto_id ?? ''} onChange={e => setForm({ ...form, konto_id: e.target.value || null })} className="input">
                <option value="">– keines –</option>
                {konten.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Notizen</label>
            <input value={form.notizen ?? ''} onChange={e => setForm({ ...form, notizen: e.target.value || null })} className="input" placeholder="Optional" />
          </div>
          <p className="text-xs text-hs-text-2">Fällige Daueraufträge werden täglich automatisch verbucht (Datum = Fälligkeit). Fällt die Fälligkeit in einen abgeschlossenen Monat, wird der Lauf übersprungen und protokolliert.</p>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending} className="btn-primary">{pending ? 'Speichern …' : 'Speichern'}</button>
            <button type="button" onClick={() => setForm(null)} className="btn-secondary">Abbrechen</button>
          </div>
        </form>
      )}

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="text-left px-4 py-2.5">Bezeichnung</th>
                <th className="text-left px-4 py-2.5">Typ</th>
                <th className="text-left px-4 py-2.5">Intervall</th>
                <th className="text-right px-4 py-2.5">Netto</th>
                <th className="text-right px-4 py-2.5">Brutto</th>
                <th className="text-left px-4 py-2.5">Nächste Fälligkeit</th>
                <th className="text-left px-4 py-2.5 hidden md:table-cell">Konto</th>
                <th className="px-3 py-2.5 w-36" />
              </tr>
            </thead>
            <tbody>
              {(zeigeInaktive ? dauerauftraege : aktive).length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center">
                  <p className="text-sm text-hs-text-2">Noch keine Daueraufträge.</p>
                  {writeOk && <button type="button" onClick={neu} className="btn-primary mt-3"><Plus size={16} strokeWidth={2} /> Ersten Dauerauftrag anlegen</button>}
                </td></tr>
              )}
              {(zeigeInaktive ? dauerauftraege : aktive).map(d => {
                const istFaellig = d.aktiv && d.naechste_faelligkeit <= heuteIso()
                return (
                  <tr key={d.id} className={`border-b border-hs-line last:border-0 hover:bg-hs-bg/60 ${d.aktiv ? '' : 'opacity-50'}`}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{d.beschreibung}</p>
                      <p className="text-xs text-hs-text-2">{(d.ea_kategorien as R | null)?.name ?? 'ohne Kategorie'}{d.notizen ? ` · ${d.notizen}` : ''}</p>
                    </td>
                    <td className="px-4 py-2.5"><span className={typPillKlasse(d.typ)}>{typLabel(d.typ)}</span></td>
                    <td className="px-4 py-2.5 text-hs-text-1">{intervallLabel(d.intervall)}<span className="text-hs-tertiary"> · {d.tag_im_monat}.</span></td>
                    <td className="px-4 py-2.5 betrag text-hs-text-1">{fmtEuroMitZeichen(d.betrag_netto)} <span className="text-hs-tertiary text-xs">+{d.ust_satz} %</span></td>
                    <td className={`px-4 py-2.5 betrag font-semibold ${betragKlasse(d.typ)}`}>{fmtEuroMitZeichen(nettoZuBrutto(Number(d.betrag_netto), Number(d.ust_satz)))}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-[13px]">
                      {fmtDatum(d.naechste_faelligkeit)}
                      {istFaellig && <span className="pill bg-hs-warn-bg text-hs-warn-fg ml-2">fällig</span>}
                    </td>
                    <td className="px-4 py-2.5 text-hs-text-2 text-[13px] hidden md:table-cell">{(d.konten as R | null)?.name ?? '–'}</td>
                    <td className="px-3 py-2.5">
                      {writeOk && (
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => bearbeiten(d)} title="Bearbeiten" className="p-1.5 rounded-md text-hs-text-2 hover:text-hs-blue-700 hover:bg-hs-blue-50">
                            <Pencil size={15} strokeWidth={1.75} />
                          </button>
                          <button type="button" disabled={pending} onClick={() => aktivSetzen(d, !d.aktiv)} className="text-xs text-hs-text-2 hover:text-hs-text px-1.5 py-1 rounded-md hover:bg-hs-bg">
                            {d.aktiv ? 'Deaktivieren' : 'Aktivieren'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-hs-line">
          <h2 className="text-sm font-semibold">Letzte Ausführungen</h2>
        </div>
        {log.length === 0 ? (
          <p className="text-sm text-hs-text-2 text-center py-8">Noch keine Läufe protokolliert.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {log.map(l => (
                <tr key={l.id} className="border-b border-hs-line last:border-0">
                  <td className="px-4 py-2 text-hs-text-2 whitespace-nowrap font-mono tabular-nums text-[12.5px]">{fmtDatumZeit(l.erstellt_am)}</td>
                  <td className="px-4 py-2">{(l.ea_dauerauftraege as R | null)?.beschreibung ?? '–'}</td>
                  <td className="px-4 py-2">
                    <span className={
                      l.status === 'erstellt' ? 'pill bg-hs-ok-bg text-hs-ok-fg'
                      : l.status === 'uebersprungen' ? 'pill bg-hs-warn-bg text-hs-warn-fg'
                      : 'pill bg-hs-err-bg text-hs-err-fg'}>
                      {l.status === 'erstellt' ? 'Erstellt' : l.status === 'uebersprungen' ? 'Übersprungen' : 'Fehler'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-hs-text-2">
                    {l.ea_transaktion_id
                      ? <Link href={`/buchhaltung?id=${l.ea_transaktion_id}${(l.ea_transaktionen as R | null)?.datum ? `&jahr=${String((l.ea_transaktionen as R).datum).slice(0, 4)}` : ''}`} className="text-hs-blue-700 hover:underline">Buchung öffnen</Link>
                      : (l.fehler_details ?? '')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
