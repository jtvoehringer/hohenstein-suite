import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership } from '@/lib/auth/roles'
import { toCSV } from '@/lib/utils/csv'
import { alleZeilen } from '@/lib/supabase/alleZeilen'
import { segmentLabel } from '@/lib/crm/types'
import { fmtDatum, heuteIso } from '@/lib/format'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

// GET /api/export/firmen – CSV aller aktiven Firmen des aktiven Mandanten
export async function GET() {
  const membership = await getCurrentMembership()
  if (!membership) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const supabase = await createSupabaseServerClient()
  const data = await alleZeilen(() => (supabase.from('firmen') as any)
    .select('kundennummer, name, segment, strasse, plz, ort, land, betriebsstandort, region, telefon_vorwahl, telefon, email, website, uid_nummer, zahlungsziel_tage, is_lead, ist_kunde, ist_lieferant, notizen, erstellt_am')
    .eq('tenant_id', membership.tenantId).eq('aktiv', true)
    .order('name').order('kundennummer'))

  const ja = (b: unknown) => (b ? 'Ja' : 'Nein')
  const rows = (data as R[]).map(r => ({
    kundennummer:      r.kundennummer,
    name:              r.name,
    segment:           segmentLabel(r.segment),
    strasse:           r.strasse,
    plz:               r.plz,
    ort:               r.ort,
    land:              r.land,
    betriebsstandort:  r.betriebsstandort,
    region:            r.region,
    telefon:           r.telefon ? `${r.telefon_vorwahl ?? '+43'} ${r.telefon}` : '',
    email:             r.email,
    website:           r.website,
    uid_nummer:        r.uid_nummer,
    zahlungsziel_tage: r.zahlungsziel_tage,
    lead:              ja(r.is_lead),
    kunde:             ja(r.ist_kunde),
    lieferant:         ja(r.ist_lieferant),
    notizen:           r.notizen,
    erstellt_am:       fmtDatum(r.erstellt_am),
  }))

  const csv = toCSV(rows, [
    { key: 'kundennummer',      header: 'Kundennummer' },
    { key: 'name',              header: 'Firmenname' },
    { key: 'segment',           header: 'Segment' },
    { key: 'strasse',           header: 'Straße' },
    { key: 'plz',               header: 'PLZ' },
    { key: 'ort',               header: 'Ort' },
    { key: 'land',              header: 'Land' },
    { key: 'betriebsstandort',  header: 'Betriebsstandort' },
    { key: 'region',            header: 'Region' },
    { key: 'telefon',           header: 'Telefon' },
    { key: 'email',             header: 'E-Mail' },
    { key: 'website',           header: 'Website' },
    { key: 'uid_nummer',        header: 'UID-Nummer' },
    { key: 'zahlungsziel_tage', header: 'Zahlungsziel (Tage)' },
    { key: 'lead',              header: 'Lead' },
    { key: 'kunde',             header: 'Kunde' },
    { key: 'lieferant',         header: 'Lieferant' },
    { key: 'notizen',           header: 'Notizen' },
    { key: 'erstellt_am',       header: 'Angelegt am' },
  ])

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="firmen_${heuteIso()}.csv"`,
    },
  })
}
