// Karte „Support-Tickets“ auf den CRM-Detailseiten (Firma/Kontakt) – Server-Komponente, per Suspense gestreamt.
// Zuordnung wie in der Übersicht (crmZuordnungFuerTickets): software:112-Mandant → JSM-Organisation → E-Mail des Melders;
// zusätzlich zählen die E-Mail-Adressen der Firma bzw. ihrer Ansprechpartner direkt.
import { LifeBuoy } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership } from '@/lib/auth/roles'
import { ladeSupportTickets, istOffen, jiraLinks } from '@/lib/support/jira'
import { crmZuordnungFuerTickets, hatBetrieb } from '@/lib/support/crm'
import TicketTabelle from './TicketTabelle'

function Rahmen({ children, rechts }: { children: React.ReactNode; rechts?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-hs-line p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-hs-text inline-flex items-center gap-1.5">
          <LifeBuoy size={15} strokeWidth={1.75} className="text-hs-tertiary" /> Support-Tickets
        </h3>
        {rechts}
      </div>
      {children}
    </div>
  )
}

export function SupportTicketsKarteLaden() {
  return <Rahmen><p className="text-[12px] text-hs-tertiary">Laden …</p></Rahmen>
}

export default async function SupportTicketsKarte({ firmaId, kontaktId, emails }: {
  firmaId?: string
  kontaktId?: string
  emails: (string | null | undefined)[]
}) {
  const adressen = new Set(emails.filter((e): e is string => !!e).map(e => e.trim().toLowerCase()))
  const erg = await ladeSupportTickets()
  // Ohne Anbindung die Karte gar nicht zeigen
  if (!erg.ok) {
    if (erg.nichtKonfiguriert) return null
    return <Rahmen><p className="text-[12px] text-hs-err-fg">Jira nicht erreichbar.</p></Rahmen>
  }
  if (erg.tickets.length === 0) return null

  const membership = await getCurrentMembership()
  if (!membership) return null
  const supabase = await createSupabaseServerClient()
  const zuordnung = await crmZuordnungFuerTickets(supabase, membership.tenantId, erg.tickets)

  const tickets = erg.tickets.filter(t => {
    const z = zuordnung.get(t.key)
    if (z && ((!!firmaId && z.firma?.id === firmaId) || (!!kontaktId && z.kontakt?.id === kontaktId))) return true
    // direkter E-Mail-Treffer: auf der Kontaktseite immer (Melder), auf der Firmenseite nur bei Tickets ohne Betrieb
    return !!t.melderEmail && adressen.has(t.melderEmail) && (!!kontaktId || !hatBetrieb(t))
  })
  if (tickets.length === 0) return null
  const offen = tickets.filter(istOffen)
  // offene zuerst, dann die letzten erledigten
  const anzeige = [...offen, ...tickets.filter(t => !istOffen(t)).slice(0, Math.max(0, 8 - offen.length))]

  return (
    <Rahmen rechts={
      <a href={`${jiraLinks.warteschlangen()}`} target="_blank" rel="noopener" className="text-[11.5px] text-hs-blue-700 hover:underline">
        {offen.length} offen · {tickets.length} gesamt
      </a>
    }>
      <TicketTabelle tickets={anzeige} kompakt />
    </Rahmen>
  )
}
