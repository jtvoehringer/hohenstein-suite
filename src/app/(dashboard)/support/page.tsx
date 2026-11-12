import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ExternalLink, LifeBuoy } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership } from '@/lib/auth/roles'
import { ladeSupportTickets, jiraLinks, istOffen, istUeberfaellig, JIRA_PROJEKT, PHASE_LABEL } from '@/lib/support/jira'
import { crmZuordnungFuerTickets } from '@/lib/support/crm'
import { Card, Hinweis, Tile } from '@/components/dashboard/ui'
import TicketTabelle from '@/components/support/TicketTabelle'

export const metadata: Metadata = { title: 'Support – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

const ANSICHTEN = [
  { key: 'offen',    label: 'Offen' },
  { key: 'ohne',     label: 'Ohne Bearbeiter' },
  { key: 'erledigt', label: 'Erledigt' },
  { key: 'alle',     label: 'Alle' },
] as const
type Ansicht = typeof ANSICHTEN[number]['key']

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ ansicht?: string }> }) {
  const membership = await getCurrentMembership()
  if (!membership) redirect('/mandant-waehlen')
  const sp = await searchParams
  const ansicht: Ansicht = (ANSICHTEN.find(a => a.key === sp.ansicht)?.key ?? 'offen')

  const erg = await ladeSupportTickets()

  const kopf = (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl">Support</h1>
        <p className="text-[13.5px] text-hs-text-2 mt-1 max-w-[72ch]">
          Serviceanfragen und Vorfälle aus Jira Service Management (Projekt „software112 Support“, {JIRA_PROJEKT}).
          Kunden werden über ihre E-Mail-Adresse dem CRM zugeordnet; bearbeitet wird per Klick in Jira.
        </p>
      </div>
      <a href={jiraLinks.warteschlangen()} target="_blank" rel="noopener" className="btn-secondary">
        <ExternalLink size={16} strokeWidth={1.75} /> Warteschlangen in Jira
      </a>
    </div>
  )

  if (!erg.ok) {
    return (
      <div className="space-y-6">
        {kopf}
        {erg.nichtKonfiguriert ? (
          <Hinweis tone="warn">
            Die Jira-Anbindung ist noch nicht eingerichtet – in Vercel die Variablen <code className="font-mono">JIRA_EMAIL</code> und{' '}
            <code className="font-mono">JIRA_API_TOKEN</code> setzen (Konto mit Agent-Zugang zum Projekt {JIRA_PROJEKT}) und neu deployen.
          </Hinweis>
        ) : (
          <Hinweis tone="err">Tickets konnten nicht geladen werden: {erg.fehler}</Hinweis>
        )}
      </div>
    )
  }

  const alle = erg.tickets
  const offen = alle.filter(istOffen)
  const vor30 = Date.now() - 30 * 86_400_000
  const kennzahlen = {
    wartetSupport: offen.filter(t => t.phase === 'wartet_support').length,
    inArbeit: offen.filter(t => t.phase === 'in_arbeit').length,
    wartetKunde: offen.filter(t => t.phase === 'wartet_kunde').length,
    ohne: offen.filter(t => !t.bearbeiter).length,
    ueberfaellig: offen.filter(t => istUeberfaellig(t)).length,
    erledigt30: alle.filter(t => !istOffen(t) && new Date(t.erledigtAm ?? t.aktualisiert).getTime() >= vor30).length,
  }

  // Offene Tickets: wer zuerst dran ist – SLA-Fälligkeit aufsteigend, ohne SLA ans Ende
  const nachSla = (a: typeof alle[number], b: typeof alle[number]) =>
    (a.sla ? new Date(a.sla.faellig).getTime() : Infinity) - (b.sla ? new Date(b.sla.faellig).getTime() : Infinity)
  const liste = ansicht === 'offen' ? [...offen].sort(nachSla)
    : ansicht === 'ohne' ? offen.filter(t => !t.bearbeiter).sort(nachSla)
    : ansicht === 'erledigt' ? alle.filter(t => !istOffen(t))
    : alle

  const supabase = await createSupabaseServerClient()
  const crm = await crmZuordnungFuerTickets(supabase, membership.tenantId, liste)

  return (
    <div className="space-y-6">
      {kopf}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Tile label={PHASE_LABEL.wartet_support} value={`${kennzahlen.wartetSupport}`} icon={LifeBuoy}
          sub={kennzahlen.ohne > 0 ? `${kennzahlen.ohne} ohne Bearbeiter` : undefined} tone={kennzahlen.ohne > 0 ? 'warn' : undefined} />
        <Tile label={PHASE_LABEL.in_arbeit} value={`${kennzahlen.inArbeit}`} />
        <Tile label={PHASE_LABEL.wartet_kunde} value={`${kennzahlen.wartetKunde}`} />
        <Tile label="SLA verletzt" value={`${kennzahlen.ueberfaellig}`} tone={kennzahlen.ueberfaellig > 0 ? 'err' : undefined}
          sub={kennzahlen.ueberfaellig > 0 ? 'Time to resolution überschritten' : undefined} />
        <Tile label="Erledigt (30 Tage)" value={`${kennzahlen.erledigt30}`} tone="ok" />
      </div>

      <Card
        title="Tickets"
        pad={false}
        right={
          <span className="inline-flex flex-wrap gap-1">
            {ANSICHTEN.map(a => (
              <Link key={a.key} href={a.key === 'offen' ? '/support' : `/support?ansicht=${a.key}`}
                className={`pill transition-colors ${a.key === ansicht ? 'bg-hs-blue-700 text-white' : 'bg-hs-bg text-hs-text-2 hover:bg-hs-blue-50'}`}>
                {a.label}
              </Link>
            ))}
          </span>
        }
      >
        {liste.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-hs-text-2">
            {alle.length === 0 ? 'Noch keine Tickets im Support-Projekt.' : 'Keine Tickets in dieser Ansicht.'}
          </p>
        ) : (
          <TicketTabelle tickets={liste} crm={crm} />
        )}
      </Card>
    </div>
  )
}
