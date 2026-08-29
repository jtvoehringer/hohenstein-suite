import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership } from '@/lib/auth/roles'
import { fmtDatum, fmtEuroMitZeichen, heuteIso } from '@/lib/format'
import { mahnstufe, tageDifferenz } from '@/lib/rechnungen/types'
import ClickableTableRow from '@/components/ui/ClickableTableRow'
import StatusPill from '@/components/rechnungen/StatusPill'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default async function OffenePostenPage() {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId
  const heute = heuteIso()

  const { data } = await (supabase.from('belege') as any)
    .select('id, nummer, status, empf_name, empf_email, datum, faellig_am, summe_brutto, bezahlt_betrag, gesendet_am')
    .eq('tenant_id', tenantId).eq('belegart', 'rechnung').in('status', ['gestellt', 'teilbezahlt'])
    .order('faellig_am', { ascending: true, nullsFirst: false })

  const posten = ((data ?? []) as R[]).map(b => {
    const offen = Number(b.summe_brutto ?? 0) - Number(b.bezahlt_betrag ?? 0)
    const tage = b.faellig_am ? tageDifferenz(b.faellig_am, heute) : 0
    return {
      id: b.id as string, nummer: (b.nummer ?? '') as string, status: b.status as string, empf_name: (b.empf_name ?? '') as string,
      datum: b.datum as string, faellig_am: (b.faellig_am ?? null) as string | null, summe_brutto: Number(b.summe_brutto ?? 0),
      offen, tage, stufe: mahnstufe(tage),
    }
  })
  const gesamt = posten.reduce((s, p) => s + p.offen, 0)
  const ueberfaellig = posten.filter(p => p.tage > 0)
  const summeUeberfaellig = ueberfaellig.reduce((s, p) => s + p.offen, 0)
  const faelligBald = posten.filter(p => p.tage <= 0 && p.tage >= -7)

  const stufeKlasse = (stufe: number) =>
    stufe === 0 ? 'pill bg-hs-bg text-hs-text-1 border border-hs-line'
    : stufe === 1 ? 'pill bg-hs-warn-bg text-hs-warn-fg'
    : 'pill bg-hs-err-bg text-hs-err-fg'

  return (
    <div className="space-y-5">
      <div>
        <Link href="/rechnungen" className="text-sm text-hs-text-2 hover:text-hs-text inline-flex items-center gap-1"><ArrowLeft size={14} strokeWidth={1.75} /> Fakturierung</Link>
        <h1 className="text-2xl mt-1">Offene Posten</h1>
        <p className="text-sm text-hs-text-2 mt-0.5">Gestellte und teilbezahlte Rechnungen · Mahnstufe ist ein rein informativer Hinweis.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card !p-4">
          <p className="overline">Offen gesamt</p>
          <p className={`kpi mt-1 ${gesamt > 0 ? 'text-hs-err-fg' : ''}`}>{fmtEuroMitZeichen(gesamt)}</p>
          <p className="text-xs text-hs-text-2 mt-0.5">{posten.length} Rechnung{posten.length === 1 ? '' : 'en'}</p>
        </div>
        <div className="card !p-4">
          <p className="overline">Überfällig</p>
          <p className={`kpi mt-1 ${summeUeberfaellig > 0 ? 'text-hs-err-fg' : ''}`}>{fmtEuroMitZeichen(summeUeberfaellig)}</p>
          <p className="text-xs text-hs-text-2 mt-0.5">{ueberfaellig.length} Rechnung{ueberfaellig.length === 1 ? '' : 'en'}</p>
        </div>
        <div className="card !p-4">
          <p className="overline">Fällig in 7 Tagen</p>
          <p className="kpi mt-1">{fmtEuroMitZeichen(faelligBald.reduce((s, p) => s + p.offen, 0))}</p>
          <p className="text-xs text-hs-text-2 mt-0.5">{faelligBald.length} Rechnung{faelligBald.length === 1 ? '' : 'en'}</p>
        </div>
      </div>

      {posten.length === 0 ? (
        <div className="card text-sm text-hs-text-2">Keine offenen Posten – alle Rechnungen sind bezahlt.</div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-2.5 text-left">Nummer</th>
                  <th className="px-4 py-2.5 text-left">Empfänger</th>
                  <th className="px-4 py-2.5 text-left hidden md:table-cell">Datum</th>
                  <th className="px-4 py-2.5 text-left">Fällig</th>
                  <th className="px-4 py-2.5 text-right">Tage</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-left hidden lg:table-cell">Mahnstufe</th>
                  <th className="px-4 py-2.5 text-right hidden md:table-cell">Brutto</th>
                  <th className="px-4 py-2.5 text-right">Offen</th>
                </tr>
              </thead>
              <tbody>
                {posten.map(p => (
                  <ClickableTableRow key={p.id} href={`/rechnungen/${p.id}`} className="border-b border-hs-line last:border-0 hover:bg-hs-bg/60">
                    <td className="px-4 py-2.5 font-mono text-[13px]">{p.nummer}</td>
                    <td className="px-4 py-2.5 font-medium max-w-[240px] truncate">{p.empf_name}</td>
                    <td className="px-4 py-2.5 text-hs-text-2 hidden md:table-cell">{fmtDatum(p.datum)}</td>
                    <td className={`px-4 py-2.5 ${p.tage > 0 ? 'text-hs-err-fg font-medium' : 'text-hs-text-2'}`}>{fmtDatum(p.faellig_am)}</td>
                    <td className={`px-4 py-2.5 betrag ${p.tage > 0 ? 'text-hs-err-fg font-medium' : 'text-hs-text-2'}`}>{p.tage > 0 ? `${p.tage} T. überfällig` : p.tage === 0 ? 'heute' : `in ${-p.tage} T.`}</td>
                    <td className="px-4 py-2.5"><StatusPill status={p.status} ueberfaellig={p.tage > 0} /></td>
                    <td className="px-4 py-2.5 hidden lg:table-cell"><span className={stufeKlasse(p.stufe.stufe)}>{p.stufe.label}</span></td>
                    <td className="px-4 py-2.5 betrag text-hs-text-2 hidden md:table-cell">{fmtEuroMitZeichen(p.summe_brutto)}</td>
                    <td className="px-4 py-2.5 betrag font-semibold text-hs-err-fg">{fmtEuroMitZeichen(p.offen)}</td>
                  </ClickableTableRow>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-hs-bg/60 font-semibold">
                  <td className="px-4 py-2.5" colSpan={8}>Summe offen</td>
                  <td className="px-4 py-2.5 betrag text-hs-err-fg">{fmtEuroMitZeichen(gesamt)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
