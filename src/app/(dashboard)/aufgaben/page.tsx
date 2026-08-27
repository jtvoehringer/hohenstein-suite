import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { heuteIso } from '@/lib/format'
import { ladeMandantMitglieder } from '@/lib/aufgaben/mitglieder'
import type { AufgabeRow } from '@/lib/aufgaben/types'
import AufgabenClient from './AufgabenClient'

export const metadata: Metadata = { title: 'Aufgaben – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

// ── Aufgabenverwaltung: Board + Liste, Filter, Anlegen/Bearbeiten ────────────
// ?neu=1 öffnet das Anlegen-Panel, ?id=… öffnet die Aufgabe,
// ?status=… / ?ueberfaellig=1 setzen Filter vor (Links vom Dashboard).

export default async function AufgabenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const membership = await getCurrentMembership()
  if (!membership) redirect('/mandant-waehlen')
  const tenantId = membership.tenantId
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const sp = await searchParams

  const vor30Tagen = new Date(Date.now() - 30 * 86400000).toISOString()

  const [{ data: offen }, { data: erledigt }, mitglieder, { data: kontakte }, { data: firmen }] = await Promise.all([
    (supabase.from('aufgaben') as any)
      .select('id, titel, beschreibung, status, prioritaet, verantwortlich_id, faellig_am, kontakt_id, firma_id, bereich, erledigt_am, erstellt_von, erstellt_am, aktualisiert_am, kontakte(vorname, nachname), firmen(name)')
      .eq('tenant_id', tenantId).neq('status', 'erledigt')
      .order('faellig_am', { ascending: true, nullsFirst: false }).order('erstellt_am', { ascending: false }),
    (supabase.from('aufgaben') as any)
      .select('id, titel, beschreibung, status, prioritaet, verantwortlich_id, faellig_am, kontakt_id, firma_id, bereich, erledigt_am, erstellt_von, erstellt_am, aktualisiert_am, kontakte(vorname, nachname), firmen(name)')
      .eq('tenant_id', tenantId).eq('status', 'erledigt').gte('erledigt_am', vor30Tagen)
      .order('erledigt_am', { ascending: false }).limit(100),
    ladeMandantMitglieder(tenantId),
    (supabase.from('kontakte') as any).select('id, vorname, nachname').eq('tenant_id', tenantId).eq('aktiv', true).order('nachname').limit(500),
    (supabase.from('firmen') as any).select('id, name').eq('tenant_id', tenantId).eq('aktiv', true).order('name').limit(500),
  ])

  const mapRow = (a: R): AufgabeRow => {
    const k = a.kontakte as R | null
    const f = a.firmen as R | null
    return {
      ...(a as AufgabeRow),
      kontakt_name: k ? [k.vorname, k.nachname].filter(Boolean).join(' ') : null,
      firma_name: f?.name ?? null,
    }
  }
  const aufgaben = [...((offen ?? []) as R[]), ...((erledigt ?? []) as R[])].map(mapRow)

  const einzel = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null

  return (
    <AufgabenClient
      aufgaben={aufgaben}
      mitglieder={mitglieder}
      kontakte={((kontakte ?? []) as R[]).map(k => ({ id: k.id, name: [k.vorname, k.nachname].filter(Boolean).join(' ') }))}
      firmen={((firmen ?? []) as R[]).map(f => ({ id: f.id, name: f.name }))}
      userId={user?.id ?? null}
      darfSchreiben={canWrite(membership.role)}
      heute={heuteIso()}
      initial={{
        neu: einzel(sp.neu) === '1',
        id: einzel(sp.id),
        status: einzel(sp.status),
        ueberfaellig: einzel(sp.ueberfaellig) === '1',
      }}
    />
  )
}
