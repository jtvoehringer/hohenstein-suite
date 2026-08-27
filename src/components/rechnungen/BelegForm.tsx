'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Trash2, ArrowUp, ArrowDown, Save, BookOpen } from 'lucide-react'
import KundenSuche from '@/components/crm/KundenSuche'
import { fmtEuroMitZeichen } from '@/lib/format'
import { berechneSummen, positionNetto } from '@/lib/rechnungen/summen'
import {
  EINHEITEN, UST_MODI, UST_SAETZE_FAKT, belegartLabel, datumPlusTage, ustModusHinweis,
  type BelegInput, type Belegart, type LeistungRow, type PositionRow, type UstModus,
} from '@/lib/rechnungen/types'
import type { EmpfaengerFirma, EmpfaengerKontakt } from '@/lib/rechnungen/server'
import { speichereBeleg } from '@/app/(dashboard)/rechnungen/actions'

export type KategorieOpt = { id: string; name: string }

type Props = {
  belegart: Belegart
  belegId?: string
  initial: BelegInput
  firmen: EmpfaengerFirma[]
  kontakte: EmpfaengerKontakt[]
  leistungen: LeistungRow[]
  kategorien: KategorieOpt[]
  ustSatzStandard: number
}

const LAENDER_KURZ = ['AT', 'DE', 'CH', 'IT', 'SI', 'HU', 'CZ', 'SK', 'FR', 'NL', 'BE', 'LU', 'PL', 'HR', 'ES', 'PT', 'DK', 'SE', 'FI', 'IE', 'GB', 'LI']

function leerePosition(pos: number, ust: number): PositionRow {
  return { pos, leistung_id: null, bezeichnung: '', beschreibung: null, menge: 1, einheit: 'Stunde', einzelpreis_netto: 0, rabatt_pct: 0, ust_satz: ust }
}

export default function BelegForm({ belegart, belegId, initial, firmen, kontakte, leistungen, kategorien, ustSatzStandard }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)
  const [f, setF] = useState<BelegInput>(() => ({
    ...initial,
    positionen: initial.positionen.length ? initial.positionen : [leerePosition(1, ustSatzStandard)],
  }))

  const set = <K extends keyof BelegInput>(k: K, v: BelegInput[K]) => setF(prev => ({ ...prev, [k]: v }))
  const summen = useMemo(() => berechneSummen(f.positionen, f.ust_modus), [f.positionen, f.ust_modus])
  const faellig = useMemo(() => (f.datum ? datumPlusTage(f.datum, Number(f.zahlungsziel_tage) || 0) : ''), [f.datum, f.zahlungsziel_tage])
  const istRechnung = belegart === 'rechnung'

  // ── Empfänger aus Firma / Kontakt ────────────────────────────────────────────
  const firmenItems = useMemo(() => firmen.map(x => ({ id: x.id, label: x.name, sub: [x.kundennummer, x.ort].filter(Boolean).join(' · ') || null })), [firmen])
  const kontaktItems = useMemo(() => kontakte.map(x => {
    const firma = x.firma_id ? firmen.find(fi => fi.id === x.firma_id)?.name : null
    return { id: x.id, label: x.name, sub: firma ?? x.ort ?? null }
  }), [kontakte, firmen])

  function waehleFirma(id: string) {
    const firma = firmen.find(x => x.id === id)
    if (!firma) { set('firma_id', null); return }
    setF(prev => {
      const kontakt = prev.kontakt_id ? kontakte.find(k => k.id === prev.kontakt_id) : null
      const kontaktPasst = kontakt && kontakt.firma_id === firma.id
      return {
        ...prev,
        firma_id: firma.id,
        kontakt_id: kontaktPasst ? prev.kontakt_id : null,
        empf_name: firma.name,
        empf_zusatz: kontaktPasst && kontakt ? `z.H. ${kontakt.name}` : null,
        empf_strasse: firma.strasse, empf_plz: firma.plz, empf_ort: firma.ort, empf_land: firma.land ?? 'AT',
        empf_uid: firma.uid_nummer, empf_email: (kontaktPasst && kontakt?.email) || firma.email,
        zahlungsziel_tage: istRechnung ? firma.zahlungsziel_tage : prev.zahlungsziel_tage,
      }
    })
  }

  function waehleKontakt(id: string) {
    const kontakt = kontakte.find(x => x.id === id)
    if (!kontakt) { set('kontakt_id', null); return }
    const firma = kontakt.firma_id ? firmen.find(x => x.id === kontakt.firma_id) : null
    setF(prev => firma
      ? {
          ...prev, kontakt_id: kontakt.id, firma_id: firma.id,
          empf_name: firma.name, empf_zusatz: `z.H. ${kontakt.name}`,
          empf_strasse: firma.strasse, empf_plz: firma.plz, empf_ort: firma.ort, empf_land: firma.land ?? 'AT',
          empf_uid: firma.uid_nummer, empf_email: kontakt.email || firma.email,
          zahlungsziel_tage: istRechnung ? firma.zahlungsziel_tage : prev.zahlungsziel_tage,
        }
      : {
          ...prev, kontakt_id: kontakt.id, firma_id: null,
          empf_name: kontakt.name, empf_zusatz: null,
          empf_strasse: kontakt.strasse, empf_plz: kontakt.plz, empf_ort: kontakt.ort, empf_land: kontakt.land ?? 'AT',
          empf_uid: null, empf_email: kontakt.email,
        })
  }

  // ── Positionen ───────────────────────────────────────────────────────────────
  function setPos(i: number, patch: Partial<PositionRow>) {
    setF(prev => ({ ...prev, positionen: prev.positionen.map((p, j) => (j === i ? { ...p, ...patch } : p)) }))
  }
  function neuePosition(l?: LeistungRow) {
    setF(prev => {
      const pos = prev.positionen.length + 1
      const p = l
        ? { pos, leistung_id: l.id, bezeichnung: l.bezeichnung, beschreibung: l.beschreibung, menge: 1, einheit: l.einheit, einzelpreis_netto: l.preis_netto, rabatt_pct: 0, ust_satz: l.ust_satz }
        : leerePosition(pos, ustSatzStandard)
      // erste leere Zeile ersetzen statt anhängen
      const leerIdx = prev.positionen.findIndex(x => !x.bezeichnung.trim() && !x.einzelpreis_netto)
      const liste = leerIdx >= 0 && l ? prev.positionen.map((x, j) => (j === leerIdx ? { ...p, pos: x.pos } : x)) : [...prev.positionen, p]
      return { ...prev, positionen: liste.map((x, j) => ({ ...x, pos: j + 1 })) }
    })
  }
  function entfernePosition(i: number) {
    setF(prev => {
      const liste = prev.positionen.filter((_, j) => j !== i)
      return { ...prev, positionen: (liste.length ? liste : [leerePosition(1, ustSatzStandard)]).map((x, j) => ({ ...x, pos: j + 1 })) }
    })
  }
  function verschiebe(i: number, richtung: -1 | 1) {
    setF(prev => {
      const liste = [...prev.positionen]
      const j = i + richtung
      if (j < 0 || j >= liste.length) return prev
      ;[liste[i], liste[j]] = [liste[j], liste[i]]
      return { ...prev, positionen: liste.map((x, k) => ({ ...x, pos: k + 1 })) }
    })
  }

  function speichern(e: React.FormEvent) {
    e.preventDefault()
    setFehler(null)
    startTransition(async () => {
      const res = await speichereBeleg({ ...f, belegart }, belegId)
      if (!res.ok) { setFehler(res.error); return }
      router.push(`/rechnungen/${res.data!.id}`)
      router.refresh()
    })
  }

  const num = (v: string) => (v === '' ? 0 : Number(v.replace(',', '.')))

  return (
    <form onSubmit={speichern} className="space-y-5">
      {fehler && <div className="rounded-lg border border-hs-err/40 bg-hs-err-bg text-hs-err-fg text-sm px-4 py-3">{fehler}</div>}

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Empfänger */}
        <div className="card space-y-3">
          <p className="overline">Empfänger</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">Firma</label>
              <KundenSuche items={firmenItems} value={f.firma_id ?? ''} onChange={waehleFirma} placeholder="Firma suchen …" />
            </div>
            <div>
              <label className="form-label">Kontakt</label>
              <KundenSuche items={kontaktItems} value={f.kontakt_id ?? ''} onChange={waehleKontakt} placeholder="Kontakt suchen …" />
            </div>
          </div>
          <p className="text-xs text-hs-text-2">Firma oder Kontakt wählen – die Anschrift wird übernommen und als Snapshot am Beleg gespeichert.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="bf-0" className="form-label">Name *</label>
              <input id="bf-0" className="input" value={f.empf_name} onChange={e => set('empf_name', e.target.value)} required />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="bf-1" className="form-label">Zusatz (z.H., Abteilung)</label>
              <input id="bf-1" className="input" value={f.empf_zusatz ?? ''} onChange={e => set('empf_zusatz', e.target.value || null)} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="bf-2" className="form-label">Straße</label>
              <input id="bf-2" className="input" value={f.empf_strasse ?? ''} onChange={e => set('empf_strasse', e.target.value || null)} />
            </div>
            <div>
              <label htmlFor="bf-3" className="form-label">PLZ</label>
              <input id="bf-3" className="input" value={f.empf_plz ?? ''} onChange={e => set('empf_plz', e.target.value || null)} />
            </div>
            <div>
              <label htmlFor="bf-4" className="form-label">Ort</label>
              <input id="bf-4" className="input" value={f.empf_ort ?? ''} onChange={e => set('empf_ort', e.target.value || null)} />
            </div>
            <div>
              <label htmlFor="bf-5" className="form-label">Land</label>
              <select id="bf-5" className="input" value={f.empf_land ?? 'AT'} onChange={e => set('empf_land', e.target.value)}>
                {LAENDER_KURZ.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="bf-6" className="form-label">UID-Nummer</label>
              <input id="bf-6" className="input" value={f.empf_uid ?? ''} onChange={e => set('empf_uid', e.target.value || null)} placeholder="ATU12345678" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="bf-7" className="form-label">E-Mail (für Versand)</label>
              <input id="bf-7" className="input" type="email" value={f.empf_email ?? ''} onChange={e => set('empf_email', e.target.value || null)} />
            </div>
          </div>
        </div>

        {/* Kopfdaten */}
        <div className="card space-y-3">
          <p className="overline">{belegartLabel(belegart)}sdaten</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="bf-8" className="form-label">Datum *</label>
              <input id="bf-8" type="date" className="input" value={f.datum} onChange={e => set('datum', e.target.value)} required />
            </div>
            <div>
              <label htmlFor="bf-9" className="form-label">{istRechnung ? 'Zahlungsziel (Tage)' : belegart === 'angebot' ? 'Gültigkeit (Tage)' : 'Frist (Tage)'}</label>
              <input id="bf-9" type="number" min={0} max={365} className="input" value={f.zahlungsziel_tage}
                onChange={e => set('zahlungsziel_tage', Number(e.target.value) || 0)} />
              {faellig && <p className="text-xs text-hs-text-2 mt-1">{istRechnung ? 'Fällig am' : 'Gültig bis'} {faellig.split('-').reverse().join('.')}</p>}
            </div>
            <div>
              <label htmlFor="bf-10" className="form-label">Leistungszeitraum von</label>
              <input id="bf-10" type="date" className="input" value={f.leistung_von ?? ''} onChange={e => set('leistung_von', e.target.value || null)} />
            </div>
            <div>
              <label htmlFor="bf-11" className="form-label">Leistungszeitraum bis</label>
              <input id="bf-11" type="date" className="input" value={f.leistung_bis ?? ''} onChange={e => set('leistung_bis', e.target.value || null)} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="bf-12" className="form-label">USt-Modus</label>
              <select id="bf-12" className="input" value={f.ust_modus} onChange={e => set('ust_modus', e.target.value as UstModus)}>
                {UST_MODI.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              {ustModusHinweis(f.ust_modus) && <p className="text-xs text-hs-text-2 mt-1">{ustModusHinweis(f.ust_modus)}</p>}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="bf-13" className="form-label">E&A-Kategorie (Vorbelegung für die Zahlungsbuchung)</label>
              <select id="bf-13" className="input" value={f.ea_kategorie_id ?? ''} onChange={e => set('ea_kategorie_id', e.target.value || null)}>
                <option value="">Standard (Beratungshonorare)</option>
                {kategorien.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Positionen */}
      <div className="card !p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-hs-line">
          <p className="overline">Positionen</p>
          <div className="flex items-center gap-2">
            {leistungen.length > 0 ? (
              <select className="input !w-auto text-[13px]" value="" onChange={e => { const l = leistungen.find(x => x.id === e.target.value); if (l) neuePosition(l) }}>
                <option value="">Aus Katalog hinzufügen …</option>
                {leistungen.map(l => <option key={l.id} value={l.id}>{l.bezeichnung} – {fmtEuroMitZeichen(l.preis_netto)} / {l.einheit}</option>)}
              </select>
            ) : (
              <Link href="/rechnungen/leistungen" className="text-xs text-hs-blue-700 hover:underline inline-flex items-center gap-1"><BookOpen size={14} strokeWidth={1.75} /> Katalog anlegen</Link>
            )}
            <button type="button" onClick={() => neuePosition()} className="btn-secondary !py-1.5"><Plus size={15} strokeWidth={2} /> Position</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="table-head">
              <tr>
                <th className="px-3 py-2 text-left w-10">Pos</th>
                <th className="px-3 py-2 text-left">Bezeichnung / Beschreibung</th>
                <th className="px-3 py-2 text-right w-20">Menge</th>
                <th className="px-3 py-2 text-left w-28">Einheit</th>
                <th className="px-3 py-2 text-right w-28">Einzelpreis</th>
                <th className="px-3 py-2 text-right w-20">Rabatt %</th>
                <th className="px-3 py-2 text-right w-20">USt</th>
                <th className="px-3 py-2 text-right w-28">Netto</th>
                <th className="px-2 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {f.positionen.map((p, i) => (
                <tr key={i} className="border-b border-hs-line align-top">
                  <td className="px-3 py-2 font-mono text-hs-text-2 pt-4">{p.pos}</td>
                  <td className="px-3 py-2 space-y-1.5">
                    <input className="input" placeholder="Bezeichnung" value={p.bezeichnung} onChange={e => setPos(i, { bezeichnung: e.target.value })} />
                    <textarea className="input !text-xs" rows={1} placeholder="Beschreibung (optional)" value={p.beschreibung ?? ''}
                      onChange={e => setPos(i, { beschreibung: e.target.value || null })} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" step="0.01" className="input text-right" value={p.menge} onChange={e => setPos(i, { menge: num(e.target.value) })} />
                  </td>
                  <td className="px-3 py-2">
                    <select className="input" value={p.einheit} onChange={e => setPos(i, { einheit: e.target.value })}>
                      {EINHEITEN.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" step="0.01" className="input text-right" value={p.einzelpreis_netto} onChange={e => setPos(i, { einzelpreis_netto: num(e.target.value) })} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" step="0.5" min={0} max={100} className="input text-right" value={p.rabatt_pct} onChange={e => setPos(i, { rabatt_pct: num(e.target.value) })} />
                  </td>
                  <td className="px-3 py-2">
                    <select className="input" value={p.ust_satz} disabled={f.ust_modus !== 'normal'} onChange={e => setPos(i, { ust_satz: Number(e.target.value) })}>
                      {UST_SAETZE_FAKT.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 betrag pt-4 font-medium">{fmtEuroMitZeichen(positionNetto(p))}</td>
                  <td className="px-2 py-2 pt-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <button type="button" onClick={() => verschiebe(i, -1)} disabled={i === 0} title="Nach oben" className="p-1 rounded text-hs-text-2 hover:text-hs-text hover:bg-hs-bg disabled:opacity-30"><ArrowUp size={14} strokeWidth={1.75} /></button>
                      <button type="button" onClick={() => verschiebe(i, 1)} disabled={i === f.positionen.length - 1} title="Nach unten" className="p-1 rounded text-hs-text-2 hover:text-hs-text hover:bg-hs-bg disabled:opacity-30"><ArrowDown size={14} strokeWidth={1.75} /></button>
                      <button type="button" onClick={() => entfernePosition(i)} title="Entfernen" className="p-1 rounded text-hs-text-2 hover:text-hs-err-fg hover:bg-hs-err-bg"><Trash2 size={14} strokeWidth={1.75} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Live-Summen */}
        <div className="flex justify-end px-5 py-4 bg-hs-bg/60">
          <div className="w-full max-w-xs space-y-1 text-sm">
            {summen.gruppen.length > 1 && summen.gruppen.map(g => (
              <div key={`n${g.satz}`} className="flex justify-between text-hs-text-2"><span>Netto {g.satz} %</span><span className="betrag">{fmtEuroMitZeichen(g.netto)}</span></div>
            ))}
            <div className="flex justify-between font-medium"><span>Nettobetrag</span><span className="betrag">{fmtEuroMitZeichen(summen.netto)}</span></div>
            {f.ust_modus === 'normal'
              ? summen.gruppen.map(g => (
                  <div key={`u${g.satz}`} className="flex justify-between text-hs-text-2"><span>USt {g.satz} %</span><span className="betrag">{fmtEuroMitZeichen(g.ust)}</span></div>
                ))
              : <div className="flex justify-between text-hs-text-2"><span>USt 0 % ({f.ust_modus === 'reverse_charge' ? 'Reverse Charge' : 'Kleinunternehmer'})</span><span className="betrag">{fmtEuroMitZeichen(0)}</span></div>}
            <div className="flex justify-between border-t border-hs-line-str pt-1.5 mt-1.5 text-base font-semibold">
              <span>Brutto</span><span className="betrag text-hs-blue-700">{fmtEuroMitZeichen(summen.brutto)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Texte */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card space-y-3">
          <p className="overline">Texte</p>
          <div>
            <label htmlFor="bf-14" className="form-label">Einleitung</label>
            <textarea id="bf-14" className="input" rows={3} value={f.einleitung ?? ''} onChange={e => set('einleitung', e.target.value || null)} />
          </div>
          <div>
            <label htmlFor="bf-15" className="form-label">Schlusstext</label>
            <textarea id="bf-15" className="input" rows={3} value={f.schlusstext ?? ''} onChange={e => set('schlusstext', e.target.value || null)} />
          </div>
        </div>
        <div className="card space-y-3">
          <p className="overline">Intern</p>
          <div>
            <label htmlFor="bf-16" className="form-label">Interne Notiz (nicht am Beleg)</label>
            <textarea id="bf-16" className="input" rows={7} value={f.interne_notiz ?? ''} onChange={e => set('interne_notiz', e.target.value || null)} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Link href={belegId ? `/rechnungen/${belegId}` : belegart === 'angebot' ? '/rechnungen/angebote' : '/rechnungen'} className="btn-secondary">Abbrechen</Link>
        <button type="submit" disabled={pending} className="btn-primary">
          <Save size={16} strokeWidth={1.75} /> {pending ? 'Speichern …' : 'Entwurf speichern'}
        </button>
      </div>
    </form>
  )
}
