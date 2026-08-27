'use server'

// ── Server Actions: Verbindlichkeiten (Eingangsrechnungen) ───────────────────
// Anlegen/Bearbeiten (nur solange offen), Bezahlen (→ E&A-Ausgabe), Zahlung
// zurücknehmen (E&A-Buchung löschen, sofern nicht gesperrt), Stornieren, Löschen.

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite, type UserRole } from '@/lib/auth/roles'
import { ladeKategorien, pruefeZeitraumOffen } from '@/lib/ea/server'
import { rund2 } from '@/lib/rechnungen/summen'
import { GUELTIGE_UST_SAETZE_FAKT } from '@/lib/rechnungen/types'
import type { EingangsrechnungInput, EingangsrechnungZahlung } from '@/lib/rechnungen/verbindlichkeiten'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; data?: T }

const KEIN_SCHREIBRECHT = 'Keine Berechtigung – nur Admins und Mitarbeiter dürfen Verbindlichkeiten ändern.'
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/

async function getCtx() {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) throw new Error('Kein aktiver Mandant')
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, tenantId: membership.tenantId, role: membership.role as UserRole, userId: user?.id ?? null }
}

function revalidate() {
  revalidatePath('/rechnungen/verbindlichkeiten')
  revalidatePath('/rechnungen')
  revalidatePath('/buchhaltung')
  revalidatePath('/dashboard')
}

function normText(v: unknown, max = 2000): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}

function normalisiere(input: EingangsrechnungInput): { ok: true; werte: R } | { ok: false; error: string } {
  const lieferant = normText(input.lieferant, 200)
  if (!lieferant) return { ok: false, error: 'Bitte den Lieferanten angeben.' }
  const beschreibung = normText(input.beschreibung, 500)
  if (!beschreibung) return { ok: false, error: 'Bitte eine Bezeichnung angeben (z.B. „Hosting August").' }
  if (!ISO_DATUM.test(input.datum ?? '')) return { ok: false, error: 'Bitte ein gültiges Rechnungsdatum angeben.' }
  if (!ISO_DATUM.test(input.faellig_am ?? '')) return { ok: false, error: 'Bitte ein gültiges Fälligkeitsdatum angeben.' }
  if (input.faellig_am < input.datum) return { ok: false, error: 'Die Fälligkeit liegt vor dem Rechnungsdatum.' }
  const netto = rund2(Number(input.betrag_netto))
  if (!Number.isFinite(netto) || netto < 0) return { ok: false, error: 'Bitte einen gültigen Nettobetrag angeben.' }
  const satz = Number(input.ust_satz)
  if (!GUELTIGE_UST_SAETZE_FAKT.includes(satz)) return { ok: false, error: 'Ungültiger USt-Satz.' }
  const abz = Number(input.abzugsfaehig_pct ?? 100)
  if (!Number.isFinite(abz) || abz < 0 || abz > 100) return { ok: false, error: 'Abzugsfähigkeit muss zwischen 0 und 100 % liegen.' }
  return {
    ok: true,
    werte: {
      firma_id: input.firma_id || null, lieferant, rechnungsnummer: normText(input.rechnungsnummer, 100), beschreibung,
      datum: input.datum, faellig_am: input.faellig_am, betrag_netto: netto, ust_satz: satz, abzugsfaehig_pct: abz,
      kategorie_id: input.kategorie_id || null, notizen: normText(input.notizen),
    },
  }
}

export async function speichereEingangsrechnung(input: EingangsrechnungInput, id?: string): Promise<ActionResult<{ id: string }>> {
  const { supabase, tenantId, role, userId } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const norm = normalisiere(input)
  if (!norm.ok) return norm

  if (id) {
    const { data: best } = await (supabase.from('eingangsrechnungen') as R).select('id, status').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
    if (!best) return { ok: false, error: 'Eingangsrechnung nicht gefunden.' }
    if ((best as R).status !== 'offen') return { ok: false, error: 'Nur offene Eingangsrechnungen können bearbeitet werden – zuerst die Zahlung zurücknehmen.' }
    const { error } = await (supabase.from('eingangsrechnungen') as R).update(norm.werte).eq('id', id).eq('tenant_id', tenantId)
    if (error) return { ok: false, error: (error as R).message }
    revalidate()
    return { ok: true, data: { id } }
  }
  const { data, error } = await (supabase.from('eingangsrechnungen') as R)
    .insert({ ...norm.werte, tenant_id: tenantId, status: 'offen', erstellt_von: userId }).select('id').single()
  if (error) return { ok: false, error: (error as R).message }
  revalidate()
  return { ok: true, data: { id: (data as R).id } }
}

/** Bezahlen: Status → bezahlt + E&A-Ausgabe (netto, USt, Abzugsfähigkeit aus der Eingangsrechnung) */
export async function bezahleEingangsrechnung(id: string, zahlung: EingangsrechnungZahlung): Promise<ActionResult> {
  const { supabase, tenantId, role, userId } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  if (!ISO_DATUM.test(zahlung.datum ?? '')) return { ok: false, error: 'Bitte ein gültiges Zahlungsdatum angeben.' }
  const art = ['bank', 'bar', 'karte', 'sonstig'].includes(zahlung.art) ? zahlung.art : 'bank'

  const { data: raw } = await (supabase.from('eingangsrechnungen') as R).select('*').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!raw) return { ok: false, error: 'Eingangsrechnung nicht gefunden.' }
  const er = raw as R
  if (er.status !== 'offen') return { ok: false, error: 'Diese Eingangsrechnung ist nicht offen.' }

  const pruef = await pruefeZeitraumOffen(supabase, tenantId, zahlung.datum)
  if (!pruef.offen) return { ok: false, error: pruef.grund ?? 'Der E&A-Zeitraum ist geschlossen.' }

  // Kategorie: Vorbelegung der Eingangsrechnung, sonst erste Ausgabenkategorie
  let kategorieId: string | null = er.kategorie_id ?? null
  if (!kategorieId) {
    const kategorien = await ladeKategorien(supabase, tenantId, false)
    kategorieId = kategorien.find(k => k.name === 'Sonstige Betriebsausgaben')?.id ?? kategorien.find(k => k.typ === 'ausgabe')?.id ?? null
  }

  const beschreibung = `${er.beschreibung} – ${er.lieferant}`
  const { data: tx, error: txErr } = await (supabase.from('ea_transaktionen') as R)
    .insert({
      tenant_id: tenantId, typ: 'ausgabe', datum: zahlung.datum, beschreibung,
      kategorie_id: kategorieId, firma_id: er.firma_id ?? null, konto_id: zahlung.konto_id || null,
      betrag_netto: Number(er.betrag_netto), ust_satz: Number(er.ust_satz), abzugsfaehig_pct: Number(er.abzugsfaehig_pct ?? 100),
      belegnummer: er.rechnungsnummer ?? null, import_quelle: 'eingangsrechnung',
      notizen: er.notizen ?? null, erstellt_von: userId,
    })
    .select('id').single()
  if (txErr) return { ok: false, error: 'E&A-Buchung fehlgeschlagen: ' + (txErr as R).message }

  const { error } = await (supabase.from('eingangsrechnungen') as R)
    .update({ status: 'bezahlt', bezahlt_am: zahlung.datum, zahlungsart: art, konto_id: zahlung.konto_id || null, ea_transaktion_id: (tx as R).id })
    .eq('id', id).eq('tenant_id', tenantId).eq('status', 'offen')
  if (error) {
    await (supabase.from('ea_transaktionen') as R).delete().eq('id', (tx as R).id).eq('tenant_id', tenantId)
    return { ok: false, error: (error as R).message }
  }
  revalidate()
  return { ok: true }
}

/** Zahlung zurücknehmen: E&A-Buchung löschen (sofern nicht gesperrt), Status → offen */
export async function zahlungZuruecknehmen(id: string): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const { data: raw } = await (supabase.from('eingangsrechnungen') as R).select('id, status, ea_transaktion_id').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!raw) return { ok: false, error: 'Eingangsrechnung nicht gefunden.' }
  const er = raw as R
  if (er.status !== 'bezahlt') return { ok: false, error: 'Diese Eingangsrechnung ist nicht als bezahlt markiert.' }
  if (er.ea_transaktion_id) {
    const { data: tx } = await (supabase.from('ea_transaktionen') as R).select('id, is_locked').eq('id', er.ea_transaktion_id).eq('tenant_id', tenantId).maybeSingle()
    if (tx && (tx as R).is_locked) return { ok: false, error: 'Die zugehörige E&A-Buchung ist gesperrt (Monatsabschluss/UVA) – die Zahlung kann nicht zurückgenommen werden.' }
    if (tx) {
      const { error } = await (supabase.from('ea_transaktionen') as R).delete().eq('id', er.ea_transaktion_id).eq('tenant_id', tenantId)
      if (error) return { ok: false, error: (error as R).message }
    }
  }
  const { error } = await (supabase.from('eingangsrechnungen') as R)
    .update({ status: 'offen', bezahlt_am: null, zahlungsart: null, konto_id: null, ea_transaktion_id: null })
    .eq('id', id).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: (error as R).message }
  revalidate()
  return { ok: true }
}

export async function storniereEingangsrechnung(id: string): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const { error } = await (supabase.from('eingangsrechnungen') as R)
    .update({ status: 'storniert' }).eq('id', id).eq('tenant_id', tenantId).eq('status', 'offen')
  if (error) return { ok: false, error: (error as R).message }
  revalidate()
  return { ok: true }
}

/** Löschen: nur offen oder storniert (bezahlte zuerst Zahlung zurücknehmen) */
export async function loescheEingangsrechnung(id: string): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const { data: raw } = await (supabase.from('eingangsrechnungen') as R).select('id, status').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!raw) return { ok: false, error: 'Eingangsrechnung nicht gefunden.' }
  if ((raw as R).status === 'bezahlt') return { ok: false, error: 'Bezahlte Eingangsrechnungen können nicht gelöscht werden – zuerst die Zahlung zurücknehmen.' }
  const { error } = await (supabase.from('eingangsrechnungen') as R).delete().eq('id', id).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: (error as R).message }
  revalidate()
  return { ok: true }
}
