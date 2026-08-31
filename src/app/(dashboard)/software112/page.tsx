import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CreditCard } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canAdmin } from '@/lib/auth/roles'
import { s112AlleMandanten, s112NeueZahlungen, s112Konfiguriert, s112KeyDiagnose, type S112Mandant } from '@/lib/s112/admin'
import { alleZeilen } from '@/lib/supabase/alleZeilen'
import { Card, Hinweis, Tile } from '@/components/dashboard/ui'
import { MandantenTabelle, SyncLeiste, type FirmaOption, type MandantRow } from './Software112Client'

export const metadata: Metadata = { title: 'software:112 Mandanten – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default async function Software112Page() {
  const membership = await getCurrentMembership()
  if (!membership) redirect('/mandant-waehlen')
  if (!canAdmin(membership.role)) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl mb-4">software:112 Mandanten</h1>
        <div className="card text-sm text-hs-text-2">Dieser Bereich ist dem Management-Team (Admins) vorbehalten.</div>
      </div>
    )
  }

  const konfiguriert = s112Konfiguriert()
  const supabase = await createSupabaseServerClient()

  let mandanten: S112Mandant[] = []
  let neueZahlungenAnzahl = 0
  let ladeFehler: string | null = null
  if (konfiguriert) {
    try {
      const [m, z] = await Promise.all([s112AlleMandanten(), s112NeueZahlungen()])
      mandanten = m
      neueZahlungenAnzahl = z.length
    } catch (e) { ladeFehler = e instanceof Error ? e.message : String(e) }
  }

  // PostgREST liefert pro Anfrage max. 1000 Zeilen - bei 5000+ Firmen im CRM
  // (ÖWM-Betriebssuche-Importe) wäre "Weingut ..." (nahe Ende der alphabetischen
  // Sortierung) sonst nie in der Trefferliste erschienen. alleZeilen() blättert
  // in 1000er-Seiten nach, analog ladeFirmen() in lib/ea/server.ts.
  const firmenRaw = await alleZeilen<R>(() => (supabase.from('firmen') as R)
    .select('id, name, s112_tenant_id').eq('tenant_id', membership.tenantId).eq('aktiv', true).order('name').order('id'))
  const firmen = firmenRaw.map(f => ({ id: f.id as string, name: f.name as string, s112TenantId: (f.s112_tenant_id as string | null) ?? null }))
  const firmaJeMandant = new Map(firmen.filter(f => f.s112TenantId).map(f => [f.s112TenantId as string, { id: f.id, name: f.name }]))
  const unverknuepfteFirmen: FirmaOption[] = firmen.filter(f => !f.s112TenantId).map(f => ({ id: f.id, name: f.name }))

  const rows: MandantRow[] = mandanten.map(m => ({
    id: m.id, name: m.name, aktiv: m.aktiv, erstelltAm: m.erstellt_am,
    stripeStatus: m.stripe_status, stripePlan: m.stripe_plan, stripePeriodenEnde: m.stripe_current_period_end,
    firma: firmaJeMandant.get(m.id) ?? null,
  }))
  const verknuepft = rows.filter(r => r.firma).length
  const aktiveAbos = rows.filter(r => r.stripeStatus === 'active' || r.stripeStatus === 'trialing').length
  const gesperrt = rows.filter(r => ['unpaid', 'canceled', 'cancelled', 'incomplete', 'incomplete_expired', 'paused'].includes(r.stripeStatus ?? '')).length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl">software:112 Mandanten</h1>
          <p className="text-[13.5px] text-hs-text-2 mt-1 max-w-[72ch]">
            Alle echten software:112-Mandanten mit Stripe-Status auf einen Blick – verknüpft mit der jeweiligen CRM-Firma.
            Neue Zahlungen werden hier automatisch als E&A-Einnahme (Kategorie „Softwarelizenzen / SaaS") verbucht,
            statt sie pro Mandant einzeln in software:112 nachzuschauen.
          </p>
        </div>
      </div>

      {!konfiguriert && (
        <Hinweis tone="warn">
          Die Anbindung an software:112 ist noch nicht konfiguriert – in Vercel die Variablen <code className="font-mono">S112_SUPABASE_URL</code> und{' '}
          <code className="font-mono">S112_SERVICE_ROLE_KEY</code> (Supabase-Projekt von software:112) setzen.
        </Hinweis>
      )}
      {ladeFehler && (
        <Hinweis tone="err">
          Mandanten konnten nicht geladen werden: {ladeFehler}
          {/Invalid API key|JWT|apikey/i.test(ladeFehler) && s112KeyDiagnose() && (
            <span className="block mt-1 text-[12.5px]">Diagnose S112_SERVICE_ROLE_KEY: {s112KeyDiagnose()}</span>
          )}
        </Hinweis>
      )}

      {konfiguriert && !ladeFehler && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Tile label="Mandanten" value={`${rows.length}`} icon={CreditCard} />
            <Tile label="Verknüpft mit CRM" value={`${verknuepft} / ${rows.length}`} />
            <Tile label="Aktive Abos" value={`${aktiveAbos}`} />
            <Tile label="Gesperrt / gekündigt" value={`${gesperrt}`} tone={gesperrt > 0 ? 'warn' : undefined} />
          </div>

          <Card title="Zahlungs-Sync" right={<span className="text-[11.5px] text-hs-tertiary">{neueZahlungenAnzahl} noch nicht verbucht</span>}>
            <SyncLeiste neueAnzahl={neueZahlungenAnzahl} />
          </Card>

          <Card title="Mandanten">
            <MandantenTabelle rows={rows} unverknuepfteFirmen={unverknuepfteFirmen} />
          </Card>
        </>
      )}
    </div>
  )
}
