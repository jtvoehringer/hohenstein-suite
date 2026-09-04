'use server'

// ── Datencenter: Server-Actions für Ordner und Datei-Organisation ─────────────
// Upload/Download/Datei-Löschen laufen über /api/datencenter/datei (FormData
// bzw. signierte URLs); hier liegt alles, was nur die DB betrifft.

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
type ActionResult = { error?: string; id?: string }

async function requireWrite(): Promise<{ tenantId: string; userId: string }> {
  const membership = await getCurrentMembership()
  if (!membership) throw new Error('Nicht angemeldet oder kein aktiver Mandant.')
  if (!canWrite(membership.role)) throw new Error('Keine Schreibberechtigung.')
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet.')
  return { tenantId: membership.tenantId, userId: user.id }
}

const fehler = (e: unknown): ActionResult => ({ error: e instanceof Error ? e.message : String(e) })

export async function createOrdner(name: string, parentId: string | null): Promise<ActionResult> {
  try {
    const { tenantId, userId } = await requireWrite()
    const n = name.trim()
    if (!n) return { error: 'Bitte einen Ordnernamen angeben.' }
    const supabase = await createSupabaseServerClient()
    const { data, error } = await (supabase.from('ablage_ordner') as any)
      .insert({ tenant_id: tenantId, parent_id: parentId, name: n, erstellt_von: userId })
      .select('id').single()
    if (error) return { error: (error as R).message }
    revalidatePath('/datencenter')
    return { id: (data as R | null)?.id }
  } catch (e) { return fehler(e) }
}

export async function renameOrdner(id: string, name: string): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const n = name.trim()
    if (!n) return { error: 'Bitte einen Ordnernamen angeben.' }
    const supabase = await createSupabaseServerClient()
    const { error } = await (supabase.from('ablage_ordner') as any)
      .update({ name: n }).eq('id', id).eq('tenant_id', tenantId)
    if (error) return { error: (error as R).message }
    revalidatePath('/datencenter')
    return {}
  } catch (e) { return fehler(e) }
}

/** Ordner samt Unterordnern und Dateien löschen (inkl. Storage-Objekte) */
export async function deleteOrdner(id: string): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()

    // Teilbaum einsammeln
    const { data: alleOrdner } = await (supabase.from('ablage_ordner') as any)
      .select('id, parent_id').eq('tenant_id', tenantId)
    const kinder = new Map<string | null, string[]>()
    for (const o of (alleOrdner ?? []) as R[]) {
      const p = (o.parent_id as string | null) ?? null
      kinder.set(p, [...(kinder.get(p) ?? []), o.id as string])
    }
    const ids: string[] = []
    const stack = [id]
    while (stack.length) {
      const cur = stack.pop() as string
      ids.push(cur)
      for (const k of kinder.get(cur) ?? []) stack.push(k)
    }

    // Storage-Objekte der betroffenen Dateien entfernen (DB-Zeilen fallen per Cascade)
    const { data: dateien } = await (supabase.from('ablage_dateien') as any)
      .select('storage_pfad').in('ordner_id', ids).eq('tenant_id', tenantId)
    const pfade = ((dateien ?? []) as R[]).map(d => d.storage_pfad as string).filter(Boolean)
    if (pfade.length > 0) await supabase.storage.from('datencenter').remove(pfade)

    const { error } = await (supabase.from('ablage_ordner') as any)
      .delete().eq('id', id).eq('tenant_id', tenantId)
    if (error) return { error: (error as R).message }
    revalidatePath('/datencenter')
    return {}
  } catch (e) { return fehler(e) }
}

/** Datei in einen anderen Ordner verschieben (null = Wurzel) */
export async function moveDatei(dateiId: string, ordnerId: string | null): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    if (ordnerId) {
      const { data } = await (supabase.from('ablage_ordner') as any)
        .select('id').eq('id', ordnerId).eq('tenant_id', tenantId).maybeSingle()
      if (!data) return { error: 'Zielordner nicht gefunden.' }
    }
    const { error } = await (supabase.from('ablage_dateien') as any)
      .update({ ordner_id: ordnerId }).eq('id', dateiId).eq('tenant_id', tenantId)
    if (error) return { error: (error as R).message }
    revalidatePath('/datencenter')
    return {}
  } catch (e) { return fehler(e) }
}

export async function renameDatei(dateiId: string, name: string): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const n = name.trim()
    if (!n) return { error: 'Bitte einen Dateinamen angeben.' }
    const supabase = await createSupabaseServerClient()
    const { error } = await (supabase.from('ablage_dateien') as any)
      .update({ dateiname: n }).eq('id', dateiId).eq('tenant_id', tenantId)
    if (error) return { error: (error as R).message }
    revalidatePath('/datencenter')
    return {}
  } catch (e) { return fehler(e) }
}
