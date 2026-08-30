// ── Serverseitige Helfer der Fakturierung (nur Server Components/Actions/Routes)
// Nie in Client-Komponenten importieren. Spaltennamen lt. 008_fakturierung.sql.
import { kontaktName } from '@/lib/crm/types'
import { alleZeilen } from '@/lib/supabase/alleZeilen'
import type { Absender, BelegRow, LeistungRow, PositionRow, ZahlungRow } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export const BELEG_SELECT =
  'id, belegart, nummer, status, firma_id, kontakt_id, empf_name, empf_zusatz, empf_strasse, empf_plz, empf_ort, empf_land, ' +
  'empf_uid, empf_email, datum, leistung_von, leistung_bis, faellig_am, zahlungsziel_tage, ust_modus, einleitung, schlusstext, ' +
  'interne_notiz, summe_netto, summe_ust, summe_brutto, bezahlt_betrag, bezahlt_am, storniert_am, storno_grund, quelle_beleg_id, ' +
  'gesendet_am, gesendet_an, ea_kategorie_id, erstellt_am, aktualisiert_am'

export const POSITION_SELECT =
  'id, pos, leistung_id, bezeichnung, beschreibung, menge, einheit, einzelpreis_netto, rabatt_pct, ust_satz, summe_netto'

export function mapBeleg(r: R): BelegRow {
  return {
    id: r.id, belegart: r.belegart, nummer: r.nummer ?? null, status: r.status,
    firma_id: r.firma_id ?? null, kontakt_id: r.kontakt_id ?? null,
    empf_name: r.empf_name ?? '', empf_zusatz: r.empf_zusatz ?? null, empf_strasse: r.empf_strasse ?? null,
    empf_plz: r.empf_plz ?? null, empf_ort: r.empf_ort ?? null, empf_land: r.empf_land ?? 'AT',
    empf_uid: r.empf_uid ?? null, empf_email: r.empf_email ?? null,
    datum: r.datum, leistung_von: r.leistung_von ?? null, leistung_bis: r.leistung_bis ?? null,
    faellig_am: r.faellig_am ?? null, zahlungsziel_tage: Number(r.zahlungsziel_tage ?? 14),
    ust_modus: r.ust_modus ?? 'normal',
    einleitung: r.einleitung ?? null, schlusstext: r.schlusstext ?? null, interne_notiz: r.interne_notiz ?? null,
    summe_netto: Number(r.summe_netto ?? 0), summe_ust: Number(r.summe_ust ?? 0), summe_brutto: Number(r.summe_brutto ?? 0),
    bezahlt_betrag: Number(r.bezahlt_betrag ?? 0), bezahlt_am: r.bezahlt_am ?? null,
    storniert_am: r.storniert_am ?? null, storno_grund: r.storno_grund ?? null,
    quelle_beleg_id: r.quelle_beleg_id ?? null, gesendet_am: r.gesendet_am ?? null, gesendet_an: r.gesendet_an ?? null,
    ea_kategorie_id: r.ea_kategorie_id ?? null,
    erstellt_am: r.erstellt_am, aktualisiert_am: r.aktualisiert_am,
  }
}

export function mapPosition(r: R): PositionRow {
  return {
    id: r.id, pos: Number(r.pos ?? 1), leistung_id: r.leistung_id ?? null,
    bezeichnung: r.bezeichnung ?? '', beschreibung: r.beschreibung ?? null,
    menge: Number(r.menge ?? 1), einheit: r.einheit ?? 'Stunde',
    einzelpreis_netto: Number(r.einzelpreis_netto ?? 0), rabatt_pct: Number(r.rabatt_pct ?? 0),
    ust_satz: Number(r.ust_satz ?? 20),
  }
}

/** Beleg mit Positionen (nach pos) – null, wenn nicht vorhanden/anderer Mandant */
export async function ladeBeleg(supabase: SB, tenantId: string, id: string): Promise<{ beleg: BelegRow; positionen: PositionRow[] } | null> {
  const { data } = await (supabase.from('belege') as SB)
    .select(BELEG_SELECT).eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!data) return null
  const { data: pos } = await (supabase.from('beleg_positionen') as SB)
    .select(POSITION_SELECT).eq('beleg_id', id).eq('tenant_id', tenantId).order('pos')
  return { beleg: mapBeleg(data as R), positionen: ((pos ?? []) as R[]).map(mapPosition) }
}

/** Zahlungen eines Belegs */
export async function ladeZahlungen(supabase: SB, tenantId: string, belegId: string): Promise<ZahlungRow[]> {
  const { data } = await (supabase.from('beleg_zahlungen') as SB)
    .select('id, datum, betrag, art, konto_id, ea_transaktion_id, notizen, konten(name)')
    .eq('beleg_id', belegId).eq('tenant_id', tenantId).order('datum', { ascending: false })
  return ((data ?? []) as R[]).map(z => ({
    id: z.id, datum: z.datum, betrag: Number(z.betrag), art: z.art,
    konto_id: z.konto_id ?? null, konto_name: (z.konten as R | null)?.name ?? null,
    ea_transaktion_id: z.ea_transaktion_id ?? null, notizen: z.notizen ?? null,
  }))
}

/** Absender (Firmendaten des Mandanten) für Vorschau, PDF und E-Mail */
export async function ladeAbsender(supabase: SB, tenantId: string): Promise<Absender> {
  const { data } = await (supabase.from('tenant_einstellungen') as SB)
    .select('anzeigename, logo_url, betrieb_name, betrieb_strasse, betrieb_plz, betrieb_ort, betrieb_telefon, betrieb_email, betrieb_website, betrieb_uid, betrieb_steuernummer, betrieb_iban, betrieb_bic, rechnung_fusstext')
    .eq('tenant_id', tenantId).maybeSingle()
  const e = (data ?? {}) as R
  return {
    name: e.betrieb_name || e.anzeigename || 'Hohenstein Consulting OG',
    strasse: e.betrieb_strasse ?? null, plz: e.betrieb_plz ?? null, ort: e.betrieb_ort ?? null,
    telefon: e.betrieb_telefon ?? null, email: e.betrieb_email ?? null, website: e.betrieb_website ?? null,
    uid: e.betrieb_uid ?? null, steuernummer: e.betrieb_steuernummer ?? null,
    iban: e.betrieb_iban ?? null, bic: e.betrieb_bic ?? null,
    logo_url: e.logo_url ?? null, fusstext: e.rechnung_fusstext ?? null,
  }
}

export type FaktEinstellungen = {
  rechnung_zahlungsziel: number
  rechnung_einleitung_std: string
  rechnung_schluss_std: string
  ea_kleinunternehmer: boolean
  ust_satz_standard: number
}

/** Fakturierungs-Einstellungen (Standardtexte, Zahlungsziel) mit Defaults */
export async function ladeFaktEinstellungen(supabase: SB, tenantId: string): Promise<FaktEinstellungen> {
  const { data } = await (supabase.from('tenant_einstellungen') as SB)
    .select('rechnung_zahlungsziel, rechnung_einleitung_std, rechnung_schluss_std, ea_kleinunternehmer, ust_satz_standard')
    .eq('tenant_id', tenantId).maybeSingle()
  const e = (data ?? {}) as R
  return {
    rechnung_zahlungsziel:   Number(e.rechnung_zahlungsziel ?? 14),
    rechnung_einleitung_std: e.rechnung_einleitung_std ?? 'Wir erlauben uns, folgende Leistungen in Rechnung zu stellen:',
    rechnung_schluss_std:    e.rechnung_schluss_std ?? 'Vielen Dank für die gute Zusammenarbeit.',
    ea_kleinunternehmer:     !!e.ea_kleinunternehmer,
    ust_satz_standard:       Number(e.ust_satz_standard ?? 20),
  }
}

/** Leistungskatalog */
export async function ladeLeistungen(supabase: SB, tenantId: string, nurAktive = true): Promise<LeistungRow[]> {
  let q = (supabase.from('leistungen') as SB)
    .select('id, bezeichnung, beschreibung, einheit, preis_netto, ust_satz, ea_kategorie_id, aktiv, sortierung')
    .eq('tenant_id', tenantId)
  if (nurAktive) q = q.eq('aktiv', true)
  const { data } = await q.order('sortierung').order('bezeichnung')
  return ((data ?? []) as R[]).map(l => ({
    id: l.id, bezeichnung: l.bezeichnung, beschreibung: l.beschreibung ?? null, einheit: l.einheit,
    preis_netto: Number(l.preis_netto ?? 0), ust_satz: Number(l.ust_satz ?? 20),
    ea_kategorie_id: l.ea_kategorie_id ?? null, aktiv: l.aktiv !== false, sortierung: Number(l.sortierung ?? 0),
  }))
}

export type EmpfaengerFirma = {
  id: string; name: string; kundennummer: string | null; strasse: string | null; plz: string | null; ort: string | null
  land: string | null; uid_nummer: string | null; email: string | null; zahlungsziel_tage: number
}
export type EmpfaengerKontakt = {
  id: string; name: string; firma_id: string | null; strasse: string | null; plz: string | null; ort: string | null
  land: string | null; email: string | null; kundennummer: string | null
}

/** Aktive Firmen und Kontakte für die Empfängerwahl */
export async function ladeEmpfaengerAuswahl(supabase: SB, tenantId: string): Promise<{ firmen: EmpfaengerFirma[]; kontakte: EmpfaengerKontakt[] }> {
  const [f, k] = await Promise.all([
    alleZeilen(() => (supabase.from('firmen') as SB)
      .select('id, name, kundennummer, strasse, plz, ort, land, uid_nummer, email, zahlungsziel_tage')
      .eq('tenant_id', tenantId).eq('aktiv', true).order('name').order('id')),
    alleZeilen(() => (supabase.from('kontakte') as SB)
      .select('id, vorname, nachname, kundennummer, firma_id, strasse, plz, ort, land, email')
      .eq('tenant_id', tenantId).eq('aktiv', true).order('nachname').order('id')),
  ])
  return {
    firmen: ((f ?? []) as R[]).map(x => ({
      id: x.id, name: x.name, kundennummer: x.kundennummer ?? null, strasse: x.strasse ?? null, plz: x.plz ?? null,
      ort: x.ort ?? null, land: x.land ?? 'AT', uid_nummer: x.uid_nummer ?? null, email: x.email ?? null,
      zahlungsziel_tage: Number(x.zahlungsziel_tage ?? 14),
    })),
    kontakte: ((k ?? []) as R[]).map(x => ({
      id: x.id, name: kontaktName({ vorname: x.vorname, nachname: x.nachname }), kundennummer: x.kundennummer ?? null,
      firma_id: x.firma_id ?? null, strasse: x.strasse ?? null, plz: x.plz ?? null, ort: x.ort ?? null,
      land: x.land ?? 'AT', email: x.email ?? null,
    })),
  }
}

/** Kundennummer der Firma bzw. des Kontakts eines Belegs (für PDF/Vorschau) */
export async function ladeKundennummer(supabase: SB, tenantId: string, firmaId: string | null, kontaktId: string | null): Promise<string | null> {
  if (firmaId) {
    const { data } = await (supabase.from('firmen') as SB).select('kundennummer').eq('id', firmaId).eq('tenant_id', tenantId).maybeSingle()
    if ((data as R | null)?.kundennummer) return (data as R).kundennummer
  }
  if (kontaktId) {
    const { data } = await (supabase.from('kontakte') as SB).select('kundennummer').eq('id', kontaktId).eq('tenant_id', tenantId).maybeSingle()
    if ((data as R | null)?.kundennummer) return (data as R).kundennummer
  }
  return null
}

/** Dateiname des PDF: Rechnung_RE-2026-0007.pdf (Entwurf: Rechnung_Entwurf.pdf) */
export function pdfDateiname(beleg: Pick<BelegRow, 'belegart' | 'nummer'>): string {
  const art = beleg.belegart === 'angebot' ? 'Angebot' : beleg.belegart === 'gutschrift' ? 'Gutschrift' : 'Rechnung'
  const nr = (beleg.nummer ?? 'Entwurf').replace(/[^A-Za-z0-9_-]/g, '_')
  return `${art}_${nr}.pdf`
}
