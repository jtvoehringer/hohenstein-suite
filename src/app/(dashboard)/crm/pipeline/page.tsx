import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import type { PipelineRow } from '@/lib/crm/types'
import { kontaktName } from '@/lib/crm/types'
import PipelineClient, { type VerlaufRow } from './PipelineClient'

export const metadata: Metadata = { title: 'Pipeline – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
const kName = (o: R) => kontaktName(o as { vorname?: string | null; nachname: string })

export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const membership = await getCurrentMembership()
  if (!membership) return null
  const tenantId = membership.tenantId
  const writeOk  = canWrite(membership.role)
  const supabase = await createSupabaseServerClient()

  const [{ data: pRaw }, { data: kRaw }, { data: fRaw }] = await Promise.all([
    (supabase.from('pipeline_eintraege') as any)
      .select('id, kontakt_id, firma_id, stufe, titel, kategorie, wert_euro, wahrscheinlichkeit, erwartetes_datum, ganztags, uhrzeit_von, uhrzeit_bis, erledigt, erledigt_am, notizen, erstellt_am, aktualisiert_am, kontakte:kontakt_id(vorname, nachname), firmen:firma_id(name)')
      .eq('tenant_id', tenantId)
      .order('aktualisiert_am', { ascending: false }),
    (supabase.from('kontakte') as any)
      .select('id, vorname, nachname, firmen:firma_id(name)').eq('tenant_id', tenantId).eq('aktiv', true).order('nachname'),
    (supabase.from('firmen') as any)
      .select('id, name, ort').eq('tenant_id', tenantId).eq('aktiv', true).order('name'),
  ])

  const eintraege: PipelineRow[] = ((pRaw ?? []) as R[]).map(p => ({
    id: p.id, kontakt_id: p.kontakt_id ?? null, firma_id: p.firma_id ?? null, stufe: p.stufe, titel: p.titel,
    kategorie: p.kategorie ?? null,
    wert_euro: p.wert_euro == null ? null : Number(p.wert_euro),
    wahrscheinlichkeit: p.wahrscheinlichkeit ?? null,
    erwartetes_datum: p.erwartetes_datum ?? null,
    ganztags: p.ganztags ?? true, uhrzeit_von: p.uhrzeit_von ?? null, uhrzeit_bis: p.uhrzeit_bis ?? null,
    erledigt: !!p.erledigt, erledigt_am: p.erledigt_am ?? null, notizen: p.notizen ?? null,
    erstellt_am: p.erstellt_am, aktualisiert_am: p.aktualisiert_am,
    kontakt_name: p.kontakte ? kName(p.kontakte) : null,
    firma_name: (p.firmen as R | null)?.name ?? null,
  }))

  // Verlauf des ggf. hervorgehobenen Eintrags
  const highlightId = typeof sp.id === 'string' ? sp.id : null
  let verlauf: VerlaufRow[] = []
  if (highlightId && eintraege.some(e => e.id === highlightId)) {
    const { data: vRaw } = await (supabase.from('pipeline_verlauf') as any)
      .select('id, stufe_von, stufe_nach, notizen, geaendert_am, geaendert_von')
      .eq('pipeline_id', highlightId)
      .order('geaendert_am', { ascending: false })
    const rows = (vRaw ?? []) as R[]
    // Klarnamen (geaendert_von zeigt auf auth.users – kein Embed möglich, deshalb separat)
    const userIds = [...new Set(rows.map(v => v.geaendert_von).filter(Boolean))] as string[]
    const namen: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: profRaw } = await (supabase.from('profiles') as any).select('id, full_name, display_name').in('id', userIds)
      for (const pr of (profRaw ?? []) as R[]) namen[pr.id] = pr.full_name || pr.display_name || ''
    }
    verlauf = rows.map(v => ({
      id: v.id, stufe_von: v.stufe_von ?? null, stufe_nach: v.stufe_nach, notizen: v.notizen ?? null,
      geaendert_am: v.geaendert_am,
      geaendert_von_name: v.geaendert_von ? (namen[v.geaendert_von] || null) : null,
    }))
  }

  const kontakte = ((kRaw ?? []) as R[]).map(k => ({ id: k.id as string, name: kName(k), sub: (k.firmen as R | null)?.name ?? null }))
  const firmen   = ((fRaw ?? []) as R[]).map(f => ({ id: f.id as string, name: f.name as string, sub: (f.ort as string | null) ?? null }))
  const offen = eintraege.filter(e => !e.erledigt && !['verloren', 'bestandskunde'].includes(e.stufe)).length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">Pipeline</h1>
        <p className="text-sm text-hs-text-2 mt-1">Verkaufschancen nach Stufen – {offen} {offen === 1 ? 'offene Chance' : 'offene Chancen'}</p>
      </div>
      <PipelineClient
        eintraege={eintraege}
        kontakte={kontakte}
        firmen={firmen}
        writeOk={writeOk}
        highlightId={highlightId}
        verlauf={verlauf}
        openNeu={sp.neu === '1'}
      />
    </div>
  )
}
