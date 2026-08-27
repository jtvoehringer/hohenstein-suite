import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canManageUsers } from '@/lib/auth/roles'
import { ladeMitglieder } from './actions'
import BenutzerClient from './BenutzerClient'

export const metadata: Metadata = { title: 'Benutzer – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default async function BenutzerPage() {
  const membership = await getCurrentMembership()
  if (!membership) redirect('/mandant-waehlen')

  if (!canManageUsers(membership.role)) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl mb-4">Benutzer</h1>
        <div className="card flex items-start gap-3">
          <ShieldAlert size={18} strokeWidth={1.75} className="text-hs-warn-fg mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-hs-text">Nur für Admins</p>
            <p className="text-sm text-hs-text-2 mt-1">Die Benutzerverwaltung (Einladen, Rollen, Zugriff) ist Admins vorbehalten.</p>
          </div>
        </div>
      </div>
    )
  }

  const supabase = await createSupabaseServerClient()
  const [mitglieder, { data: tenant }, { data: domains }] = await Promise.all([
    ladeMitglieder(),
    (supabase.from('tenants') as any).select('name, ist_demo').eq('id', membership.tenantId).maybeSingle(),
    (supabase.from('zugelassene_domains') as any).select('domain, role').order('domain'),
  ])
  const t = (tenant ?? {}) as R

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl">Benutzer</h1>
        <p className="text-[13.5px] text-hs-text-2 mt-1">
          Mitglieder und Rollen für <span className="font-medium text-hs-text">{t.name ?? 'diesen Mandanten'}</span>{t.ist_demo ? ' (Demo-Umgebung)' : ''}.
          Neue Benutzer erhalten Zugang zum aktiven Mandanten.
        </p>
      </div>
      <BenutzerClient mitglieder={mitglieder} domains={((domains ?? []) as R[]).map(d => ({ domain: d.domain, role: d.role }))} />
    </div>
  )
}
