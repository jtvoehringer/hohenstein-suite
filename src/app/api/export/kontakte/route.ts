import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership } from '@/lib/auth/roles'
import { toCSV } from '@/lib/utils/csv'
import { segmentLabel } from '@/lib/crm/types'
import { fmtDatum, heuteIso } from '@/lib/format'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

// GET /api/export/kontakte – CSV aller aktiven Kontakte des aktiven Mandanten
export async function GET() {
  const membership = await getCurrentMembership()
  if (!membership) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const supabase = await createSupabaseServerClient()
  const { data, error } = await (supabase.from('kontakte') as any)
    .select('kundennummer, vorname, nachname, segment, firmen:firma_id(name), position, email, telefon_vorwahl, telefon, mobil_vorwahl, mobil, strasse, plz, ort, land, geburtsdatum, sprache, ansprechpartner_intern, is_lead, notizen, erstellt_am')
    .eq('tenant_id', membership.tenantId).eq('aktiv', true)
    .order('nachname').order('vorname')
  if (error) return NextResponse.json({ error: (error as R).message }, { status: 500 })

  const rows = ((data ?? []) as R[]).map(r => ({
    kundennummer:  r.kundennummer,
    vorname:       r.vorname,
    nachname:      r.nachname,
    segment:       segmentLabel(r.segment),
    firma:         (r.firmen as R | null)?.name ?? '',
    position:      r.position,
    email:         r.email,
    telefon:       r.telefon ? `${r.telefon_vorwahl ?? '+43'} ${r.telefon}` : '',
    mobil:         r.mobil ? `${r.mobil_vorwahl ?? '+43'} ${r.mobil}` : '',
    strasse:       r.strasse,
    plz:           r.plz,
    ort:           r.ort,
    land:          r.land,
    geburtsdatum:  r.geburtsdatum ? fmtDatum(r.geburtsdatum) : '',
    sprache:       r.sprache,
    ansprechpartner_intern: r.ansprechpartner_intern,
    status:        r.is_lead ? 'Lead' : 'Kunde',
    notizen:       r.notizen,
    erstellt_am:   fmtDatum(r.erstellt_am),
  }))

  const csv = toCSV(rows, [
    { key: 'kundennummer', header: 'Kundennummer' },
    { key: 'vorname',      header: 'Vorname' },
    { key: 'nachname',     header: 'Nachname' },
    { key: 'segment',      header: 'Segment' },
    { key: 'firma',        header: 'Firma' },
    { key: 'position',     header: 'Position' },
    { key: 'email',        header: 'E-Mail' },
    { key: 'telefon',      header: 'Telefon' },
    { key: 'mobil',        header: 'Mobil' },
    { key: 'strasse',      header: 'Straße' },
    { key: 'plz',          header: 'PLZ' },
    { key: 'ort',          header: 'Ort' },
    { key: 'land',         header: 'Land' },
    { key: 'geburtsdatum', header: 'Geburtsdatum' },
    { key: 'sprache',      header: 'Sprache' },
    { key: 'ansprechpartner_intern', header: 'Interner Ansprechpartner' },
    { key: 'status',       header: 'Status' },
    { key: 'notizen',      header: 'Notizen' },
    { key: 'erstellt_am',  header: 'Angelegt am' },
  ])

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="kontakte_${heuteIso()}.csv"`,
    },
  })
}
