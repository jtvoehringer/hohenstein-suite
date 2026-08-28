'use server'

// ── Server Actions: software:112-Demo (Reset + Vorführ-Zugänge des Teams) ─────
// Der Demo-Bereich ist nur für das Management-Team (Admins) – externer Zugriff
// für Interessenten wird hier NICHT vergeben (läuft später über die Homepage).
// Zugriff auf software:112 ausschließlich über src/lib/s112/admin.ts.

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canAdmin } from '@/lib/auth/roles'
import {
  s112DemoReset, s112DemoUserAnlegen, s112DemoUserAktiv, s112DemoUserRolle,
  s112DemoUserPasswort, s112DemoUserLoeschen, demoPasswort, s112Konfiguriert,
} from '@/lib/s112/admin'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
type Ergebnis<T = undefined> = { ok: true; data?: T } | { ok: false; fehler: string }

async function ctx() {
  const membership = await getCurrentMembership()
  if (!membership) throw new Error('Kein aktiver Mandant')
  if (!canAdmin(membership.role)) throw new Error('Der Demo-Bereich ist nur für das Management-Team (Admins).')
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, tenantId: membership.tenantId, userId: user?.id ?? null }
}

function fehler(e: unknown): { ok: false; fehler: string } {
  return { ok: false, fehler: e instanceof Error ? e.message : String(e) }
}

function neuSetzen() {
  revalidatePath('/demo')
}

/** Demo-Daten in software:112 neu erzeugen */
export async function demoZuruecksetzenAction(): Promise<Ergebnis> {
  try {
    const { supabase, tenantId, userId } = await ctx()
    if (!s112Konfiguriert()) return { ok: false, fehler: 'software:112-Anbindung nicht konfiguriert.' }
    await s112DemoReset()
    await (supabase.from('demo_resets') as any).insert({ tenant_id: tenantId, ausgeloest_von: userId })
    neuSetzen()
    return { ok: true }
  } catch (e) { return fehler(e) }
}

export type NeuerZugang = {
  name: string
  email: string
  rolle: 'winzer' | 'leser'
  /** null = unbefristet (Standard für Team-Zugänge) */
  gueltig_bis: string | null
  notizen?: string | null
}

/** Vorführ-Zugang anlegen: Benutzer im software:112-Demo-Mandanten + Eintrag in demo_zugaenge. Liefert das Startpasswort (wird nur einmal angezeigt). */
export async function zugangAnlegenAction(input: NeuerZugang): Promise<Ergebnis<{ id: string; passwort: string }>> {
  try {
    const { supabase, tenantId, userId } = await ctx()
    const email = input.email.trim().toLowerCase()
    const name = input.name.trim()
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, fehler: 'Name und gültige E-Mail-Adresse sind erforderlich.' }
    if (!s112Konfiguriert()) return { ok: false, fehler: 'software:112-Anbindung nicht konfiguriert.' }

    const passwort = demoPasswort()
    const { userId: s112UserId } = await s112DemoUserAnlegen({ email, name, passwort, rolle: input.rolle })

    // Bestehenden Eintrag (gleiche E-Mail) reaktivieren statt doppelt anlegen
    const { data: vorhanden } = await (supabase.from('demo_zugaenge') as any)
      .select('id').eq('tenant_id', tenantId).eq('email', email).limit(1).maybeSingle()
    const werte = {
      tenant_id: tenantId, name, email, s112_user_id: s112UserId, s112_rolle: input.rolle,
      gueltig_bis: input.gueltig_bis || null, status: 'aktiv',
      kontakt_id: null, firma_id: null, notizen: input.notizen?.trim() || null,
      erstellt_von: userId,
    }
    let id: string
    if ((vorhanden as R | null)?.id) {
      id = (vorhanden as R).id
      const { error } = await (supabase.from('demo_zugaenge') as any).update(werte).eq('id', id).eq('tenant_id', tenantId)
      if (error) throw new Error(error.message)
    } else {
      const { data, error } = await (supabase.from('demo_zugaenge') as any).insert(werte).select('id').single()
      if (error) throw new Error(error.message)
      id = (data as R).id
    }
    neuSetzen()
    return { ok: true, data: { id, passwort } }
  } catch (e) { return fehler(e) }
}

async function ladeZugang(supabase: R, tenantId: string, id: string): Promise<R> {
  const { data, error } = await (supabase.from('demo_zugaenge') as any)
    .select('*').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Zugang nicht gefunden')
  return data as R
}

/** Gültigkeit setzen (Datum oder null = unbefristet) und ggf. reaktivieren */
export async function zugangVerlaengernAction(id: string, gueltigBis: string | null): Promise<Ergebnis> {
  try {
    const { supabase, tenantId } = await ctx()
    const z = await ladeZugang(supabase, tenantId, id)
    if (z.s112_user_id && z.status !== 'aktiv') await s112DemoUserAktiv(z.s112_user_id, true)
    const { error } = await (supabase.from('demo_zugaenge') as any)
      .update({ gueltig_bis: gueltigBis, status: 'aktiv' }).eq('id', id).eq('tenant_id', tenantId)
    if (error) throw new Error(error.message)
    neuSetzen()
    return { ok: true }
  } catch (e) { return fehler(e) }
}

/** Zugang sperren / entsperren */
export async function zugangSperrenAction(id: string, sperren: boolean): Promise<Ergebnis> {
  try {
    const { supabase, tenantId } = await ctx()
    const z = await ladeZugang(supabase, tenantId, id)
    if (z.s112_user_id) await s112DemoUserAktiv(z.s112_user_id, !sperren)
    const { error } = await (supabase.from('demo_zugaenge') as any)
      .update({ status: sperren ? 'gesperrt' : 'aktiv' }).eq('id', id).eq('tenant_id', tenantId)
    if (error) throw new Error(error.message)
    neuSetzen()
    return { ok: true }
  } catch (e) { return fehler(e) }
}

export async function zugangRolleAction(id: string, rolle: 'winzer' | 'leser'): Promise<Ergebnis> {
  try {
    const { supabase, tenantId } = await ctx()
    const z = await ladeZugang(supabase, tenantId, id)
    if (z.s112_user_id) await s112DemoUserRolle(z.s112_user_id, rolle)
    const { error } = await (supabase.from('demo_zugaenge') as any).update({ s112_rolle: rolle }).eq('id', id).eq('tenant_id', tenantId)
    if (error) throw new Error(error.message)
    neuSetzen()
    return { ok: true }
  } catch (e) { return fehler(e) }
}

/** Neues Startpasswort erzeugen (wird nur einmal angezeigt) */
export async function zugangPasswortNeuAction(id: string): Promise<Ergebnis<{ passwort: string }>> {
  try {
    const { supabase, tenantId } = await ctx()
    const z = await ladeZugang(supabase, tenantId, id)
    if (!z.s112_user_id) return { ok: false, fehler: 'Kein software:112-Benutzer verknüpft.' }
    const passwort = demoPasswort()
    await s112DemoUserPasswort(z.s112_user_id, passwort)
    return { ok: true, data: { passwort } }
  } catch (e) { return fehler(e) }
}

/** Zugang endgültig löschen (Benutzer in software:112 wird entfernt) */
export async function zugangLoeschenAction(id: string): Promise<Ergebnis> {
  try {
    const { supabase, tenantId } = await ctx()
    const z = await ladeZugang(supabase, tenantId, id)
    if (z.s112_user_id) await s112DemoUserLoeschen(z.s112_user_id)
    const { error } = await (supabase.from('demo_zugaenge') as any).delete().eq('id', id).eq('tenant_id', tenantId)
    if (error) throw new Error(error.message)
    neuSetzen()
    return { ok: true }
  } catch (e) { return fehler(e) }
}
