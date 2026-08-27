import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, roleLabel, canWrite, canAdmin } from '@/lib/auth/roles'
import AppShell from '@/components/layout/AppShell'
import SessionTimeout from '@/components/SessionTimeout'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

/** Kontext des aktiven Mandanten – wird an die Kopfleiste/Navigation durchgereicht */
export type MandantKontext = {
  tenantId: string
  name: string
  anzeigename: string
  logo_url: string | null
  istDemo: boolean
  session_timeout?: number | null
}

export type MandantOption = { tenantId: string; name: string; istDemo: boolean }

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const membership = await getCurrentMembership()
  if (!membership) redirect('/mandant-waehlen')
  const role = membership.role

  const [{ data: profil }, { data: einstellungen }, { data: tenant }, { data: alleMemberships }] = await Promise.all([
    (supabase.from('profiles') as any).select('full_name, display_name').eq('id', user.id).maybeSingle(),
    (supabase.from('tenant_einstellungen') as any)
      .select('anzeigename, logo_url, session_timeout_minuten').eq('tenant_id', membership.tenantId).maybeSingle(),
    (supabase.from('tenants') as any).select('name, ist_demo').eq('id', membership.tenantId).maybeSingle(),
    (supabase.from('tenant_memberships') as any)
      .select('tenant_id, tenants(name, ist_demo)').eq('user_id', user.id).eq('aktiv', true).order('created_at', { ascending: true }),
  ])

  const t = (tenant ?? {}) as R
  const e = (einstellungen ?? {}) as R
  const mandant: MandantKontext = {
    tenantId:        membership.tenantId,
    name:            t.name ?? 'Mandant',
    anzeigename:     e.anzeigename ?? t.name ?? 'Mandant',
    logo_url:        e.logo_url ?? null,
    istDemo:         !!t.ist_demo,
    session_timeout: e.session_timeout_minuten ?? null,
  }
  const mandanten: MandantOption[] = ((alleMemberships ?? []) as R[]).map(m => ({
    tenantId: m.tenant_id,
    name:     (m.tenants as R | null)?.name ?? m.tenant_id,
    istDemo:  !!(m.tenants as R | null)?.ist_demo,
  }))

  const p = (profil ?? {}) as R
  const userName = p.full_name || p.display_name || user.user_metadata?.full_name || (user.email ?? '').split('@')[0]

  return (
    <>
      <SessionTimeout timeoutMinuten={mandant.session_timeout} />
      <AppShell
        userEmail={user.email ?? ''}
        userName={userName}
        role={role}
        roleLabel={roleLabel(role)}
        mandant={mandant}
        mandanten={mandanten}
        darfSchreiben={canWrite(role)}
        istAdmin={canAdmin(role)}
      >
        {children}
      </AppShell>
    </>
  )
}
