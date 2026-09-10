import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Printer } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { ladeAnlagen, ladeBuchungsKandidaten, afaBuchungsStatus, anlagenspiegel, type AfaBuchungRoh } from '@/lib/ea/anlagen'
import { heuteIso } from '@/lib/format'
import AnlagenClient from './AnlagenClient'
import JahrWaehler from './JahrWaehler'

export const metadata: Metadata = { title: 'Anlagenverzeichnis – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default async function AnlagenPage({ searchParams }: { searchParams: Promise<{ jahr?: string; buchung?: string }> }) {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId
  const heute = heuteIso()
  const aktJahr = Number(heute.slice(0, 4))

  const [anlagen, kandidaten, { jahr: jahrParam, buchung: buchungParam }] = await Promise.all([
    ladeAnlagen(supabase, tenantId),
    ladeBuchungsKandidaten(supabase, tenantId),
    searchParams,
  ])
  const jahre = [...new Set([aktJahr, ...anlagen.map(a => Number(a.anschaffungsdatum.slice(0, 4)))])].sort((a, b) => b - a)
  const jahr = jahre.includes(Number(jahrParam)) ? Number(jahrParam) : aktJahr

  // AfA-Buchung am Jahresende: gebuchte AfA des Jahres, Kategorie vorhanden?, Dezember abgeschlossen?
  const [{ data: afaRaw }, { data: kat }, { data: dezember }] = await Promise.all([
    (supabase.from('ea_transaktionen') as R).select('id, anlage_id, betrag_netto, datum, is_locked')
      .eq('tenant_id', tenantId).not('anlage_id', 'is', null).gte('datum', `${jahr}-01-01`).lte('datum', `${jahr}-12-31`),
    (supabase.from('ea_kategorien') as R).select('id').eq('tenant_id', tenantId).eq('name', 'Abschreibung (AfA)').limit(1).maybeSingle(),
    (supabase.from('ea_monatsabschluss') as R).select('id').eq('tenant_id', tenantId).eq('jahr', jahr).eq('monat', 12).limit(1).maybeSingle(),
  ])
  const afaBuchungen: AfaBuchungRoh[] = ((afaRaw ?? []) as R[]).map(b => ({ id: b.id, anlage_id: b.anlage_id, betrag_netto: Number(b.betrag_netto), datum: b.datum, is_locked: !!b.is_locked }))
  const afaStatus = afaBuchungsStatus(anlagen, jahr, afaBuchungen)
  const spiegel = anlagenspiegel(anlagen, jahr)

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl">Anlagenverzeichnis</h1>
          <p className="text-sm text-hs-text-2 mt-0.5">
            Abnutzbares Anlagevermögen mit Nutzungsdauer, AfA je Jahr (linear, degressiv oder GWG) und Buchwert zum Jahresende – Grundlage für Reporting, AfA-Buchung und Anlagenspiegel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <JahrWaehler jahre={jahre} jahr={jahr} basis="/buchhaltung/anlagen" />
          {anlagen.length > 0 && (
            <Link href={`/buchhaltung/anlagen/spiegel?jahr=${jahr}`} className="btn-secondary"><Printer size={15} strokeWidth={1.75} /> Anlagenspiegel</Link>
          )}
        </div>
      </div>
      <AnlagenClient
        anlagen={anlagen}
        jahr={jahr}
        heute={heute}
        spiegel={spiegel}
        kandidaten={kandidaten}
        afaStatus={afaStatus}
        afaKategorieVorhanden={!!kat}
        dezemberGesperrt={!!dezember}
        vorbelegungBuchungId={buchungParam ?? null}
        writeOk={canWrite(membership.role)}
      />
    </div>
  )
}
