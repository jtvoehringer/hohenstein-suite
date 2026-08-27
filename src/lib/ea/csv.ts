// ── CSV-Export für Buchhaltung/Steuerberater ─────────────────────────────────
// Semikolon-getrennt, Beträge mit Komma (de-AT), BOM für Excel – das ist das
// Format, das Excel (DE/AT) und BMD/RZL ohne Import-Assistent lesen.
// Client-tauglich (keine Server-Imports). Download über downloadCSV aus
// @/lib/utils/csv.

export type CsvSpalte<T> = { header: string; wert: (row: T) => unknown }

/** Zahl → „1234,56" (kein Tausenderpunkt – Excel/BMD-freundlich) */
export function csvZahl(n: number | string | null | undefined, digits = 2): string {
  if (n == null || n === '') return ''
  const v = typeof n === 'string' ? Number(n) : n
  if (!Number.isFinite(v)) return ''
  return v.toFixed(digits).replace('.', ',')
}

/** ISO-Datum → 27.08.2026 */
export function csvDatum(d: string | null | undefined): string {
  if (!d) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : d
}

export function toCsvSemikolon<T>(rows: T[], spalten: CsvSpalte<T>[]): string {
  const esc = (v: unknown): string => {
    if (v == null) return '""'
    return '"' + String(v).replace(/"/g, '""') + '"'
  }
  const kopf  = spalten.map(s => esc(s.header)).join(';')
  const zeilen = rows.map(r => spalten.map(s => esc(s.wert(r))).join(';'))
  return '﻿' + [kopf, ...zeilen].join('\r\n')
}
