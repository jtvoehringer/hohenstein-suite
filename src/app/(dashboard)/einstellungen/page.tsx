import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canAdmin } from '@/lib/auth/roles'
import EinstellungenForm, { type Einstellungen } from './EinstellungenForm'

export const metadata: Metadata = { title: 'Einstellungen – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default async function EinstellungenPage() {
  const membership = await getCurrentMembership()
  if (!membership) redirect('/mandant-waehlen')

  if (!canAdmin(membership.role)) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl mb-4">Einstellungen</h1>
        <div className="card flex items-start gap-3">
          <ShieldAlert size={18} strokeWidth={1.75} className="text-hs-warn-fg mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-hs-text">Nur für Admins</p>
            <p className="text-sm text-hs-text-2 mt-1">Die Mandanteneinstellungen (Firmendaten, Nummernkreise, E&A-Parameter) können nur von Admins bearbeitet werden.</p>
          </div>
        </div>
      </div>
    )
  }

  const supabase = await createSupabaseServerClient()
  const [{ data: e }, { data: t }] = await Promise.all([
    (supabase.from('tenant_einstellungen') as any)
      .select('anzeigename, logo_url, betrieb_name, betrieb_strasse, betrieb_plz, betrieb_ort, betrieb_telefon, betrieb_email, betrieb_website, betrieb_uid, betrieb_steuernummer, betrieb_iban, betrieb_bic, kunden_prefix, kunden_zaehler, kunden_stellen, ust_satz_standard, ea_buchung_modus, ea_kleinunternehmer, ea_uva_zeitraum, ea_betriebsbeginn, session_timeout_minuten, fristen_vorwarnung_tage, aktualisiert_am')
      .eq('tenant_id', membership.tenantId).maybeSingle(),
    (supabase.from('tenants') as any).select('name, ist_demo').eq('id', membership.tenantId).maybeSingle(),
  ])
  const r = (e ?? {}) as R
  const tenant = (t ?? {}) as R

  const daten: Einstellungen = {
    anzeigename:             r.anzeigename ?? '',
    logo_url:                r.logo_url ?? null,
    betrieb_name:            r.betrieb_name ?? '',
    betrieb_strasse:         r.betrieb_strasse ?? '',
    betrieb_plz:             r.betrieb_plz ?? '',
    betrieb_ort:             r.betrieb_ort ?? '',
    betrieb_telefon:         r.betrieb_telefon ?? '',
    betrieb_email:           r.betrieb_email ?? '',
    betrieb_website:         r.betrieb_website ?? '',
    betrieb_uid:             r.betrieb_uid ?? '',
    betrieb_steuernummer:    r.betrieb_steuernummer ?? '',
    betrieb_iban:            r.betrieb_iban ?? '',
    betrieb_bic:             r.betrieb_bic ?? '',
    kunden_prefix:           r.kunden_prefix ?? 'K',
    kunden_zaehler:          Number(r.kunden_zaehler ?? 1),
    kunden_stellen:          Number(r.kunden_stellen ?? 4),
    ust_satz_standard:       Number(r.ust_satz_standard ?? 20),
    ea_buchung_modus:        r.ea_buchung_modus ?? 'brutto',
    ea_kleinunternehmer:     !!r.ea_kleinunternehmer,
    ea_uva_zeitraum:         r.ea_uva_zeitraum ?? 'quartalsweise',
    ea_betriebsbeginn:       r.ea_betriebsbeginn ?? '',
    session_timeout_minuten: r.session_timeout_minuten ?? null,
    fristen_vorwarnung_tage: Number(r.fristen_vorwarnung_tage ?? 30),
    aktualisiert_am:         r.aktualisiert_am ?? null,
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl">Einstellungen</h1>
        <p className="text-[13.5px] text-hs-text-2 mt-1">
          Mandant <span className="font-medium text-hs-text">{tenant.name ?? '–'}</span>{tenant.ist_demo ? ' (Demo-Umgebung)' : ''} · Firmendaten, Nummernkreise, E&A-Parameter und Logo.
        </p>
      </div>
      <EinstellungenForm daten={daten} />
    </div>
  )
}
