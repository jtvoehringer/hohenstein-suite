// ── Fakturierung: Konstanten, Typen und Hilfsfunktionen ──────────────────────
// Bewusst ohne Server-Imports (client-tauglich). Spaltennamen lt.
// supabase/migrations/008_fakturierung.sql.

export type Belegart = 'angebot' | 'rechnung' | 'gutschrift'
export type UstModus = 'normal' | 'reverse_charge' | 'kleinunternehmer'
export type BelegStatus =
  | 'entwurf' | 'gesendet' | 'angenommen' | 'abgelehnt'
  | 'gestellt' | 'teilbezahlt' | 'bezahlt' | 'storniert' | 'verrechnet'
export type ZahlungArt = 'bank' | 'bar' | 'karte' | 'sonstig'

export const BELEGARTEN: { value: Belegart; label: string; plural: string }[] = [
  { value: 'angebot',    label: 'Angebot',    plural: 'Angebote' },
  { value: 'rechnung',   label: 'Rechnung',   plural: 'Rechnungen' },
  { value: 'gutschrift', label: 'Gutschrift', plural: 'Gutschriften' },
]

export function belegartLabel(a: string | null | undefined): string {
  return BELEGARTEN.find(b => b.value === a)?.label ?? a ?? '–'
}

export const EINHEITEN = ['Tag', 'Stunde', 'Monat', 'Jahr', 'Stück', 'pauschal'] as const
export type Einheit = (typeof EINHEITEN)[number]

export const UST_SAETZE_FAKT = [
  { value: 20, label: '20 %' },
  { value: 13, label: '13 %' },
  { value: 10, label: '10 %' },
  { value: 0,  label: '0 %' },
] as const
export const GUELTIGE_UST_SAETZE_FAKT: number[] = [0, 10, 13, 20]

export const UST_MODI: { value: UstModus; label: string; hinweis: string }[] = [
  { value: 'normal',           label: 'Normal (USt ausweisen)',       hinweis: '' },
  { value: 'reverse_charge',   label: 'Reverse Charge (EU-Ausland)',  hinweis: 'Steuerschuldnerschaft des Leistungsempfängers gemäß Art. 196 MwStSystRL / § 19 UStG. Der Rechnungsbetrag enthält keine Umsatzsteuer.' },
  { value: 'kleinunternehmer', label: 'Kleinunternehmer (§ 6 Abs. 1 Z 27 UStG)', hinweis: 'Umsatzsteuerbefreit gemäß § 6 Abs. 1 Z 27 UStG (Kleinunternehmerregelung).' },
]

export function ustModusHinweis(m: string | null | undefined): string {
  return UST_MODI.find(x => x.value === m)?.hinweis ?? ''
}

export const ZAHLUNG_ARTEN: { value: ZahlungArt; label: string }[] = [
  { value: 'bank',    label: 'Überweisung' },
  { value: 'bar',     label: 'Bar' },
  { value: 'karte',   label: 'Karte' },
  { value: 'sonstig', label: 'Sonstig' },
]

export function zahlungArtLabel(a: string | null | undefined): string {
  return ZAHLUNG_ARTEN.find(x => x.value === a)?.label ?? a ?? '–'
}

// ── Status ────────────────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<BelegStatus, string> = {
  entwurf:     'Entwurf',
  gesendet:    'Gesendet',
  angenommen:  'Angenommen',
  abgelehnt:   'Abgelehnt',
  gestellt:    'Gestellt',
  teilbezahlt: 'Teilbezahlt',
  bezahlt:     'Bezahlt',
  storniert:   'Storniert',
  verrechnet:  'Verrechnet',
}

export function statusLabel(s: string | null | undefined): string {
  return (STATUS_LABELS as Record<string, string>)[s ?? ''] ?? s ?? '–'
}

/** Pill-Klassen: entwurf grau, gestellt blau, teilbezahlt warn, bezahlt ok, storniert err, überfällig err */
export function statusPillKlasse(s: string | null | undefined, ueberfaellig = false): string {
  if (ueberfaellig) return 'pill bg-hs-err-bg text-hs-err-fg'
  switch (s) {
    case 'gestellt':
    case 'gesendet':    return 'pill bg-hs-blue-50 text-hs-blue-700'
    case 'teilbezahlt': return 'pill bg-hs-warn-bg text-hs-warn-fg'
    case 'bezahlt':
    case 'angenommen':
    case 'verrechnet':  return 'pill bg-hs-ok-bg text-hs-ok-fg'
    case 'storniert':
    case 'abgelehnt':   return 'pill bg-hs-err-bg text-hs-err-fg'
    default:            return 'pill bg-hs-bg text-hs-text-1 border border-hs-line'
  }
}

/** Zulässige Status je Belegart (für Filter/Validierung) */
export const STATUS_JE_ART: Record<Belegart, BelegStatus[]> = {
  angebot:    ['entwurf', 'gesendet', 'angenommen', 'abgelehnt'],
  rechnung:   ['entwurf', 'gestellt', 'teilbezahlt', 'bezahlt', 'storniert'],
  gutschrift: ['entwurf', 'gestellt', 'verrechnet'],
}

/** Rechnung ist offen (gestellt/teilbezahlt) und Fälligkeit überschritten? */
export function istUeberfaellig(b: { belegart: string; status: string; faellig_am: string | null }, heuteIso: string): boolean {
  return b.belegart === 'rechnung' && (b.status === 'gestellt' || b.status === 'teilbezahlt')
    && !!b.faellig_am && b.faellig_am < heuteIso
}

/** Tage zwischen zwei ISO-Daten (bis − von) */
export function tageDifferenz(vonIso: string, bisIso: string): number {
  const a = new Date(vonIso + 'T00:00:00').getTime()
  const b = new Date(bisIso + 'T00:00:00').getTime()
  return Math.round((b - a) / 86_400_000)
}

/** Rein informative Mahnstufe nach Tagen überfällig */
export function mahnstufe(tageUeberfaellig: number): { stufe: number; label: string } {
  if (tageUeberfaellig <= 0)  return { stufe: 0, label: 'fällig' }
  if (tageUeberfaellig <= 14) return { stufe: 1, label: 'Zahlungserinnerung' }
  if (tageUeberfaellig <= 30) return { stufe: 2, label: '1. Mahnung' }
  if (tageUeberfaellig <= 60) return { stufe: 3, label: '2. Mahnung' }
  return { stufe: 4, label: 'Inkasso prüfen' }
}

/** ISO-Datum + n Tage */
export function datumPlusTage(iso: string, tage: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + tage)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Row-Typen ─────────────────────────────────────────────────────────────────

export type LeistungRow = {
  id: string
  bezeichnung: string
  beschreibung: string | null
  einheit: string
  preis_netto: number
  ust_satz: number
  ea_kategorie_id: string | null
  aktiv: boolean
  sortierung: number
}

export type PositionRow = {
  id?: string
  pos: number
  leistung_id: string | null
  bezeichnung: string
  beschreibung: string | null
  menge: number
  einheit: string
  einzelpreis_netto: number
  rabatt_pct: number
  ust_satz: number
}

export type BelegRow = {
  id: string
  belegart: Belegart
  nummer: string | null
  status: BelegStatus
  firma_id: string | null
  kontakt_id: string | null
  empf_name: string
  empf_zusatz: string | null
  empf_strasse: string | null
  empf_plz: string | null
  empf_ort: string | null
  empf_land: string | null
  empf_uid: string | null
  empf_email: string | null
  datum: string
  leistung_von: string | null
  leistung_bis: string | null
  faellig_am: string | null
  zahlungsziel_tage: number
  ust_modus: UstModus
  einleitung: string | null
  schlusstext: string | null
  interne_notiz: string | null
  summe_netto: number
  summe_ust: number
  summe_brutto: number
  bezahlt_betrag: number
  bezahlt_am: string | null
  storniert_am: string | null
  storno_grund: string | null
  quelle_beleg_id: string | null
  gesendet_am: string | null
  gesendet_an: string | null
  ea_kategorie_id: string | null
  erstellt_am: string
  aktualisiert_am: string
}

export type ZahlungRow = {
  id: string
  datum: string
  betrag: number
  art: ZahlungArt
  konto_id: string | null
  konto_name?: string | null
  ea_transaktion_id: string | null
  notizen: string | null
}

/** Eingabe des Beleg-Formulars (Server Action speichereBeleg) */
export type BelegInput = {
  belegart: Belegart
  firma_id: string | null
  kontakt_id: string | null
  empf_name: string
  empf_zusatz: string | null
  empf_strasse: string | null
  empf_plz: string | null
  empf_ort: string | null
  empf_land: string | null
  empf_uid: string | null
  empf_email: string | null
  datum: string
  leistung_von: string | null
  leistung_bis: string | null
  zahlungsziel_tage: number
  ust_modus: UstModus
  einleitung: string | null
  schlusstext: string | null
  interne_notiz: string | null
  ea_kategorie_id: string | null
  quelle_beleg_id?: string | null
  positionen: PositionRow[]
}

export type LeistungInput = {
  bezeichnung: string
  beschreibung: string | null
  einheit: string
  preis_netto: number
  ust_satz: number
  ea_kategorie_id: string | null
  aktiv: boolean
  sortierung: number
}

export type ZahlungInput = {
  datum: string
  betrag: number
  art: ZahlungArt
  konto_id: string | null
  notizen: string | null
}

/** Firmendaten des Mandanten (tenant_einstellungen) für Vorschau/PDF */
export type Absender = {
  name: string
  strasse: string | null
  plz: string | null
  ort: string | null
  telefon: string | null
  email: string | null
  website: string | null
  uid: string | null
  steuernummer: string | null
  iban: string | null
  bic: string | null
  logo_url: string | null
  fusstext: string | null
}

/** Empfänger als Zeilen für Anschriftblock */
export function empfaengerZeilen(b: Pick<BelegRow, 'empf_name' | 'empf_zusatz' | 'empf_strasse' | 'empf_plz' | 'empf_ort' | 'empf_land'>): string[] {
  const zeilen = [b.empf_name, b.empf_zusatz, b.empf_strasse, [b.empf_plz, b.empf_ort].filter(Boolean).join(' ')]
  if (b.empf_land && b.empf_land !== 'AT') zeilen.push(landName(b.empf_land))
  return zeilen.filter((z): z is string => !!z && z.trim() !== '')
}

const LAENDER: Record<string, string> = {
  AT: 'Österreich', DE: 'Deutschland', CH: 'Schweiz', IT: 'Italien', SI: 'Slowenien', HU: 'Ungarn',
  CZ: 'Tschechien', SK: 'Slowakei', FR: 'Frankreich', NL: 'Niederlande', BE: 'Belgien', LU: 'Luxemburg',
  PL: 'Polen', HR: 'Kroatien', ES: 'Spanien', PT: 'Portugal', DK: 'Dänemark', SE: 'Schweden', FI: 'Finnland',
  IE: 'Irland', GB: 'Vereinigtes Königreich', LI: 'Liechtenstein',
}
export function landName(code: string | null | undefined): string {
  if (!code) return ''
  return LAENDER[code.toUpperCase()] ?? code
}
