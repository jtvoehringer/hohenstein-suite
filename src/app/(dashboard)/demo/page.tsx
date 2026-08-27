import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FlaskConical, ArrowLeftRight, Building2, Users, ReceiptText, ListChecks, LayoutDashboard, Target, CalendarDays, FileSpreadsheet, Percent, Check } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { wechsleMandantAction } from '@/lib/auth/mandantActions'
import { fmtDatumZeit } from '@/lib/format'
import { Card, Hinweis } from '@/components/dashboard/ui'
import DemoResetButton from './DemoResetButton'

export const metadata: Metadata = { title: 'Demo-Umgebung – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

const SCHRITTE = [
  { icon: LayoutDashboard, titel: 'Dashboard', text: 'Begrüßung, Kennzahlen des Monats, Aufgaben-Kachel mit Verantwortlichen und Fälligkeiten, nächste Termine – alles auf einen Blick.', href: '/dashboard' },
  { icon: Target,          titel: 'CRM-Pipeline', text: 'Verkaufschancen nach Stufen von Interessent bis Bestandskunde; Wert, Wahrscheinlichkeit und Verlauf je Chance zeigen.', href: '/crm/pipeline' },
  { icon: CalendarDays,    titel: 'Kalender', text: 'Termine dieser Woche mit Kontakt und Firma – Demo-Termin, Jour fixe, Vor-Ort-Besuch. Neuen Termin direkt anlegen.', href: '/crm' },
  { icon: FileSpreadsheet, titel: 'E&A-Journal', text: 'Einnahmen und Ausgaben der letzten sechs Monate, Kategorien, Konten, Daueraufträge und abgeschlossene Monate.', href: '/buchhaltung' },
  { icon: Percent,         titel: 'UVA', text: 'Umsatzsteuervoranmeldung des letzten Quartals: Bemessungsgrundlagen, Vorsteuer, Zahllast – bereit für FinanzOnline.', href: '/buchhaltung/uva' },
]

export default async function DemoPage() {
  const membership = await getCurrentMembership()
  if (!membership) redirect('/mandant-waehlen')
  const darfSchreiben = canWrite(membership.role)

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Demo-Mandant + Echt-Mandant (per RLS nur die eigenen Mandanten sichtbar)
  const { data: tenants } = await (supabase.from('tenants') as any).select('id, name, ist_demo').eq('active', true)
  const alle = (tenants ?? []) as R[]
  const demo = alle.find(t => t.ist_demo) ?? null
  const echt = alle.find(t => !t.ist_demo) ?? null
  const istDemoAktiv = demo?.id === membership.tenantId

  // Alle Nutzer mit zugelassener Domain sind Mitglied der Demo (Trigger in Migration 001);
  // Zähler laufen daher über den normalen Client (RLS auf den Demo-Mandanten).
  const demoId: string | null = demo?.id ?? null
  const demoMitglied = !!demo
  const zaehle = async (tabelle: string) => {
    if (!demoId) return 0
    const { count } = await (supabase.from(tabelle) as any).select('id', { count: 'exact', head: true }).eq('tenant_id', demoId)
    return count ?? 0
  }
  const [firmen, kontakte, buchungen, aufgaben, { data: ersteFirma }] = await Promise.all([
    zaehle('firmen'), zaehle('kontakte'), zaehle('ea_transaktionen'), zaehle('aufgaben'),
    demoId
      ? (supabase.from('firmen') as any).select('erstellt_am').eq('tenant_id', demoId).order('erstellt_am', { ascending: true }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const resetZeitpunkt = (ersteFirma as R | null)?.erstellt_am ?? null

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl">Demo-Umgebung</h1>
          <p className="text-[13.5px] text-hs-text-2 mt-1 max-w-[72ch]">
            Ein eigener Mandant mit Beispieldaten zum Vorführen der Suite: Firmen, Kontakte, Termine, Pipeline, Aufgaben und
            eine E&A-Rechnung über die letzten Monate. Die Demo kann jederzeit zurückgesetzt werden und hat keine Auswirkung
            auf die Echtdaten von Hohenstein Consulting.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-5">
        {/* ── Status ─────────────────────────────────────────────────────── */}
        <Card title="Status">
          <div className="flex items-center gap-3 mb-4">
            <span className={`pill ${istDemoAktiv ? 'bg-hs-warn-bg text-hs-warn-fg' : 'bg-hs-blue-50 text-hs-blue-700'}`}>
              {istDemoAktiv ? 'Demo-Umgebung aktiv' : `Aktiv: ${echt?.name ?? 'Echt-Mandant'}`}
            </span>
            {istDemoAktiv && <span className="text-[12.5px] text-hs-text-2">Alle Eingaben landen in den Beispieldaten.</span>}
          </div>

          <p className="overline mb-2">Inhalt der Demo-Umgebung</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Zahl icon={Building2} label="Firmen" wert={firmen} />
            <Zahl icon={Users} label="Kontakte" wert={kontakte} />
            <Zahl icon={ReceiptText} label="Buchungen" wert={buchungen} />
            <Zahl icon={ListChecks} label="Aufgaben" wert={aufgaben} />
          </div>
          <p className="text-[11.5px] text-hs-tertiary mt-3">
            {resetZeitpunkt ? `Zuletzt zurückgesetzt am ${fmtDatumZeit(resetZeitpunkt)}.` : 'Noch keine Demo-Daten vorhanden.'}
            {' '}Termine und Buchungen werden relativ zum Reset-Datum erzeugt – nach längerer Zeit lohnt sich ein neuer Reset.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-5 pt-4 border-t border-hs-line">
            {istDemoAktiv ? (
              echt && (
                <form action={wechsleMandantAction}>
                  <input type="hidden" name="tenant_id" value={echt.id} />
                  <input type="hidden" name="next" value="/dashboard" />
                  <button type="submit" className="btn-primary"><ArrowLeftRight size={15} strokeWidth={1.75} /> Zurück zu {echt.name}</button>
                </form>
              )
            ) : demoMitglied && demoId ? (
              <form action={wechsleMandantAction}>
                <input type="hidden" name="tenant_id" value={demoId} />
                <input type="hidden" name="next" value="/dashboard" />
                <button type="submit" className="btn-primary"><FlaskConical size={15} strokeWidth={1.75} /> Demo-Umgebung öffnen</button>
              </form>
            ) : null}
            {darfSchreiben && demoMitglied && <DemoResetButton />}
          </div>

          {!demoMitglied && (
            <Hinweis tone="warn" className="mt-4">
              {user?.email ? `${user.email} ist` : 'Du bist'} noch kein Mitglied der Demo-Umgebung. Ein Admin kann dich unter
              {' '}<Link href="/benutzer" className="underline">Benutzer</Link> hinzufügen.
            </Hinweis>
          )}
          {!darfSchreiben && demoMitglied && (
            <p className="text-[11.5px] text-hs-tertiary mt-3">Zurücksetzen ist Mitarbeitenden und Admins vorbehalten.</p>
          )}
        </Card>

        {/* ── Checkliste ─────────────────────────────────────────────────── */}
        <Card title="So führst du die Suite vor">
          <ol className="space-y-3">
            {SCHRITTE.map((s, i) => (
              <li key={s.titel} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-hs-blue-50 text-hs-blue-700 font-mono text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                <div className="min-w-0">
                  <Link href={s.href} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-hs-text hover:text-hs-blue-700">
                    <s.icon size={14} strokeWidth={1.75} className="text-hs-tertiary" /> {s.titel}
                  </Link>
                  <p className="text-[12.5px] text-hs-text-2 mt-0.5">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <Hinweis className="mt-4">
            <span className="inline-flex items-start gap-2"><Check size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
              Tipp: Vor dem Termin die Demo zurücksetzen – dann liegen Termine „diese Woche" und der Monatsabschluss steht wie im Echtbetrieb an.</span>
          </Hinweis>
        </Card>
      </div>
    </div>
  )
}

function Zahl({ icon: Icon, label, wert }: { icon: typeof Building2; label: string; wert: number }) {
  return (
    <div className="bg-hs-bg rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11.5px] text-hs-text-2"><Icon size={13} strokeWidth={1.75} className="text-hs-tertiary" /> {label}</div>
      <p className="font-mono text-xl text-hs-text tabular-nums mt-0.5">{wert.toLocaleString('de-AT')}</p>
    </div>
  )
}
