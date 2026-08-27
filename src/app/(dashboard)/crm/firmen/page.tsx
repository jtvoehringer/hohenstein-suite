import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import type { FirmaRow } from '@/lib/crm/types'
import FirmenClient from './FirmenClient'

export const metadata: Metadata = { title: 'Firmen – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default async function FirmenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const membership = await getCurrentMembership()
  if (!membership) return null
  const tenantId = membership.tenantId
  const writeOk  = canWrite(membership.role)
  const supabase = await createSupabaseServerClient()

  const [{ data: fRaw }, { data: kRaw }] = await Promise.all([
    (supabase.from('firmen') as any)
      .select('id, kundennummer, name, segment, strasse, plz, ort, land, telefon_vorwahl, telefon, email, website, uid_nummer, zahlungsziel_tage, is_lead, ist_kunde, ist_lieferant, notizen, aktiv, erstellt_am')
      .eq('tenant_id', tenantId).eq('aktiv', true).order('name'),
    (supabase.from('kontakte') as any)
      .select('firma_id').eq('tenant_id', tenantId).eq('aktiv', true).not('firma_id', 'is', null),
  ])

  const anzahlKontakte: Record<string, number> = {}
  for (const k of (kRaw ?? []) as R[]) anzahlKontakte[k.firma_id] = (anzahlKontakte[k.firma_id] ?? 0) + 1

  const firmen: FirmaRow[] = ((fRaw ?? []) as R[]).map(f => ({
    id: f.id, kundennummer: f.kundennummer ?? null, name: f.name, segment: f.segment,
    strasse: f.strasse ?? null, plz: f.plz ?? null, ort: f.ort ?? null, land: f.land ?? 'AT',
    telefon_vorwahl: f.telefon_vorwahl ?? '+43', telefon: f.telefon ?? null,
    email: f.email ?? null, website: f.website ?? null, uid_nummer: f.uid_nummer ?? null,
    zahlungsziel_tage: f.zahlungsziel_tage ?? 14,
    is_lead: !!f.is_lead, ist_kunde: !!f.ist_kunde, ist_lieferant: !!f.ist_lieferant,
    notizen: f.notizen ?? null, aktiv: f.aktiv ?? true, erstellt_am: f.erstellt_am,
  }))

  const filterParam = typeof sp.filter === 'string' ? sp.filter : undefined
  const initialFilter = filterParam === 'lead' || filterParam === 'kunde' || filterParam === 'lieferant' ? filterParam : 'alle'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">Firmen</h1>
        <p className="text-sm text-hs-text-2 mt-1">Weingüter, Partner und Lieferanten – {firmen.length} {firmen.length === 1 ? 'Firma' : 'Firmen'}</p>
      </div>
      <FirmenClient
        firmen={firmen}
        anzahlKontakte={anzahlKontakte}
        writeOk={writeOk}
        initialFilter={initialFilter}
        openNeu={sp.neu === '1'}
        initialSegment={typeof sp.segment === 'string' ? sp.segment : undefined}
      />
    </div>
  )
}
