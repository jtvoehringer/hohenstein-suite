import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { ladeKategorien } from '@/lib/ea/server'
import { ladeLeistungen } from '@/lib/rechnungen/server'
import LeistungenClient from '@/components/rechnungen/LeistungenClient'

export const dynamic = 'force-dynamic'

export default async function LeistungenPage() {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId

  const [leistungen, kategorien] = await Promise.all([
    ladeLeistungen(supabase, tenantId, false),
    ladeKategorien(supabase, tenantId),
  ])
  const einnahmeKategorien = kategorien.filter(k => k.typ === 'einnahme' || k.typ === 'beides').map(k => ({ id: k.id, name: k.name }))

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <Link href="/rechnungen" className="text-sm text-hs-text-2 hover:text-hs-text inline-flex items-center gap-1"><ArrowLeft size={14} strokeWidth={1.75} /> Fakturierung</Link>
        <h1 className="text-2xl mt-1">Leistungskatalog</h1>
        <p className="text-sm text-hs-text-2 mt-0.5">Beratungstage, Stunden, software:112-Lizenzen, Projekte, Schulungen – zur Schnellauswahl in Angeboten und Rechnungen.</p>
      </div>
      <LeistungenClient leistungen={leistungen} kategorien={einnahmeKategorien} writeOk={canWrite(membership.role)} />
    </div>
  )
}
