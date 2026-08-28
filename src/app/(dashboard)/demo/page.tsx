import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ExternalLink, Grape, Warehouse, Users, ReceiptText, ListChecks, FlaskConical, Wine } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canAdmin } from '@/lib/auth/roles'
import { s112DemoInfo, s112Konfiguriert, s112KeyDiagnose, s112LetzteAnmeldungen, S112_APP_URL, type DemoInfo } from '@/lib/s112/admin'
import { fmtDatumZeit, fmtZahl } from '@/lib/format'
import { Card, Hinweis } from '@/components/dashboard/ui'
import { ResetButton, NeuButton, Liste, type ZugangRow } from './DemoClient'

export const metadata: Metadata = { title: 'Demo-Umgebung – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

const ABLAUF = [
  { titel: 'Dashboard & Fristen', text: 'Kennzahlen, Gärkontrollen, Meldefristen und die Lese-Checkliste des laufenden Jahres.' },
  { titel: 'Rieden & Maßnahmen', text: '12 Rieden, 14 ha, Grundstücke mit Kataster – Spritzungen, Wartezeiten, PSM-Lager, Kupferbilanz.' },
  { titel: 'Lese & Kellerbuch', text: 'Pressungen des Vorjahres, Chargen in Tanks und Fässern, Umzüge, ein Verschnitt, Analysen, Kellerplan.' },
  { titel: 'Warenlager & Verkauf', text: 'Füllungen mit Beständen, Rechnungen an Gastronomie/Handel, offene Posten, Zahlungen.' },
  { titel: 'CRM & E&A', text: 'Kontakte, Pipeline, Termine – Einnahmen-Ausgaben-Rechnung mit Monatsabschlüssen und UVA.' },
]

export default async function DemoPage() {
  const membership = await getCurrentMembership()
  if (!membership) redirect('/mandant-waehlen')
  // Nur fürs Management-Team: Der Demo-Bereich vergibt Vollzugriff auf den Musterhof.
  if (!canAdmin(membership.role)) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl mb-4">Demo-Umgebung software:112</h1>
        <div className="card text-sm text-hs-text-2">Der Demo-Bereich ist dem Management-Team (Admins) vorbehalten.</div>
      </div>
    )
  }
  const darfSchreiben = true
  const supabase = await createSupabaseServerClient()

  const konfiguriert = s112Konfiguriert()
  let info: DemoInfo | null = null
  let infoFehler: string | null = null
  if (konfiguriert) {
    try { info = await s112DemoInfo() } catch (e) { infoFehler = e instanceof Error ? e.message : String(e) }
  }

  const [{ data: zugaengeRaw }, { data: letzterReset }] = await Promise.all([
    (supabase.from('demo_zugaenge') as any)
      .select('id, name, email, s112_user_id, s112_rolle, gueltig_bis, status, notizen, erstellt_am')
      .eq('tenant_id', membership.tenantId).neq('status', 'geloescht').order('erstellt_am', { ascending: false }),
    (supabase.from('demo_resets') as any).select('erstellt_am, profiles:ausgeloest_von(full_name)').eq('tenant_id', membership.tenantId)
      .order('erstellt_am', { ascending: false }).limit(1).maybeSingle(),
  ])
  const rows = (zugaengeRaw ?? []) as R[]
  const anmeldungen = await s112LetzteAnmeldungen(rows.map(r => r.s112_user_id).filter(Boolean))
  const heute = new Date().toISOString().slice(0, 10)
  const zugaenge: ZugangRow[] = rows.map(r => ({
    id: r.id, name: r.name, email: r.email, rolle: r.s112_rolle, gueltig_bis: r.gueltig_bis,
    status: r.status === 'aktiv' && r.gueltig_bis && r.gueltig_bis < heute ? 'abgelaufen' : r.status,
    notizen: r.notizen ?? null, erstellt_am: r.erstellt_am,
    letzte_anmeldung: r.s112_user_id ? (anmeldungen.get(r.s112_user_id) ?? null) : null,
  }))
  const aktiv = zugaenge.filter(z => z.status === 'aktiv').length
  const lr = letzterReset as R | null

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl">Demo-Umgebung software:112</h1>
          <p className="text-[13.5px] text-hs-text-2 mt-1 max-w-[72ch]">
            Der Mandant <span className="font-medium text-hs-text">Weingut Musterhof (Demo)</span> in software:112 mit vollständigen
            Beispieldaten – nur für das Management-Team zum Vorführen bei Kundenterminen. Die Daten lassen sich jederzeit auf den
            Ausgangszustand zurücksetzen. Externer Zugriff für Interessenten wird hier nicht vergeben.
          </p>
        </div>
        <a href={S112_APP_URL} target="_blank" rel="noreferrer" className="btn-primary">
          <ExternalLink size={15} strokeWidth={1.75} /> software:112 öffnen
        </a>
      </div>

      {!konfiguriert && (
        <Hinweis tone="warn">
          Die Anbindung an software:112 ist noch nicht konfiguriert – in Vercel die Variablen <code className="font-mono">S112_SUPABASE_URL</code> und{' '}
          <code className="font-mono">S112_SERVICE_ROLE_KEY</code> (Supabase-Projekt von software:112) setzen. Bis dahin sind Reset und Vorführ-Zugänge deaktiviert.
        </Hinweis>
      )}
      {infoFehler && (
        <Hinweis tone="err">
          Kennzahlen konnten nicht geladen werden: {infoFehler}
          {/Invalid API key|JWT|apikey/i.test(infoFehler) && s112KeyDiagnose() && (
            <span className="block mt-1 text-[12.5px]">Diagnose S112_SERVICE_ROLE_KEY: {s112KeyDiagnose()}</span>
          )}
        </Hinweis>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-5">
        <Card title="Inhalt der Demo" right={info?.letzter_reset ? <span className="text-[11.5px] text-hs-tertiary">Stand {fmtDatumZeit(info.letzter_reset)}</span> : undefined}>
          {info ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <Kachel icon={Grape} label="Rieden" wert={`${info.weingarten}`} sub={`${fmtZahl(info.flaeche_ha, 2)} ha · ${info.grundstuecke} Grundstücke`} />
              <Kachel icon={FlaskConical} label="Maßnahmen" wert={`${info.behandlungen}`} sub="Spritzungen, Schnitt, Düngung" />
              <Kachel icon={Wine} label="Chargen" wert={`${info.chargen_aktiv}`} sub={`${fmtZahl(info.liter_im_keller, 0)} l in ${info.behaelter} Behältern`} />
              <Kachel icon={Warehouse} label="Füllungen" wert={`${info.fuellungen}`} sub={`${fmtZahl(info.flaschen_bestand, 0)} Flaschen`} />
              <Kachel icon={Users} label="CRM" wert={`${info.kontakte + info.firmen}`} sub={`${info.firmen} Firmen · ${info.kontakte} Kontakte`} />
              <Kachel icon={ReceiptText} label="Verkauf & E&A" wert={`${info.verkaufsposten}`} sub={`${info.offene_posten} offene Posten · ${info.ea_transaktionen} Buchungen`} />
            </div>
          ) : (
            <p className="text-sm text-hs-text-2">Kennzahlen stehen nach der Konfiguration der Anbindung zur Verfügung.</p>
          )}
          <div className="mt-4 pt-4 border-t border-hs-line flex flex-wrap items-center gap-3">
            <ResetButton aktiv={konfiguriert && darfSchreiben} />
            <span className="text-[12px] text-hs-tertiary">
              {lr ? <>Zuletzt zurückgesetzt {fmtDatumZeit(lr.erstellt_am)}{lr.profiles?.full_name ? ` von ${lr.profiles.full_name}` : ''}</> : 'Termine, Buchungen und Fristen werden relativ zum Reset-Datum erzeugt – vor einem Termin lohnt sich ein frischer Stand.'}
            </span>
          </div>
        </Card>

        <Card title="So führst du vor">
          <ol className="space-y-3">
            {ABLAUF.map((s, i) => (
              <li key={s.titel} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-hs-blue-50 text-hs-blue-700 text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                <div>
                  <p className="text-[13px] font-semibold text-hs-text flex items-center gap-1.5"><ListChecks size={13} strokeWidth={1.75} className="text-hs-tertiary" />{s.titel}</p>
                  <p className="text-[12.5px] text-hs-text-2">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[12px] text-hs-tertiary">
            Vorgeführt wird mit den unten angelegten Vorführ-Zugängen (oder eurem eigenen software:112-Konto, Betrieb „Weingut Musterhof (Demo)" wählen).
          </p>
        </Card>
      </div>

      <Card title={<>Vorführ-Zugänge (Team) <span className="ml-2 font-mono text-[11.5px] font-normal text-hs-tertiary">{aktiv} aktiv · {zugaenge.length} gesamt</span></>}
        right={<NeuButton aktiv={konfiguriert && darfSchreiben} appUrl={S112_APP_URL} />}>
        <Liste zugaenge={zugaenge} darfSchreiben={konfiguriert && darfSchreiben} appUrl={S112_APP_URL} />
      </Card>
    </div>
  )
}

function Kachel({ icon: Icon, label, wert, sub }: { icon: typeof Grape; label: string; wert: string; sub: string }) {
  return (
    <div className="rounded-lg border border-hs-line bg-hs-bg/60 px-3 py-2.5">
      <p className="text-[11px] font-semibold text-hs-text-2 flex items-center gap-1.5"><Icon size={13} strokeWidth={1.75} className="text-hs-tertiary" />{label}</p>
      <p className="font-mono text-[20px] text-hs-text leading-tight mt-0.5">{wert}</p>
      <p className="text-[11px] text-hs-tertiary truncate">{sub}</p>
    </div>
  )
}
