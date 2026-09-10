import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership } from '@/lib/auth/roles'
import { fmtEuro, fmtDatum, heuteIso } from '@/lib/format'
import { ladeAnlagen, afaSatzProzent, anlagenspiegelZeilen, gruppeLabel, methodeLabel, type SpiegelZeile } from '@/lib/ea/anlagen'
import JahrWaehler from '../JahrWaehler'
import DruckenKnopf from './DruckenKnopf'

// Anlagenspiegel – /buchhaltung/anlagen/spiegel?jahr= (übernommen aus KPS Welle 8)
// Druckbare Aufstellung je Jahr: Buchwert 1.1., Zugänge, Abgänge, AfA, kumulierte AfA
// und Buchwert 31.12. je Anlage mit Gruppen-Zwischensummen – Beilage zur E&A / für den Steuerberater.

export const metadata: Metadata = { title: 'Anlagenspiegel – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
type SummenKey = 'buchwertAnfang' | 'zugang' | 'abgang' | 'afa' | 'kumulierteAfa' | 'buchwertEnde'

const eur = (n: number) => (n === 0 ? '–' : fmtEuro(n))
const summiere = (rows: SpiegelZeile[], k: SummenKey) => Math.round(rows.reduce((s, r) => s + r[k], 0) * 100) / 100

const th = 'px-2 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[.06em] text-hs-tertiary border-b border-hs-line-str whitespace-nowrap print:text-[9px] print:px-1.5'
const thNum = th + ' text-right'
const td = 'px-2 py-1.5 text-[12.5px] text-hs-text border-b border-hs-line align-top print:text-[10px] print:px-1.5 print:py-1'
const tdNum = td + ' tabular-nums text-right whitespace-nowrap'
const tdSum = 'px-2 py-2 text-[12.5px] font-semibold text-hs-blue-700 border-t-2 border-hs-blue-700 print:text-[10px] print:px-1.5'
const tdSumNum = tdSum + ' tabular-nums text-right whitespace-nowrap'

export default async function AnlagenspiegelPage({ searchParams }: { searchParams: Promise<{ jahr?: string }> }) {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId

  const [anlagen, { data: tenant }, { data: einst }, { jahr: jahrParam }] = await Promise.all([
    ladeAnlagen(supabase, tenantId),
    (supabase.from('tenants') as R).select('name').eq('id', tenantId).maybeSingle(),
    (supabase.from('tenant_einstellungen') as R).select('betrieb_name, betrieb_uid').eq('tenant_id', tenantId).maybeSingle(),
    searchParams,
  ])
  const firma = ((einst as R | null)?.betrieb_name as string | null) || ((tenant as R | null)?.name as string | null) || 'Hohenstein Consulting OG'
  const uid = ((einst as R | null)?.betrieb_uid as string | null) ?? null

  const heute = heuteIso()
  const aktJahr = Number(heute.slice(0, 4))
  const jahre = [...new Set([aktJahr, ...anlagen.map(a => Number(a.anschaffungsdatum.slice(0, 4)))])].sort((a, b) => b - a)
  const jahr = jahre.includes(Number(jahrParam)) ? Number(jahrParam) : aktJahr
  const { zeilen, summe } = anlagenspiegelZeilen(anlagen, jahr)

  // Gruppierung nach Anlagengruppe (Zwischensummen)
  const gruppen = new Map<string, SpiegelZeile[]>()
  for (const z of zeilen) {
    const g = gruppeLabel(z.anlage.gruppe)
    gruppen.set(g, [...(gruppen.get(g) ?? []), z])
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 print:max-w-none">
      <style>{`@media print { @page { size: A4 landscape; margin: 12mm 12mm 14mm; } header, nav, aside, .print-hide { display: none !important } main { padding: 0 !important } body { background: #fff } }`}</style>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl">Anlagenspiegel {jahr}</h1>
          <p className="text-sm text-hs-text-2 mt-0.5">{firma}{uid ? ` · UID ${uid}` : ''} · Stichtag 31.12.{jahr} · Anlagenverzeichnis nach § 7 EStG</p>
        </div>
        <div className="flex items-center gap-2 print-hide">
          <Link href={`/buchhaltung/anlagen?jahr=${jahr}`} className="btn-secondary"><ArrowLeft size={15} strokeWidth={2} /> Zum Verzeichnis</Link>
          <JahrWaehler jahre={jahre} jahr={jahr} basis="/buchhaltung/anlagen/spiegel" />
          <DruckenKnopf />
        </div>
      </div>

      {zeilen.length === 0 ? (
        <p className="text-sm text-hs-text-2 bg-white rounded-xl border border-hs-line px-4 py-5">
          Für {jahr} gibt es keine Anlagen im Verzeichnis. <Link href="/buchhaltung/anlagen" className="text-hs-blue-700 underline underline-offset-2">Zum Anlagenverzeichnis</Link>
        </p>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-hs-line overflow-x-auto print:overflow-visible print:border-0 print:rounded-none">
            <table className="w-full min-w-[980px] print:min-w-0 border-collapse">
              <thead>
                <tr>
                  <th className={th}>Anlage</th>
                  <th className={th}>Konto</th>
                  <th className={th}>Anschaffung</th>
                  <th className={th}>ND / Methode</th>
                  <th className={thNum}>AK netto</th>
                  <th className={thNum}>Buchwert 1.1.</th>
                  <th className={thNum}>Zugang {jahr}</th>
                  <th className={thNum}>Abgang {jahr}</th>
                  <th className={thNum}>AfA {jahr}</th>
                  <th className={thNum}>kum. AfA</th>
                  <th className={thNum}>Buchwert 31.12.</th>
                </tr>
              </thead>
              <tbody>
                {[...gruppen.entries()].map(([gruppe, rows]) => (
                  <GruppenBlock key={gruppe} gruppe={gruppe} rows={rows} mehrereGruppen={gruppen.size > 1} />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className={tdSum} colSpan={4}>Summe {jahr} · {summe.anzahlAktiv} {summe.anzahlAktiv === 1 ? 'Anlage' : 'Anlagen'} im Bestand</td>
                  <td className={tdSumNum}>{fmtEuro(summe.anschaffungskosten + summe.abgaenge)}</td>
                  <td className={tdSumNum}>{fmtEuro(summiere(zeilen, 'buchwertAnfang'))}</td>
                  <td className={tdSumNum}>{eur(summe.zugaenge)}</td>
                  <td className={tdSumNum}>{eur(summe.abgaenge)}</td>
                  <td className={tdSumNum}>{fmtEuro(summe.afaJahr)}</td>
                  <td className={tdSumNum}>{fmtEuro(summiere(zeilen, 'kumulierteAfa'))}</td>
                  <td className={tdSumNum}>{fmtEuro(summe.buchwertEnde)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {summe.abgaenge > 0 && (
            <p className="text-xs text-hs-text-1 print:text-[10px]">
              Abgänge {jahr}: Restbuchwert zum Abgang <span className="tabular-nums">{fmtEuro(summe.restbuchwertAbgaenge)}</span>
              {summe.veraeusserungserloese > 0 && <> · Veräußerungserlöse netto <span className="tabular-nums">{fmtEuro(summe.veraeusserungserloese)}</span></>}
              {' '}· Buchgewinn/-verlust <span className="tabular-nums">{fmtEuro(Math.round((summe.veraeusserungserloese - summe.restbuchwertAbgaenge) * 100) / 100)}</span>
            </p>
          )}

          <p className="text-[11px] text-hs-text-2 leading-relaxed print:text-[9px]">
            Alle Beträge in Euro, netto. Lineare AfA nach § 7 Abs. 1 EStG; Halbjahresregel (½) nach § 7 Abs. 2 bei Inbetriebnahme
            bzw. Ausscheiden im zweiten bzw. ersten Halbjahr; degressive AfA nach § 7 Abs. 1a (max. 30 % vom Restbuchwert);
            geringwertige Wirtschaftsgüter (GWG) nach § 13 EStG im Anschaffungsjahr voll abgeschrieben. Buchwert 1.1. = Buchwert
            zum 31.12. des Vorjahres. kum. AfA = Anschaffungskosten abzüglich Buchwert 31.12. (bei Abgängen: bis zum Abgang).
            Erstellt mit der Hohenstein Suite am {fmtDatum(heute)}; ersetzt keine steuerliche Beratung.
          </p>
        </>
      )}
    </div>
  )
}

function GruppenBlock({ gruppe, rows, mehrereGruppen }: { gruppe: string; rows: SpiegelZeile[]; mehrereGruppen: boolean }) {
  const tdZw = 'px-2 py-1.5 text-[11.5px] font-semibold text-hs-text-1 bg-hs-bg border-b border-hs-line-str print:text-[9.5px] print:px-1.5'
  return (
    <>
      {mehrereGruppen && <tr><td className={tdZw} colSpan={11}>{gruppe}</td></tr>}
      {rows.map(z => {
        const a = z.anlage
        return (
          <tr key={a.id} className={z.abgegangen ? 'text-hs-text-2' : ''}>
            <td className={td}>
              <span className="font-medium">{a.bezeichnung}</span>
              {z.abgegangen && <span className="block text-[11px] text-hs-text-2">Abgang {fmtDatum(a.abgang_datum)}{z.erloes > 0 ? ` · Erlös ${fmtEuro(z.erloes)}` : ''}</span>}
            </td>
            <td className={td + ' tabular-nums'}>{a.konto_nr ?? '–'}</td>
            <td className={td + ' tabular-nums whitespace-nowrap'}>{fmtDatum(a.anschaffungsdatum)}</td>
            <td className={td + ' whitespace-nowrap'}>
              {a.methode === 'gwg' ? 'GWG' : `${a.nutzungsdauer_jahre} J. · ${methodeLabel(a.methode)}`}
              <span className="tabular-nums text-hs-text-2"> {afaSatzProzent(a).toLocaleString('de-AT')} %</span>
            </td>
            <td className={tdNum}>{fmtEuro(a.anschaffungskosten)}</td>
            <td className={tdNum}>{eur(z.buchwertAnfang)}</td>
            <td className={tdNum}>{eur(z.zugang)}</td>
            <td className={tdNum}>{eur(z.abgang)}</td>
            <td className={tdNum}>{z.afa > 0 ? <>{fmtEuro(z.afa)}{z.halb && <span className="text-hs-text-2" title="Halbjahresregel"> ½</span>}</> : '–'}</td>
            <td className={tdNum}>{fmtEuro(z.kumulierteAfa)}</td>
            <td className={tdNum + ' font-semibold text-hs-blue-700'}>{fmtEuro(z.buchwertEnde)}</td>
          </tr>
        )
      })}
      {mehrereGruppen && (
        <tr className="bg-hs-bg/60">
          <td className={td + ' text-[11.5px] text-hs-text-1 italic'} colSpan={4}>Zwischensumme {gruppe}</td>
          <td className={tdNum + ' text-hs-text-1'}>{fmtEuro(rows.reduce((s, r) => s + r.anlage.anschaffungskosten, 0))}</td>
          <td className={tdNum + ' text-hs-text-1'}>{eur(summiere(rows, 'buchwertAnfang'))}</td>
          <td className={tdNum + ' text-hs-text-1'}>{eur(summiere(rows, 'zugang'))}</td>
          <td className={tdNum + ' text-hs-text-1'}>{eur(summiere(rows, 'abgang'))}</td>
          <td className={tdNum + ' text-hs-text-1'}>{eur(summiere(rows, 'afa'))}</td>
          <td className={tdNum + ' text-hs-text-1'}>{fmtEuro(summiere(rows, 'kumulierteAfa'))}</td>
          <td className={tdNum + ' text-hs-text-1'}>{fmtEuro(summiere(rows, 'buchwertEnde'))}</td>
        </tr>
      )}
    </>
  )
}
