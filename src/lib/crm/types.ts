// ── Segment-Definitionen (Enum kundensegment in der DB) ───────────────────────

export const SEGMENTE = [
  { value: 'weinbau',     label: 'Weinbau',      farbe: 'bg-hs-blue-50 text-hs-blue-700' },
  { value: 'gastronomie', label: 'Gastronomie',  farbe: 'bg-orange-50 text-orange-800' },
  { value: 'handel',      label: 'Handel',       farbe: 'bg-purple-50 text-purple-800' },
  { value: 'beratung',    label: 'Beratung',     farbe: 'bg-hs-ok-bg text-hs-ok-fg' },
  { value: 'partner',     label: 'Partner',      farbe: 'bg-teal-50 text-teal-800' },
  { value: 'lieferant',   label: 'Lieferant',    farbe: 'bg-hs-warn-bg text-hs-warn-fg' },
  { value: 'sonstiges',   label: 'Sonstiges',    farbe: 'bg-gray-100 text-gray-700' },
] as const

export type Kundensegment = (typeof SEGMENTE)[number]['value']

export function segmentLabel(value: string | null | undefined): string {
  return SEGMENTE.find(s => s.value === value)?.label ?? value ?? '–'
}

export function segmentFarbe(value: string | null | undefined): string {
  return SEGMENTE.find(s => s.value === value)?.farbe ?? 'bg-gray-100 text-gray-600'
}

// ── Betriebsstandorte & Regionen (ÖWM-Logik, Textfelder auf firmen) ───────────
// Betriebsstandort = generisches Weinbaugebiet; Region = Gebiet innerhalb davon
// (im Bergland: das Bundesland). Freitext in der DB – die Listen sind Vorschläge.

export const BETRIEBSSTANDORTE: { value: string; regionen: string[] }[] = [
  { value: 'Niederösterreich', regionen: ['Carnuntum', 'Kamptal', 'Kremstal', 'Thermenregion', 'Traisental', 'Wachau', 'Wagram', 'Weinviertel'] },
  { value: 'Burgenland',       regionen: ['Eisenberg', 'Leithaberg', 'Mittelburgenland', 'Neusiedlersee', 'Rosalia', 'Ruster Ausbruch', 'Südburgenland'] },
  { value: 'Steiermark',       regionen: ['Südsteiermark', 'Vulkanland Steiermark', 'Weststeiermark'] },
  { value: 'Wien',             regionen: ['Wien'] },
  { value: 'Bergland',         regionen: ['Kärnten', 'Oberösterreich', 'Salzburg', 'Tirol', 'Vorarlberg'] },
]

export function regionenFuer(betriebsstandort: string | null | undefined): string[] {
  return BETRIEBSSTANDORTE.find(b => b.value === betriebsstandort)?.regionen ?? []
}

// ── Pipeline-Stufen (Enum pipeline_stufe) ─────────────────────────────────────

export const PIPELINE_STUFEN = [
  { value: 'interessent',   label: 'Interessent',   farbe: 'bg-gray-100 text-gray-700' },
  { value: 'kontaktiert',   label: 'Kontaktiert',   farbe: 'bg-hs-blue-50 text-hs-blue-700' },
  { value: 'demo',          label: 'Demo',          farbe: 'bg-purple-50 text-purple-700' },
  { value: 'angebot',       label: 'Angebot',       farbe: 'bg-hs-warn-bg text-hs-warn-fg' },
  { value: 'verhandlung',   label: 'Verhandlung',   farbe: 'bg-orange-50 text-orange-700' },
  { value: 'abschluss',     label: 'Abschluss',     farbe: 'bg-hs-ok-bg text-hs-ok-fg' },
  { value: 'bestandskunde', label: 'Bestandskunde', farbe: 'bg-teal-50 text-teal-700' },
  { value: 'verloren',      label: 'Verloren',      farbe: 'bg-hs-err-bg text-hs-err-fg' },
] as const

export type PipelineStufe = (typeof PIPELINE_STUFEN)[number]['value']

// ── Pipeline-Kategorien (Textfeld) ────────────────────────────────────────────

export const PIPELINE_KATEGORIEN = [
  { value: 'software112', label: 'software:112' },
  { value: 'beratung',    label: 'Beratung' },
  { value: 'projekt',     label: 'Projekt / Implementierung' },
  { value: 'schulung',    label: 'Schulung / Workshop' },
  { value: 'sonstiges',   label: 'Sonstiges' },
] as const

// ── Aktivitäts-Arten (Check-Constraint aktivitaeten.art) ──────────────────────

export const AKTIVITAET_ARTEN = [
  { value: 'notiz',       label: 'Notiz', nurAnzeige: true },
  { value: 'email',       label: 'E-Mail', nurAnzeige: true },
  { value: 'anruf',       label: 'Anruf' },
  { value: 'aufgabe',     label: 'Aufgabe' },
  { value: 'besprechung', label: 'Besprechung' },
  { value: 'demo',        label: 'Demo' },
  { value: 'messe',       label: 'Messe' },
  { value: 'besuch',      label: 'Besuch' },
  { value: 'angebot',     label: 'Angebot' },
  { value: 'sonstiges',   label: 'Sonstiges' },
  { value: 'urlaub',      label: 'Urlaub' },
  { value: 'abwesenheit', label: 'Abwesenheit' },
] as const

export type AktivitaetArt = (typeof AKTIVITAET_ARTEN)[number]['value']

export function aktivitaetLabel(value: string | null | undefined): string {
  return AKTIVITAET_ARTEN.find(a => a.value === value)?.label ?? value ?? '–'
}

// ── Basis-Typen ───────────────────────────────────────────────────────────────

export type KontaktRow = {
  id: string
  kundennummer: string | null
  vorname: string | null
  nachname: string
  segment: Kundensegment
  firma_id: string | null
  firma_name?: string | null
  position: string | null
  email: string | null
  telefon_vorwahl: string | null
  telefon: string | null
  mobil_vorwahl: string | null
  mobil: string | null
  strasse: string | null
  plz: string | null
  ort: string | null
  land: string | null
  geburtsdatum: string | null
  sprache: string | null
  ansprechpartner_intern: string | null
  is_lead: boolean
  notizen: string | null
  aktiv: boolean
  erstellt_am: string
}

export type FirmaRow = {
  id: string
  kundennummer: string | null
  name: string
  segment: Kundensegment
  strasse: string | null
  plz: string | null
  ort: string | null
  land: string | null
  betriebsstandort: string | null
  region: string | null
  telefon_vorwahl: string | null
  telefon: string | null
  email: string | null
  website: string | null
  uid_nummer: string | null
  zahlungsziel_tage: number
  is_lead: boolean
  ist_kunde: boolean
  ist_lieferant: boolean
  quelle: string | null
  /** Team-Mitglied (auth.users-ID), das den Lead/Kunden betreut – Migration 013 */
  account_manager: string | null
  notizen: string | null
  aktiv: boolean
  erstellt_am: string
}

export type AktivitaetRow = {
  id: string
  kontakt_id: string | null
  firma_id: string | null
  art: AktivitaetArt
  betreff: string | null
  beschreibung: string | null
  datum: string
  bis_datum: string | null
  ganztags: boolean
  uhrzeit_von: string | null
  uhrzeit_bis: string | null
  erledigt: boolean
  faellig_am: string | null
  ist_privat: boolean
  erstellt_von: string | null
  erstellt_am: string
  kontakt_name?: string | null
  firma_name?: string | null
}

export type PipelineRow = {
  id: string
  kontakt_id: string | null
  firma_id: string | null
  stufe: PipelineStufe
  titel: string
  kategorie: string | null
  wert_euro: number | null
  wahrscheinlichkeit: number | null
  erwartetes_datum: string | null
  ganztags: boolean | null
  uhrzeit_von: string | null
  uhrzeit_bis: string | null
  erledigt: boolean
  erledigt_am: string | null
  notizen: string | null
  erstellt_am: string
  aktualisiert_am: string
  kontakt_name?: string | null
  firma_name?: string | null
}

/** Vollständiger Anzeigename eines Kontakts */
export function kontaktName(k: { vorname?: string | null; nachname: string } | null | undefined): string {
  if (!k) return '–'
  return [k.vorname, k.nachname].filter(Boolean).join(' ')
}
