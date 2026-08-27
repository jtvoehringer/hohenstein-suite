'use client'

import { Download } from 'lucide-react'
import { downloadCSV } from '@/lib/utils/csv'
import { toCsvSemikolon, csvDatum, csvZahl } from '@/lib/ea/csv'
import { IMPORT_QUELLEN } from '@/lib/ea/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default function CsvExportButton({ buchungen, dateiname }: { buchungen: R[]; dateiname: string }) {
  function exportieren() {
    const csv = toCsvSemikolon(buchungen, [
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
      { header: 'Quelle',           wert: b => IMPORT_QUELLEN[b.import_quelle] ?? b.import_quelle ?? '' },
      { header: 'Gesperrt',         wert: b => b.is_locked ? 'ja' : 'nein' },
      { header: 'Notizen',          wert: b => b.notizen ?? '' },
    ])
    downloadCSV(csv, dateiname)
  }

  return (
    <button type="button" onClick={exportieren} disabled={buchungen.length === 0} className="btn-secondary" title="Gefilterte Buchungen als CSV">
      <Download size={16} strokeWidth={1.75} /> CSV
    </button>
  )
}
