import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { ladeEaEinstellungen, ladeFirmen, ladeKategorien, ladeKonten } from '@/lib/ea/server'
import BuchungForm from '@/components/ea/BuchungForm'
import { erstelleBuchung } from '../actions'

export const dynamic = 'force-dynamic'

export default async function BuchungNeuPage({ searchParams }: { searchParams: Promise<{ typ?: string }> }) {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  if (!canWrite(membership.role)) redirect('/buchhaltung')
  const tenantId = membership.tenantId
  const sp = await searchParams

  const [einst, kategorien, konten, firmen] = await Promise.all([
    ladeEaEinstellungen(supabase, tenantId),
    ladeKategorien(supabase, tenantId),
    ladeKonten(supabase, tenantId),
    ladeFirmen(supabase, tenantId),
  ])

  async function speichern(input: Parameters<typeof erstelleBuchung>[0]) {
    'use server'
    return erstelleBuchung(input, 'manuell')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="text-sm text-hs-text-2 flex items-center gap-2">
        <Link href="/buchhaltung" className="hover:text-hs-blue-700">Buchungen</Link>
        <span>/</span>
        <span className="text-hs-text font-medium">Neue Buchung</span>
      </div>
      <h1 className="text-2xl">Neue Buchung</h1>
      <BuchungForm
        modus={einst.ea_buchung_modus}
        ustStandard={einst.ust_satz_standard}
        kategorien={kategorien}
        konten={konten}
        firmen={firmen}
        initial={{ typ: sp.typ === 'einnahme' ? 'einnahme' : 'ausgabe' }}
        onSubmit={speichern}
      />
    </div>
  )
}
