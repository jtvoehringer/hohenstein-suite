import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertTriangle, FileText, Image as ImageIcon, Info, Trash2 } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite, canAdmin } from '@/lib/auth/roles'
import { fmtDatum, fmtDatumZeit, fmtEuroMitZeichen } from '@/lib/format'
import ConfirmDeleteForm from '@/components/ui/ConfirmDeleteForm'
import BelegUpload from './BelegUpload'
import { loescheBelegForm } from '../actions'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default async function BelegePage() {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId
  const writeOk  = canWrite(membership.role)
  const adminOk  = canAdmin(membership.role)
  const kiAktiv  = !!process.env.ANTHROPIC_API_KEY

  const { data: belegeRaw } = await (supabase.from('ea_belege') as any)
    .select('id, dateiname, dateityp, groesse_bytes, status, erkannte_daten, fehler_details, hochgeladen_am, verbucht_am, ea_transaktion_id, ea_transaktionen(id, typ, beschreibung, betrag_brutto, datum)')
    .eq('tenant_id', tenantId)
    .order('hochgeladen_am', { ascending: false })
    .limit(200)
  const belege   = (belegeRaw ?? []) as R[]
  const offen    = belege.filter(b => b.status !== 'verbucht')
  const verbucht = belege.filter(b => b.status === 'verbucht').slice(0, 30)

  function BelegZeile({ b }: { b: R }) {
    const e = (b.erkannte_daten ?? {}) as R
    const istBild = String(b.dateityp ?? '').startsWith('image/')
    const tx = b.ea_transaktionen as R | null
    const darfLoeschen = writeOk && (b.status !== 'verbucht' || adminOk)
    return (
      <div className="flex items-center gap-4 px-4 py-3 border-b border-hs-line last:border-0 hover:bg-hs-bg/60">
        <div className="shrink-0 text-hs-text-2">
          {istBild ? <ImageIcon size={20} strokeWidth={1.5} /> : <FileText size={20} strokeWidth={1.5} />}
        </div>
        <div className="flex-1 min-w-0">
          <Link href={`/buchhaltung/belege/${b.id}`} className="font-medium text-hs-text hover:text-hs-blue-700 truncate block">
            {tx?.beschreibung || e.beschreibung || b.dateiname}
          </Link>
          <p className="text-xs text-hs-text-2 truncate">
            {b.dateiname} · hochgeladen {fmtDatumZeit(b.hochgeladen_am)}
            {e.datum ? ` · Belegdatum ${fmtDatum(e.datum)}` : ''}
            {tx?.datum ? ` · gebucht am ${fmtDatum(tx.datum)}` : ''}
          </p>
          {b.status === 'fehler' && (
            <p className="text-xs text-hs-warn-fg flex items-center gap-1 mt-0.5">
              <AlertTriangle size={12} strokeWidth={2} /> Erkennung fehlgeschlagen – bitte manuell buchen
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          {(tx?.betrag_brutto ?? e.betrag_brutto) != null && (
            <p className={`betrag font-semibold ${(tx?.typ ?? e.typ) === 'einnahme' ? 'text-hs-ok-fg' : 'text-hs-text'}`}>
              {fmtEuroMitZeichen(tx?.betrag_brutto ?? e.betrag_brutto)}
            </p>
          )}
          {e.konfidenz && e.konfidenz !== 'hoch' && b.status !== 'verbucht' && (
            <p className="text-xs text-hs-warn-fg">Erkennung: {e.konfidenz}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {b.status === 'verbucht'
            ? <span className="pill bg-hs-ok-bg text-hs-ok-fg">Verbucht</span>
            : b.status === 'fehler'
              ? <span className="pill bg-hs-warn-bg text-hs-warn-fg">Prüfen</span>
              : <span className="pill bg-hs-blue-50 text-hs-blue-700">Offen</span>}
          {b.status !== 'verbucht' && writeOk && (
            <Link href={`/buchhaltung/belege/${b.id}`} className="btn-primary !px-3 !py-1.5">Buchen</Link>
          )}
          {darfLoeschen && (
            <ConfirmDeleteForm
              action={loescheBelegForm.bind(null, b.id)}
              message={b.status === 'verbucht'
                ? 'Beleg löschen? Die Datei wird endgültig entfernt, die Buchung bleibt bestehen.'
                : 'Beleg verwerfen? Die Datei wird endgültig gelöscht, es entsteht keine Buchung.'}
              title="Löschen"
              label={<Trash2 size={15} strokeWidth={1.75} />}
              className="p-1.5 rounded-md text-hs-text-2 hover:text-hs-err-fg hover:bg-hs-err-bg"
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl">Belege</h1>
        <p className="text-sm text-hs-text-2 mt-0.5">
          {kiAktiv
            ? 'PDF oder Foto hochladen – Datum, Betrag, USt-Satz und Kategorie werden automatisch erkannt und vor dem Buchen geprüft.'
            : 'PDF oder Foto hochladen und anschließend verbuchen.'}
        </p>
      </div>

      {!kiAktiv && (
        <div className="flex items-start gap-2.5 rounded-xl bg-hs-blue-50 border border-hs-blue-100 px-4 py-3 text-sm text-hs-blue-700">
          <Info size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>Die automatische Belegerkennung ist nicht konfiguriert (ANTHROPIC_API_KEY fehlt). Belege werden gespeichert, die Buchungsdaten trägst du beim Verbuchen manuell ein.</span>
        </div>
      )}

      {writeOk && <BelegUpload kiAktiv={kiAktiv} />}

      <div className="card !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-hs-line flex items-center justify-between">
          <h2 className="text-sm font-semibold">Zu verbuchen {offen.length > 0 && <span className="text-hs-text-2 font-normal">({offen.length})</span>}</h2>
        </div>
        {offen.length === 0
          ? <p className="text-sm text-hs-text-2 text-center py-10">Keine offenen Belege – alles verbucht.</p>
          : offen.map(b => <BelegZeile key={b.id} b={b} />)}
      </div>

      {verbucht.length > 0 && (
        <div className="card !p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-hs-line">
            <h2 className="text-sm font-semibold">Zuletzt verbucht</h2>
          </div>
          {verbucht.map(b => <BelegZeile key={b.id} b={b} />)}
        </div>
      )}
    </div>
  )
}
