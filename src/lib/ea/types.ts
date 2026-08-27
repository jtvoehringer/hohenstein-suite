// ── E&A-Rechnung: gemeinsame Konstanten und Hilfsfunktionen ──────────────────
// Bewusst ohne Server-Imports (client-tauglich). Spaltennamen lt.
// supabase/migrations/003_ea.sql.

export type BuchungTyp = 'einnahme' | 'ausgabe'
export type KategorieTyp = 'einnahme' | 'ausgabe' | 'beides'
export type BuchungModus = 'brutto' | 'netto'
export type UvaZeitraumModus = 'monatlich' | 'quartalsweise'

export const UST_SAETZE = [
  { value: 0,  label: '0 % (steuerfrei / Reverse Charge)' },
  { value: 10, label: '10 % (ermäßigt)' },
  { value: 13, label: '13 % (ermäßigt)' },
  { value: 20, label: '20 % (Normalsteuersatz)' },
] as const

export const GUELTIGE_UST_SAETZE: number[] = [0, 10, 13, 20]

export const INTERVALLE = [
  { value: 'monatlich',        label: 'Monatlich' },
  { value: 'vierteljaehrlich', label: 'Vierteljährlich' },
  { value: 'halbjaehrlich',    label: 'Halbjährlich' },
  { value: 'jaehrlich',        label: 'Jährlich' },
] as const

export function intervallLabel(v: string | null | undefined): string {
  return INTERVALLE.find(i => i.value === v)?.label ?? v ?? '–'
}

export const KONTO_TYPEN = [
  { value: 'giro',        label: 'Girokonto' },
  { value: 'kreditkarte', label: 'Kreditkarte' },
  { value: 'kassa',       label: 'Kassa' },
  { value: 'sonstiges',   label: 'Sonstiges' },
] as const

export function kontoTypLabel(v: string | null | undefined): string {
  return KONTO_TYPEN.find(t => t.value === v)?.label ?? v ?? '–'
}

export const IMPORT_QUELLEN: Record<string, string> = {
  manuell:      'Manuell',
  csv:          'CSV-Import',
  beleg:        'Beleg',
  dauerauftrag: 'Dauerauftrag',
}

export function typLabel(typ: string | null | undefined): string {
  if (typ === 'einnahme') return 'Einnahme'
  if (typ === 'ausgabe')  return 'Ausgabe'
  if (typ === 'beides')   return 'Beides'
  return typ ?? '–'
}

/** Pill-Klassen je Buchungs-/Kategorietyp */
export function typPillKlasse(typ: string | null | undefined): string {
  if (typ === 'einnahme') return 'pill bg-hs-ok-bg text-hs-ok-fg'
  if (typ === 'ausgabe')  return 'pill bg-hs-bg text-hs-text-1 border border-hs-line'
  return 'pill bg-hs-blue-50 text-hs-blue-700'
}

/** Betragsfarbe: Einnahmen grün, Ausgaben neutral */
export function betragKlasse(typ: string | null | undefined): string {
  return typ === 'einnahme' ? 'text-hs-ok-fg' : 'text-hs-text'
}

/** Kaufmännisch runden auf 2 Nachkommastellen (Fließkomma-sicher) */
export function rund2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Brutto → Netto: netto = round(brutto / (1 + ust/100), 2) */
export function bruttoZuNetto(brutto: number, ustSatz: number): number {
  return rund2(brutto / (1 + ustSatz / 100))
}

/** Netto → Brutto (Spiegel der GENERATED-Spalte in ea_transaktionen) */
export function nettoZuBrutto(netto: number, ustSatz: number): number {
  return rund2(netto + rund2(netto * ustSatz / 100))
}

/** USt-Betrag aus Netto (Spiegel der GENERATED-Spalte) */
export function ustBetrag(netto: number, ustSatz: number): number {
  return rund2(netto * ustSatz / 100)
}

/** Betrags-Eingabe „1.234,56" oder „1234.56" → Zahl (NaN bei Unsinn) */
export function parseBetrag(s: string | null | undefined): number {
  if (s == null) return NaN
  let t = String(s).trim().replace(/\s/g, '').replace('€', '')
  if (!t) return NaN
  // Sowohl Punkt als auch Komma vorhanden → letztes Trennzeichen ist Dezimaltrenner
  if (t.includes(',') && t.includes('.')) {
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.')
    else t = t.replace(/,/g, '')
  } else if (t.includes(',')) {
    t = t.replace(',', '.')
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

/** UVA-Perioden eines Jahres je Modus: 'Q1'…'Q4' oder '01'…'12' */
export function uvaPerioden(modus: UvaZeitraumModus): string[] {
  return modus === 'monatlich'
    ? Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
    : ['Q1', 'Q2', 'Q3', 'Q4']
}

/** Lesbare Periodenbezeichnung: „Q1 2026" bzw. „Jänner 2026" */
export function uvaPeriodeLabel(zeitraum: string, jahr: number, monatsnamen: readonly string[]): string {
  if (zeitraum.startsWith('Q')) return `${zeitraum} ${jahr}`
  const idx = parseInt(zeitraum, 10) - 1
  return `${monatsnamen[idx] ?? zeitraum} ${jahr}`
}

/** Aktuelle UVA-Periode (heute) im gewählten Modus */
export function aktuellePeriode(modus: UvaZeitraumModus, d = new Date()): string {
  const m = d.getMonth() + 1
  return modus === 'monatlich' ? String(m).padStart(2, '0') : `Q${Math.ceil(m / 3)}`
}

// ── Zeilen-Typen (Auszug, wie sie in den Seiten verwendet werden) ─────────────

export type KategorieOption = {
  id: string
  name: string
  typ: KategorieTyp
  konto_nr: number | null
  ust_satz_std: number
  abzugsfaehig_pct: number
  aktiv: boolean
  sortierung: number
}

export type KontoOption = { id: string; name: string }
export type FirmaOption = { id: string; name: string }

/** Eingabewerte des Buchungsformulars (Server Action) */
export type BuchungInput = {
  typ: BuchungTyp
  datum: string
  beschreibung: string
  kategorie_id: string | null
  betrag_netto: number
  ust_satz: number
  abzugsfaehig_pct: number
  konto_id: string | null
  firma_id: string | null
  belegnummer: string | null
  notizen: string | null
}
