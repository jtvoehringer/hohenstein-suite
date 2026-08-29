// Kleine Client-Helfer für das CRM-Modul (keine Server-Imports!)

export const LAENDER = [
  { code: 'AT', label: 'Österreich' },
  { code: 'DE', label: 'Deutschland' },
  { code: 'CH', label: 'Schweiz' },
  { code: 'IT', label: 'Italien' },
  { code: 'SI', label: 'Slowenien' },
  { code: 'HU', label: 'Ungarn' },
  { code: 'SK', label: 'Slowakei' },
  { code: 'CZ', label: 'Tschechien' },
  { code: 'FR', label: 'Frankreich' },
  { code: 'NL', label: 'Niederlande' },
  { code: 'GB', label: 'Großbritannien' },
  { code: 'US', label: 'USA' },
]

export const VORWAHLEN = [
  { code: '+43',  iso: 'AT' },
  { code: '+49',  iso: 'DE' },
  { code: '+41',  iso: 'CH' },
  { code: '+423', iso: 'LI' },
  { code: '+39',  iso: 'IT' },
  { code: '+386', iso: 'SI' },
  { code: '+36',  iso: 'HU' },
  { code: '+421', iso: 'SK' },
  { code: '+420', iso: 'CZ' },
  { code: '+33',  iso: 'FR' },
  { code: '+31',  iso: 'NL' },
  { code: '+44',  iso: 'GB' },
  { code: '+1',   iso: 'US' },
]

export const SPRACHEN = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'Englisch' },
  { code: 'it', label: 'Italienisch' },
  { code: 'fr', label: 'Französisch' },
  { code: 'hu', label: 'Ungarisch' },
  { code: 'sl', label: 'Slowenisch' },
]

/** "14:30:00" → "14:30" */
export function fmtUhrzeit(t: string | null | undefined): string | null {
  if (!t) return null
  return t.slice(0, 5)
}

/** Vorwahl + Nummer als Anzeige ("+43 664 1234567") */
export function fmtTelefon(vorwahl: string | null | undefined, nummer: string | null | undefined): string | null {
  if (!nummer) return null
  // Nummern mit eigener Landesvorwahl (+43 …, 0043 …) nicht doppelt präfixen
  const n = nummer.trim()
  if (n.startsWith('+') || n.startsWith('00')) return n
  return `${vorwahl ?? '+43'} ${n}`.trim()
}

/** tel:-Link ohne Leerzeichen */
export function telHref(vorwahl: string | null | undefined, nummer: string | null | undefined): string {
  const n = (nummer ?? '').trim()
  if (n.startsWith('+')) return `tel:+${n.replace(/[^\d]/g, '')}`
  if (n.startsWith('00')) return `tel:${n.replace(/[^\d]/g, '')}`
  return `tel:${(vorwahl ?? '+43')}${n.replace(/[^\d]/g, '')}`
}

export function fmtBytes(n: number | null | undefined): string {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Adresse als Google-Maps-Suchlink */
export function mapsHref(parts: (string | null | undefined)[]): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.filter(Boolean).join(', '))}`
}

// ── Typen für Detailseiten ────────────────────────────────────────────────────

export type DokumentRow = {
  id: string
  dateiname: string
  dateityp: string
  groesse_bytes: number | null
  erstellt_am: string
}

export type AktivitaetMitDokumenten = {
  id: string
  kontakt_id: string | null
  firma_id: string | null
  art: string
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
  email_von: string | null
  email_von_name: string | null
  email_an: string | null
  email_body: string | null
  kontakt_name?: string | null
  firma_name?: string | null
  dokumente: DokumentRow[]
}

export type PipelineKurz = {
  id: string
  stufe: string
  titel: string
  kategorie: string | null
  wert_euro: number | null
  wahrscheinlichkeit: number | null
  erwartetes_datum: string | null
  erledigt: boolean
}
