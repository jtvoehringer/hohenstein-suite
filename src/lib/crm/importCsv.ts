// ── CSV-Import (Kontakte, Firmen): Parser, Spaltenzuordnung, Validierung ──────
// Bewusst frei von Server-Imports – wird im Browser (Vorschau/Zuordnung) und in
// den Server Actions (Validierung) verwendet. Excel-Österreich-Exporte kommen
// typischerweise mit Semikolon und Windows-1252 – beides wird erkannt.

import { SEGMENTE } from './types'

export type ImportTyp = 'firmen' | 'kontakte'

// ── CSV lesen ─────────────────────────────────────────────────────────────────

/** Datei-Bytes dekodieren: UTF-8, bei Ersatzzeichen (�) Fallback Windows-1252 */
export function dekodiere(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  if (!utf8.includes('�')) return utf8.replace(/^\uFEFF/, '')
  try { return new TextDecoder('windows-1252').decode(buf) } catch { return utf8.replace(/^\uFEFF/, '') }
}

/** Trennzeichen erraten: Semikolon (AT-Excel), Komma oder Tabulator */
export function erkenneTrenner(kopfzeile: string): ';' | ',' | '\t' {
  const zaehle = (t: string) => kopfzeile.split(t).length - 1
  const s = zaehle(';'), k = zaehle(','), t = zaehle('\t')
  if (t > s && t > k) return '\t'
  return s >= k ? ';' : ','
}

/** Einfacher, robuster CSV-Parser (Anführungszeichen, "" als Escape, \r\n) */
export function parseCsv(text: string, trenner?: string): string[][] {
  const erste = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'))
  const t = trenner ?? erkenneTrenner(erste)
  const zeilen: string[][] = []
  let feld = '', zeile: string[] = [], inQuote = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') { feld += '"'; i++ } else inQuote = false
      } else feld += c
    } else if (c === '"') {
      inQuote = true
    } else if (c === t) {
      zeile.push(feld); feld = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      zeile.push(feld); feld = ''
      if (zeile.some(z => z.trim() !== '')) zeilen.push(zeile)
      zeile = []
    } else feld += c
  }
  zeile.push(feld)
  if (zeile.some(z => z.trim() !== '')) zeilen.push(zeile)
  return zeilen
}

// ── Felddefinitionen ──────────────────────────────────────────────────────────

export type FeldDef = {
  key: string
  label: string
  pflicht?: boolean
  /** Synonyme für die automatische Spaltenzuordnung (kleingeschrieben) */
  synonyme: string[]
  hinweis?: string
  beispiel: string
}

export const FIRMEN_FELDER: FeldDef[] = [
  { key: 'name',              label: 'Firmenname',        pflicht: true, synonyme: ['name', 'firma', 'firmenname', 'unternehmen', 'betrieb', 'company'], beispiel: 'Weingut Beispielhof GmbH' },
  { key: 'segment',           label: 'Segment',           synonyme: ['segment', 'kategorie', 'branche', 'typ'], hinweis: 'Weinbau, Gastronomie, Handel, Beratung, Partner, Lieferant, Sonstiges', beispiel: 'Weinbau' },
  { key: 'strasse',           label: 'Straße',            synonyme: ['strasse', 'straße', 'adresse', 'anschrift', 'street'], beispiel: 'Kellergasse 12' },
  { key: 'plz',               label: 'PLZ',               synonyme: ['plz', 'postleitzahl', 'zip'], beispiel: '3500' },
  { key: 'ort',               label: 'Ort',               synonyme: ['ort', 'stadt', 'gemeinde', 'city'], beispiel: 'Krems an der Donau' },
  { key: 'land',              label: 'Land',              synonyme: ['land', 'country', 'staat'], hinweis: 'AT, DE, CH … oder ausgeschrieben', beispiel: 'AT' },
  { key: 'betriebsstandort',  label: 'Betriebsstandort',  synonyme: ['betriebsstandort', 'weinbaugebiet', 'standort', 'gebiet'], hinweis: 'Niederösterreich, Burgenland, Steiermark, Wien, Bergland', beispiel: 'Niederösterreich' },
  { key: 'region',            label: 'Region',            synonyme: ['region', 'anbaugebiet', 'weinbauregion'], hinweis: 'z. B. Kamptal – im Bergland das Bundesland', beispiel: 'Kremstal' },
  { key: 'telefon',           label: 'Telefon',           synonyme: ['telefon', 'tel', 'telefonnummer', 'phone', 'festnetz'], beispiel: '+43 2732 12345' },
  { key: 'email',             label: 'E-Mail',            synonyme: ['email', 'e-mail', 'mail', 'emailadresse', 'e-mail-adresse'], beispiel: 'office@beispielhof.at' },
  { key: 'website',           label: 'Website',           synonyme: ['website', 'web', 'homepage', 'url'], beispiel: 'beispielhof.at' },
  { key: 'uid_nummer',        label: 'UID-Nummer',        synonyme: ['uid_nummer', 'uid', 'uid-nummer', 'ust-id', 'ust-idnr', 'vat'], beispiel: 'ATU12345678' },
  { key: 'zahlungsziel_tage', label: 'Zahlungsziel (Tage)', synonyme: ['zahlungsziel_tage', 'zahlungsziel', 'zahlungsziel (tage)'], beispiel: '14' },
  { key: 'ist_kunde',         label: 'Ist Kunde',         synonyme: ['ist_kunde', 'kunde'], hinweis: 'ja/nein – leer = ja', beispiel: 'ja' },
  { key: 'ist_lieferant',     label: 'Ist Lieferant',     synonyme: ['ist_lieferant', 'lieferant'], hinweis: 'ja/nein – leer = nein', beispiel: 'nein' },
  { key: 'is_lead',           label: 'Lead',              synonyme: ['is_lead', 'lead', 'interessent'], hinweis: 'ja/nein – leer = nein', beispiel: 'nein' },
  { key: 'kundennummer',      label: 'Kundennummer',      synonyme: ['kundennummer', 'kunden-nr', 'kundennr', 'kdnr'], hinweis: 'leer = automatisch vergeben', beispiel: '' },
  { key: 'quelle',            label: 'Quelle',            synonyme: ['quelle', 'herkunft', 'source', 'lead-quelle', 'leadquelle'], hinweis: 'leer = „CSV-Import"', beispiel: 'Messe Krems' },
  { key: 'notizen',           label: 'Notizen',           synonyme: ['notizen', 'notiz', 'bemerkung', 'bemerkungen', 'kommentar', 'anmerkung'], beispiel: 'Kontakt über Messe Krems' },
]

export const KONTAKTE_FELDER: FeldDef[] = [
  { key: 'vorname',      label: 'Vorname',            synonyme: ['vorname', 'first name', 'firstname'], beispiel: 'Maria' },
  { key: 'nachname',     label: 'Nachname',           pflicht: true, synonyme: ['nachname', 'name', 'familienname', 'last name', 'lastname', 'zuname'], beispiel: 'Beispiel' },
  { key: 'firma',        label: 'Firma (Name)',       synonyme: ['firma', 'firmenname', 'unternehmen', 'betrieb', 'company'], hinweis: 'wird über den Firmennamen verknüpft', beispiel: 'Weingut Beispielhof GmbH' },
  { key: 'segment',      label: 'Segment',            synonyme: ['segment', 'kategorie', 'branche', 'typ'], hinweis: 'Weinbau, Gastronomie, Handel …', beispiel: 'Weinbau' },
  { key: 'position',     label: 'Position',           synonyme: ['position', 'funktion', 'rolle', 'titel'], beispiel: 'Geschäftsführerin' },
  { key: 'email',        label: 'E-Mail',             synonyme: ['email', 'e-mail', 'mail', 'emailadresse', 'e-mail-adresse'], beispiel: 'maria@beispielhof.at' },
  { key: 'telefon',      label: 'Telefon',            synonyme: ['telefon', 'tel', 'telefonnummer', 'phone', 'festnetz'], beispiel: '+43 2732 12345' },
  { key: 'mobil',        label: 'Mobil',              synonyme: ['mobil', 'handy', 'mobile', 'mobiltelefon'], beispiel: '+43 664 1234567' },
  { key: 'strasse',      label: 'Straße',             synonyme: ['strasse', 'straße', 'adresse', 'anschrift', 'street'], beispiel: 'Kellergasse 12' },
  { key: 'plz',          label: 'PLZ',                synonyme: ['plz', 'postleitzahl', 'zip'], beispiel: '3500' },
  { key: 'ort',          label: 'Ort',                synonyme: ['ort', 'stadt', 'gemeinde', 'city'], beispiel: 'Krems an der Donau' },
  { key: 'land',         label: 'Land',               synonyme: ['land', 'country', 'staat'], beispiel: 'AT' },
  { key: 'geburtsdatum', label: 'Geburtsdatum',       synonyme: ['geburtsdatum', 'geburtstag', 'geb'], hinweis: 'TT.MM.JJJJ oder JJJJ-MM-TT', beispiel: '14.05.1980' },
  { key: 'kundennummer', label: 'Kundennummer',       synonyme: ['kundennummer', 'kunden-nr', 'kundennr', 'kdnr'], hinweis: 'leer = automatisch vergeben', beispiel: '' },
  { key: 'notizen',      label: 'Notizen',            synonyme: ['notizen', 'notiz', 'bemerkung', 'bemerkungen', 'kommentar', 'anmerkung'], beispiel: '' },
]

export function felderFuer(typ: ImportTyp): FeldDef[] {
  return typ === 'firmen' ? FIRMEN_FELDER : KONTAKTE_FELDER
}

/** Kopfzeile finden: manche Exporte haben Titel-/Beschreibungszeilen vor der
 *  eigentlichen Tabelle. Gewinner ist die Zeile (unter den ersten 15), deren
 *  Spalten sich am besten auf bekannte Felder abbilden lassen. */
export function findeKopfzeile(typ: ImportTyp, rows: string[][]): number {
  let best = 0, bestTreffer = -1
  for (let i = 0; i < Math.min(rows.length - 1, 15); i++) {
    const treffer = autoZuordnung(typ, rows[i]).filter(Boolean).length
    if (treffer > bestTreffer) { bestTreffer = treffer; best = i }
  }
  return bestTreffer >= 2 ? best : 0
}

/** Spalten automatisch zuordnen: Kopfzeile → Feld-Key (oder '' = ignorieren) */
export function autoZuordnung(typ: ImportTyp, kopfzeile: string[]): string[] {
  const felder = felderFuer(typ)
  const belegt = new Set<string>()
  return kopfzeile.map(h => {
    const norm = h.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!norm) return ''
    const feld = felder.find(f => !belegt.has(f.key) && (f.key === norm || f.synonyme.includes(norm)))
      ?? felder.find(f => !belegt.has(f.key) && f.synonyme.some(s => norm.startsWith(s) || s.startsWith(norm)) && norm.length >= 3)
    if (!feld) return ''
    belegt.add(feld.key)
    return feld.key
  })
}

// ── Werte normalisieren ───────────────────────────────────────────────────────

const LAND_NAMEN: Record<string, string> = {
  'oesterreich': 'AT', 'österreich': 'AT', 'austria': 'AT',
  'deutschland': 'DE', 'germany': 'DE',
  'schweiz': 'CH', 'switzerland': 'CH',
  'italien': 'IT', 'italy': 'IT',
  'slowakei': 'SK', 'tschechien': 'CZ', 'ungarn': 'HU', 'slowenien': 'SI',
}

export function normLand(v: string): string {
  const s = v.trim()
  if (!s) return 'AT'
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase()
  return LAND_NAMEN[s.toLowerCase()] ?? 'AT'
}

export function normSegment(v: string): { wert: string; unbekannt: boolean } {
  const s = v.trim().toLowerCase()
  if (!s) return { wert: 'weinbau', unbekannt: false }
  const treffer = SEGMENTE.find(x => x.value === s || x.label.toLowerCase() === s)
  return treffer ? { wert: treffer.value, unbekannt: false } : { wert: 'sonstiges', unbekannt: true }
}

export function normBool(v: string, leer: boolean): boolean {
  const s = v.trim().toLowerCase()
  if (!s) return leer
  return ['ja', 'j', 'true', '1', 'x', 'wahr', 'yes', 'y'].includes(s)
}

/** TT.MM.JJJJ oder JJJJ-MM-TT → ISO; sonst null */
export function normDatum(v: string): string | null {
  const s = v.trim()
  if (!s) return null
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Zeile → Datensatz + Prüfung ───────────────────────────────────────────────

export type ImportZeile = {
  /** 1-basierte Zeilennummer in der Datei (inkl. Kopfzeile) */
  zeile: number
  werte: Record<string, string>
  warnungen: string[]
  fehler: string[]
}

export function baueZeilen(typ: ImportTyp, rows: string[][], zuordnung: string[]): ImportZeile[] {
  const ergebnis: ImportZeile[] = []
  for (let i = 1; i < rows.length; i++) {
    const roh = rows[i]
    const werte: Record<string, string> = {}
    zuordnung.forEach((key, idx) => {
      if (!key) return
      const v = (roh[idx] ?? '').trim()
      if (v) werte[key] = v
    })
    const z: ImportZeile = { zeile: i + 1, werte, warnungen: [], fehler: [] }

    if (typ === 'firmen') {
      if (!werte.name) z.fehler.push('Firmenname fehlt')
    } else {
      if (!werte.nachname) z.fehler.push('Nachname fehlt')
    }
    if (werte.email && !EMAIL_RE.test(werte.email)) z.warnungen.push(`E-Mail „${werte.email}" sieht ungültig aus`)
    if (werte.segment) {
      const seg = normSegment(werte.segment)
      if (seg.unbekannt) z.warnungen.push(`Segment „${werte.segment}" unbekannt → Sonstiges`)
    }
    if (werte.geburtsdatum && !normDatum(werte.geburtsdatum)) z.warnungen.push(`Geburtsdatum „${werte.geburtsdatum}" nicht lesbar – wird ausgelassen`)
    if (werte.zahlungsziel_tage && !/^\d{1,3}$/.test(werte.zahlungsziel_tage)) z.warnungen.push(`Zahlungsziel „${werte.zahlungsziel_tage}" keine Zahl – Standard 14`)
    ergebnis.push(z)
  }
  return ergebnis
}

/** Vorlagen-CSV (Semikolon, mit Beispielzeile) */
export function vorlageCsv(typ: ImportTyp): string {
  const felder = felderFuer(typ)
  const kopf = felder.map(f => f.label).join(';')
  const beispiel = felder.map(f => f.beispiel.includes(';') ? `"${f.beispiel}"` : f.beispiel).join(';')
  return '\uFEFF' + kopf + '\r\n' + beispiel + '\r\n'
}
