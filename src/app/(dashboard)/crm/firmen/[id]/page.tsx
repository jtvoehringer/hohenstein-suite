import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import type { FirmaRow } from '@/lib/crm/types'
import { kontaktName } from '@/lib/crm/types'
import type { AktivitaetMitDokumenten, PipelineKurz } from '@/components/crm/crmUtils'
import { ladeMandantMitglieder } from '@/lib/aufgaben/mitglieder'
import FirmaDetailClient, { type Ansprechpartner } from './FirmaDetailClient'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
const kName = (o: R) => kontaktName(o as { vorname?: string | null; nachname: string })

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const membership = await getCurrentMembership()
  if (!membership) return { title: 'Firma – Hohenstein Suite' }
  const supabase = await createSupabaseServerClient()
  const { data } = await (supabase.from('firmen') as any)
    .select('name').eq('id', id).eq('tenant_id', membership.tenantId).maybeSingle()
  return { title: `${(data as R | null)?.name ?? 'Firma'} – Hohenstein Suite` }
}

export default async function FirmaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const membership = await getCurrentMembership()
  if (!membership) return null
  const tenantId = membership.tenantId
  const writeOk  = canWrite(membership.role)
  const supabase = await createSupabaseServerClient()

  const [{ data: fRaw }, { data: kRaw }, { data: kfRaw }, { data: pRaw }, mitglieder] = await Promise.all([
    (supabase.from('firmen') as any)
      .select('id, kundennummer, name, segment, strasse, plz, ort, land, betriebsstandort, region, telefon_vorwahl, telefon, email, website, uid_nummer, zahlungsziel_tage, is_lead, ist_kunde, ist_lieferant, quelle, account_manager, notizen, aktiv, erstellt_am')
      .eq('id', id).eq('tenant_id', tenantId).maybeSingle(),
    // Ansprechpartner 1: Kontakte mit firma_id = diese Firma
    (supabase.from('kontakte') as any)
      .select('id, vorname, nachname, position, email, telefon_vorwahl, telefon, mobil_vorwahl, mobil, segment, is_lead')
      .eq('firma_id', id).eq('tenant_id', tenantId).eq('aktiv', true).order('nachname'),
    // Ansprechpartner 2: Zuordnung über kontakt_firmen
    (supabase.from('kontakt_firmen') as any)
      .select('kontakt_id, position, hauptkontakt, kontakte:kontakt_id(id, vorname, nachname, position, email, telefon_vorwahl, telefon, mobil_vorwahl, mobil, segment, is_lead, tenant_id, aktiv)')
      .eq('firma_id', id),
    (supabase.from('pipeline_eintraege') as any)
      .select('id, stufe, titel, kategorie, wert_euro, wahrscheinlichkeit, erwartetes_datum, erledigt')
      .eq('firma_id', id).eq('tenant_id', tenantId)
      .order('aktualisiert_am', { ascending: false }),
    ladeMandantMitglieder(tenantId),
  ])

  const { data: trialRaw } = await (supabase.from('demo_zugaenge') as any)
    .select('id, email, s112_rolle, gueltig_bis, status')
    .eq('firma_id', id).eq('tenant_id', tenantId).neq('status', 'geloescht')
    .order('erstellt_am', { ascending: false }).limit(1).maybeSingle()
  const trialZugang = trialRaw ? {
    email: (trialRaw as R).email as string, rolle: (trialRaw as R).s112_rolle as 'winzer' | 'leser',
    gueltigBis: (trialRaw as R).gueltig_bis as string | null, status: (trialRaw as R).status as string,
  } : null
  if (!fRaw) notFound()

  const f = fRaw as R
  const firma: FirmaRow = {
    id: f.id, kundennummer: f.kundennummer ?? null, name: f.name, segment: f.segment,
    strasse: f.strasse ?? null, plz: f.plz ?? null, ort: f.ort ?? null, land: f.land ?? 'AT',
    betriebsstandort: f.betriebsstandort ?? null, region: f.region ?? null,
    telefon_vorwahl: f.telefon_vorwahl ?? '+43', telefon: f.telefon ?? null,
    email: f.email ?? null, website: f.website ?? null, uid_nummer: f.uid_nummer ?? null,
    zahlungsziel_tage: f.zahlungsziel_tage ?? 14,
    is_lead: !!f.is_lead, ist_kunde: !!f.ist_kunde, ist_lieferant: !!f.ist_lieferant,
    quelle: f.quelle ?? null, account_manager: f.account_manager ?? null,
    notizen: f.notizen ?? null, aktiv: f.aktiv ?? true, erstellt_am: f.erstellt_am,
  }

  // Ansprechpartner zusammenführen (Primärzuordnung + kontakt_firmen), Duplikate vermeiden
  const apMap = new Map<string, Ansprechpartner>()
  for (const k of (kRaw ?? []) as R[]) {
    apMap.set(k.id, {
      id: k.id, name: kName(k), position: k.position ?? null, email: k.email ?? null,
      telefon_vorwahl: k.telefon_vorwahl ?? '+43', telefon: k.telefon ?? null,
      mobil_vorwahl: k.mobil_vorwahl ?? '+43', mobil: k.mobil ?? null,
      segment: k.segment, is_lead: !!k.is_lead, hauptkontakt: false, quelle: 'primaer',
    })
  }
  for (const x of (kfRaw ?? []) as R[]) {
    const k = x.kontakte as R | null
    if (!k || k.tenant_id !== tenantId || k.aktiv === false) continue
    const vorhanden = apMap.get(k.id)
    if (vorhanden) { vorhanden.hauptkontakt = !!x.hauptkontakt; if (x.position) vorhanden.position = x.position; continue }
    apMap.set(k.id, {
      id: k.id, name: kName(k), position: (x.position as string | null) ?? k.position ?? null, email: k.email ?? null,
      telefon_vorwahl: k.telefon_vorwahl ?? '+43', telefon: k.telefon ?? null,
      mobil_vorwahl: k.mobil_vorwahl ?? '+43', mobil: k.mobil ?? null,
      segment: k.segment, is_lead: !!k.is_lead, hauptkontakt: !!x.hauptkontakt, quelle: 'zuordnung',
    })
  }
  const ansprechpartner = [...apMap.values()].sort((a, b) => Number(b.hauptkontakt) - Number(a.hauptkontakt) || a.name.localeCompare(b.name, 'de'))

  // Aktivitäten der Firma UND ihrer Ansprechpartner
  const kontaktIds = [...apMap.keys()]
  const orFilter = kontaktIds.length > 0
    ? `firma_id.eq.${id},kontakt_id.in.(${kontaktIds.join(',')})`
    : `firma_id.eq.${id}`
  const { data: aRaw } = await (supabase.from('aktivitaeten') as any)
    .select('id, kontakt_id, firma_id, art, betreff, beschreibung, datum, bis_datum, ganztags, uhrzeit_von, uhrzeit_bis, erledigt, faellig_am, ist_privat, erstellt_von, erstellt_am, email_von, email_von_name, email_an, email_body, kontakte:kontakt_id(vorname, nachname), aktivitaet_dokumente(id, dateiname, dateityp, groesse_bytes, erstellt_am)')
    .eq('tenant_id', tenantId)
    .or(orFilter)
    .order('datum', { ascending: false }).order('uhrzeit_von', { ascending: false, nullsFirst: false })

  const aktivitaeten: AktivitaetMitDokumenten[] = ((aRaw ?? []) as R[])
    .map(a => ({
      id: a.id, kontakt_id: a.kontakt_id ?? null, firma_id: a.firma_id ?? null, art: a.art,
      betreff: a.betreff ?? null, beschreibung: a.beschreibung ?? null, datum: a.datum, bis_datum: a.bis_datum ?? null,
      ganztags: a.ganztags ?? true, uhrzeit_von: a.uhrzeit_von ?? null, uhrzeit_bis: a.uhrzeit_bis ?? null,
      erledigt: !!a.erledigt, faellig_am: a.faellig_am ?? null, ist_privat: !!a.ist_privat,
      erstellt_von: a.erstellt_von ?? null, erstellt_am: a.erstellt_am,
      email_von: a.email_von ?? null, email_von_name: a.email_von_name ?? null, email_an: a.email_an ?? null, email_body: a.email_body ?? null,
      kontakt_name: a.kontakte ? kName(a.kontakte) : null,
      firma_name: firma.name,
      dokumente: ((a.aktivitaet_dokumente ?? []) as R[]).map(d => ({
        id: d.id, dateiname: d.dateiname, dateityp: d.dateityp, groesse_bytes: d.groesse_bytes ?? null, erstellt_am: d.erstellt_am,
      })),
    }))

  const pipeline: PipelineKurz[] = ((pRaw ?? []) as R[]).map(p => ({
    id: p.id, stufe: p.stufe, titel: p.titel, kategorie: p.kategorie ?? null,
    wert_euro: p.wert_euro == null ? null : Number(p.wert_euro),
    wahrscheinlichkeit: p.wahrscheinlichkeit ?? null, erwartetes_datum: p.erwartetes_datum ?? null, erledigt: !!p.erledigt,
  }))

  return (
    <FirmaDetailClient
      firma={firma}
      ansprechpartner={ansprechpartner}
      aktivitaeten={aktivitaeten}
      pipeline={pipeline}
      mitglieder={mitglieder}
      writeOk={writeOk}
      trialZugang={trialZugang}
    />
  )
}
