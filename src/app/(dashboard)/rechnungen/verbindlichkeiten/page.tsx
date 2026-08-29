import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { ladeKategorien, ladeKonten } from '@/lib/ea/server'
import { fmtEuroMitZeichen, heuteIso } from '@/lib/format'
import { tageDifferenz } from '@/lib/rechnungen/types'
import type { EingangsrechnungRow } from '@/lib/rechnungen/verbindlichkeiten'
import VerbindlichkeitenClient from '@/components/rechnungen/VerbindlichkeitenClient'

export const metadata: Metadata = { title: 'Verbindlichkeiten – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default async function VerbindlichkeitenPage({ searchParams }: { searchParams: Promise<{ filter?: string; neu?: string }> }) {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId
  const writeOk = canWrite(membership.role)
  const { filter: filterRaw, neu } = await searchParams
  const filter = filterRaw === 'bezahlt' || filterRaw === 'alle' ? filterRaw : 'offen'
  const heute = heuteIso()

  let q = (supabase.from('eingangsrechnungen') as R).select('*').eq('tenant_id', tenantId)
  if (filter === 'offen') q = q.eq('status', 'offen').order('faellig_am', { ascending: true })
  else if (filter === 'bezahlt') q = q.eq('status', 'bezahlt').order('bezahlt_am', { ascending: false }).limit(200)
  else q = q.order('datum', { ascending: false }).limit(300)

  const [{ data }, kategorien, konten, { data: firmenRaw }, { data: offeneRaw }] = await Promise.all([
    q,
    ladeKategorien(supabase, tenantId, true),
    ladeKonten(supabase, tenantId),
    (supabase.from('firmen') as R).select('id, name, ort, segment').eq('tenant_id', tenantId).eq('aktiv', true).order('name'),
    // Kennzahlen immer über alle offenen Posten (unabhängig vom Filter)
    (supabase.from('eingangsrechnungen') as R).select('betrag_brutto, faellig_am').eq('tenant_id', tenantId).eq('status', 'offen'),
  ])

  const rows: EingangsrechnungRow[] = ((data ?? []) as R[]).map(r => ({
    id: r.id, firma_id: r.firma_id ?? null, lieferant: r.lieferant ?? '', rechnungsnummer: r.rechnungsnummer ?? null,
    beschreibung: r.beschreibung ?? '', datum: r.datum, faellig_am: r.faellig_am,
    betrag_netto: Number(r.betrag_netto ?? 0), ust_satz: Number(r.ust_satz ?? 20), ust_betrag: Number(r.ust_betrag ?? 0),
    betrag_brutto: Number(r.betrag_brutto ?? 0), abzugsfaehig_pct: Number(r.abzugsfaehig_pct ?? 100),
    kategorie_id: r.kategorie_id ?? null, status: r.status, bezahlt_am: r.bezahlt_am ?? null, zahlungsart: r.zahlungsart ?? null,
    konto_id: r.konto_id ?? null, ea_transaktion_id: r.ea_transaktion_id ?? null, notizen: r.notizen ?? null, erstellt_am: r.erstellt_am,
  }))

  const offene = ((offeneRaw ?? []) as R[]).map(o => ({ brutto: Number(o.betrag_brutto ?? 0), tage: tageDifferenz(o.faellig_am, heute) }))
  const gesamt = offene.reduce((s, o) => s + o.brutto, 0)
  const ueberfaellig = offene.filter(o => o.tage > 0)
  const bald = offene.filter(o => o.tage <= 0 && o.tage >= -7)

  const ausgabenKategorien = kategorien.filter(k => k.typ === 'ausgabe' || k.typ === 'beides').map(k => ({ id: k.id, name: k.name, ust_satz_std: k.ust_satz_std, abzugsfaehig_pct: k.abzugsfaehig_pct }))
  const firmen = ((firmenRaw ?? []) as R[])
    // Lieferanten zuerst, danach alle anderen Firmen
    .sort((a, b) => (a.segment === 'lieferant' ? 0 : 1) - (b.segment === 'lieferant' ? 0 : 1) || String(a.name).localeCompare(String(b.name), 'de'))
    .map(f => ({ id: f.id as string, name: f.name as string, ort: (f.ort ?? null) as string | null, lieferant: f.segment === 'lieferant' }))

  return (
    <div className="space-y-5">
      <div>
        <Link href="/rechnungen" className="text-sm text-hs-text-2 hover:text-hs-text inline-flex items-center gap-1"><ArrowLeft size={14} strokeWidth={1.75} /> Fakturierung</Link>
        <h1 className="text-2xl mt-1">Verbindlichkeiten</h1>
        <p className="text-sm text-hs-text-2 mt-0.5">Eingangsrechnungen von Lieferanten mit Fälligkeit · beim Bezahlen wird automatisch die E&A-Ausgabe gebucht.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card !p-4">
          <p className="overline">Offen gesamt</p>
          <p className={`kpi mt-1 ${gesamt > 0 ? 'text-hs-err-fg' : ''}`}>{fmtEuroMitZeichen(gesamt)}</p>
          <p className="text-xs text-hs-text-2 mt-0.5">{offene.length} Eingangsrechnung{offene.length === 1 ? '' : 'en'}</p>
        </div>
        <div className="card !p-4">
          <p className="overline">Überfällig</p>
          <p className={`kpi mt-1 ${ueberfaellig.length > 0 ? 'text-hs-err-fg' : ''}`}>{fmtEuroMitZeichen(ueberfaellig.reduce((s, o) => s + o.brutto, 0))}</p>
          <p className="text-xs text-hs-text-2 mt-0.5">{ueberfaellig.length} Eingangsrechnung{ueberfaellig.length === 1 ? '' : 'en'}</p>
        </div>
        <div className="card !p-4">
          <p className="overline">Fällig in 7 Tagen</p>
          <p className="kpi mt-1">{fmtEuroMitZeichen(bald.reduce((s, o) => s + o.brutto, 0))}</p>
          <p className="text-xs text-hs-text-2 mt-0.5">{bald.length} Eingangsrechnung{bald.length === 1 ? '' : 'en'}</p>
        </div>
      </div>

      <VerbindlichkeitenClient rows={rows} filter={filter} kategorien={ausgabenKategorien} konten={konten} firmen={firmen} writeOk={writeOk} heute={heute} autoNeu={neu === '1' && writeOk} />
    </div>
  )
}
