'use server'

import { revalidatePath } from 'next/cache'
import type Mail from 'nodemailer/lib/mailer'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite, type UserRole } from '@/lib/auth/roles'
import { ladeKategorien, pruefeZeitraumOffen } from '@/lib/ea/server'
import { ladeVerbindung, fehlerText } from '@/lib/email/verbindung'
import { baueRohnachricht, sendeRoh, absenderAdresse } from '@/lib/email/smtp'
import { textZuHtml } from '@/lib/email/html'
import { mitImap, inGesendetAblegen } from '@/lib/email/imap'
import { legeEmailAktivitaetAn } from '@/lib/email/crm'
import { ladeBeleg, ladeFaktEinstellungen } from '@/lib/rechnungen/server'
import { erzeugeBelegPdf } from '@/lib/rechnungen/belegPdf'
import { berechneSummen, rund2 } from '@/lib/rechnungen/summen'
import {
  GUELTIGE_UST_SAETZE_FAKT, EINHEITEN, STATUS_JE_ART, datumPlusTage,
  type BelegInput, type Belegart, type LeistungInput, type PositionRow, type UstModus, type ZahlungInput,
} from '@/lib/rechnungen/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; data?: T }

const KEIN_SCHREIBRECHT = 'Keine Berechtigung – nur Admins und Mitarbeiter dürfen Belege ändern.'
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/

async function getCtx() {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) throw new Error('Kein aktiver Mandant')
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, tenantId: membership.tenantId, role: membership.role as UserRole, userId: user?.id ?? null }
}

function revalidateRechnungen(id?: string) {
  revalidatePath('/rechnungen')
  revalidatePath('/rechnungen/angebote')
  revalidatePath('/rechnungen/offene-posten')
  revalidatePath('/rechnungen/leistungen')
  revalidatePath('/buchhaltung')
  revalidatePath('/dashboard')
  if (id) {
    revalidatePath(`/rechnungen/${id}`)
    revalidatePath(`/rechnungen/${id}/bearbeiten`)
  }
}

// ── Validierung ───────────────────────────────────────────────────────────────

function normText(v: unknown, max = 5000): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}

function normalisierePositionen(input: PositionRow[]): { ok: true; positionen: PositionRow[] } | { ok: false; error: string } {
  const positionen: PositionRow[] = []
  let pos = 1
  for (const p of input ?? []) {
    const bezeichnung = normText(p.bezeichnung, 500)
    if (!bezeichnung) continue // leere Zeilen ignorieren
    const menge = Number(p.menge)
    const preis = Number(p.einzelpreis_netto)
    const rabatt = Number(p.rabatt_pct ?? 0)
    const ust = Number(p.ust_satz)
    if (!Number.isFinite(menge)) return { ok: false, error: `Position ${pos}: ungültige Menge.` }
    if (!Number.isFinite(preis)) return { ok: false, error: `Position ${pos}: ungültiger Einzelpreis.` }
    if (!Number.isFinite(rabatt) || rabatt < 0 || rabatt > 100) return { ok: false, error: `Position ${pos}: Rabatt muss zwischen 0 und 100 % liegen.` }
    if (!GUELTIGE_UST_SAETZE_FAKT.includes(ust)) return { ok: false, error: `Position ${pos}: ungültiger USt-Satz.` }
    const einheit = (EINHEITEN as readonly string[]).includes(p.einheit) ? p.einheit : (normText(p.einheit, 30) ?? 'Stunde')
    positionen.push({
      pos: pos++,
      leistung_id: p.leistung_id || null,
      bezeichnung,
      beschreibung: normText(p.beschreibung, 2000),
      menge: rund2(menge),
      einheit,
      einzelpreis_netto: rund2(preis),
      rabatt_pct: rund2(rabatt),
      ust_satz: ust,
    })
  }
  if (positionen.length === 0) return { ok: false, error: 'Bitte mindestens eine Position mit Bezeichnung angeben.' }
  return { ok: true, positionen }
}

function normalisiereBeleg(input: BelegInput): { ok: true; kopf: R; positionen: PositionRow[] } | { ok: false; error: string } {
  const belegart: Belegart | null = input.belegart === 'angebot' || input.belegart === 'rechnung' || input.belegart === 'gutschrift' ? input.belegart : null
  if (!belegart) return { ok: false, error: 'Ungültige Belegart.' }
  const empfName = normText(input.empf_name, 300)
  if (!empfName) return { ok: false, error: 'Bitte einen Empfänger angeben.' }
  if (!input.datum || !ISO_DATUM.test(input.datum)) return { ok: false, error: 'Bitte ein gültiges Belegdatum angeben.' }
  const von = input.leistung_von && ISO_DATUM.test(input.leistung_von) ? input.leistung_von : null
  const bis = input.leistung_bis && ISO_DATUM.test(input.leistung_bis) ? input.leistung_bis : null
  if (von && bis && bis < von) return { ok: false, error: 'Leistungszeitraum: „bis" liegt vor „von".' }
  const ziel = Number(input.zahlungsziel_tage)
  if (!Number.isFinite(ziel) || ziel < 0 || ziel > 365) return { ok: false, error: 'Zahlungsziel muss zwischen 0 und 365 Tagen liegen.' }
  const modus: UstModus = input.ust_modus === 'reverse_charge' || input.ust_modus === 'kleinunternehmer' ? input.ust_modus : 'normal'
  const empfLand = (normText(input.empf_land, 2) ?? 'AT').toUpperCase()
  if (modus === 'reverse_charge' && !normText(input.empf_uid)) {
    return { ok: false, error: 'Reverse Charge erfordert die UID-Nummer des Leistungsempfängers.' }
  }
  const norm = normalisierePositionen(input.positionen)
  if (!norm.ok) return norm
  const summen = berechneSummen(norm.positionen, modus)
  const kopf: R = {
    belegart,
    firma_id: input.firma_id || null,
    kontakt_id: input.kontakt_id || null,
    empf_name: empfName,
    empf_zusatz: normText(input.empf_zusatz, 300),
    empf_strasse: normText(input.empf_strasse, 300),
    empf_plz: normText(input.empf_plz, 20),
    empf_ort: normText(input.empf_ort, 200),
    empf_land: empfLand,
    empf_uid: normText(input.empf_uid, 40),
    empf_email: normText(input.empf_email, 300),
    datum: input.datum,
    leistung_von: von,
    leistung_bis: bis,
    zahlungsziel_tage: Math.round(ziel),
    ust_modus: modus,
    einleitung: normText(input.einleitung),
    schlusstext: normText(input.schlusstext),
    interne_notiz: normText(input.interne_notiz),
    ea_kategorie_id: input.ea_kategorie_id || null,
    summe_netto: summen.netto,
    summe_ust: summen.ust,
    summe_brutto: summen.brutto,
  }
  return { ok: true, kopf, positionen: norm.positionen }
}

async function schreibePositionen(supabase: R, tenantId: string, belegId: string, positionen: PositionRow[]): Promise<string | null> {
  const { error: delErr } = await (supabase.from('beleg_positionen') as R).delete().eq('beleg_id', belegId).eq('tenant_id', tenantId)
  if (delErr) return (delErr as R).message
  const rows = positionen.map(p => ({
    tenant_id: tenantId, beleg_id: belegId, pos: p.pos, leistung_id: p.leistung_id,
    bezeichnung: p.bezeichnung, beschreibung: p.beschreibung, menge: p.menge, einheit: p.einheit,
    einzelpreis_netto: p.einzelpreis_netto, rabatt_pct: p.rabatt_pct, ust_satz: p.ust_satz,
  }))
  const { error } = await (supabase.from('beleg_positionen') as R).insert(rows)
  return error ? (error as R).message : null
}

// ── Beleg anlegen / bearbeiten (nur Entwurf) ──────────────────────────────────

export async function speichereBeleg(input: BelegInput, id?: string): Promise<ActionResult<{ id: string }>> {
  const { supabase, tenantId, role, userId } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const norm = normalisiereBeleg(input)
  if (!norm.ok) return norm

  if (id) {
    const { data: best } = await (supabase.from('belege') as R)
      .select('id, status').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
    if (!best) return { ok: false, error: 'Beleg nicht gefunden.' }
    if ((best as R).status !== 'entwurf') return { ok: false, error: 'Nur Entwürfe können bearbeitet werden. Gestellte Belege sind unveränderlich.' }
    const { belegart: _art, ...patch } = norm.kopf
    void _art
    const { error } = await (supabase.from('belege') as R).update(patch).eq('id', id).eq('tenant_id', tenantId)
    if (error) return { ok: false, error: (error as R).message }
    const posErr = await schreibePositionen(supabase, tenantId, id, norm.positionen)
    if (posErr) return { ok: false, error: posErr }
    revalidateRechnungen(id)
    return { ok: true, data: { id } }
  }

  // Quelle (Angebot → Rechnung) nur übernehmen, wenn sie zum Mandanten gehört
  let quelleId: string | null = null
  if (input.quelle_beleg_id) {
    const { data: q } = await (supabase.from('belege') as R).select('id').eq('id', input.quelle_beleg_id).eq('tenant_id', tenantId).maybeSingle()
    quelleId = (q as R | null)?.id ?? null
  }
  const { data, error } = await (supabase.from('belege') as R)
    .insert({ ...norm.kopf, tenant_id: tenantId, status: 'entwurf', quelle_beleg_id: quelleId, erstellt_von: userId })
    .select('id').single()
  if (error) return { ok: false, error: (error as R).message }
  const neuId = (data as R).id as string
  const posErr = await schreibePositionen(supabase, tenantId, neuId, norm.positionen)
  if (posErr) return { ok: false, error: posErr }
  revalidateRechnungen(neuId)
  return { ok: true, data: { id: neuId } }
}

// ── Stellen / Finalisieren: Nummer vergeben, Fälligkeit setzen ────────────────
// Rechnung/Gutschrift → 'gestellt', Angebot → 'gesendet' (ausgestellt). Ab dann unveränderlich.

export async function stelleBeleg(id: string): Promise<ActionResult<{ nummer: string }>> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const geladen = await ladeBeleg(supabase, tenantId, id)
  if (!geladen) return { ok: false, error: 'Beleg nicht gefunden.' }
  const { beleg, positionen } = geladen
  if (beleg.status !== 'entwurf') return { ok: false, error: 'Der Beleg ist bereits gestellt.' }
  if (positionen.length === 0) return { ok: false, error: 'Der Beleg hat keine Positionen.' }
  if (!beleg.empf_name.trim()) return { ok: false, error: 'Bitte zuerst einen Empfänger angeben.' }
  if (beleg.ust_modus === 'reverse_charge' && !beleg.empf_uid) return { ok: false, error: 'Reverse Charge erfordert die UID des Empfängers.' }

  const summen = berechneSummen(positionen, beleg.ust_modus)
  let nummer = beleg.nummer
  if (!nummer) {
    const { data, error } = await (supabase as R).rpc('get_next_belegnummer', { p_tenant_id: tenantId, p_belegart: beleg.belegart })
    if (error) return { ok: false, error: 'Belegnummer konnte nicht vergeben werden: ' + (error as R).message }
    nummer = data as string | null
    if (!nummer) return { ok: false, error: 'Belegnummer konnte nicht vergeben werden – bitte Einstellungen prüfen.' }
  }
  const faellig = datumPlusTage(beleg.datum, beleg.zahlungsziel_tage)
  const status = beleg.belegart === 'angebot' ? 'gesendet' : 'gestellt'
  const { error } = await (supabase.from('belege') as R)
    .update({ nummer, status, faellig_am: faellig, summe_netto: summen.netto, summe_ust: summen.ust, summe_brutto: summen.brutto })
    .eq('id', id).eq('tenant_id', tenantId).eq('status', 'entwurf')
  if (error) return { ok: false, error: (error as R).message }
  revalidateRechnungen(id)
  return { ok: true, data: { nummer } }
}

// ── Angebotsstatus ────────────────────────────────────────────────────────────

export async function setzeAngebotStatus(id: string, status: 'gesendet' | 'angenommen' | 'abgelehnt'): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  if (!STATUS_JE_ART.angebot.includes(status)) return { ok: false, error: 'Ungültiger Status.' }
  const { data: best } = await (supabase.from('belege') as R).select('id, belegart, status, nummer').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!best) return { ok: false, error: 'Beleg nicht gefunden.' }
  const b = best as R
  if (b.belegart !== 'angebot') return { ok: false, error: 'Nur Angebote haben diesen Status.' }
  if (!b.nummer) return { ok: false, error: 'Bitte das Angebot zuerst finalisieren (Nummer vergeben).' }
  const { error } = await (supabase.from('belege') as R).update({ status }).eq('id', id).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: (error as R).message }
  revalidateRechnungen(id)
  return { ok: true }
}

export async function setzeGutschriftVerrechnet(id: string): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const { error } = await (supabase.from('belege') as R)
    .update({ status: 'verrechnet' }).eq('id', id).eq('tenant_id', tenantId).eq('belegart', 'gutschrift').eq('status', 'gestellt')
  if (error) return { ok: false, error: (error as R).message }
  revalidateRechnungen(id)
  return { ok: true }
}

// ── Kopieren: Angebot → Rechnung, Rechnung → Gutschrift, Duplizieren ──────────

async function kopiereBeleg(id: string, zielart: Belegart, mitQuelle: boolean): Promise<ActionResult<{ id: string }>> {
  const { supabase, tenantId, role, userId } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const geladen = await ladeBeleg(supabase, tenantId, id)
  if (!geladen) return { ok: false, error: 'Beleg nicht gefunden.' }
  const { beleg, positionen } = geladen
  const einst = await ladeFaktEinstellungen(supabase, tenantId)
  const heute = new Date().toISOString().slice(0, 10)
  const summen = berechneSummen(positionen, beleg.ust_modus)
  const kopf: R = {
    tenant_id: tenantId, belegart: zielart, status: 'entwurf', nummer: null,
    firma_id: beleg.firma_id, kontakt_id: beleg.kontakt_id,
    empf_name: beleg.empf_name, empf_zusatz: beleg.empf_zusatz, empf_strasse: beleg.empf_strasse, empf_plz: beleg.empf_plz,
    empf_ort: beleg.empf_ort, empf_land: beleg.empf_land, empf_uid: beleg.empf_uid, empf_email: beleg.empf_email,
    datum: heute, leistung_von: beleg.leistung_von, leistung_bis: beleg.leistung_bis, faellig_am: null,
    zahlungsziel_tage: zielart === 'rechnung' && beleg.belegart !== 'rechnung' ? einst.rechnung_zahlungsziel : beleg.zahlungsziel_tage,
    ust_modus: beleg.ust_modus,
    einleitung: zielart === beleg.belegart ? beleg.einleitung : (zielart === 'rechnung' ? einst.rechnung_einleitung_std : beleg.einleitung),
    schlusstext: zielart === beleg.belegart ? beleg.schlusstext : (zielart === 'rechnung' ? einst.rechnung_schluss_std : beleg.schlusstext),
    interne_notiz: beleg.interne_notiz,
    ea_kategorie_id: beleg.ea_kategorie_id,
    quelle_beleg_id: mitQuelle ? beleg.id : null,
    summe_netto: summen.netto, summe_ust: summen.ust, summe_brutto: summen.brutto,
    erstellt_von: userId,
  }
  const { data, error } = await (supabase.from('belege') as R).insert(kopf).select('id').single()
  if (error) return { ok: false, error: (error as R).message }
  const neuId = (data as R).id as string
  const posErr = await schreibePositionen(supabase, tenantId, neuId, positionen.map(p => ({ ...p, id: undefined })))
  if (posErr) return { ok: false, error: posErr }
  revalidateRechnungen(neuId)
  return { ok: true, data: { id: neuId } }
}

/** Angebot → Rechnung (Entwurf, quelle_beleg_id = Angebot) */
export async function wandleAngebotInRechnung(id: string): Promise<ActionResult<{ id: string }>> {
  const { supabase, tenantId } = await getCtx()
  const { data } = await (supabase.from('belege') as R).select('belegart, status').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!data) return { ok: false, error: 'Beleg nicht gefunden.' }
  if ((data as R).belegart !== 'angebot') return { ok: false, error: 'Nur Angebote können in Rechnungen umgewandelt werden.' }
  const erg = await kopiereBeleg(id, 'rechnung', true)
  if (erg.ok && (data as R).status === 'gesendet') {
    await (supabase.from('belege') as R).update({ status: 'angenommen' }).eq('id', id).eq('tenant_id', tenantId)
    revalidateRechnungen(id)
  }
  return erg
}

/** Gutschrift zu einer gestellten Rechnung (Entwurf, quelle_beleg_id = Rechnung) */
export async function erstelleGutschriftZuRechnung(id: string): Promise<ActionResult<{ id: string }>> {
  const { supabase, tenantId } = await getCtx()
  const { data } = await (supabase.from('belege') as R).select('belegart, status').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!data) return { ok: false, error: 'Beleg nicht gefunden.' }
  if ((data as R).belegart !== 'rechnung' || (data as R).status === 'entwurf') return { ok: false, error: 'Gutschriften können nur zu gestellten Rechnungen erstellt werden.' }
  return kopiereBeleg(id, 'gutschrift', true)
}

/** Beleg als neuen Entwurf gleicher Art duplizieren */
export async function dupliziereBeleg(id: string): Promise<ActionResult<{ id: string }>> {
  const { supabase, tenantId } = await getCtx()
  const { data } = await (supabase.from('belege') as R).select('belegart').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!data) return { ok: false, error: 'Beleg nicht gefunden.' }
  return kopiereBeleg(id, (data as R).belegart as Belegart, false)
}

// ── Entwurf löschen ───────────────────────────────────────────────────────────

export async function loescheBeleg(id: string): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const { data: best } = await (supabase.from('belege') as R).select('id, status').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!best) return { ok: false, error: 'Beleg nicht gefunden.' }
  if ((best as R).status !== 'entwurf') return { ok: false, error: 'Nur Entwürfe können gelöscht werden – gestellte Rechnungen bitte stornieren.' }
  const { error } = await (supabase.from('belege') as R).delete().eq('id', id).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: (error as R).message }
  revalidateRechnungen()
  return { ok: true }
}

// ── Stornieren (nur gestellte Rechnung ohne Zahlungen) ────────────────────────

export async function storniereBeleg(id: string, grund: string): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const { data: best } = await (supabase.from('belege') as R)
    .select('id, belegart, status, bezahlt_betrag').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!best) return { ok: false, error: 'Beleg nicht gefunden.' }
  const b = best as R
  if (b.belegart !== 'rechnung') return { ok: false, error: 'Nur Rechnungen können storniert werden.' }
  if (b.status !== 'gestellt') return { ok: false, error: 'Nur gestellte Rechnungen ohne Zahlungen können storniert werden.' }
  const { count } = await (supabase.from('beleg_zahlungen') as R).select('id', { count: 'exact', head: true }).eq('beleg_id', id).eq('tenant_id', tenantId)
  if (count) return { ok: false, error: 'Die Rechnung hat bereits Zahlungen – bitte stattdessen eine Gutschrift erstellen.' }
  const { error } = await (supabase.from('belege') as R)
    .update({ status: 'storniert', storniert_am: new Date().toISOString(), storno_grund: normText(grund, 1000) })
    .eq('id', id).eq('tenant_id', tenantId).eq('status', 'gestellt')
  if (error) return { ok: false, error: (error as R).message }
  revalidateRechnungen(id)
  return { ok: true }
}

// ── Zahlung erfassen → beleg_zahlungen + E&A-Einnahme je USt-Satz ─────────────

export async function erfasseZahlung(belegId: string, input: ZahlungInput): Promise<ActionResult<{ id: string }>> {
  const { supabase, tenantId, role, userId } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  if (!input.datum || !ISO_DATUM.test(input.datum)) return { ok: false, error: 'Bitte ein gültiges Zahlungsdatum angeben.' }
  const betrag = rund2(Number(input.betrag))
  if (!Number.isFinite(betrag) || betrag <= 0) return { ok: false, error: 'Bitte einen Betrag größer 0 angeben.' }
  const art = ['bank', 'bar', 'karte', 'sonstig'].includes(input.art) ? input.art : 'bank'

  const geladen = await ladeBeleg(supabase, tenantId, belegId)
  if (!geladen) return { ok: false, error: 'Beleg nicht gefunden.' }
  const { beleg, positionen } = geladen
  if (beleg.belegart !== 'rechnung') return { ok: false, error: 'Zahlungen können nur zu Rechnungen erfasst werden.' }
  if (beleg.status !== 'gestellt' && beleg.status !== 'teilbezahlt') return { ok: false, error: 'Zahlungen sind nur bei gestellten oder teilbezahlten Rechnungen möglich.' }
  const offen = rund2(beleg.summe_brutto - beleg.bezahlt_betrag)
  if (betrag > offen + 0.005) return { ok: false, error: `Der Betrag übersteigt den offenen Rest von € ${offen.toLocaleString('de-AT', { minimumFractionDigits: 2 })}.` }

  const pruef = await pruefeZeitraumOffen(supabase, tenantId, input.datum)
  if (!pruef.offen) return { ok: false, error: pruef.grund ?? 'Der E&A-Zeitraum ist geschlossen.' }

  // Kategorie: Beleg-Vorbelegung oder Standard „Beratungshonorare" (bzw. Reverse-Charge-Erlöse)
  const kategorien = await ladeKategorien(supabase, tenantId, false)
  const standardName = beleg.ust_modus === 'reverse_charge' ? 'Erlöse EU-Ausland (Reverse Charge)' : 'Beratungshonorare'
  const kategorieId = beleg.ea_kategorie_id
    ?? kategorien.find(k => k.name === standardName)?.id
    ?? kategorien.find(k => k.typ === 'einnahme')?.id
    ?? null

  // Zahlung anteilig auf die Steuersätze verteilen (nach Brutto-Anteil), letzte Gruppe nimmt den Rest
  const summen = berechneSummen(positionen, beleg.ust_modus)
  const gruppen = summen.gruppen.length ? summen.gruppen : [{ satz: 0, netto: beleg.summe_netto, ust: 0 }]
  const gesamtBrutto = gruppen.reduce((s, g) => s + g.netto + g.ust, 0) || 1
  const anteile: { satz: number; brutto: number }[] = []
  let verteilt = 0
  gruppen.forEach((g, i) => {
    const anteil = i === gruppen.length - 1 ? rund2(betrag - verteilt) : rund2(betrag * (g.netto + g.ust) / gesamtBrutto)
    verteilt = rund2(verteilt + anteil)
    if (anteil > 0) anteile.push({ satz: g.satz, brutto: anteil })
  })

  const txIds: string[] = []
  for (const a of anteile) {
    const netto = rund2(a.brutto / (1 + a.satz / 100))
    const beschreibung = `Zahlung ${beleg.nummer ?? 'Rechnung'} – ${beleg.empf_name}${anteile.length > 1 ? ` (USt ${a.satz} %)` : ''}`
    const { data, error } = await (supabase.from('ea_transaktionen') as R)
      .insert({
        tenant_id: tenantId, typ: 'einnahme', datum: input.datum, beschreibung,
        kategorie_id: kategorieId, firma_id: beleg.firma_id, konto_id: input.konto_id || null,
        betrag_netto: netto, ust_satz: a.satz, abzugsfaehig_pct: 100,
        belegnummer: beleg.nummer, import_quelle: 'rechnung',
        notizen: normText(input.notizen, 1000), erstellt_von: userId,
      })
      .select('id').single()
    if (error) return { ok: false, error: 'E&A-Buchung fehlgeschlagen: ' + (error as R).message }
    txIds.push((data as R).id)
  }

  const { data: z, error: zErr } = await (supabase.from('beleg_zahlungen') as R)
    .insert({
      tenant_id: tenantId, beleg_id: belegId, datum: input.datum, betrag, art,
      konto_id: input.konto_id || null, ea_transaktion_id: txIds[0] ?? null,
      notizen: normText(input.notizen, 1000), erstellt_von: userId,
    })
    .select('id').single()
  if (zErr) {
    // Buchungen wieder entfernen, damit nichts Halbes stehen bleibt
    if (txIds.length) await (supabase.from('ea_transaktionen') as R).delete().in('id', txIds).eq('tenant_id', tenantId)
    return { ok: false, error: (zErr as R).message }
  }
  revalidateRechnungen(belegId)
  return { ok: true, data: { id: (z as R).id } }
}

/** Zahlung löschen (inkl. zugehöriger E&A-Buchungen, sofern nicht gesperrt) */
export async function loescheZahlung(zahlungId: string): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const { data: z } = await (supabase.from('beleg_zahlungen') as R)
    .select('id, beleg_id, ea_transaktion_id, betrag, datum').eq('id', zahlungId).eq('tenant_id', tenantId).maybeSingle()
  if (!z) return { ok: false, error: 'Zahlung nicht gefunden.' }
  const zahlung = z as R
  const { data: beleg } = await (supabase.from('belege') as R).select('nummer').eq('id', zahlung.beleg_id).eq('tenant_id', tenantId).maybeSingle()
  // Alle E&A-Buchungen dieser Zahlung (gleiche Belegnummer, Datum, Quelle 'rechnung') entfernen
  const nummer = (beleg as R | null)?.nummer
  if (nummer) {
    const { data: txs } = await (supabase.from('ea_transaktionen') as R)
      .select('id, is_locked, betrag_brutto')
      .eq('tenant_id', tenantId).eq('import_quelle', 'rechnung').eq('belegnummer', nummer).eq('datum', zahlung.datum)
    const liste = (txs ?? []) as R[]
    if (liste.some(t => t.is_locked)) return { ok: false, error: 'Die zugehörige E&A-Buchung ist gesperrt (Monatsabschluss/UVA) – die Zahlung kann nicht gelöscht werden.' }
    // Nur Buchungen entfernen, deren Summe zur Zahlung passt (Schutz bei mehreren Zahlungen am selben Tag)
    const summe = rund2(liste.reduce((s, t) => s + Number(t.betrag_brutto ?? 0), 0))
    if (liste.length && Math.abs(summe - Number(zahlung.betrag)) < 0.05) {
      const { error } = await (supabase.from('ea_transaktionen') as R).delete().in('id', liste.map(t => t.id)).eq('tenant_id', tenantId)
      if (error) return { ok: false, error: (error as R).message }
    } else if (zahlung.ea_transaktion_id) {
      const { error } = await (supabase.from('ea_transaktionen') as R).delete().eq('id', zahlung.ea_transaktion_id).eq('tenant_id', tenantId)
      if (error) return { ok: false, error: (error as R).message }
    }
  }
  const { error } = await (supabase.from('beleg_zahlungen') as R).delete().eq('id', zahlungId).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: (error as R).message }
  revalidateRechnungen(zahlung.beleg_id)
  return { ok: true }
}

// ── Per E-Mail senden (SMTP-Konto des angemeldeten Benutzers, PDF-Anhang) ─────

export type SendeBelegInput = { an: string; betreff: string; text: string; crmAblegen?: boolean }
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

export async function sendeBelegEmail(belegId: string, input: SendeBelegInput): Promise<ActionResult<{ keinKonto?: boolean }>> {
  const { supabase, tenantId, role, userId } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const an = (input.an ?? '').split(/[,;]/).map(s => s.trim()).filter(Boolean)
  if (an.length === 0) return { ok: false, error: 'Bitte mindestens einen Empfänger angeben.' }
  const ungueltig = an.find(a => !EMAIL_RE.test(a.match(/<([^>]+)>/)?.[1] ?? a))
  if (ungueltig) return { ok: false, error: `Ungültige E-Mail-Adresse: ${ungueltig}` }
  const betreff = (input.betreff ?? '').trim()
  if (!betreff) return { ok: false, error: 'Bitte einen Betreff angeben.' }

  const verb = await ladeVerbindung()
  if (!verb.ok) return { ok: false, error: verb.fehler, data: { keinKonto: verb.status === 404 } }
  if (!verb.v.smtp) return { ok: false, error: 'SMTP-Zugang unvollständig – bitte im E-Mail-Konto ergänzen.', data: { keinKonto: true } }

  const pdf = await erzeugeBelegPdf(supabase, tenantId, belegId)
  if (!pdf) return { ok: false, error: 'Beleg nicht gefunden.' }
  if (pdf.beleg.status === 'entwurf') return { ok: false, error: 'Bitte den Beleg zuerst stellen (Nummer vergeben), bevor er versendet wird.' }

  const text = (input.text ?? '').trim() + (verb.v.signatur ? `\n\n${verb.v.signatur}` : '')
  const mail: Mail.Options = {
    from: absenderAdresse(verb.v.smtpFromName || verb.v.anzeigename, verb.v.emailAddress),
    to: an.join(', '),
    subject: betreff,
    text,
    html: textZuHtml(text),
    attachments: [{ filename: pdf.dateiname, content: pdf.buffer, contentType: 'application/pdf' }],
  }
  let messageId: string
  try {
    const roh = await baueRohnachricht(mail)
    messageId = roh.messageId
    await sendeRoh(verb.v.smtp, roh.envelope, roh.raw)
    if (verb.v.imap) {
      try { await mitImap(verb.v.imap, c => inGesendetAblegen(c, roh.raw)) } catch { /* Ablage nicht kritisch */ }
    }
  } catch (e) {
    return { ok: false, error: 'Senden fehlgeschlagen: ' + fehlerText(e) }
  }

  const patch: R = { gesendet_am: new Date().toISOString(), gesendet_an: an.join(', ') }
  await (supabase.from('belege') as R).update(patch).eq('id', belegId).eq('tenant_id', tenantId)

  // CRM-Protokoll (best effort)
  if (input.crmAblegen !== false && userId && (pdf.beleg.firma_id || pdf.beleg.kontakt_id)) {
    await legeEmailAktivitaetAn(supabase, {
      tenantId, userId, kontaktId: pdf.beleg.kontakt_id, firmaId: pdf.beleg.firma_id,
      betreff, datum: new Date().toISOString(), messageId, conversationId: messageId,
      von: verb.v.emailAddress, vonName: verb.v.smtpFromName || verb.v.anzeigename,
      an: an.join(', '), text, html: null,
    }).catch(() => null)
  }
  revalidateRechnungen(belegId)
  return { ok: true }
}

// ── Leistungskatalog ──────────────────────────────────────────────────────────

export async function speichereLeistung(input: LeistungInput, id?: string): Promise<ActionResult<{ id: string }>> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const bezeichnung = normText(input.bezeichnung, 300)
  if (!bezeichnung) return { ok: false, error: 'Bitte eine Bezeichnung angeben.' }
  const preis = Number(input.preis_netto)
  if (!Number.isFinite(preis) || preis < 0) return { ok: false, error: 'Bitte einen gültigen Nettopreis angeben.' }
  const ust = Number(input.ust_satz)
  if (!GUELTIGE_UST_SAETZE_FAKT.includes(ust)) return { ok: false, error: 'Ungültiger USt-Satz.' }
  const einheit = (EINHEITEN as readonly string[]).includes(input.einheit) ? input.einheit : 'Stunde'
  const werte = {
    bezeichnung, beschreibung: normText(input.beschreibung, 2000), einheit,
    preis_netto: rund2(preis), ust_satz: ust, ea_kategorie_id: input.ea_kategorie_id || null,
    aktiv: input.aktiv !== false, sortierung: Number.isFinite(Number(input.sortierung)) ? Math.round(Number(input.sortierung)) : 0,
  }
  if (id) {
    const { error } = await (supabase.from('leistungen') as R).update(werte).eq('id', id).eq('tenant_id', tenantId)
    if (error) return { ok: false, error: (error as R).message }
    revalidateRechnungen()
    return { ok: true, data: { id } }
  }
  const { data, error } = await (supabase.from('leistungen') as R).insert({ ...werte, tenant_id: tenantId }).select('id').single()
  if (error) return { ok: false, error: (error as R).message }
  revalidateRechnungen()
  return { ok: true, data: { id: (data as R).id } }
}

export async function setzeLeistungAktiv(id: string, aktiv: boolean): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const { error } = await (supabase.from('leistungen') as R).update({ aktiv }).eq('id', id).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: (error as R).message }
  revalidateRechnungen()
  return { ok: true }
}

export async function loescheLeistung(id: string): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const { error } = await (supabase.from('leistungen') as R).delete().eq('id', id).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: (error as R).message }
  revalidateRechnungen()
  return { ok: true }
}
