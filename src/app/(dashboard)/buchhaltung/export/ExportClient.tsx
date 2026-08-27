'use client'

import { Download, FileSpreadsheet, Briefcase } from 'lucide-react'
import { downloadCSV } from '@/lib/utils/csv'
import { toCsvSemikolon, csvDatum, csvZahl } from '@/lib/ea/csv'
import { IMPORT_QUELLEN } from '@/lib/ea/types'
import { fmtEuroMitZeichen } from '@/lib/format'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export type KategorieSumme = {
  key: string
  name: string
  konto_nr: number | null
  typ: 'einnahme' | 'ausgabe'
  anzahl: number
  netto: number
  ust: number
  brutto: number
  abzugsfaehig: number
}

export default function ExportClient({ buchungen, kategorien, von, bis, betriebName }: {
  buchungen: R[]
  kategorien: KategorieSumme[]
  von: string
  bis: string
  betriebName: string
}) {
  const suffix = `${von}_${bis}`

  function journalCsv() {
    downloadCSV(toCsvSemikolon(buchungen, [
      { header: 'Datum',            wert: b => csvDatum(b.datum) },
      { header: 'Typ',              wert: b => b.typ === 'einnahme' ? 'Einnahme' : 'Ausgabe' },
      { header: 'Belegnummer',      wert: b => b.belegnummer ?? '' },
      { header: 'Bezeichnung',      wert: b => b.beschreibung ?? '' },
      { header: 'Kategorie',        wert: b => (b.ea_kategorien as R | null)?.name ?? '' },
      { header: 'Konto-Nr',         wert: b => (b.ea_kategorien as R | null)?.konto_nr ?? '' },
      { header: 'Geschäftspartner', wert: b => (b.firmen as R | null)?.name ?? '' },
      { header: 'Bankkonto',        wert: b => (b.konten as R | null)?.name ?? '' },
      { header: 'USt-Satz %',       wert: b => csvZahl(b.ust_satz, 0) },
      { header: 'Netto',            wert: b => csvZahl(b.betrag_netto) },
      { header: 'USt',              wert: b => csvZahl(b.ust_betrag) },
      { header: 'Brutto',           wert: b => csvZahl(b.betrag_brutto) },
      { header: 'Abzugsfähig %',    wert: b => csvZahl(b.abzugsfaehig_pct, 0) },
      { header: 'Abzugsfähig netto', wert: b => csvZahl(b.betrag_abzugsfaehig) },
      { header: 'Quelle',           wert: b => IMPORT_QUELLEN[b.import_quelle] ?? b.import_quelle ?? '' },
      { header: 'Gesperrt',         wert: b => b.is_locked ? 'ja' : 'nein' },
      { header: 'Abgeglichen',      wert: b => b.abgeglichen ? 'ja' : 'nein' },
      { header: 'Notizen',          wert: b => b.notizen ?? '' },
    ]), `ea_journal_${suffix}.csv`)
  }

  function kategorienCsv() {
    downloadCSV(toCsvSemikolon(kategorien, [
      { header: 'Typ',           wert: k => k.typ === 'einnahme' ? 'Einnahme' : 'Ausgabe' },
      { header: 'Konto-Nr',      wert: k => k.konto_nr ?? '' },
      { header: 'Kategorie',     wert: k => k.name },
      { header: 'Buchungen',     wert: k => k.anzahl },
      { header: 'Netto',         wert: k => csvZahl(k.netto) },
      { header: 'USt',           wert: k => csvZahl(k.ust) },
      { header: 'Brutto',        wert: k => csvZahl(k.brutto) },
      { header: 'Abzugsfähig netto', wert: k => csvZahl(k.abzugsfaehig) },
    ]), `ea_kategorien_${suffix}.csv`)
  }

  function steuerberaterCsv() {
    // Schlankes Buchungsformat: Konto-Nr, Datum, Beleg, Text, Netto, USt, Brutto – wie es
    // Steuerberater für den Import in BMD/RZL erwarten (Ausgaben negativ ausgewiesen).
    downloadCSV(toCsvSemikolon(buchungen, [
      { header: 'Konto',      wert: b => (b.ea_kategorien as R | null)?.konto_nr ?? '' },
      { header: 'Datum',      wert: b => csvDatum(b.datum) },
      { header: 'Beleg',      wert: b => b.belegnummer ?? '' },
      { header: 'Text',       wert: b => [b.beschreibung, (b.firmen as R | null)?.name].filter(Boolean).join(' – ') },
      { header: 'Soll/Haben', wert: b => b.typ === 'einnahme' ? 'H' : 'S' },
      { header: 'Netto',      wert: b => csvZahl(b.betrag_netto) },
      { header: 'USt-Satz',   wert: b => csvZahl(b.ust_satz, 0) },
      { header: 'USt',        wert: b => csvZahl(b.ust_betrag) },
      { header: 'Brutto',     wert: b => csvZahl(b.betrag_brutto) },
      { header: 'Abzugsfähig %', wert: b => csvZahl(b.abzugsfaehig_pct, 0) },
      { header: 'Kategorie',  wert: b => (b.ea_kategorien as R | null)?.name ?? '' },
    ]), `ea_steuerberater_${betriebName.replace(/[^a-zA-Z0-9]+/g, '_')}_${suffix}.csv`)
  }

  const einnahmen = kategorien.filter(k => k.typ === 'einnahme')
  const ausgaben  = kategorien.filter(k => k.typ === 'ausgabe')
  const sum = (rows: KategorieSumme[], f: keyof KategorieSumme) => rows.reduce((s, r) => s + Number(r[f] ?? 0), 0)

  function KategorieTabelle({ titel, rows }: { titel: string; rows: KategorieSumme[] }) {
    return (
      <div className="card !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-hs-line"><h2 className="text-sm font-semibold">{titel}</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="text-left px-4 py-2">Konto</th>
                <th className="text-left px-4 py-2">Kategorie</th>
                <th className="text-right px-4 py-2">Anzahl</th>
                <th className="text-right px-4 py-2">Netto</th>
                <th className="text-right px-4 py-2">USt</th>
                <th className="text-right px-4 py-2">Brutto</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-hs-text-2">Keine Buchungen im Zeitraum.</td></tr>}
              {rows.map(k => (
                <tr key={k.key} className="border-b border-hs-line last:border-0">
                  <td className="px-4 py-2 font-mono tabular-nums text-hs-text-2 text-[13px]">{k.konto_nr ?? '–'}</td>
                  <td className="px-4 py-2">{k.name}</td>
                  <td className="px-4 py-2 betrag text-hs-text-2">{k.anzahl}</td>
                  <td className="px-4 py-2 betrag">{fmtEuroMitZeichen(k.netto)}</td>
                  <td className="px-4 py-2 betrag text-hs-text-2">{fmtEuroMitZeichen(k.ust)}</td>
                  <td className={`px-4 py-2 betrag font-semibold ${k.typ === 'einnahme' ? 'text-hs-ok-fg' : ''}`}>{fmtEuroMitZeichen(k.brutto)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-hs-line-str bg-hs-bg/60 font-semibold">
                  <td colSpan={2} className="px-4 py-2">Summe</td>
                  <td className="px-4 py-2 betrag">{sum(rows, 'anzahl')}</td>
                  <td className="px-4 py-2 betrag">{fmtEuroMitZeichen(sum(rows, 'netto'))}</td>
                  <td className="px-4 py-2 betrag">{fmtEuroMitZeichen(sum(rows, 'ust'))}</td>
                  <td className="px-4 py-2 betrag">{fmtEuroMitZeichen(sum(rows, 'brutto'))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card flex flex-col gap-3">
          <div className="flex items-center gap-2"><FileSpreadsheet size={18} strokeWidth={1.75} className="text-hs-blue-500" /><h2 className="text-base">Buchungsjournal</h2></div>
          <p className="text-sm text-hs-text-2 flex-1">Alle {buchungen.length} Buchungen des Zeitraums mit Kategorie, Konto, Geschäftspartner, Netto/USt/Brutto.</p>
          <button type="button" onClick={journalCsv} disabled={buchungen.length === 0} className="btn-primary"><Download size={15} strokeWidth={1.75} /> Journal CSV</button>
        </div>
        <div className="card flex flex-col gap-3">
          <div className="flex items-center gap-2"><FileSpreadsheet size={18} strokeWidth={1.75} className="text-hs-blue-500" /><h2 className="text-base">Kategorien-Auswertung</h2></div>
          <p className="text-sm text-hs-text-2 flex-1">Summen je Kategorie (Netto, USt, Brutto, abzugsfähiger Anteil) – die Basis für die E&A-Rechnung.</p>
          <button type="button" onClick={kategorienCsv} disabled={kategorien.length === 0} className="btn-primary"><Download size={15} strokeWidth={1.75} /> Auswertung CSV</button>
        </div>
        <div className="card flex flex-col gap-3">
          <div className="flex items-center gap-2"><Briefcase size={18} strokeWidth={1.75} className="text-hs-blue-500" /><h2 className="text-base">Steuerberater</h2></div>
          <p className="text-sm text-hs-text-2 flex-1">Schlankes Buchungsformat: Konto-Nr, Datum, Beleg, Text, Soll/Haben, Netto, USt, Brutto – für BMD/RZL-Import.</p>
          <button type="button" onClick={steuerberaterCsv} disabled={buchungen.length === 0} className="btn-primary"><Download size={15} strokeWidth={1.75} /> Export CSV</button>
        </div>
      </div>

      <KategorieTabelle titel="Einnahmen je Kategorie" rows={einnahmen} />
      <KategorieTabelle titel="Ausgaben je Kategorie" rows={ausgaben} />
    </div>
  )
}
