import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import type { KontaktRow } from '@/lib/crm/types'
import KontakteClient from './KontakteClient'

export const metadata: Metadata = { title: 'Kontakte – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default async function KontaktePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const membership = await getCurrentMembership()
  if (!membership) return null
  const tenantId = membership.tenantId
  const writeOk  = canWrite(membership.role)
  const supabase = await createSupabaseServerClient()

  const [{ data: kRaw }, { data: fRaw }] = await Promise.all([
    (supabase.from('kontakte') as any)
      .select('id, kundennummer, vorname, nachname, segment, firma_id, firmen:firma_id(name), position, email, telefon_vorwahl, telefon, mobil_vorwahl, mobil, strasse, plz, ort, land, geburtsdatum, sprache, ansprechpartner_intern, is_lead, notizen, aktiv, erstellt_am')
      .eq('tenant_id', tenantId).eq('aktiv', true)
      .order('nachname').order('vorname'),
    (supabase.from('firmen') as any)
      .select('id, name').eq('tenant_id', tenantId).eq('aktiv', true).order('name'),
  ])

  const kontakte: KontaktRow[] = ((kRaw ?? []) as R[]).map(k => ({
    id: k.id, kundennummer: k.kundennummer ?? null, vorname: k.vorname ?? null, nachname: k.nachname,
    segment: k.segment, firma_id: k.firma_id ?? null, firma_name: (k.firmen as R | null)?.name ?? null,
    position: k.position ?? null, email: k.email ?? null,
    telefon_vorwahl: k.telefon_vorwahl ?? '+43', telefon: k.telefon ?? null,
    mobil_vorwahl: k.mobil_vorwahl ?? '+43', mobil: k.mobil ?? null,
    strasse: k.strasse ?? null, plz: k.plz ?? null, ort: k.ort ?? null, land: k.land ?? 'AT',
    geburtsdatum: k.geburtsdatum ?? null, sprache: k.sprache ?? 'de',
    ansprechpartner_intern: k.ansprechpartner_intern ?? null,
    is_lead: !!k.is_lead, notizen: k.notizen ?? null, aktiv: k.aktiv ?? true, erstellt_am: k.erstellt_am,
  }))
  const firmen = ((fRaw ?? []) as R[]).map(f => ({ id: f.id as string, name: f.name as string }))

  const filterParam = typeof sp.filter === 'string' ? sp.filter : undefined
  const initialFilter = filterParam === 'lead' || filterParam === 'kunde' ? filterParam : 'alle'

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl">Kontakte</h1>
          <p className="text-sm text-hs-text-2 mt-1">Ansprechpartner, Interessenten und Kunden – {kontakte.length} {kontakte.length === 1 ? 'Kontakt' : 'Kontakte'}</p>
        </div>
      </div>
      <KontakteClient
        kontakte={kontakte}
        firmen={firmen}
        writeOk={writeOk}
        initialFilter={initialFilter}
        openNeu={sp.neu === '1'}
        initialSegment={typeof sp.segment === 'string' ? sp.segment : undefined}
      />
    </div>
  )
}
