'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getCurrentMembership, canAdmin, canWrite, type UserRole } from '@/lib/auth/roles'
import { pruefeZeitraumOffen, uebernehmeStandardkategorien } from '@/lib/ea/server'
import { GUELTIGE_UST_SAETZE, type BuchungInput } from '@/lib/ea/types'

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
