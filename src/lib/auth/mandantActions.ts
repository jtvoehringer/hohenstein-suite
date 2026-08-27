'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { setActiveTenantCookie } from '@/lib/auth/activeTenant'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

/**
 * Aktiven Mandanten wechseln (z.B. Hohenstein Consulting ↔ Demo-Umgebung).
 * Validiert die Mitgliedschaft serverseitig, setzt den Cookie und lädt das Dashboard.
 */
export async function wechsleMandantAction(formData: FormData) {
  const tenantId = String(formData.get('tenant_id') ?? '')
  const next     = String(formData.get('next') ?? '/dashboard')
  if (!tenantId) return

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await (supabase.from('tenant_memberships') as any)
    .select('tenant_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .eq('aktiv', true)
    .limit(1)
    .maybeSingle()
  if (!(data as R | null)?.tenant_id) return

  await setActiveTenantCookie(tenantId)
  redirect(next.startsWith('/') ? next : '/dashboard')
}
