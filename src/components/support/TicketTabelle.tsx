// Tabelle der Support-Tickets (Jira) – Server-Komponente, ein Klick öffnet das Ticket in Jira.
import Link from 'next/link'
import { ExternalLink, Pause } from 'lucide-react'
import { istUeberfaellig, type SupportTicket } from '@/lib/support/jira'
import type { TicketZuordnung } from '@/lib/support/crm'

// Server läuft in UTC (Vercel) – Jira-Zeitpunkte immer in Wiener Zeit anzeigen
const TZ = 'Europe/Vienna'
const fmtDatum = (iso: string) => new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso).toLocaleDateString('de-AT', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtDatumZeit = (iso: string) => new Date(iso).toLocaleString('de-AT', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Status-Pill nach Phase: wartet auf uns = gelb, in Bearbeitung = blau, wartet auf Kunde = grau, erledigt = grün */
export function StatusPill({ t }: { t: SupportTicket }) {
  const cls = t.phase === 'erledigt' ? 'bg-hs-ok-bg text-hs-ok-fg'
    : t.phase === 'in_arbeit' ? 'bg-hs-blue-50 text-hs-blue-700'
    : t.phase === 'wartet_kunde' ? 'bg-hs-bg text-hs-text-2'
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

/** Fällig laut SLA „Time to resolution“ (Fallback: manuelles Fälligkeitsdatum) */
function Faellig({ t, kurz = false }: { t: SupportTicket; kurz?: boolean }) {
  if (t.phase === 'erledigt') return <span className="text-hs-tertiary">{t.erledigtAm ? `erledigt ${fmtDatum(t.erledigtAm)}` : '–'}</span>
  const rot = istUeberfaellig(t)
  if (t.sla) {
    return (
      <span className={`inline-flex items-center gap-1 ${rot ? 'text-hs-err-fg font-semibold' : ''}`} title="SLA „Time to resolution“">
        {t.sla.pausiert && <Pause size={11} strokeWidth={2} className="text-hs-tertiary" />}
        {kurz ? fmtDatum(t.sla.faellig) : fmtDatumZeit(t.sla.faellig)}
        {rot && <span className="text-[10.5px]">SLA verletzt</span>}
      </span>
    )
  }
  return <span className={rot ? 'text-hs-err-fg font-semibold' : ''}>{t.faellig ? fmtDatum(t.faellig) : '–'}</span>
}

export default function TicketTabelle({ tickets, crm, kompakt = false }: {
  tickets: SupportTicket[]
  /** Ticket-Key → CRM-Zuordnung (nur in der Übersicht) */
  crm?: Map<string, TicketZuordnung>
  /** schmale Variante für die Karten auf den CRM-Detailseiten */
  kompakt?: boolean
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
                {t.phase !== 'erledigt' && (t.sla || t.faellig) && <> · fällig <Faellig t={t} kurz /></>}
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
            <th className="px-3 py-2 font-semibold hidden lg:table-cell">Fällig (SLA)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hs-line">
          {tickets.map(t => {
            const z = crm?.get(t.key)
            // Betrieb aus software:112 (Organisation in Jira) – maßgeblich vor der E-Mail des Melders
            const betrieb = t.organisationen[0] ?? (t.s112TenantId ? 'software:112-Betrieb' : null)
            const melder = z?.kontakt?.name ?? t.melderName
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
                    : betrieb ? <span className="text-hs-text-1">{betrieb}</span>
                    : z?.kontakt ? <Link href={`/crm/kontakte/${z.kontakt.id}`} className="text-hs-blue-700 hover:underline">{z.kontakt.name}</Link>
                    : <span className="text-hs-text-1">{t.melderName ?? '–'}</span>}
                  <span className="block text-[11px] text-hs-tertiary">
                    {/* Melder unter Firma bzw. Betrieb: CRM-Kontakt, sonst Name aus Jira */}
                    {(z?.firma || betrieb) && melder ? `${melder} · ` : ''}
                    {t.melderEmail ?? ''}
                    {!z?.firma && betrieb ? (
                      <> · <Link href="/software112" className="text-hs-warn-fg hover:underline" title="CRM-Firma mit dem software:112-Mandanten verknüpfen">Betrieb nicht im CRM verknüpft</Link></>
                    ) : !z && <span className="text-hs-warn-fg">{t.melderEmail ? ' · ' : ''}nicht im CRM</span>}
                  </span>
                </td>
                <td className="px-3 py-2"><StatusPill t={t} /></td>
                <td className="px-3 py-2 hidden md:table-cell"><PrioPill p={t.prioritaet} /></td>
                <td className="px-3 py-2 hidden md:table-cell">{t.bearbeiter ?? <span className="text-hs-warn-fg">offen</span>}</td>
                <td className="px-3 py-2 hidden lg:table-cell whitespace-nowrap">
                  {fmtDatum(t.erstellt)}<span className="block text-[11px] text-hs-tertiary">{alter(t.erstellt)}</span>
                </td>
                <td className="px-3 py-2 hidden lg:table-cell whitespace-nowrap"><Faellig t={t} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
