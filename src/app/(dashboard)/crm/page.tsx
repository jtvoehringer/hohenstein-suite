import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { aktivitaetLabel, kontaktName } from '@/lib/crm/types'
import { heuteIso } from '@/lib/format'
import { alleZeilen } from '@/lib/supabase/alleZeilen'
import CRMUebersichtClient, { type KalenderEintrag } from './CRMUebersichtClient'

export const metadata: Metadata = { title: 'Kalender – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
const kName = (o: R) => kontaktName(o as { vorname?: string | null; nachname: string })

export default async function CRMKalenderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const membership = await getCurrentMembership()
  if (!membership) return null
  const tenantId = membership.tenantId
  const writeOk  = canWrite(membership.role)
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? null
  const heute = heuteIso()

  const [{ data: aRaw }, kRaw, fRaw] = await Promise.all([
    (supabase.from('aktivitaeten') as any)
      .select('id, kontakt_id, firma_id, art, betreff, beschreibung, datum, bis_datum, ganztags, uhrzeit_von, uhrzeit_bis, erledigt, ist_privat, erstellt_von, serie_id, serie_regel, kontakte:kontakt_id(vorname, nachname), firmen:firma_id(name)')
      .eq('tenant_id', tenantId)
      .not('art', 'in', '(notiz,email)')
      .order('datum', { ascending: true }).order('uhrzeit_von', { ascending: true, nullsFirst: true }),
    alleZeilen(() => (supabase.from('kontakte') as any)
      .select('id, vorname, nachname, firmen:firma_id(name)').eq('tenant_id', tenantId).eq('aktiv', true).order('nachname').order('id')),
    alleZeilen(() => (supabase.from('firmen') as any)
      .select('id, name, ort').eq('tenant_id', tenantId).eq('aktiv', true).order('name').order('id')),
  ])

  // Private Termine anderer Nutzer sind per RLS bereits ausgeblendet – zur Sicherheit nochmals filtern
  const rows = ((aRaw ?? []) as R[]).filter(a => !a.ist_privat || a.erstellt_von === userId)

  // Klarnamen der Ersteller für den Personen-Filter
  const userIds = [...new Set(rows.map(a => a.erstellt_von).filter(Boolean))] as string[]
  const userProfiles: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: pRaw } = await (supabase.from('profiles') as any).select('id, full_name, display_name').in('id', userIds)
    for (const p of (pRaw ?? []) as R[]) { const n = p.full_name || p.display_name; if (n) userProfiles[p.id] = n }
  }

  const eintraege: KalenderEintrag[] = rows
    // erledigte Aufgaben verschwinden aus dem Kalender, andere erledigte Termine bleiben (ausgegraut)
    .filter(a => !(a.art === 'aufgabe' && a.erledigt))
    .map(a => ({
      id:           a.id as string,
      datum:        a.datum as string,
      bis_datum:    (a.bis_datum as string | null) ?? null,
      titel:        (a.betreff as string | null) || aktivitaetLabel(a.art),
      art:          a.art as string,
      beschreibung: (a.beschreibung as string | null) ?? null,
      ganztags:     (a.ganztags as boolean) ?? true,
      uhrzeit_von:  (a.uhrzeit_von as string | null) ?? null,
      uhrzeit_bis:  (a.uhrzeit_bis as string | null) ?? null,
      erledigt:     !!a.erledigt,
      ueberfaellig: a.art === 'aufgabe' && !a.erledigt && (a.datum as string) < heute,
      ist_privat:   !!a.ist_privat,
      erstellt_von: (a.erstellt_von as string | null) ?? null,
      serie_id:     (a.serie_id as string | null) ?? null,
      serie_regel:  (a.serie_regel as string | null) ?? null,
      kontakt_id:   (a.kontakt_id as string | null) ?? null,
      firma_id:     (a.firma_id as string | null) ?? null,
      kontaktName:  a.kontakte ? kName(a.kontakte) : null,
      firmaName:    (a.firmen as R | null)?.name ?? null,
    }))

  const kontakte = ((kRaw ?? []) as R[]).map(k => ({ id: k.id as string, name: kName(k), sub: (k.firmen as R | null)?.name ?? null }))
  const firmen   = ((fRaw ?? []) as R[]).map(f => ({ id: f.id as string, name: f.name as string, sub: (f.ort as string | null) ?? null }))

  const datumParam = typeof sp.datum === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.datum) ? sp.datum : null

  return (
    <CRMUebersichtClient
      eintraege={eintraege}
      heute={heute}
      kontakte={kontakte}
      firmen={firmen}
      userProfiles={userProfiles}
      currentUserId={userId}
      writeOk={writeOk}
      initialDatum={datumParam}
      openNeu={sp.neu === '1'}
    />
  )
}
