import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { ladeAnlagen } from '@/lib/ea/anlagen'
import { heuteIso } from '@/lib/format'
import AnlagenClient from './AnlagenClient'

export const metadata: Metadata = { title: 'Anlagenverzeichnis – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

export default async function AnlagenPage() {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const anlagen = await ladeAnlagen(supabase, membership.tenantId)

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl">Anlagenverzeichnis</h1>
        <p className="text-sm text-hs-text-2 mt-0.5">
          Anlagevermögen mit linearer AfA (Halbjahresregel) und Buchwert zum Stichtag – Grundlage für das Reporting und die E&A-Beilage.
        </p>
      </div>
      <AnlagenClient anlagen={anlagen} heute={heuteIso()} writeOk={canWrite(membership.role)} />
    </div>
  )
}
