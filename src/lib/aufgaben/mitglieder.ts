// ── Mitglieder des Mandanten für die Verantwortlich-Auswahl (server-only) ─────
// Über die RPC mandant_mitglieder (SECURITY DEFINER, Migration 006): jedes
// aktive Mitglied sieht die Kolleginnen/Kollegen seines Mandanten mit Name –
// ohne Service-Role-Key, nur id + Name + Rolle (keine E-Mail).

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { MitgliedOption } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export async function ladeMandantMitglieder(tenantId: string): Promise<MitgliedOption[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await (supabase.rpc('mandant_mitglieder', { p_tenant_id: tenantId }) as any)
  return ((data ?? []) as R[])
    .map(r => ({ id: r.user_id as string, name: (r.name as string) || 'Unbekannt' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

/** Map user_id → Anzeigename */
export function mitgliederMap(m: MitgliedOption[]): Map<string, string> {
  return new Map(m.map(x => [x.id, x.name]))
}
