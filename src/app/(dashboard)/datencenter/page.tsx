import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { alleZeilen } from '@/lib/supabase/alleZeilen'
import DatencenterClient, { type AblageOrdner, type AblageDatei } from './DatencenterClient'

export const metadata: Metadata = { title: 'Datencenter – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default async function DatencenterPage() {
  const membership = await getCurrentMembership()
  if (!membership) return null
  const tenantId = membership.tenantId
  const writeOk  = canWrite(membership.role)
  const supabase = await createSupabaseServerClient()

  const [oRaw, dRaw] = await Promise.all([
    alleZeilen(() => (supabase.from('ablage_ordner') as any)
      .select('id, parent_id, name')
      .eq('tenant_id', tenantId).order('name').order('id')),
    alleZeilen(() => (supabase.from('ablage_dateien') as any)
      .select('id, ordner_id, firma_id, kontakt_id, dateiname, dateityp, groesse_bytes, erstellt_am, firmen:firma_id(name), kontakte:kontakt_id(vorname, nachname)')
      .eq('tenant_id', tenantId).order('dateiname').order('id')),
  ])

  const ordner: AblageOrdner[] = ((oRaw ?? []) as R[]).map(o => ({
    id: o.id, parent_id: o.parent_id ?? null, name: o.name,
  }))
  const dateien: AblageDatei[] = ((dRaw ?? []) as R[]).map(d => ({
    id: d.id, ordner_id: d.ordner_id ?? null, firma_id: d.firma_id ?? null, kontakt_id: d.kontakt_id ?? null,
    dateiname: d.dateiname, dateityp: d.dateityp ?? null,
    groesse_bytes: d.groesse_bytes == null ? null : Number(d.groesse_bytes),
    erstellt_am: d.erstellt_am,
    verknuepfung: (d.firmen as R | null)?.name
      ?? (d.kontakte ? [((d.kontakte as R).vorname ?? ''), (d.kontakte as R).nachname].filter(Boolean).join(' ') : null),
  }))

  return <DatencenterClient ordner={ordner} dateien={dateien} writeOk={writeOk} />
}
