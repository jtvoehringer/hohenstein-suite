import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canAdmin } from '@/lib/auth/roles'
import { ladeEaEinstellungen } from '@/lib/ea/server'
import { monatVorBeginn } from '@/lib/ea/betriebsbeginn'
import MonatsabschlussClient, { type MonatInfo } from './MonatsabschlussClient'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default async function MonatsabschlussPage({ searchParams }: { searchParams: Promise<{ jahr?: string }> }) {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId
  const adminOk  = canAdmin(membership.role)

  const sp = await searchParams
  const heute = new Date()
  const jahr = parseInt(sp.jahr ?? '') || heute.getFullYear()

  const einst = await ladeEaEinstellungen(supabase, tenantId)
  const betriebsbeginn = einst.ea_betriebsbeginn
  const beginnJahr = betriebsbeginn ? new Date(betriebsbeginn).getFullYear() : null
  const jahre = Array.from({ length: 6 }, (_, i) => heute.getFullYear() + 1 - i)
    .filter(j => beginnJahr === null || j >= beginnJahr)

  const [{ data: abschluesseRaw }, { data: uvaRaw }, { data: txRaw }] = await Promise.all([
    (supabase.from('ea_monatsabschluss') as any)
      .select('monat, abgeschlossen_am').eq('tenant_id', tenantId).eq('jahr', jahr),
    (supabase.from('ea_uva') as any)
      .select('zeitraum, gesperrt').eq('tenant_id', tenantId).eq('jahr', jahr).eq('gesperrt', true),
    (supabase.from('ea_transaktionen') as any)
      .select('datum, typ, betrag_netto').eq('tenant_id', tenantId)
      .gte('datum', `${jahr}-01-01`).lte('datum', `${jahr}-12-31`),
  ])

  const abschluesse = new Map<number, string>(((abschluesseRaw ?? []) as R[]).map(a => [Number(a.monat), a.abgeschlossen_am as string]))
  const uvaGesperrt = new Set<string>(((uvaRaw ?? []) as R[]).map(u => u.zeitraum as string))

  const kennzahlen = new Map<number, { anzahl: number; einnahmen: number; ausgaben: number }>()
  for (const t of (txRaw ?? []) as R[]) {
    const m = parseInt(String(t.datum).slice(5, 7), 10)
    const k = kennzahlen.get(m) ?? { anzahl: 0, einnahmen: 0, ausgaben: 0 }
    k.anzahl++
    if (t.typ === 'einnahme') k.einnahmen += Number(t.betrag_netto ?? 0)
    else k.ausgaben += Number(t.betrag_netto ?? 0)
    kennzahlen.set(m, k)
  }

  const monate: MonatInfo[] = Array.from({ length: 12 }, (_, i) => {
    const monat = i + 1
    const k = kennzahlen.get(monat) ?? { anzahl: 0, einnahmen: 0, ausgaben: 0 }
    return {
      monat,
      abgeschlossenAm: abschluesse.get(monat) ?? null,
      vorBeginn: monatVorBeginn(jahr, monat, betriebsbeginn),
      zukunft: jahr > heute.getFullYear() || (jahr === heute.getFullYear() && monat > heute.getMonth() + 1),
      uvaGesperrt: uvaGesperrt.has(`Q${Math.ceil(monat / 3)}`) || uvaGesperrt.has(String(monat).padStart(2, '0')),
      ...k,
    }
  })

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Monatsabschluss</h1>
          <p className="text-sm text-hs-text-2 mt-0.5">
            Ein abgeschlossener Monat sperrt alle Buchungen dieses Monats gegen Bearbeiten und Löschen; neue Buchungen mit einem Datum in diesem Monat sind nicht mehr möglich.
            Der Abschluss kann von Admins wieder aufgehoben werden, solange die UVA der Periode nicht übermittelt ist.
          </p>
        </div>
        <form method="GET" className="flex items-end gap-2">
          <div>
            <label className="form-label">Jahr</label>
            <select name="jahr" defaultValue={String(jahr)} className="input">
              {jahre.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
          </div>
          <button type="submit" className="btn-secondary">Anzeigen</button>
        </form>
      </div>
      <MonatsabschlussClient jahr={jahr} monate={monate} adminOk={adminOk} betriebsbeginn={betriebsbeginn} />
    </div>
  )
}
