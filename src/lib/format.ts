/** Euro-Betrag mit genau 2 Dezimalstellen (de-AT, Tausender-Punkt), ohne Währungszeichen */
export function fmtEuro(n: number | string | null | undefined): string {
  if (n == null || n === '') return '–'
  const v = typeof n === 'string' ? Number(n) : n
  if (Number.isNaN(v)) return '–'
  return v.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** „€ 12.480,00" – Format lt. CD (Währung vor dem Betrag) */
export function fmtEuroMitZeichen(n: number | string | null | undefined): string {
  const s = fmtEuro(n)
  return s === '–' ? s : `€ ${s}`
}

/** Prozentzahl (de-AT). digits = Nachkommastellen (Standard 1). */
export function fmtProzent(n: number | null | undefined, digits = 1): string {
  if (n == null) return '–'
  return n.toLocaleString('de-AT', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** Generische Zahl (de-AT), trailing zeros entfernt */
export function fmtZahl(n: number | null | undefined, maxDigits = 2): string {
  if (n == null) return '–'
  return n.toLocaleString('de-AT', { maximumFractionDigits: maxDigits })
}

/** ISO-Datum (YYYY-MM-DD) → 27.08.2026 */
export function fmtDatum(d: string | Date | null | undefined): string {
  if (!d) return '–'
  const date = typeof d === 'string' ? new Date(d.length === 10 ? d + 'T00:00:00' : d) : d
  if (Number.isNaN(date.getTime())) return '–'
  return date.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Datum + Uhrzeit → 27.08.2026, 14:05 */
export function fmtDatumZeit(d: string | Date | null | undefined): string {
  if (!d) return '–'
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return '–'
  return date.toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Heute als ISO-Datum (lokale Zeitzone) */
export function heuteIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const MONATE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
export const MONATE_KURZ = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
