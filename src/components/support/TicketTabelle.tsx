// Tabelle der Support-Tickets (Jira) – Server-Komponente, ein Klick öffnet das Ticket in Jira.
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { fmtDatum } from '@/lib/format'
import type { SupportTicket } from '@/lib/support/jira'
import type { CrmTreffer } from '@/lib/support/crm'

export function StatusPill({ t }: { t: SupportTicket }) {
  const cls = t.statusKategorie === 'done' ? 'bg-hs-ok-bg text-hs-ok-fg'
    : t.statusKategorie === 'indeterminate' ? 'bg-hs-blue-50 text-hs-blue-700'
    : 'bg-hs-warn-bg text-hs-warn-fg'
  return <span className={`pill ${cls} whitespace-nowrap`}>{t.status}</span>
}

function PrioPill({ p }: { p: string | null }) {
  if (!p) return <span className="text-hs-tertiary">–</span>
  const hoch = /highest|high|hoch|kritisch|critical|blocker/i.test(p)
  return <span className={hoch ? 'text-hs-err-fg font-semibold' : 'text-hs-text-2'}>{p}</span>
}

/** „vor 3 Tagen“ / „heute“ */
export function alter(iso: string): string {
  const tage = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return tage <= 0 ? 'heute' : tage === 1 ? 'gestern' : `vor ${tage} Tagen`
}

export default function TicketTabelle({ tickets, crm, kompakt = false, heute }: {
  tickets: SupportTicket[]
  /** E-Mail des Melders → CRM-Zuordnung (nur in der Übersicht) */
  crm?: Map<string, CrmTreffer>
  /** schmale Variante für die Karten auf den CRM-Detailseiten */
  kompakt?: boolean
  heute: string
}) {
  if (kompakt) {
    return (
      <ul className="divide-y divide-hs-line">
        {tickets.map(t => (
          <li key={t.key} className="py-2 flex items-start gap-2">
            <a href={t.url} target="_blank" rel="noopener" className="flex-1 min-w-0 group">
              <span className="block text-[12.5px] text-hs-text group-hover:text-hs-blue-700 truncate">
                <span className="font-mono text-[11px] text-hs-tertiary mr-1.5">{t.key}</span>{t.zusammenfassung}
              </span>
              <span className="block text-[11px] text-hs-tertiary">
                {t.typ} · {fmtDatum(t.erstellt)}{t.bearbeiter ? ` · ${t.bearbeiter}` : ' · ohne Bearbeiter'}
              </span>
            </a>
            <StatusPill t={t} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-hs-tertiary border-b border-hs-line">
            <th className="px-3 py-2 font-semibold">Ticket</th>
            <th className="px-3 py-2 font-semibold">Kunde</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold hidden md:table-cell">Priorität</th>
            <th className="px-3 py-2 font-semibold hidden md:table-cell">Bearbeiter</th>
            <th className="px-3 py-2 font-semibold hidden lg:table-cell">Erstellt</th>
            <th className="px-3 py-2 font-semibold hidden lg:table-cell">Fällig</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hs-line">
          {tickets.map(t => {
            const z = t.melderEmail ? crm?.get(t.melderEmail) : undefined
            const ueberfaellig = t.statusKategorie !== 'done' && !!t.faellig && t.faellig < heute
            return (
              <tr key={t.key} className="hover:bg-hs-bg/70 align-top">
                <td className="px-3 py-2 max-w-[420px]">
                  <a href={t.url} target="_blank" rel="noopener" className="group inline-flex items-start gap-1.5">
                    <span className="font-mono text-[11.5px] text-hs-tertiary pt-px shrink-0">{t.key}</span>
                    <span className="text-hs-text group-hover:text-hs-blue-700">{t.zusammenfassung}</span>
                    <ExternalLink size={12} strokeWidth={1.75} className="text-hs-tertiary mt-1 shrink-0 opacity-0 group-hover:opacity-100" />
                  </a>
                  <span className="block text-[11px] text-hs-tertiary">{t.typ}</span>
                </td>
                <td className="px-3 py-2">
                  {z?.firma ? <Link href={`/crm/firmen/${z.firma.id}`} className="text-hs-blue-700 hover:underline">{z.firma.name}</Link>
                    : z?.kontakt ? <Link href={`/crm/kontakte/${z.kontakt.id}`} className="text-hs-blue-700 hover:underline">{z.kontakt.name}</Link>
                    : <span className="text-hs-text-1">{t.melderName ?? '–'}</span>}
                  <span className="block text-[11px] text-hs-tertiary">
                    {z?.firma && z.kontakt ? `${z.kontakt.name} · ` : ''}{t.melderEmail ?? (z ? '' : 'nicht im CRM')}
                  </span>
                </td>
                <td className="px-3 py-2"><StatusPill t={t} /></td>
                <td className="px-3 py-2 hidden md:table-cell"><PrioPill p={t.prioritaet} /></td>
                <td className="px-3 py-2 hidden md:table-cell">{t.bearbeiter ?? <span className="text-hs-warn-fg">offen</span>}</td>
                <td className="px-3 py-2 hidden lg:table-cell whitespace-nowrap">
                  {fmtDatum(t.erstellt)}<span className="block text-[11px] text-hs-tertiary">{alter(t.erstellt)}</span>
                </td>
                <td className={`px-3 py-2 hidden lg:table-cell whitespace-nowrap ${ueberfaellig ? 'text-hs-err-fg font-semibold' : ''}`}>
                  {t.faellig ? fmtDatum(t.faellig) : '–'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
