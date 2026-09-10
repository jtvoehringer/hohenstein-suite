'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getCurrentMembership, canAdmin, canWrite, type UserRole } from '@/lib/auth/roles'
import { pruefeZeitraumOffen, uebernehmeStandardkategorien } from '@/lib/ea/server'
import { GUELTIGE_UST_SAETZE, type BuchungInput } from '@/lib/ea/types'
import { ladeAnlagen, afaBuchungsStatus, type AnlageInput, type AfaMethode } from '@/lib/ea/anlagen'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

async function getCtx() {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) throw new Error('Kein aktiver Mandant')
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, tenantId: membership.tenantId, role: membership.role as UserRole, userId: user?.id ?? null }
}

const KEIN_SCHREIBRECHT = 'Keine Berechtigung – nur Admins und Mitarbeiter dürfen Buchungen ändern.'
const KEIN_ADMIN        = 'Keine Berechtigung – diese Aktion ist Admins vorbehalten.'

function revalidateBuchhaltung() {
  revalidatePath('/buchhaltung')
  revalidatePath('/buchhaltung/uva')
  revalidatePath('/buchhaltung/monatsabschluss')
  revalidatePath('/buchhaltung/export')
  revalidatePath('/konten')
}

// ── Eingabe validieren/normalisieren ──────────────────────────────────────────

function normalisiereBuchung(input: BuchungInput): { ok: true; werte: BuchungInput } | { ok: false; error: string } {
  const typ = input.typ === 'einnahme' ? 'einnahme' : input.typ === 'ausgabe' ? 'ausgabe' : null
  if (!typ) return { ok: false, error: 'Bitte Einnahme oder Ausgabe wählen.' }
  if (!input.datum || !/^\d{4}-\d{2}-\d{2}$/.test(input.datum)) return { ok: false, error: 'Bitte ein gültiges Datum angeben.' }
  const beschreibung = (input.beschreibung ?? '').trim()
  if (!beschreibung) return { ok: false, error: 'Bitte eine Bezeichnung angeben.' }
  const netto = Number(input.betrag_netto)
  if (!Number.isFinite(netto) || netto < 0) return { ok: false, error: 'Bitte einen gültigen Betrag angeben.' }
  const ust = Number(input.ust_satz)
  if (!GUELTIGE_UST_SAETZE.includes(ust)) return { ok: false, error: 'Ungültiger USt-Satz.' }
  let abz = Number(input.abzugsfaehig_pct)
  if (!Number.isFinite(abz)) abz = 100
  abz = Math.min(100, Math.max(0, abz))
  return {
    ok: true,
    werte: {
      typ, datum: input.datum, beschreibung,
      kategorie_id:     input.kategorie_id || null,
      betrag_netto:     Math.round(netto * 100) / 100,
      ust_satz:         ust,
      abzugsfaehig_pct: abz,
      konto_id:         input.konto_id || null,
      firma_id:         input.firma_id || null,
      belegnummer:      input.belegnummer?.trim() || null,
      notizen:          input.notizen?.trim() || null,
    },
  }
}

// ── Zeitraum prüfen (für Live-Hinweis im Formular) ────────────────────────────

export async function pruefeZeitraumAction(datum: string): Promise<{ offen: boolean; grund: string | null }> {
  const { supabase, tenantId } = await getCtx()
  if (!datum || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return { offen: true, grund: null }
  return pruefeZeitraumOffen(supabase, tenantId, datum)
}

// ── Buchung anlegen ───────────────────────────────────────────────────────────

export async function erstelleBuchung(input: BuchungInput, quelle: 'manuell' | 'beleg' = 'manuell'): Promise<ActionResult<{ id: string }>> {
  const { supabase, tenantId, role, userId } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const norm = normalisiereBuchung(input)
  if (!norm.ok) return norm
  const w = norm.werte

  const pruef = await pruefeZeitraumOffen(supabase, tenantId, w.datum)
  if (!pruef.offen) return { ok: false, error: pruef.grund ?? 'Der Zeitraum ist geschlossen.' }

  const { data, error } = await (supabase.from('ea_transaktionen') as any)
    .insert({
      tenant_id: tenantId, typ: w.typ, datum: w.datum, beschreibung: w.beschreibung,
      kategorie_id: w.kategorie_id, firma_id: w.firma_id, konto_id: w.konto_id,
      betrag_netto: w.betrag_netto, ust_satz: w.ust_satz, abzugsfaehig_pct: w.abzugsfaehig_pct,
      belegnummer: w.belegnummer, notizen: w.notizen,
      import_quelle: quelle, erstellt_von: userId,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: (error as R).message }
  revalidateBuchhaltung()
  return { ok: true, data: { id: (data as R).id } }
}

// ── Buchung bearbeiten ────────────────────────────────────────────────────────
// Gesperrte Buchungen (is_locked): nur Konto, Firma, Belegnummer und Notizen
// dürfen geändert werden – alles andere blockt der DB-Trigger. Wir schicken in
// diesem Fall bewusst nur die erlaubten Felder.

export async function aktualisiereBuchung(id: string, input: BuchungInput): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }

  const { data: bestehend } = await (supabase.from('ea_transaktionen') as any)
    .select('id, is_locked, datum')
    .eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!bestehend) return { ok: false, error: 'Buchung nicht gefunden.' }

  if ((bestehend as R).is_locked) {
    const { error } = await (supabase.from('ea_transaktionen') as any)
      .update({
        konto_id:    input.konto_id || null,
        firma_id:    input.firma_id || null,
        belegnummer: input.belegnummer?.trim() || null,
        notizen:     input.notizen?.trim() || null,
      })
      .eq('id', id).eq('tenant_id', tenantId)
    if (error) return { ok: false, error: (error as R).message }
    revalidateBuchhaltung()
    return { ok: true }
  }

  const norm = normalisiereBuchung(input)
  if (!norm.ok) return norm
  const w = norm.werte

  // Neues Datum muss in einem offenen Zeitraum liegen (altes ohnehin, sonst wäre is_locked)
  const pruef = await pruefeZeitraumOffen(supabase, tenantId, w.datum)
  if (!pruef.offen) return { ok: false, error: pruef.grund ?? 'Der Zeitraum ist geschlossen.' }

  const { error } = await (supabase.from('ea_transaktionen') as any)
    .update({
      typ: w.typ, datum: w.datum, beschreibung: w.beschreibung,
      kategorie_id: w.kategorie_id, firma_id: w.firma_id, konto_id: w.konto_id,
      betrag_netto: w.betrag_netto, ust_satz: w.ust_satz, abzugsfaehig_pct: w.abzugsfaehig_pct,
      belegnummer: w.belegnummer, notizen: w.notizen,
    })
    .eq('id', id).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: (error as R).message }
  revalidateBuchhaltung()
  return { ok: true }
}

// ── Buchung löschen ───────────────────────────────────────────────────────────

export async function loescheBuchung(id: string): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const { error } = await (supabase.from('ea_transaktionen') as any)
    .delete()
    .eq('id', id).eq('tenant_id', tenantId).eq('is_locked', false)
  if (error) return { ok: false, error: (error as R).message }
  revalidateBuchhaltung()
  revalidatePath('/buchhaltung/belege')
  return { ok: true }
}

/** Variante für <form action> (ConfirmDeleteForm) – Fehler werden dort nicht angezeigt, nur geloggt */
export async function loescheBuchungForm(id: string): Promise<void> {
  const res = await loescheBuchung(id)
  if (!res.ok) console.error('loescheBuchung:', res.error)
}

// ── Kategorien ────────────────────────────────────────────────────────────────

export type KategorieInput = {
  typ: 'einnahme' | 'ausgabe' | 'beides'
  name: string
  konto_nr: number | null
  ust_satz_std: number
  abzugsfaehig_pct: number
  sortierung: number
}

function normalisiereKategorie(input: KategorieInput): { ok: true; werte: KategorieInput } | { ok: false; error: string } {
  const name = (input.name ?? '').trim()
  if (!name) return { ok: false, error: 'Bitte einen Namen angeben.' }
  if (!['einnahme', 'ausgabe', 'beides'].includes(input.typ)) return { ok: false, error: 'Ungültiger Typ.' }
  const ust = Number(input.ust_satz_std)
  if (!GUELTIGE_UST_SAETZE.includes(ust)) return { ok: false, error: 'Ungültiger USt-Satz.' }
  let abz = Number(input.abzugsfaehig_pct); if (!Number.isFinite(abz)) abz = 100
  abz = Math.min(100, Math.max(0, abz))
  const kontoRaw = input.konto_nr == null ? NaN : Number(input.konto_nr)
  const konto_nr = Number.isFinite(kontoRaw) && kontoRaw > 0 ? Math.trunc(kontoRaw) : null
  const sortierung = Number.isFinite(Number(input.sortierung)) ? Math.trunc(Number(input.sortierung)) : 0
  return { ok: true, werte: { typ: input.typ, name, konto_nr, ust_satz_std: ust, abzugsfaehig_pct: abz, sortierung } }
}

export async function speichereKategorie(input: KategorieInput, id?: string): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const norm = normalisiereKategorie(input)
  if (!norm.ok) return norm
  const w = norm.werte
  const { error } = id
    ? await (supabase.from('ea_kategorien') as any).update(w).eq('id', id).eq('tenant_id', tenantId)
    : await (supabase.from('ea_kategorien') as any).insert({ ...w, tenant_id: tenantId, aktiv: true })
  if (error) {
    const msg = (error as R).message as string
    return { ok: false, error: msg.includes('unique') || msg.includes('duplicate') ? 'Eine Kategorie mit diesem Namen existiert bereits.' : msg }
  }
  revalidatePath('/buchhaltung/kategorien')
  revalidatePath('/buchhaltung/neu')
  return { ok: true }
}

export async function setzeKategorieAktiv(id: string, aktiv: boolean): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const { error } = await (supabase.from('ea_kategorien') as any)
    .update({ aktiv }).eq('id', id).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: (error as R).message }
  revalidatePath('/buchhaltung/kategorien')
  return { ok: true }
}

export async function standardkategorienUebernehmenAction(): Promise<ActionResult<{ neu: number }>> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const res = await uebernehmeStandardkategorien(supabase, tenantId)
  if (res.fehler) return { ok: false, error: res.fehler }
  revalidatePath('/buchhaltung/kategorien')
  return { ok: true, data: { neu: res.neu } }
}

// ── Daueraufträge ─────────────────────────────────────────────────────────────

export type DauerauftragInput = {
  typ: 'einnahme' | 'ausgabe'
  beschreibung: string
  kategorie_id: string | null
  konto_id: string | null
  betrag_netto: number
  ust_satz: number
  intervall: 'monatlich' | 'vierteljaehrlich' | 'halbjaehrlich' | 'jaehrlich'
  tag_im_monat: number
  naechste_faelligkeit: string
  notizen: string | null
}

export async function speichereDauerauftrag(input: DauerauftragInput, id?: string): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const beschreibung = (input.beschreibung ?? '').trim()
  if (!beschreibung) return { ok: false, error: 'Bitte eine Bezeichnung angeben.' }
  if (input.typ !== 'einnahme' && input.typ !== 'ausgabe') return { ok: false, error: 'Ungültiger Typ.' }
  const netto = Number(input.betrag_netto)
  if (!Number.isFinite(netto) || netto <= 0) return { ok: false, error: 'Der Nettobetrag muss größer als 0 sein.' }
  if (!GUELTIGE_UST_SAETZE.includes(Number(input.ust_satz))) return { ok: false, error: 'Ungültiger USt-Satz.' }
  if (!['monatlich', 'vierteljaehrlich', 'halbjaehrlich', 'jaehrlich'].includes(input.intervall)) return { ok: false, error: 'Ungültiges Intervall.' }
  const tag = Math.min(28, Math.max(1, Number(input.tag_im_monat) || 1))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.naechste_faelligkeit ?? '')) return { ok: false, error: 'Bitte die nächste Fälligkeit angeben.' }

  const werte = {
    typ: input.typ, beschreibung,
    kategorie_id: input.kategorie_id || null, konto_id: input.konto_id || null,
    betrag_netto: Math.round(netto * 100) / 100, ust_satz: Number(input.ust_satz),
    intervall: input.intervall, tag_im_monat: tag, naechste_faelligkeit: input.naechste_faelligkeit,
    notizen: input.notizen?.trim() || null,
  }
  const { error } = id
    ? await (supabase.from('ea_dauerauftraege') as any).update(werte).eq('id', id).eq('tenant_id', tenantId)
    : await (supabase.from('ea_dauerauftraege') as any).insert({ ...werte, tenant_id: tenantId, aktiv: true })
  if (error) return { ok: false, error: (error as R).message }
  revalidatePath('/buchhaltung/dauerauftraege')
  return { ok: true }
}

export async function setzeDauerauftragAktiv(id: string, aktiv: boolean): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const { error } = await (supabase.from('ea_dauerauftraege') as any)
    .update({ aktiv }).eq('id', id).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: (error as R).message }
  revalidatePath('/buchhaltung/dauerauftraege')
  return { ok: true }
}

/**
 * „Jetzt ausführen": process_ea_dauerauftraege() ist nur für service_role
 * freigegeben – daher über den Admin-Client. Die Funktion arbeitet bewusst
 * mandantenübergreifend (alle fälligen Daueraufträge); nur Admins dürfen sie
 * anstoßen.
 */
export async function fuehreDauerauftraegeAusAction(): Promise<ActionResult<{ verarbeitet: number; erstellt: number; uebersprungen: number; fehler: number }>> {
  const { role } = await getCtx()
  if (!canAdmin(role)) return { ok: false, error: KEIN_ADMIN }
  const admin = createSupabaseAdminClient()
  const { data, error } = await (admin.rpc as any)('process_ea_dauerauftraege')
  if (error) return { ok: false, error: (error as R).message }
  const row = (Array.isArray(data) ? data[0] : data) as R | null
  revalidatePath('/buchhaltung/dauerauftraege')
  revalidateBuchhaltung()
  return {
    ok: true,
    data: {
      verarbeitet:   Number(row?.verarbeitet   ?? 0),
      erstellt:      Number(row?.erstellt      ?? 0),
      uebersprungen: Number(row?.uebersprungen ?? 0),
      fehler:        Number(row?.fehler        ?? 0),
    },
  }
}

// ── Monatsabschluss ───────────────────────────────────────────────────────────

export async function schliesseMonatAction(jahr: number, monat: number): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canAdmin(role)) return { ok: false, error: KEIN_ADMIN }
  const { error } = await (supabase.rpc as any)('sperre_ea_monat', { p_tenant_id: tenantId, p_jahr: jahr, p_monat: monat })
  if (error) return { ok: false, error: (error as R).message }
  revalidateBuchhaltung()
  return { ok: true }
}

export async function oeffneMonatAction(jahr: number, monat: number): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canAdmin(role)) return { ok: false, error: KEIN_ADMIN }
  const { error } = await (supabase.rpc as any)('oeffne_ea_monat', { p_tenant_id: tenantId, p_jahr: jahr, p_monat: monat })
  if (error) return { ok: false, error: (error as R).message }
  revalidateBuchhaltung()
  return { ok: true }
}

// ── UVA ───────────────────────────────────────────────────────────────────────

export type UvaKennzahlen = {
  bmgl_0: number; bmgl_10: number; bmgl_13: number; bmgl_20: number
  ust_10: number; ust_13: number; ust_20: number
  vst_10: number; vst_13: number; vst_20: number
}

export async function berechneUndSpeichereUvaAction(jahr: number, zeitraum: string): Promise<ActionResult<UvaKennzahlen>> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  if (!/^(Q[1-4]|0[1-9]|1[0-2])$/.test(zeitraum)) return { ok: false, error: 'Ungültiger Zeitraum.' }

  const { data: bestehend } = await (supabase.from('ea_uva') as any)
    .select('gesperrt').eq('tenant_id', tenantId).eq('jahr', jahr).eq('zeitraum', zeitraum).maybeSingle()
  if ((bestehend as R | null)?.gesperrt) {
    return { ok: false, error: 'Diese Meldung ist bereits als übermittelt markiert und kann nicht neu berechnet werden.' }
  }

  const { data, error } = await (supabase.rpc as any)('berechne_ea_uva', { p_tenant_id: tenantId, p_jahr: jahr, p_zeitraum: zeitraum })
  if (error) return { ok: false, error: (error as R).message }
  const row = (Array.isArray(data) ? data[0] : data) as R | null
  if (!row) return { ok: false, error: 'Keine Daten für diesen Zeitraum.' }

  const kz: UvaKennzahlen = {
    bmgl_0: Number(row.bmgl_0 ?? 0), bmgl_10: Number(row.bmgl_10 ?? 0), bmgl_13: Number(row.bmgl_13 ?? 0), bmgl_20: Number(row.bmgl_20 ?? 0),
    ust_10: Number(row.ust_10 ?? 0), ust_13: Number(row.ust_13 ?? 0), ust_20: Number(row.ust_20 ?? 0),
    vst_10: Number(row.vst_10 ?? 0), vst_13: Number(row.vst_13 ?? 0), vst_20: Number(row.vst_20 ?? 0),
  }

  const { error: upsertErr } = await (supabase.from('ea_uva') as any).upsert({
    tenant_id: tenantId, jahr, zeitraum,
    bmgl_ust_0: kz.bmgl_0, bmgl_ust_10: kz.bmgl_10, bmgl_ust_13: kz.bmgl_13, bmgl_ust_20: kz.bmgl_20,
    ust_10: kz.ust_10, ust_13: kz.ust_13, ust_20: kz.ust_20,
    vst_10: kz.vst_10, vst_13: kz.vst_13, vst_20: kz.vst_20,
  }, { onConflict: 'tenant_id,jahr,zeitraum' })
  if (upsertErr) return { ok: false, error: (upsertErr as R).message }

  revalidatePath('/buchhaltung/uva')
  return { ok: true, data: kz }
}

export async function markiereUvaUebermitteltAction(uvaId: string): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canAdmin(role)) return { ok: false, error: KEIN_ADMIN }
  const { data: uvaRaw } = await (supabase.from('ea_uva') as any)
    .select('jahr, zeitraum, gesperrt').eq('id', uvaId).eq('tenant_id', tenantId).maybeSingle()
  const uva = uvaRaw as R | null
  if (!uva) return { ok: false, error: 'UVA-Meldung nicht gefunden.' }
  if (uva.gesperrt) return { ok: true }
  const { error } = await (supabase.rpc as any)('sperre_ea_uva', { p_tenant_id: tenantId, p_jahr: uva.jahr, p_zeitraum: uva.zeitraum })
  if (error) return { ok: false, error: (error as R).message }
  revalidateBuchhaltung()
  return { ok: true }
}

export async function loescheUvaEntwurfAction(uvaId: string): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canAdmin(role)) return { ok: false, error: KEIN_ADMIN }
  const { error } = await (supabase.from('ea_uva') as any)
    .delete().eq('id', uvaId).eq('tenant_id', tenantId).eq('gesperrt', false)
  if (error) return { ok: false, error: (error as R).message }
  revalidatePath('/buchhaltung/uva')
  return { ok: true }
}

// ── Belege ────────────────────────────────────────────────────────────────────

/** Beleg verbuchen: Buchung anlegen (import_quelle='beleg') + Beleg verknüpfen */
export async function verbucheBelegAction(belegId: string, input: BuchungInput): Promise<ActionResult<{ id: string }>> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }

  const { data: belegRaw } = await (supabase.from('ea_belege') as any)
    .select('id, status, ea_transaktion_id').eq('id', belegId).eq('tenant_id', tenantId).maybeSingle()
  const beleg = belegRaw as R | null
  if (!beleg) return { ok: false, error: 'Beleg nicht gefunden.' }
  if (beleg.status === 'verbucht' && beleg.ea_transaktion_id) return { ok: false, error: 'Dieser Beleg wurde bereits verbucht.' }

  const res = await erstelleBuchung(input, 'beleg')
  if (!res.ok) return res
  const neueId = res.data!.id

  const { error } = await (supabase.from('ea_belege') as any)
    .update({ ea_transaktion_id: neueId, status: 'verbucht', verbucht_am: new Date().toISOString(), fehler_details: null })
    .eq('id', belegId).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: `Buchung angelegt, aber Beleg konnte nicht verknüpft werden: ${(error as R).message}` }

  revalidatePath('/buchhaltung/belege')
  revalidatePath(`/buchhaltung/belege/${belegId}`)
  return { ok: true, data: { id: neueId } }
}

/** Beleg löschen (Datei + Datensatz). Verbuchte Belege nur durch Admins – die Buchung bleibt erhalten. */
export async function loescheBelegAction(belegId: string): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }

  const { data: belegRaw } = await (supabase.from('ea_belege') as any)
    .select('id, storage_pfad, status').eq('id', belegId).eq('tenant_id', tenantId).maybeSingle()
  const beleg = belegRaw as R | null
  if (!beleg) return { ok: false, error: 'Beleg nicht gefunden.' }
  if (beleg.status === 'verbucht' && !canAdmin(role)) {
    return { ok: false, error: 'Verbuchte Belege sind ein Nachweis – nur Admins dürfen sie löschen.' }
  }

  const { error } = await (supabase.from('ea_belege') as any).delete().eq('id', belegId).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: (error as R).message }
  if (beleg.storage_pfad) await supabase.storage.from('ea-belege').remove([beleg.storage_pfad])

  revalidatePath('/buchhaltung/belege')
  return { ok: true }
}

export async function loescheBelegForm(belegId: string): Promise<void> {
  const res = await loescheBelegAction(belegId)
  if (!res.ok) console.error('loescheBeleg:', res.error)
}

// ── Anlagenverzeichnis (Migrationen 017/018) ──────────────────────────────────

export async function speichereAnlage(input: AnlageInput, id?: string): Promise<ActionResult<{ id: string }>> {
  const { supabase, tenantId, role, userId } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const bezeichnung = (input.bezeichnung ?? '').trim()
  if (!bezeichnung) return { ok: false, error: 'Bitte eine Bezeichnung angeben.' }
  if (!input.anschaffungsdatum || !/^\d{4}-\d{2}-\d{2}$/.test(input.anschaffungsdatum)) return { ok: false, error: 'Bitte ein gültiges Anschaffungsdatum angeben.' }
  const kosten = Number(input.anschaffungskosten)
  if (!Number.isFinite(kosten) || kosten < 0) return { ok: false, error: 'Bitte gültige Anschaffungskosten angeben.' }
  const methode: AfaMethode = input.methode === 'degressiv' ? 'degressiv' : input.methode === 'gwg' ? 'gwg' : 'linear'
  const nd = methode === 'gwg' ? 1 : Math.max(1, Math.min(60, Math.round(Number(input.nutzungsdauer_jahre) || 0)))
  if (methode !== 'gwg' && !(Number(input.nutzungsdauer_jahre) >= 1)) return { ok: false, error: 'Nutzungsdauer mindestens 1 Jahr – oder GWG-Sofortabschreibung wählen.' }
  const satz = methode === 'degressiv' ? Number(input.degressiv_satz) : null
  if (methode === 'degressiv' && !(satz && satz > 0 && satz <= 30)) return { ok: false, error: 'Degressiver AfA-Satz: zwischen 1 und 30 %.' }
  const restwert = Math.max(0, Number(input.restwert) || 0)
  if (restwert > kosten) return { ok: false, error: 'Der Restwert darf die Anschaffungskosten nicht übersteigen.' }
  if (input.abgang_datum && input.abgang_datum < input.anschaffungsdatum) return { ok: false, error: 'Das Abgangsdatum liegt vor der Anschaffung.' }
  if (input.transaktion_id) {
    const { data: tx } = await (supabase.from('ea_transaktionen') as any).select('id').eq('id', input.transaktion_id).eq('tenant_id', tenantId).maybeSingle()
    if (!tx) return { ok: false, error: 'Die gewählte Anschaffungsbuchung wurde nicht gefunden.' }
  }

  const w: R = {
    bezeichnung, gruppe: input.gruppe || 'sonstiges', konto_nr: (input.konto_nr ?? '').trim() || null,
    anschaffungsdatum: input.anschaffungsdatum, anschaffungskosten: kosten,
    nutzungsdauer_jahre: nd, methode, degressiv_satz: satz, sofortabschreibung: methode === 'gwg', restwert,
    abgang_datum: input.abgang_datum || null,
    abgang_erloes: input.abgang_datum && input.abgang_erloes != null ? Number(input.abgang_erloes) : null,
    transaktion_id: input.transaktion_id || null,
    lieferant: (input.lieferant ?? '').trim() || null,
    belegnummer: (input.belegnummer ?? '').trim() || null,
    notizen: (input.notizen ?? '').trim() || null,
  }
  const res = id
    ? await (supabase.from('anlagen') as any).update(w).eq('id', id).eq('tenant_id', tenantId).select('id').single()
    : await (supabase.from('anlagen') as any).insert({ ...w, tenant_id: tenantId, erstellt_von: userId }).select('id').single()
  if (res.error) return { ok: false, error: (res.error as R).message }
  revalidateAnlagen()
  return { ok: true, data: { id: (res.data as R).id } }
}

export async function loescheAnlage(id: string): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const { data: afa } = await (supabase.from('ea_transaktionen') as any).select('datum').eq('anlage_id', id).eq('tenant_id', tenantId)
  const jahre = [...new Set(((afa ?? []) as R[]).map(t => String(t.datum).slice(0, 4)))].sort()
  if (jahre.length > 0) return { ok: false, error: `Für diese Anlage ist die AfA ${jahre.join(', ')} gebucht. Bitte zuerst die AfA-Buchungen zurücknehmen.` }
  const { error } = await (supabase.from('anlagen') as any).delete().eq('id', id).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: (error as R).message }
  revalidateAnlagen()
  return { ok: true }
}

function revalidateAnlagen() {
  revalidatePath('/buchhaltung/anlagen')
  revalidatePath('/buchhaltung/anlagen/spiegel')
  revalidatePath('/buchhaltung')
  revalidatePath('/reporting')
}

/** Kategorie „Abschreibung (AfA)“ des Mandanten (Migration 018) */
async function afaKategorieId(supabase: any, tenantId: string): Promise<string | null> {
  const { data } = await (supabase.from('ea_kategorien') as any)
    .select('id').eq('tenant_id', tenantId).eq('name', 'Abschreibung (AfA)').limit(1).maybeSingle()
  return ((data as R | null)?.id as string | undefined) ?? null
}

/**
 * AfA eines Jahres buchen: je Anlage eine Ausgabe „Abschreibung (AfA)“ per 31.12.,
 * 0 % USt, ohne Zahlungskonto (nicht zahlungswirksam). Bestehende abweichende
 * Buchungen des Jahres werden ersetzt; gesperrte bleiben unangetastet.
 */
export async function bucheAfa(jahr: number): Promise<ActionResult<{ gebucht: number }>> {
  const { supabase, tenantId, role, userId } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) return { ok: false, error: 'Ungültiges Jahr.' }
  const stichtag = `${jahr}-12-31`
  const offen = await pruefeZeitraumOffen(supabase, tenantId, stichtag)
  if (!offen.offen) return { ok: false, error: offen.grund ?? `Dezember ${jahr} ist abgeschlossen – bitte den Monat zuerst öffnen.` }
  const katId = await afaKategorieId(supabase, tenantId)
  if (!katId) return { ok: false, error: 'Die Kategorie „Abschreibung (AfA)“ fehlt – bitte Migration 018 einspielen.' }

  const [anlagen, { data: bRaw }] = await Promise.all([
    ladeAnlagen(supabase, tenantId),
    (supabase.from('ea_transaktionen') as any).select('id, anlage_id, betrag_netto, datum, is_locked')
      .eq('tenant_id', tenantId).not('anlage_id', 'is', null).gte('datum', `${jahr}-01-01`).lte('datum', stichtag),
  ])
  const status = afaBuchungsStatus(anlagen, jahr, ((bRaw ?? []) as R[]).map(b => ({ id: b.id, anlage_id: b.anlage_id, betrag_netto: Number(b.betrag_netto), datum: b.datum, is_locked: !!b.is_locked })))
  const zuBuchen = status.zeilen.filter(z => z.status !== 'gebucht' && !z.gesperrt)
  if (zuBuchen.length === 0) return { ok: true, data: { gebucht: 0 } }

  const alt = zuBuchen.filter(z => z.buchungId).map(z => z.buchungId as string)
  if (alt.length > 0) {
    const { error } = await (supabase.from('ea_transaktionen') as any).delete().in('id', alt).eq('tenant_id', tenantId)
    if (error) return { ok: false, error: (error as R).message }
  }
  const neu = zuBuchen.filter(z => z.soll > 0).map(z => ({
    tenant_id: tenantId, typ: 'ausgabe', datum: stichtag,
    beschreibung: `AfA ${jahr}: ${z.anlage.bezeichnung}`,
    kategorie_id: katId, konto_id: null, betrag_netto: z.soll, ust_satz: 0, abzugsfaehig_pct: 100,
    import_quelle: 'manuell', anlage_id: z.anlage.id, erstellt_von: userId,
    notizen: 'Abschreibung laut Anlagenverzeichnis – nicht zahlungswirksam',
  }))
  if (neu.length > 0) {
    const { error } = await (supabase.from('ea_transaktionen') as any).insert(neu)
    if (error) return { ok: false, error: (error as R).message }
  }
  revalidateBuchhaltung(); revalidateAnlagen()
  return { ok: true, data: { gebucht: neu.length } }
}

/** Alle (nicht gesperrten) AfA-Buchungen eines Jahres löschen – das Verzeichnis bleibt unverändert. */
export async function afaZuruecknehmen(jahr: number): Promise<ActionResult<{ geloescht: number }>> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const stichtag = `${jahr}-12-31`
  const offen = await pruefeZeitraumOffen(supabase, tenantId, stichtag)
  if (!offen.offen) return { ok: false, error: offen.grund ?? `Dezember ${jahr} ist abgeschlossen.` }
  const { data: bRaw } = await (supabase.from('ea_transaktionen') as any).select('id')
    .eq('tenant_id', tenantId).not('anlage_id', 'is', null).eq('is_locked', false)
    .gte('datum', `${jahr}-01-01`).lte('datum', stichtag)
  const ids = ((bRaw ?? []) as R[]).map(b => b.id as string)
  if (ids.length > 0) {
    const { error } = await (supabase.from('ea_transaktionen') as any).delete().in('id', ids).eq('tenant_id', tenantId)
    if (error) return { ok: false, error: (error as R).message }
  }
  revalidateBuchhaltung(); revalidateAnlagen()
  return { ok: true, data: { geloescht: ids.length } }
}
