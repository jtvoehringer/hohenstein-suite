'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite, type UserRole } from '@/lib/auth/roles'

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

const KEIN_SCHREIBRECHT = 'Keine Berechtigung – nur Admins und Mitarbeiter dürfen Konten ändern.'

function revalidateKonten(...ids: (string | null | undefined)[]) {
  revalidatePath('/konten')
  revalidatePath('/buchhaltung')
  for (const id of ids) if (id) revalidatePath(`/konten/${id}/abstimmung`)
}

// ── Konto ─────────────────────────────────────────────────────────────────────

export type KontoInput = {
  name: string
  typ: 'giro' | 'kreditkarte' | 'kassa' | 'sonstiges'
  iban: string | null
  eroeffnungsdatum: string
  eroeffnungssaldo: number
  sortierung: number
}

export async function speichereKonto(input: KontoInput, id?: string): Promise<ActionResult<{ id: string }>> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const name = (input.name ?? '').trim()
  if (!name) return { ok: false, error: 'Bitte eine Bezeichnung angeben.' }
  if (!['giro', 'kreditkarte', 'kassa', 'sonstiges'].includes(input.typ)) return { ok: false, error: 'Ungültiger Kontotyp.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.eroeffnungsdatum ?? '')) return { ok: false, error: 'Bitte ein gültiges Eröffnungsdatum angeben.' }
  const saldo = Number(input.eroeffnungssaldo)
  if (!Number.isFinite(saldo)) return { ok: false, error: 'Ungültiger Eröffnungssaldo.' }
  const werte = {
    name, typ: input.typ,
    iban: input.iban?.replace(/\s+/g, '').toUpperCase() || null,
    eroeffnungsdatum: input.eroeffnungsdatum,
    eroeffnungssaldo: Math.round(saldo * 100) / 100,
    sortierung: Number.isFinite(Number(input.sortierung)) ? Math.trunc(Number(input.sortierung)) : 0,
  }
  if (id) {
    const { error } = await (supabase.from('konten') as any).update(werte).eq('id', id).eq('tenant_id', tenantId)
    if (error) return { ok: false, error: (error as R).message }
    revalidateKonten(id)
    return { ok: true, data: { id } }
  }
  const { data, error } = await (supabase.from('konten') as any)
    .insert({ ...werte, tenant_id: tenantId, aktiv: true }).select('id').single()
  if (error) return { ok: false, error: (error as R).message }
  revalidateKonten()
  return { ok: true, data: { id: (data as R).id } }
}

export async function setzeKontoAktiv(id: string, aktiv: boolean): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const { error } = await (supabase.from('konten') as any).update({ aktiv }).eq('id', id).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: (error as R).message }
  revalidateKonten(id)
  return { ok: true }
}

// ── Umbuchung ─────────────────────────────────────────────────────────────────

export type UmbuchungInput = {
  von_konto_id: string
  nach_konto_id: string
  betrag: number
  datum: string
  beschreibung: string | null
}

export async function erstelleUmbuchung(input: UmbuchungInput): Promise<ActionResult> {
  const { supabase, tenantId, role, userId } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  if (!input.von_konto_id || !input.nach_konto_id) return { ok: false, error: 'Bitte beide Konten wählen.' }
  if (input.von_konto_id === input.nach_konto_id) return { ok: false, error: 'Von- und Nach-Konto müssen unterschiedlich sein.' }
  const betrag = Number(input.betrag)
  if (!Number.isFinite(betrag) || betrag <= 0) return { ok: false, error: 'Der Betrag muss größer als 0 sein.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.datum ?? '')) return { ok: false, error: 'Bitte ein gültiges Datum angeben.' }

  // Beide Konten müssen dem Mandanten gehören
  const { data: kontenRaw } = await (supabase.from('konten') as any)
    .select('id').eq('tenant_id', tenantId).in('id', [input.von_konto_id, input.nach_konto_id])
  if (((kontenRaw ?? []) as R[]).length !== 2) return { ok: false, error: 'Konto nicht gefunden.' }

  const { error } = await (supabase.from('konto_umbuchungen') as any).insert({
    tenant_id: tenantId, von_konto_id: input.von_konto_id, nach_konto_id: input.nach_konto_id,
    betrag: Math.round(betrag * 100) / 100, datum: input.datum,
    beschreibung: input.beschreibung?.trim() || null, erstellt_von: userId,
  })
  if (error) return { ok: false, error: (error as R).message }
  revalidateKonten(input.von_konto_id, input.nach_konto_id)
  return { ok: true }
}

export async function loescheUmbuchung(id: string): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  const { data: u } = await (supabase.from('konto_umbuchungen') as any)
    .select('von_konto_id, nach_konto_id').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  const { error } = await (supabase.from('konto_umbuchungen') as any).delete().eq('id', id).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: (error as R).message }
  revalidateKonten((u as R | null)?.von_konto_id, (u as R | null)?.nach_konto_id)
  return { ok: true }
}

// ── Abgleich (RPC setze_kontobewegung_abgeglichen) ────────────────────────────
// Bewusst unabhängig von is_locked – der Abgleich gegen den Kontoauszug bleibt
// auch nach Monatsabschluss/UVA möglich (siehe Trigger in 003_ea.sql).

export type BewegungQuelle = 'ea_transaktion' | 'umbuchung_von' | 'umbuchung_nach'

export async function setzeAbgeglichen(kontoId: string, quelle: BewegungQuelle, id: string, abgeglichen: boolean): Promise<ActionResult> {
  const { supabase, tenantId, role } = await getCtx()
  if (!canWrite(role)) return { ok: false, error: KEIN_SCHREIBRECHT }
  if (!['ea_transaktion', 'umbuchung_von', 'umbuchung_nach'].includes(quelle)) return { ok: false, error: 'Unbekannte Quelle.' }
  const { error } = await (supabase.rpc as any)('setze_kontobewegung_abgeglichen', {
    p_tenant_id: tenantId, p_quelle: quelle, p_id: id, p_abgeglichen: abgeglichen,
  })
  if (error) return { ok: false, error: (error as R).message }
  revalidatePath(`/konten/${kontoId}/abstimmung`)
  return { ok: true }
}
