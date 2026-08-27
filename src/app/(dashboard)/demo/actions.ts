'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'

/**
 * Demo-Daten zurücksetzen: ruft die RPC demo_zuruecksetzen() mit dem normalen
 * Server-Client auf. Die Funktion prüft selbst die Mitgliedschaft im Demo-
 * Mandanten (admin/mitarbeiter) – hier zusätzlich canWrite im aktiven Mandanten.
 */
export async function demoZuruecksetzenAction(): Promise<{ fehler?: string; ok?: boolean }> {
  const membership = await getCurrentMembership()
  if (!membership) return { fehler: 'Kein aktiver Mandant' }
  if (!canWrite(membership.role)) return { fehler: 'Keine Berechtigung' }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)('demo_zuruecksetzen')
  if (error) return { fehler: error.message }

  revalidatePath('/demo')
  revalidatePath('/dashboard')
  revalidatePath('/aufgaben')
  return { ok: true }
}
