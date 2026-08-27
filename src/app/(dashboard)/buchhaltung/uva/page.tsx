import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canAdmin, canWrite } from '@/lib/auth/roles'
import { ladeEaEinstellungen } from '@/lib/ea/server'
import { monatVorBeginn, monateDerPeriode, periodeVorBeginn } from '@/lib/ea/betriebsbeginn'
import { uvaPerioden, aktuellePeriode } from '@/lib/ea/types'
import UvaClient from './UvaClient'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default async function UvaPage({ searchParams }: { searchParams: Promise<{ jahr?: string }> }) {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId

  const sp = await searchParams
  const heute = new Date()
  const jahr = parseInt(sp.jahr ?? '') || heute.getFullYear()

  const einst = await ladeEaEinstellungen(supabase, tenantId)
  const betriebsbeginn = einst.ea_betriebsbeginn
  const beginnJahr = betriebsbeginn ? new Date(betriebsbeginn).getFullYear() : null
  const jahre = Array.from({ length: 6 }, (_, i) => heute.getFullYear() + 1 - i)
    .filter(j => beginnJahr === null || j >= beginnJahr)

  const [{ data: uvaRaw }, { data: abschluesseRaw }] = await Promise.all([
    (supabase.from('ea_uva') as any)
      .select('id, jahr, zeitraum, bmgl_ust_0, bmgl_ust_10, bmgl_ust_13, bmgl_ust_20, ust_10, ust_13, ust_20, ust_gesamt, vst_10, vst_13, vst_20, vst_gesamt, zahllast, gesperrt, gesperrt_am, notizen, erstellt_am')
      .eq('tenant_id', tenantId).eq('jahr', jahr).order('zeitraum'),
    (supabase.from('ea_monatsabschluss') as any)
      .select('monat').eq('tenant_id', tenantId).eq('jahr', jahr),
  ])
  const uvaListe = (uvaRaw ?? []) as R[]
  const abgeschlossen = new Set(((abschluesseRaw ?? []) as R[]).map(a => Number(a.monat)))

  const alle = uvaPerioden(einst.ea_uva_zeitraum).filter(z => !periodeVorBeginn(jahr, z, betriebsbeginn))
  const gesperrt = new Set(uvaListe.filter(u => u.gesperrt).map(u => u.zeitraum as string))
  const zeitraeume = alle.filter(z => !gesperrt.has(z))

  const fehlendeMonate: Record<string, number[]> = {}
  for (const u of uvaListe) {
    fehlendeMonate[u.zeitraum] = monateDerPeriode(u.zeitraum)
      .filter(m => !monatVorBeginn(jahr, m, betriebsbeginn))
      .filter(m => !abgeschlossen.has(m))
  }

  // Vorschlag: die zuletzt abgelaufene Periode (bei aktuellem Jahr), sonst die erste offene
  const vorschlag = (() => {
    if (jahr !== heute.getFullYear()) return zeitraeume[0] ?? ''
    const aktuell = aktuellePeriode(einst.ea_uva_zeitraum, heute)
    const idx = alle.indexOf(aktuell)
    return alle[idx - 1] ?? aktuell
  })()

  // Anzeige: übermittelte zuerst? Nein – chronologisch, wie gespeichert (order zeitraum)
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">UVA-Meldung</h1>
          <p className="text-sm text-hs-text-2 mt-0.5">
            Umsatzsteuervoranmeldung {einst.ea_uva_zeitraum === 'monatlich' ? 'monatlich' : 'quartalsweise'} · Kennzahlen zur Eingabe in FinanzOnline.
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
      <UvaClient
        jahr={jahr}
        zeitraeume={zeitraeume}
        vorschlag={vorschlag}
        uvaListe={uvaListe}
        fehlendeMonate={fehlendeMonate}
        writeOk={canWrite(membership.role)}
        adminOk={canAdmin(membership.role)}
        kleinunternehmer={einst.ea_kleinunternehmer}
      />
    </div>
  )
}
