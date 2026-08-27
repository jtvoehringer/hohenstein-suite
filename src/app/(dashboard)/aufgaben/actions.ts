'use server'

// ── Server Actions: Aufgaben (Team-To-dos) ───────────────────────────────────
// Alle Aktionen: tenant_id ausschließlich aus getCurrentMembership(), Schreib-
// recht über canWrite(). Spalten lt. Migration 004_aufgaben_email.sql.

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { ladeMandantMitglieder } from '@/lib/aufgaben/mitglieder'
import { AUFGABE_BEREICHE, AUFGABE_PRIORITAET, AUFGABE_STATUS, type MitgliedOption } from '@/lib/aufgaben/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export type AufgabeInput = {
  id?: string | null
  titel: string
  beschreibung?: string | null
  status: string
  prioritaet: string
  verantwortlich_id?: string | null
  faellig_am?: string | null
  bereich?: string | null
  kontakt_id?: string | null
  firma_id?: string | null
}

export type ActionResult = { fehler?: string; id?: string }

function revalidate() {
  revalidatePath('/aufgaben')
  revalidatePath('/dashboard')
}

async function schreibKontext(): Promise<{ tenantId: string; userId: string } | { fehler: string }> {
  const membership = await getCurrentMembership()
  if (!membership) return { fehler: 'Kein aktiver Mandant' }
  if (!canWrite(membership.role)) return { fehler: 'Keine Berechtigung' }
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { fehler: 'Nicht angemeldet' }
  return { tenantId: membership.tenantId, userId: user.id }
}

const uuidOderNull = (v: string | null | undefined) =>
  v && /^[0-9a-f-]{36}$/i.test(v) ? v : null
const datumOderNull = (v: string | null | undefined) =>
  v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null

/** Aufgabe anlegen (ohne id) oder bearbeiten (mit id) */
export async function speichereAufgabeAction(input: AufgabeInput): Promise<ActionResult> {
  const ctx = await schreibKontext()
  if ('fehler' in ctx) return { fehler: ctx.fehler }

  const titel = (input.titel ?? '').trim()
  if (!titel) return { fehler: 'Titel ist ein Pflichtfeld.' }
  if (!AUFGABE_STATUS.some(s => s.value === input.status)) return { fehler: 'Ungültiger Status.' }
  if (!AUFGABE_PRIORITAET.some(p => p.value === input.prioritaet)) return { fehler: 'Ungültige Priorität.' }
  const bereich = input.bereich && AUFGABE_BEREICHE.some(b => b.value === input.bereich) ? input.bereich : null

  const supabase = await createSupabaseServerClient()
  const werte: R = {
    titel,
    beschreibung:      (input.beschreibung ?? '').trim() || null,
    status:            input.status,
    prioritaet:        input.prioritaet,
    verantwortlich_id: uuidOderNull(input.verantwortlich_id),
    faellig_am:        datumOderNull(input.faellig_am),
    bereich,
    kontakt_id:        uuidOderNull(input.kontakt_id),
    firma_id:          uuidOderNull(input.firma_id),
  }

  if (input.id) {
    const { error } = await (supabase.from('aufgaben') as any)
      .update(werte)
      .eq('id', input.id)
      .eq('tenant_id', ctx.tenantId)
    if (error) return { fehler: error.message }
    revalidate()
    return { id: input.id }
  }

  const { data, error } = await (supabase.from('aufgaben') as any)
    .insert({ ...werte, tenant_id: ctx.tenantId, erstellt_von: ctx.userId })
    .select('id')
    .single()
  if (error) return { fehler: error.message }
  revalidate()
  return { id: (data as R).id }
}

/** Schnell-Statuswechsel (Dashboard-Kachel, Board-Buttons) */
export async function setzeAufgabeStatusAction(id: string, status: string): Promise<ActionResult> {
  const ctx = await schreibKontext()
  if ('fehler' in ctx) return { fehler: ctx.fehler }
  if (!AUFGABE_STATUS.some(s => s.value === status)) return { fehler: 'Ungültiger Status.' }
  const supabase = await createSupabaseServerClient()
  const { error } = await (supabase.from('aufgaben') as any)
    .update({ status })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
  if (error) return { fehler: error.message }
  revalidate()
  return { id }
}

/** Variante für <form action> in Server Components (Dashboard-Kachel) */
export async function statusFormAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '')
  if (!id || !status) return
  await setzeAufgabeStatusAction(id, status)
}

export async function loescheAufgabeAction(id: string): Promise<ActionResult> {
  const ctx = await schreibKontext()
  if ('fehler' in ctx) return { fehler: ctx.fehler }
  const supabase = await createSupabaseServerClient()
  const { error } = await (supabase.from('aufgaben') as any)
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
  if (error) return { fehler: error.message }
  revalidate()
  return {}
}

/** Mitglieder des aktiven Mandanten (nur id + Name) – für die Verantwortlich-Auswahl */
export async function ladeMitgliederAction(): Promise<MitgliedOption[]> {
  const membership = await getCurrentMembership()
  if (!membership) return []
  return ladeMandantMitglieder(membership.tenantId)
}
