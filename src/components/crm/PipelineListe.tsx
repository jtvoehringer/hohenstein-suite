import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PIPELINE_KATEGORIEN } from '@/lib/crm/types'
import { fmtEuroMitZeichen, fmtDatum } from '@/lib/format'
import { StufePill } from './Pills'
import type { PipelineKurz } from './crmUtils'

/** Kompakte Liste der Verkaufschancen auf Detailseiten (Kontakt/Firma). */
export default function PipelineListe({ eintraege }: { eintraege: PipelineKurz[] }) {
  if (eintraege.length === 0) {
    return <p className="text-sm text-hs-text-2">Noch keine Verkaufschancen.</p>
  }
  return (
    <div className="space-y-2">
      {eintraege.map(p => {
        const kat = PIPELINE_KATEGORIEN.find(k => k.value === p.kategorie)?.label ?? p.kategorie
        return (
          <Link key={p.id} href={`/crm/pipeline?id=${p.id}`}
            className={`block rounded-lg border border-hs-line p-3 hover:border-hs-blue-300 transition-colors ${p.erledigt ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <StufePill stufe={p.stufe} />
                {p.erledigt && <span className="pill bg-hs-ok-bg text-hs-ok-fg">Erledigt</span>}
              </div>
              <ArrowRight size={14} strokeWidth={1.75} className="text-hs-tertiary flex-shrink-0" />
            </div>
            <p className="text-sm font-medium text-hs-text mt-1.5">{p.titel}</p>
            <div className="flex gap-3 text-xs text-hs-text-2 mt-0.5 flex-wrap">
              {kat && <span>{kat}</span>}
              {p.wert_euro != null && <span className="font-mono tabular-nums">{fmtEuroMitZeichen(p.wert_euro)}</span>}
              {p.wahrscheinlichkeit != null && <span>{p.wahrscheinlichkeit} %</span>}
              {p.erwartetes_datum && <span>{fmtDatum(p.erwartetes_datum)}</span>}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
