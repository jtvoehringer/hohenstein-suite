import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AlertTriangle, ExternalLink, Trash2 } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite, canAdmin } from '@/lib/auth/roles'
import { fmtDatum, fmtDatumZeit, fmtEuroMitZeichen } from '@/lib/format'
import { ladeEaEinstellungen, ladeFirmen, ladeKategorien, ladeKonten } from '@/lib/ea/server'
import type { KategorieOption, KontoOption, FirmaOption } from '@/lib/ea/types'
import BuchungForm from '@/components/ea/BuchungForm'
import ConfirmDeleteForm from '@/components/ui/ConfirmDeleteForm'
import { loescheBelegAction, verbucheBelegAction } from '../../actions'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

function fmtBytes(n: number | null | undefined): string {
  if (!n) return ''
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toLocaleString('de-AT', { maximumFractionDigits: 1 })} MB`
}

export default async function BelegDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId
  const writeOk  = canWrite(membership.role)
  const adminOk  = canAdmin(membership.role)

  const { data: belegRaw } = await (supabase.from('ea_belege') as any)
    .select('id, dateiname, dateityp, groesse_bytes, storage_pfad, status, erkannte_daten, fehler_details, hochgeladen_am, verbucht_am, ea_transaktion_id, ea_transaktionen(id, typ, datum, beschreibung, betrag_netto, betrag_brutto, ust_satz, is_locked)')
    .eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!belegRaw) notFound()
  const beleg = belegRaw as R
  const tx = beleg.ea_transaktionen as R | null
  const istVerbucht = beleg.status === 'verbucht' && !!tx

  const { data: signed } = await supabase.storage.from('ea-belege').createSignedUrl(beleg.storage_pfad, 3600)
  const previewUrl = signed?.signedUrl ?? null
  const istBild = String(beleg.dateityp ?? '').startsWith('image/')

  const [einst, kategorien, konten, firmen] = istVerbucht
    ? [null, [] as KategorieOption[], [] as KontoOption[], [] as FirmaOption[]]
    : await Promise.all([
        ladeEaEinstellungen(supabase, tenantId),
        ladeKategorien(supabase, tenantId),
        ladeKonten(supabase, tenantId),
        ladeFirmen(supabase, tenantId),
      ])

  const e = (beleg.erkannte_daten ?? {}) as R

  async function verbuchen(input: Parameters<typeof verbucheBelegAction>[1]) {
    'use server'
    return verbucheBelegAction(id, input)
  }

  async function loeschen() {
    'use server'
    const res = await loescheBelegAction(id)
    if (res.ok) redirect('/buchhaltung/belege')
  }

  const hinweise: string[] = []
  if (beleg.status === 'fehler') hinweise.push(`Automatische Erkennung fehlgeschlagen${beleg.fehler_details ? ` (${beleg.fehler_details})` : ''} – bitte alle Felder manuell ausfüllen.`)
  if (e.hinweis) hinweise.push(e.hinweis)
  if (e.konfidenz && e.konfidenz !== 'hoch') hinweise.push(`Erkennungssicherheit ${e.konfidenz} – bitte Werte vor dem Buchen prüfen.`)
  if (e.partner_name && !e.firma_id_vorschlag) hinweise.push(`Erkannter Geschäftspartner „${e.partner_name}" ist im CRM nicht angelegt – optional unter Firmen anlegen und hier zuordnen.`)

  return (
    <div className="space-y-4">
      <div className="text-sm text-hs-text-2 flex items-center gap-2">
        <Link href="/buchhaltung/belege" className="hover:text-hs-blue-700">Belege</Link>
        <span>/</span>
        <span className="text-hs-text font-medium truncate">{beleg.dateiname}</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">{istVerbucht ? 'Beleg' : 'Beleg verbuchen'}</h1>
          <p className="text-sm text-hs-text-2 mt-0.5">
            {beleg.dateiname}{beleg.groesse_bytes ? ` · ${fmtBytes(beleg.groesse_bytes)}` : ''} · hochgeladen {fmtDatumZeit(beleg.hochgeladen_am)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              <ExternalLink size={15} strokeWidth={1.75} /> Original öffnen
            </a>
          )}
          {writeOk && (!istVerbucht || adminOk) && (
            <ConfirmDeleteForm
              action={loeschen}
              message={istVerbucht
                ? 'Beleg löschen? Die Datei wird endgültig entfernt, die Buchung bleibt bestehen.'
                : 'Beleg verwerfen? Die Datei wird endgültig gelöscht, es entsteht keine Buchung.'}
              title="Beleg löschen"
              label={<span className="inline-flex items-center gap-1.5"><Trash2 size={15} strokeWidth={1.75} /> {istVerbucht ? 'Löschen' : 'Verwerfen'}</span>}
              className="btn-danger"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Vorschau */}
        <div className="card !p-3">
          {previewUrl ? (
            istBild ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={beleg.dateiname} className="w-full rounded-lg" />
            ) : (
              <iframe src={previewUrl} className="w-full h-[70vh] rounded-lg border border-hs-line" title={beleg.dateiname} />
            )
          ) : (
            <p className="text-sm text-hs-text-2 text-center py-10">Vorschau nicht verfügbar.</p>
          )}
        </div>

        {/* Rechts: Formular oder Buchungszusammenfassung */}
        {istVerbucht ? (
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base">Verknüpfte Buchung</h2>
              <span className="pill bg-hs-ok-bg text-hs-ok-fg">Verbucht{beleg.verbucht_am ? ` am ${fmtDatum(beleg.verbucht_am)}` : ''}</span>
            </div>
            <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-hs-text-2">Datum</dt><dd className="font-mono tabular-nums">{fmtDatum(tx!.datum)}</dd>
              <dt className="text-hs-text-2">Typ</dt><dd>{tx!.typ === 'einnahme' ? 'Einnahme' : 'Ausgabe'}</dd>
              <dt className="text-hs-text-2">Bezeichnung</dt><dd>{tx!.beschreibung}</dd>
              <dt className="text-hs-text-2">Netto</dt><dd className="font-mono tabular-nums">{fmtEuroMitZeichen(tx!.betrag_netto)} ({tx!.ust_satz} % USt)</dd>
              <dt className="text-hs-text-2">Brutto</dt><dd className={`font-mono tabular-nums font-semibold ${tx!.typ === 'einnahme' ? 'text-hs-ok-fg' : ''}`}>{fmtEuroMitZeichen(tx!.betrag_brutto)}</dd>
            </dl>
            <Link href={`/buchhaltung/${tx!.id}`} className="btn-secondary">Buchung öffnen</Link>
          </div>
        ) : writeOk ? (
          <div className="space-y-3">
            {hinweise.length > 0 && (
              <div className="rounded-xl bg-hs-warn-bg border border-hs-warn/40 px-4 py-3 text-sm text-hs-warn-fg space-y-1">
                {hinweise.map((h, i) => (
                  <p key={i} className="flex items-start gap-2"><AlertTriangle size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" /><span>{h}</span></p>
                ))}
              </div>
            )}
            <BuchungForm
              modus={einst!.ea_buchung_modus}
              ustStandard={einst!.ust_satz_standard}
              kategorien={kategorien}
              konten={konten}
              firmen={firmen}
              initial={{
                typ: e.typ === 'einnahme' ? 'einnahme' : 'ausgabe',
                datum: e.datum ?? undefined,
                beschreibung: e.beschreibung ?? '',
                kategorie_id: e.kategorie_id ?? null,
                betrag_brutto: e.betrag_brutto ?? null,
                betrag_netto: e.betrag_netto ?? null,
                ust_satz: e.ust_satz ?? undefined,
                belegnummer: e.belegnummer ?? null,
                firma_id: e.firma_id_vorschlag ?? null,
                notizen: `Beleg: ${beleg.dateiname}`,
              }}
              submitLabel="Buchung anlegen"
              abbrechenHref="/buchhaltung/belege"
              erfolgHref="/buchhaltung?id={id}"
              onSubmit={verbuchen}
            />
          </div>
        ) : (
          <div className="card text-sm text-hs-text-2">Du hast nur Leserechte – Belege können nicht verbucht werden.</div>
        )}
      </div>
    </div>
  )
}
