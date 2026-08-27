'use client'

// ── Buchungsformular (Neu / Bearbeiten / Beleg verbuchen) ────────────────────
// Kategorie → USt-Satz und Abzugsfähigkeit vorbelegen; Betrag wird je nach
// tenant_einstellungen.ea_buchung_modus brutto oder netto erfasst – gespeichert
// wird immer betrag_netto (brutto/ust_betrag sind GENERATED-Spalten).

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Lock } from 'lucide-react'
import { fmtEuroMitZeichen, heuteIso } from '@/lib/format'
import {
  UST_SAETZE, bruttoZuNetto, nettoZuBrutto, ustBetrag, parseBetrag,
  type BuchungInput, type BuchungModus, type KategorieOption, type KontoOption, type FirmaOption,
} from '@/lib/ea/types'
import { pruefeZeitraumAction, type ActionResult } from '@/app/(dashboard)/buchhaltung/actions'

export type BuchungFormWerte = Partial<BuchungInput> & { betrag_brutto?: number | null }

type Props = {
  modus: BuchungModus
  ustStandard: number
  kategorien: KategorieOption[]
  konten: KontoOption[]
  firmen: FirmaOption[]
  initial?: BuchungFormWerte
  gesperrt?: boolean
  submitLabel?: string
  abbrechenHref?: string
  /** Wird mit den normalisierten Werten aufgerufen; bei ok → Weiterleitung */
  onSubmit: (input: BuchungInput) => Promise<ActionResult<{ id: string }> | ActionResult>
  /** Ziel nach Erfolg; `{id}` wird durch die Buchungs-ID ersetzt (falls vorhanden) */
  erfolgHref?: string
  hinweis?: string | null
}

export default function BuchungForm({
  modus, ustStandard, kategorien, konten, firmen, initial, gesperrt = false,
  submitLabel = 'Buchung speichern', abbrechenHref = '/buchhaltung', onSubmit, erfolgHref = '/buchhaltung?id={id}', hinweis,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)

  const [typ, setTyp]                 = useState<'einnahme' | 'ausgabe'>(initial?.typ ?? 'ausgabe')
  const [datum, setDatum]             = useState(initial?.datum ?? heuteIso())
  const [beschreibung, setBeschreibung] = useState(initial?.beschreibung ?? '')
  const initialKategorie = kategorien.find(k => k.id === initial?.kategorie_id)
  const [kategorieId, setKategorieId] = useState(initial?.kategorie_id ?? '')
  const [ustSatz, setUstSatz]         = useState<number>(initial?.ust_satz ?? initialKategorie?.ust_satz_std ?? ustStandard)
  const [abzug, setAbzug]             = useState<number>(initial?.abzugsfaehig_pct ?? initialKategorie?.abzugsfaehig_pct ?? 100)
  const [kontoId, setKontoId]         = useState(initial?.konto_id ?? '')
  const [firmaId, setFirmaId]         = useState(initial?.firma_id ?? '')
  const [belegnummer, setBelegnummer] = useState(initial?.belegnummer ?? '')
  const [notizen, setNotizen]         = useState(initial?.notizen ?? '')

  // Betragseingabe als Text (de-AT), Modus brutto/netto
  const initialBetrag = (() => {
    if (modus === 'brutto') {
      if (initial?.betrag_brutto != null) return initial.betrag_brutto
      if (initial?.betrag_netto != null) return nettoZuBrutto(initial.betrag_netto, initial?.ust_satz ?? ustStandard)
      return null
    }
    if (initial?.betrag_netto != null) return initial.betrag_netto
    if (initial?.betrag_brutto != null) return bruttoZuNetto(initial.betrag_brutto, initial?.ust_satz ?? ustStandard)
    return null
  })()
  const [betragText, setBetragText] = useState(initialBetrag != null ? initialBetrag.toFixed(2).replace('.', ',') : '')

  const [zeitraum, setZeitraum] = useState<{ offen: boolean; grund: string | null }>({ offen: true, grund: null })

  const passendeKategorien = useMemo(
    () => kategorien.filter(k => k.typ === 'beides' || k.typ === typ),
    [kategorien, typ],
  )

  // Zeitraum-Prüfung bei Datumswechsel (Live-Hinweis; die Server Action prüft ohnehin nochmals)
  useEffect(() => {
    if (gesperrt || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return
    let aktiv = true
    pruefeZeitraumAction(datum).then(r => { if (aktiv) setZeitraum(r) }).catch(() => {})
    return () => { aktiv = false }
  }, [datum, gesperrt])

  function kategorieWaehlen(id: string) {
    setKategorieId(id)
    const k = kategorien.find(x => x.id === id)
    if (k) { setUstSatz(k.ust_satz_std); setAbzug(k.abzugsfaehig_pct) }
    else   { setAbzug(100) }
  }

  const betrag = parseBetrag(betragText)
  const betragOk = Number.isFinite(betrag) && betrag >= 0
  const netto  = betragOk ? (modus === 'brutto' ? bruttoZuNetto(betrag, ustSatz) : Math.round(betrag * 100) / 100) : null
  const brutto = netto != null ? nettoZuBrutto(netto, ustSatz) : null
  const ust    = netto != null ? ustBetrag(netto, ustSatz) : null

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setFehler(null)
    if (!gesperrt && netto == null) { setFehler('Bitte einen gültigen Betrag eingeben.'); return }
    const input: BuchungInput = {
      typ, datum, beschreibung: beschreibung.trim(),
      kategorie_id: kategorieId || null,
      betrag_netto: netto ?? 0,
      ust_satz: ustSatz,
      abzugsfaehig_pct: abzug,
      konto_id: kontoId || null,
      firma_id: firmaId || null,
      belegnummer: belegnummer.trim() || null,
      notizen: notizen.trim() || null,
    }
    startTransition(async () => {
      const res = await onSubmit(input)
      if (!res.ok) { setFehler(res.error); return }
      const id = (res as { ok: true; data?: { id: string } }).data?.id
      router.push(id ? erfolgHref.replace('{id}', id) : erfolgHref.replace('?id={id}', '').replace('{id}', ''))
      router.refresh()
    })
  }

  const disabledKern = gesperrt || pending

  return (
    <form onSubmit={submit} className="card space-y-5">
      {gesperrt && (
        <div className="flex items-start gap-2 rounded-lg bg-hs-bg border border-hs-line px-3 py-2.5 text-sm text-hs-text-1">
          <Lock size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-hs-text-2" />
          <span>Diese Buchung ist gesperrt (Monatsabschluss oder UVA übermittelt). Nur Konto, Geschäftspartner, Belegnummer und Notizen können noch geändert werden.</span>
        </div>
      )}
      {hinweis && (
        <div className="flex items-start gap-2 rounded-lg bg-hs-warn-bg border border-hs-warn/40 px-3 py-2.5 text-sm text-hs-warn-fg">
          <AlertTriangle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>{hinweis}</span>
        </div>
      )}
      {!gesperrt && !zeitraum.offen && (
        <div className="flex items-start gap-2 rounded-lg bg-hs-err-bg border border-hs-err/40 px-3 py-2.5 text-sm text-hs-err-fg">
          <Lock size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>{zeitraum.grund ?? 'Dieser Zeitraum ist geschlossen.'} Bitte ein anderes Datum wählen.</span>
        </div>
      )}
      {fehler && (
        <div className="rounded-lg bg-hs-err-bg border border-hs-err/40 px-3 py-2.5 text-sm text-hs-err-fg">{fehler}</div>
      )}

      {/* Typ */}
      <div>
        <label className="form-label">Typ *</label>
        <div className="flex gap-2">
          {([['einnahme', 'Einnahme'], ['ausgabe', 'Ausgabe']] as const).map(([v, l]) => (
            <label key={v}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm font-medium transition-colors
                ${typ === v
                  ? (v === 'einnahme' ? 'bg-hs-ok-bg border-hs-ok text-hs-ok-fg' : 'bg-hs-bg border-hs-line-str text-hs-text')
                  : 'bg-white border-hs-line text-hs-text-2 hover:bg-hs-bg'}
                ${disabledKern ? 'opacity-60 cursor-not-allowed' : ''}`}>
              <input type="radio" name="typ" value={v} checked={typ === v} disabled={disabledKern}
                onChange={() => { setTyp(v); setKategorieId('') }} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="form-label">Datum *</label>
          <input type="date" required value={datum} disabled={disabledKern}
            onChange={e => setDatum(e.target.value)} className="input" />
        </div>
        <div>
          <label className="form-label">Belegnummer</label>
          <input value={belegnummer} onChange={e => setBelegnummer(e.target.value)} disabled={pending}
            placeholder="z. B. RE-2026-042" className="input" />
        </div>
      </div>

      <div>
        <label className="form-label">Bezeichnung *</label>
        <input required value={beschreibung} disabled={disabledKern}
          onChange={e => setBeschreibung(e.target.value)}
          placeholder={typ === 'einnahme' ? 'z. B. Beratungshonorar Weingut Muster, Juli' : 'z. B. Software-Abo, Büromaterial …'}
          className="input" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="form-label">Kategorie</label>
          <select value={kategorieId} disabled={disabledKern} onChange={e => kategorieWaehlen(e.target.value)} className="input">
            <option value="">– keine –</option>
            {passendeKategorien.map(k => (
              <option key={k.id} value={k.id}>
                {k.konto_nr ? `${k.konto_nr} · ` : ''}{k.name}{k.abzugsfaehig_pct < 100 ? ` (${k.abzugsfaehig_pct} % abzugsfähig)` : ''}
              </option>
            ))}
          </select>
          {kategorien.length === 0 && (
            <p className="text-xs text-hs-text-2 mt-1">Noch keine Kategorien – <Link href="/buchhaltung/kategorien" className="text-hs-blue-700 hover:underline">Standardkategorien übernehmen</Link>.</p>
          )}
        </div>
        <div>
          <label className="form-label">USt-Satz *</label>
          <select value={ustSatz} disabled={disabledKern} onChange={e => setUstSatz(Number(e.target.value))} className="input">
            {UST_SAETZE.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="form-label">Betrag {modus === 'brutto' ? 'brutto' : 'netto'} (€) *</label>
          <input inputMode="decimal" required={!gesperrt} value={betragText} disabled={disabledKern}
            onChange={e => setBetragText(e.target.value)} placeholder="0,00"
            className="input font-mono tabular-nums text-right" />
          {netto != null && (
            <p className="text-xs text-hs-text-2 mt-1 font-mono tabular-nums">
              Netto {fmtEuroMitZeichen(netto)} · USt {fmtEuroMitZeichen(ust)} · Brutto {fmtEuroMitZeichen(brutto)}
            </p>
          )}
        </div>
        <div>
          <label className="form-label">Abzugsfähig (%)</label>
          <input type="number" min={0} max={100} step={1} value={abzug} disabled={disabledKern || typ === 'einnahme'}
            onChange={e => setAbzug(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            className="input font-mono tabular-nums text-right" />
          {typ === 'ausgabe' && abzug < 100 && (
            <p className="text-xs text-hs-warn-fg mt-1">Nur {abzug} % dieser Ausgabe (und der Vorsteuer) werden steuerlich berücksichtigt (§ 20 EStG).</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="form-label">Konto</label>
          <select value={kontoId} disabled={pending} onChange={e => setKontoId(e.target.value)} className="input">
            <option value="">– keines –</option>
            {konten.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
          {konten.length === 0 && <p className="text-xs text-hs-text-2 mt-1">Für die Kontoabstimmung zuerst ein <Link href="/konten/neu" className="text-hs-blue-700 hover:underline">Konto anlegen</Link>.</p>}
        </div>
        <div>
          <label className="form-label">Geschäftspartner (Firma)</label>
          <select value={firmaId} disabled={pending} onChange={e => setFirmaId(e.target.value)} className="input">
            <option value="">– keine –</option>
            {firmen.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="form-label">Notizen</label>
        <textarea rows={2} value={notizen} disabled={pending} onChange={e => setNotizen(e.target.value)}
          className="input resize-none" placeholder="Optional" />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={pending || (!gesperrt && !zeitraum.offen)} className="btn-primary">
          {pending ? 'Speichern …' : submitLabel}
        </button>
        <Link href={abbrechenHref} className="btn-secondary">Abbrechen</Link>
      </div>
    </form>
  )
}
