import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Lock, Paperclip, Trash2 } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { fmtDatumZeit, fmtEuroMitZeichen } from '@/lib/format'
import { ladeEaEinstellungen, ladeFirmen, ladeKategorien, ladeKonten } from '@/lib/ea/server'
import { IMPORT_QUELLEN } from '@/lib/ea/types'
import BuchungForm from '@/components/ea/BuchungForm'
import ConfirmDeleteForm from '@/components/ui/ConfirmDeleteForm'
import { aktualisiereBuchung, loescheBuchung } from '../actions'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default async function BuchungBearbeitenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId
  const writeOk  = canWrite(membership.role)

  const { data: raw } = await (supabase.from('ea_transaktionen') as any)
    .select('id, typ, datum, beschreibung, kategorie_id, firma_id, konto_id, betrag_netto, ust_satz, ust_betrag, betrag_brutto, abzugsfaehig_pct, belegnummer, is_locked, abgeglichen, import_quelle, notizen, erstellt_am, aktualisiert_am, ea_belege(id, dateiname)')
    .eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!raw) notFound()
  const b = raw as R

  const [einst, alleKategorien, konten, firmen] = await Promise.all([
    ladeEaEinstellungen(supabase, tenantId),
    ladeKategorien(supabase, tenantId, false),
    ladeKonten(supabase, tenantId),
    ladeFirmen(supabase, tenantId),
  ])
  // Aktive Kategorien + (falls inaktiv) die an dieser Buchung hängende
  const kategorienListe = alleKategorien.filter(k => k.aktiv || k.id === b.kategorie_id)

  async function speichern(input: Parameters<typeof aktualisiereBuchung>[1]) {
    'use server'
    return aktualisiereBuchung(id, input)
  }

  async function loeschen() {
    'use server'
    const res = await loescheBuchung(id)
    if (res.ok) redirect('/buchhaltung')
  }

  const belege = (b.ea_belege ?? []) as R[]

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="text-sm text-hs-text-2 flex items-center gap-2">
        <Link href="/buchhaltung" className="hover:text-hs-blue-700">Buchungen</Link>
        <span>/</span>
        <span className="text-hs-text font-medium truncate">{b.beschreibung}</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl flex items-center gap-2">
            {writeOk ? 'Buchung bearbeiten' : 'Buchung'}
            {b.is_locked && <Lock size={18} strokeWidth={1.75} className="text-hs-tertiary" />}
          </h1>
          <p className="text-sm text-hs-text-2 mt-0.5">
            {IMPORT_QUELLEN[b.import_quelle] ?? 'Manuell'} · angelegt {fmtDatumZeit(b.erstellt_am)}
            {b.aktualisiert_am !== b.erstellt_am ? ` · geändert ${fmtDatumZeit(b.aktualisiert_am)}` : ''}
            {b.abgeglichen ? ' · abgeglichen' : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="overline">Brutto</p>
          <p className={`kpi ${b.typ === 'einnahme' ? 'text-hs-ok-fg' : ''}`}>{fmtEuroMitZeichen(b.betrag_brutto)}</p>
        </div>
      </div>

      {belege.length > 0 && (
        <div className="card !p-3 flex flex-wrap items-center gap-2 text-sm">
          <Paperclip size={16} strokeWidth={1.75} className="text-hs-text-2" />
          <span className="text-hs-text-2">Beleg:</span>
          {belege.map(bl => (
            <Link key={bl.id} href={`/buchhaltung/belege/${bl.id}`} className="text-hs-blue-700 hover:underline">{bl.dateiname}</Link>
          ))}
        </div>
      )}

      {writeOk ? (
        <BuchungForm
          modus={einst.ea_buchung_modus}
          ustStandard={einst.ust_satz_standard}
          kategorien={kategorienListe}
          konten={konten}
          firmen={firmen}
          initial={{
            typ: b.typ, datum: b.datum, beschreibung: b.beschreibung, kategorie_id: b.kategorie_id,
            betrag_netto: Number(b.betrag_netto), betrag_brutto: Number(b.betrag_brutto), ust_satz: Number(b.ust_satz),
            abzugsfaehig_pct: Number(b.abzugsfaehig_pct ?? 100), konto_id: b.konto_id, firma_id: b.firma_id,
            belegnummer: b.belegnummer, notizen: b.notizen,
          }}
          gesperrt={!!b.is_locked}
          submitLabel="Änderungen speichern"
          erfolgHref={`/buchhaltung?jahr=${String(b.datum).slice(0, 4)}&id=${b.id}`}
          onSubmit={speichern}
        />
      ) : (
        <div className="card text-sm text-hs-text-2">Du hast nur Leserechte – Buchungen können nicht bearbeitet werden.</div>
      )}

      {writeOk && !b.is_locked && (
        <div className="flex justify-end">
          <ConfirmDeleteForm
            action={loeschen}
            message={`Buchung „${b.beschreibung}" endgültig löschen?`}
            title="Buchung löschen"
            label={<span className="inline-flex items-center gap-1.5"><Trash2 size={15} strokeWidth={1.75} /> Buchung löschen</span>}
            className="btn-danger"
          />
        </div>
      )}
    </div>
  )
}
