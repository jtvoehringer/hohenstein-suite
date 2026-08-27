// ── Kleine Anzeige-Bausteine für Aufgaben (server- und client-tauglich) ──────
import { fmtDatum } from '@/lib/format'
import { faelligkeit, faelligkeitKlasse, prioritaetLabel, prioritaetPunkt, statusLabel, statusPill } from '@/lib/aufgaben/types'

export function StatusPill({ status }: { status: string }) {
  return <span className={`pill ${statusPill(status)}`}>{statusLabel(status)}</span>
}

export function PrioPunkt({ prioritaet, className = '' }: { prioritaet: string; className?: string }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${prioritaetPunkt(prioritaet)} ${className}`}
      title={`Priorität: ${prioritaetLabel(prioritaet)}`} aria-label={`Priorität ${prioritaetLabel(prioritaet)}`} />
  )
}

/** „zu erledigen bis" – überfällig rot, heute gelb */
export function FaelligAm({ faelligAm, status, heuteIso, kurz = false }: { faelligAm: string | null; status: string; heuteIso: string; kurz?: boolean }) {
  if (!faelligAm) return <span className="text-hs-tertiary">–</span>
  const f = faelligkeit(faelligAm, status, heuteIso)
  const text = f === 'heute' ? 'heute' : fmtDatum(faelligAm)
  const prefix = kurz ? '' : f === 'ueberfaellig' ? 'überfällig seit ' : f === 'heute' ? 'fällig ' : 'bis '
  return (
    <span className={`font-mono text-[11.5px] tabular-nums whitespace-nowrap ${faelligkeitKlasse(f)}`}>
      {f === 'ueberfaellig' && <span className={`inline-block w-1.5 h-1.5 rounded-full bg-hs-err mr-1.5 align-middle`} />}
      {prefix}{text}
    </span>
  )
}
