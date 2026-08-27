// ── Aufgaben: Konstanten und Typen (client-tauglich, keine Server-Imports) ────
// Spalten lt. Migration 004_aufgaben_email.sql

export const AUFGABE_STATUS = [
  { value: 'offen',     label: 'Offen',     pill: 'bg-hs-blue-50 text-hs-blue-700' },
  { value: 'in_arbeit', label: 'In Arbeit', pill: 'bg-hs-warn-bg text-hs-warn-fg' },
  { value: 'erledigt',  label: 'Erledigt',  pill: 'bg-hs-ok-bg text-hs-ok-fg' },
] as const
export type AufgabeStatus = (typeof AUFGABE_STATUS)[number]['value']

export const AUFGABE_PRIORITAET = [
  { value: 'niedrig', label: 'Niedrig', punkt: 'bg-hs-line-str' },
  { value: 'normal',  label: 'Normal',  punkt: 'bg-hs-blue-300' },
  { value: 'hoch',    label: 'Hoch',    punkt: 'bg-hs-err' },
] as const
export type AufgabePrioritaet = (typeof AUFGABE_PRIORITAET)[number]['value']

export const AUFGABE_BEREICHE = [
  { value: 'crm',       label: 'CRM' },
  { value: 'ea',        label: 'E&A-Rechnung' },
  { value: 'demo',      label: 'Demo' },
  { value: 'intern',    label: 'Intern' },
  { value: 'sonstiges', label: 'Sonstiges' },
] as const
export type AufgabeBereich = (typeof AUFGABE_BEREICHE)[number]['value']

export function statusLabel(v: string | null | undefined): string {
  return AUFGABE_STATUS.find(s => s.value === v)?.label ?? v ?? '–'
}
export function statusPill(v: string | null | undefined): string {
  return AUFGABE_STATUS.find(s => s.value === v)?.pill ?? 'bg-hs-bg text-hs-text-1'
}
export function prioritaetPunkt(v: string | null | undefined): string {
  return AUFGABE_PRIORITAET.find(p => p.value === v)?.punkt ?? 'bg-hs-line-str'
}
export function prioritaetLabel(v: string | null | undefined): string {
  return AUFGABE_PRIORITAET.find(p => p.value === v)?.label ?? v ?? '–'
}
export function bereichLabel(v: string | null | undefined): string {
  return AUFGABE_BEREICHE.find(b => b.value === v)?.label ?? v ?? '–'
}

export type AufgabeRow = {
  id: string
  titel: string
  beschreibung: string | null
  status: AufgabeStatus
  prioritaet: AufgabePrioritaet
  verantwortlich_id: string | null
  faellig_am: string | null
  kontakt_id: string | null
  firma_id: string | null
  bereich: AufgabeBereich | null
  erledigt_am: string | null
  erstellt_von: string | null
  erstellt_am: string
  aktualisiert_am: string
  /** aus Join: kontakte(vorname, nachname) */
  kontakt_name?: string | null
  /** aus Join: firmen(name) */
  firma_name?: string | null
}

/** Mandantenmitglied zur Auswahl als Verantwortliche/r – bewusst ohne E-Mail */
export type MitgliedOption = { id: string; name: string }

export type Faelligkeit = 'ueberfaellig' | 'heute' | 'bald' | 'spaeter' | 'keine'

/** Fälligkeitsstatus relativ zu heute (ISO-Datum) */
export function faelligkeit(faelligAm: string | null | undefined, status: string, heuteIso: string): Faelligkeit {
  if (!faelligAm || status === 'erledigt') return 'keine'
  if (faelligAm < heuteIso) return 'ueberfaellig'
  if (faelligAm === heuteIso) return 'heute'
  const in3 = new Date(heuteIso + 'T00:00:00'); in3.setDate(in3.getDate() + 3)
  const in3Iso = `${in3.getFullYear()}-${String(in3.getMonth() + 1).padStart(2, '0')}-${String(in3.getDate()).padStart(2, '0')}`
  return faelligAm <= in3Iso ? 'bald' : 'spaeter'
}

export function faelligkeitKlasse(f: Faelligkeit): string {
  switch (f) {
    case 'ueberfaellig': return 'text-hs-err-fg font-semibold'
    case 'heute':        return 'text-hs-warn-fg font-semibold'
    case 'bald':         return 'text-hs-text-1'
    default:             return 'text-hs-text-2'
  }
}
