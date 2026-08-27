import ClickableTableRow from '@/components/ui/ClickableTableRow'
import StatusPill from '@/components/rechnungen/StatusPill'
import { fmtDatum, fmtEuroMitZeichen } from '@/lib/format'
import { belegartLabel, istUeberfaellig } from '@/lib/rechnungen/types'

export type BelegListenZeile = {
  id: string
  belegart: string
  nummer: string | null
  status: string
  empf_name: string
  datum: string
  faellig_am: string | null
  summe_netto: number
  summe_brutto: number
  bezahlt_betrag: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export const LISTE_SELECT = 'id, belegart, nummer, status, empf_name, datum, faellig_am, summe_netto, summe_brutto, bezahlt_betrag'

export function mapListe(rows: R[]): BelegListenZeile[] {
  return rows.map(b => ({
    id: b.id, belegart: b.belegart, nummer: b.nummer ?? null, status: b.status, empf_name: b.empf_name ?? '',
    datum: b.datum, faellig_am: b.faellig_am ?? null,
    summe_netto: Number(b.summe_netto ?? 0), summe_brutto: Number(b.summe_brutto ?? 0), bezahlt_betrag: Number(b.bezahlt_betrag ?? 0),
  }))
}

/** Tabellarische Belegliste (Server Component) */
export default function BelegTabelle({ belege, heute, zeigeArt = true, leerText }: {
  belege: BelegListenZeile[]
  heute: string
  zeigeArt?: boolean
  leerText: React.ReactNode
}) {
  if (belege.length === 0) {
    return <div className="card text-sm text-hs-text-2">{leerText}</div>
  }
  return (
    <div className="card !p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-2.5 text-left">Nummer</th>
              {zeigeArt && <th className="px-4 py-2.5 text-left hidden sm:table-cell">Art</th>}
              <th className="px-4 py-2.5 text-left">Empfänger</th>
              <th className="px-4 py-2.5 text-left hidden md:table-cell">Datum</th>
              <th className="px-4 py-2.5 text-left hidden md:table-cell">Fällig</th>
              <th className="px-4 py-2.5 text-left">Status</th>
              <th className="px-4 py-2.5 text-right hidden lg:table-cell">Netto</th>
              <th className="px-4 py-2.5 text-right">Brutto</th>
              <th className="px-4 py-2.5 text-right hidden lg:table-cell">Offen</th>
            </tr>
          </thead>
          <tbody>
            {belege.map(b => {
              const ueberfaellig = istUeberfaellig(b, heute)
              const offen = b.belegart === 'rechnung' && ['gestellt', 'teilbezahlt'].includes(b.status) ? b.summe_brutto - b.bezahlt_betrag : 0
              return (
                <ClickableTableRow key={b.id} href={`/rechnungen/${b.id}`} className="border-b border-hs-line last:border-0 hover:bg-hs-bg/60">
                  <td className="px-4 py-2.5 font-mono text-[13px]">{b.nummer ?? <span className="text-hs-tertiary">Entwurf</span>}</td>
                  {zeigeArt && <td className="px-4 py-2.5 text-hs-text-2 hidden sm:table-cell">{belegartLabel(b.belegart)}</td>}
                  <td className="px-4 py-2.5 font-medium max-w-[260px] truncate">{b.empf_name || '–'}</td>
                  <td className="px-4 py-2.5 text-hs-text-2 hidden md:table-cell">{fmtDatum(b.datum)}</td>
                  <td className={`px-4 py-2.5 hidden md:table-cell ${ueberfaellig ? 'text-hs-err-fg font-medium' : 'text-hs-text-2'}`}>{b.faellig_am ? fmtDatum(b.faellig_am) : '–'}</td>
                  <td className="px-4 py-2.5"><StatusPill status={b.status} ueberfaellig={ueberfaellig} /></td>
                  <td className="px-4 py-2.5 betrag text-hs-text-2 hidden lg:table-cell">{fmtEuroMitZeichen(b.summe_netto)}</td>
                  <td className="px-4 py-2.5 betrag font-medium">{fmtEuroMitZeichen(b.summe_brutto)}</td>
                  <td className={`px-4 py-2.5 betrag hidden lg:table-cell ${offen > 0 ? (ueberfaellig ? 'text-hs-err-fg' : 'text-hs-warn-fg') : 'text-hs-tertiary'}`}>{offen > 0 ? fmtEuroMitZeichen(offen) : '–'}</td>
                </ClickableTableRow>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
