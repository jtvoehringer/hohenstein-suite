import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { ladeKategorien } from '@/lib/ea/server'
import KategorienClient from './KategorienClient'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default async function KategorienPage() {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId

  // ladeKategorien kopiert beim ersten Zugriff die Standardvorlage (tenant_id IS NULL)
  const [kategorien, { data: vorlageRaw }] = await Promise.all([
    ladeKategorien(supabase, tenantId, false),
    (supabase.from('ea_kategorien') as any).select('name').is('tenant_id', null),
  ])
  const vorhanden = new Set(kategorien.map(k => k.name.trim().toLowerCase()))
  const fehlendeVorlagen = ((vorlageRaw ?? []) as R[]).filter(v => !vorhanden.has(String(v.name).trim().toLowerCase())).length

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl">Buchungskategorien</h1>
        <p className="text-sm text-hs-text-2 mt-0.5">Kontenrahmen light: Kategorie, EKR-Konto, Standard-USt-Satz und Abzugsfähigkeit je Buchungsart.</p>
      </div>
      <KategorienClient kategorien={kategorien} writeOk={canWrite(membership.role)} fehlendeVorlagen={fehlendeVorlagen} />
    </div>
  )
}
