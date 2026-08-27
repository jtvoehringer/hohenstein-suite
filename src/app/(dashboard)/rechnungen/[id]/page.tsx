import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Link2 } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { ladeKonten } from '@/lib/ea/server'
import { ladeVerbindungRoh } from '@/lib/email/verbindung'
import { fmtDatum, fmtEuroMitZeichen, heuteIso } from '@/lib/format'
import { ladeAbsender, ladeBeleg, ladeKundennummer, ladeZahlungen } from '@/lib/rechnungen/server'
import { belegartLabel, istUeberfaellig, tageDifferenz } from '@/lib/rechnungen/types'
import BelegVorschau from '@/components/rechnungen/BelegVorschau'
import BelegAktionen from '@/components/rechnungen/BelegAktionen'
import StatusPill from '@/components/rechnungen/StatusPill'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const membership = await getCurrentMembership()
  if (!membership) return { title: 'Beleg – Hohenstein Suite' }
  const supabase = await createSupabaseServerClient()
  const { data } = await (supabase.from('belege') as any).select('belegart, nummer').eq('id', id).eq('tenant_id', membership.tenantId).maybeSingle()
  const b = data as R | null
  return { title: `${b ? `${belegartLabel(b.belegart)} ${b.nummer ?? '(Entwurf)'}` : 'Beleg'} – Hohenstein Suite` }
}

export default async function BelegDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId
  const writeOk  = canWrite(membership.role)

  const geladen = await ladeBeleg(supabase, tenantId, id)
  if (!geladen) notFound()
  const { beleg, positionen } = geladen

  const [absender, kundennummer, zahlungen, konten, verbindung, { data: quelleRaw }, { data: folgeRaw }] = await Promise.all([
    ladeAbsender(supabase, tenantId),
    ladeKundennummer(supabase, tenantId, beleg.firma_id, beleg.kontakt_id),
    ladeZahlungen(supabase, tenantId, id),
    ladeKonten(supabase, tenantId),
    ladeVerbindungRoh().catch(() => null),
    beleg.quelle_beleg_id
      ? (supabase.from('belege') as any).select('id, belegart, nummer, status').eq('id', beleg.quelle_beleg_id).eq('tenant_id', tenantId).maybeSingle()
      : Promise.resolve({ data: null }),
    (supabase.from('belege') as any).select('id, belegart, nummer, status').eq('quelle_beleg_id', id).eq('tenant_id', tenantId).order('erstellt_am'),
  ])
  const quelle = quelleRaw as R | null
  const folge = (folgeRaw ?? []) as R[]
  const emailKonto = !!(verbindung?.row?.smtp_host && verbindung?.row?.smtp_user && verbindung?.row?.smtp_pass_enc)

  const heute = heuteIso()
  const ueberfaellig = istUeberfaellig(beleg, heute)
  const offen = beleg.summe_brutto - beleg.bezahlt_betrag
  const zurueck = beleg.belegart === 'angebot' ? '/rechnungen/angebote' : '/rechnungen'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={zurueck} className="text-sm text-hs-text-2 hover:text-hs-text inline-flex items-center gap-1">
            <ArrowLeft size={14} strokeWidth={1.75} /> {beleg.belegart === 'angebot' ? 'Angebote' : 'Fakturierung'}
          </Link>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <h1 className="text-2xl">{belegartLabel(beleg.belegart)} {beleg.nummer ?? <span className="text-hs-tertiary">(Entwurf)</span>}</h1>
            <StatusPill status={beleg.status} ueberfaellig={ueberfaellig} />
          </div>
          <p className="text-sm text-hs-text-2 mt-0.5">
            {beleg.empf_name} · {fmtDatum(beleg.datum)}
            {beleg.belegart === 'rechnung' && beleg.faellig_am && ` · fällig ${fmtDatum(beleg.faellig_am)}`}
            {ueberfaellig && beleg.faellig_am && <span className="text-hs-err-fg"> ({tageDifferenz(beleg.faellig_am, heute)} Tage überfällig)</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="overline">{beleg.belegart === 'rechnung' && offen > 0 && beleg.status !== 'storniert' && beleg.status !== 'entwurf' ? 'Offen' : 'Brutto'}</p>
          <p className={`kpi ${ueberfaellig ? 'text-hs-err-fg' : ''}`}>
            {fmtEuroMitZeichen(beleg.belegart === 'rechnung' && offen > 0 && beleg.status !== 'storniert' && beleg.status !== 'entwurf' ? offen : beleg.summe_brutto)}
          </p>
          {beleg.bezahlt_betrag > 0 && <p className="text-xs text-hs-text-2 font-mono">bezahlt {fmtEuroMitZeichen(beleg.bezahlt_betrag)} von {fmtEuroMitZeichen(beleg.summe_brutto)}</p>}
        </div>
      </div>

      {(quelle || folge.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-hs-text-2">
          <Link2 size={14} strokeWidth={1.75} />
          {quelle && (
            <Link href={`/rechnungen/${quelle.id}`} className="pill bg-hs-bg text-hs-text-1 border border-hs-line hover:border-hs-blue-300">
              aus {belegartLabel(quelle.belegart)} {quelle.nummer ?? '(Entwurf)'}
            </Link>
          )}
          {folge.map(f => (
            <Link key={f.id} href={`/rechnungen/${f.id}`} className="pill bg-hs-bg text-hs-text-1 border border-hs-line hover:border-hs-blue-300">
              → {belegartLabel(f.belegart)} {f.nummer ?? '(Entwurf)'}
            </Link>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
        <BelegVorschau beleg={beleg} positionen={positionen} absender={absender} kundennummer={kundennummer} />
        <BelegAktionen beleg={beleg} zahlungen={zahlungen} konten={konten} writeOk={writeOk} emailKonto={emailKonto} absenderName={absender.name} />
      </div>
    </div>
  )
}
