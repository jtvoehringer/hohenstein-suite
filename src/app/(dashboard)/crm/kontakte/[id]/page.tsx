import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import type { KontaktRow } from '@/lib/crm/types'
import { kontaktName } from '@/lib/crm/types'
import type { AktivitaetMitDokumenten, PipelineKurz } from '@/components/crm/crmUtils'
import KontaktDetailClient from './KontaktDetailClient'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
const kName = (o: R) => kontaktName(o as { vorname?: string | null; nachname: string })

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const membership = await getCurrentMembership()
  if (!membership) return { title: 'Kontakt – Hohenstein Suite' }
  const supabase = await createSupabaseServerClient()
  const { data } = await (supabase.from('kontakte') as any)
    .select('vorname, nachname').eq('id', id).eq('tenant_id', membership.tenantId).maybeSingle()
  return { title: `${data ? kName(data) : 'Kontakt'} – Hohenstein Suite` }
}

export default async function KontaktDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const membership = await getCurrentMembership()
  if (!membership) return null
  const tenantId = membership.tenantId
  const writeOk  = canWrite(membership.role)
  const supabase = await createSupabaseServerClient()

  const [{ data: kRaw }, { data: aRaw }, { data: pRaw }, { data: fRaw }, { data: kfRaw }] = await Promise.all([
    (supabase.from('kontakte') as any)
      .select('id, kundennummer, vorname, nachname, segment, firma_id, firmen:firma_id(name, segment), position, email, telefon_vorwahl, telefon, mobil_vorwahl, mobil, strasse, plz, ort, land, geburtsdatum, sprache, ansprechpartner_intern, is_lead, notizen, aktiv, erstellt_am')
      .eq('id', id).eq('tenant_id', tenantId).maybeSingle(),
    (supabase.from('aktivitaeten') as any)
      .select('id, kontakt_id, firma_id, art, betreff, beschreibung, datum, bis_datum, ganztags, uhrzeit_von, uhrzeit_bis, erledigt, faellig_am, ist_privat, erstellt_von, erstellt_am, email_von, email_von_name, email_an, email_body, aktivitaet_dokumente(id, dateiname, dateityp, groesse_bytes, erstellt_am)')
      .eq('kontakt_id', id).eq('tenant_id', tenantId)
      .order('datum', { ascending: false }).order('uhrzeit_von', { ascending: false, nullsFirst: false }),
    (supabase.from('pipeline_eintraege') as any)
      .select('id, stufe, titel, kategorie, wert_euro, wahrscheinlichkeit, erwartetes_datum, erledigt')
      .eq('kontakt_id', id).eq('tenant_id', tenantId)
      .order('aktualisiert_am', { ascending: false }),
    (supabase.from('firmen') as any)
      .select('id, name').eq('tenant_id', tenantId).eq('aktiv', true).order('name'),
    (supabase.from('kontakt_firmen') as any)
      .select('firma_id, position, hauptkontakt, firmen:firma_id(id, name, segment, tenant_id)')
      .eq('kontakt_id', id),
  ])
  if (!kRaw) notFound()

  const { data: dateienRaw } = await (supabase.from('ablage_dateien') as any)
    .select('id, dateiname, dateityp, groesse_bytes, erstellt_am')
    .eq('kontakt_id', id).eq('tenant_id', tenantId)
    .order('erstellt_am', { ascending: false })
  const dateien = ((dateienRaw ?? []) as R[]).map(d => ({
    id: d.id as string, dateiname: d.dateiname as string, dateityp: (d.dateityp as string | null) ?? null,
    groesse_bytes: d.groesse_bytes == null ? null : Number(d.groesse_bytes), erstellt_am: d.erstellt_am as string,
  }))

  const k = kRaw as R
  const kontakt: KontaktRow = {
    id: k.id, kundennummer: k.kundennummer ?? null, vorname: k.vorname ?? null, nachname: k.nachname,
    segment: k.segment, firma_id: k.firma_id ?? null, firma_name: (k.firmen as R | null)?.name ?? null,
    position: k.position ?? null, email: k.email ?? null,
    telefon_vorwahl: k.telefon_vorwahl ?? '+43', telefon: k.telefon ?? null,
    mobil_vorwahl: k.mobil_vorwahl ?? '+43', mobil: k.mobil ?? null,
    strasse: k.strasse ?? null, plz: k.plz ?? null, ort: k.ort ?? null, land: k.land ?? 'AT',
    geburtsdatum: k.geburtsdatum ?? null, sprache: k.sprache ?? 'de',
    ansprechpartner_intern: k.ansprechpartner_intern ?? null,
    is_lead: !!k.is_lead, notizen: k.notizen ?? null, aktiv: k.aktiv ?? true, erstellt_am: k.erstellt_am,
  }
  const firmaSegment: string | null = (k.firmen as R | null)?.segment ?? null

  const aktivitaeten: AktivitaetMitDokumenten[] = ((aRaw ?? []) as R[]).map(a => ({
    id: a.id, kontakt_id: a.kontakt_id ?? null, firma_id: a.firma_id ?? null, art: a.art,
    betreff: a.betreff ?? null, beschreibung: a.beschreibung ?? null, datum: a.datum, bis_datum: a.bis_datum ?? null,
    ganztags: a.ganztags ?? true, uhrzeit_von: a.uhrzeit_von ?? null, uhrzeit_bis: a.uhrzeit_bis ?? null,
    erledigt: !!a.erledigt, faellig_am: a.faellig_am ?? null, ist_privat: !!a.ist_privat,
    erstellt_von: a.erstellt_von ?? null, erstellt_am: a.erstellt_am,
    email_von: a.email_von ?? null, email_von_name: a.email_von_name ?? null, email_an: a.email_an ?? null, email_body: a.email_body ?? null,
    dokumente: ((a.aktivitaet_dokumente ?? []) as R[]).map(d => ({
      id: d.id, dateiname: d.dateiname, dateityp: d.dateityp, groesse_bytes: d.groesse_bytes ?? null, erstellt_am: d.erstellt_am,
    })),
  }))

  const pipeline: PipelineKurz[] = ((pRaw ?? []) as R[]).map(p => ({
    id: p.id, stufe: p.stufe, titel: p.titel, kategorie: p.kategorie ?? null,
    wert_euro: p.wert_euro == null ? null : Number(p.wert_euro),
    wahrscheinlichkeit: p.wahrscheinlichkeit ?? null, erwartetes_datum: p.erwartetes_datum ?? null, erledigt: !!p.erledigt,
  }))

  const firmen = ((fRaw ?? []) as R[]).map(f => ({ id: f.id as string, name: f.name as string }))

  // weitere Firmenzuordnungen (kontakt_firmen) – nur Firmen des aktiven Mandanten
  const weitereFirmen = ((kfRaw ?? []) as R[])
    .filter(x => (x.firmen as R | null)?.tenant_id === tenantId && x.firma_id !== kontakt.firma_id)
    .map(x => ({
      id: x.firma_id as string, name: (x.firmen as R).name as string, segment: (x.firmen as R).segment as string,
      position: (x.position as string | null) ?? null, hauptkontakt: !!x.hauptkontakt,
    }))

  return (
    <KontaktDetailClient
      kontakt={kontakt}
      firmaSegment={firmaSegment}
      weitereFirmen={weitereFirmen}
      aktivitaeten={aktivitaeten}
      pipeline={pipeline}
      firmen={firmen}
      dateien={dateien}
      writeOk={writeOk}
    />
  )
}
