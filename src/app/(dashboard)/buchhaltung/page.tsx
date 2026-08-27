import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Lock, Pencil, Plus, Trash2, Paperclip } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { fmtDatum, fmtEuroMitZeichen, MONATE } from '@/lib/format'
import { ladeKategorien, ladeKonten } from '@/lib/ea/server'
import { betragKlasse, IMPORT_QUELLEN } from '@/lib/ea/types'
import ConfirmDeleteForm from '@/components/ui/ConfirmDeleteForm'
import { loescheBuchungForm } from './actions'
import CsvExportButton from './CsvExportButton'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

type SP = { jahr?: string; monat?: string; typ?: string; kategorie?: string; konto?: string; q?: string; id?: string }

function letzterTag(jahr: number, monat: number): string {
  const d = new Date(jahr, monat, 0)
  return `${jahr}-${String(monat).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default async function BuchhaltungPage({ searchParams }: { searchParams: Promise<SP> }) {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId
  const writeOk  = canWrite(membership.role)

  const sp = await searchParams
  const heute = new Date()
  const jahr  = parseInt(sp.jahr ?? '') || heute.getFullYear()
  const monat = Math.min(12, Math.max(0, parseInt(sp.monat ?? '') || 0))  // 0 = ganzes Jahr
  const typFilter = sp.typ === 'einnahme' || sp.typ === 'ausgabe' ? sp.typ : ''
  const katFilter = sp.kategorie ?? ''
  const kontoFilter = sp.konto ?? ''
  const q = (sp.q ?? '').trim()
  const markiertId = sp.id ?? ''

  const von = monat ? `${jahr}-${String(monat).padStart(2, '0')}-01` : `${jahr}-01-01`
  const bis = monat ? letzterTag(jahr, monat) : `${jahr}-12-31`

  let query = (supabase.from('ea_transaktionen') as any)
    .select('id, typ, datum, beschreibung, kategorie_id, firma_id, konto_id, betrag_netto, ust_satz, ust_betrag, betrag_brutto, abzugsfaehig_pct, betrag_abzugsfaehig, belegnummer, is_locked, abgeglichen, import_quelle, notizen, ea_kategorien(name, konto_nr), konten(name), firmen(name), ea_belege(id)')
    .eq('tenant_id', tenantId)
    .gte('datum', von)
    .lte('datum', bis)
    .order('datum', { ascending: false })
    .order('erstellt_am', { ascending: false })
  if (typFilter)   query = query.eq('typ', typFilter)
  if (katFilter)   query = katFilter === 'ohne' ? query.is('kategorie_id', null) : query.eq('kategorie_id', katFilter)
  if (kontoFilter) query = kontoFilter === 'ohne' ? query.is('konto_id', null) : query.eq('konto_id', kontoFilter)
  if (q) {
    const safe = q.replace(/[,()"'\\%]/g, ' ').trim()
    if (safe) query = query.or(`beschreibung.ilike.%${safe}%,belegnummer.ilike.%${safe}%,notizen.ilike.%${safe}%`)
  }

  const [{ data: buchungenRaw }, kategorien, konten] = await Promise.all([
    query,
    ladeKategorien(supabase, tenantId, false),
    ladeKonten(supabase, tenantId),
  ])
  const buchungen = (buchungenRaw ?? []) as R[]

  // Summen (netto) + USt/VSt (VSt anteilig abzugsfähig – wie berechne_ea_uva)
  let einnahmenNetto = 0, einnahmenBrutto = 0, ausgabenNetto = 0, ausgabenBrutto = 0, ust = 0, vst = 0
  for (const b of buchungen) {
    const n = Number(b.betrag_netto ?? 0), br = Number(b.betrag_brutto ?? 0), u = Number(b.ust_betrag ?? 0)
    if (b.typ === 'einnahme') { einnahmenNetto += n; einnahmenBrutto += br; ust += u }
    else { ausgabenNetto += n; ausgabenBrutto += br; vst += Math.round(u * Number(b.abzugsfaehig_pct ?? 100)) / 100 }
  }
  const ergebnis = einnahmenNetto - ausgabenNetto
  const zahllast = ust - vst

  const jahre = Array.from({ length: 6 }, (_, i) => heute.getFullYear() + 1 - i)
  const zeitraumLabel = monat ? `${MONATE[monat - 1]} ${jahr}` : `${jahr}`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">Buchungen</h1>
          <p className="text-sm text-hs-text-2 mt-0.5">Einnahmen-Ausgaben-Rechnung · § 4 Abs. 3 EStG · {zeitraumLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <CsvExportButton buchungen={buchungen} dateiname={`buchungen_${jahr}${monat ? '-' + String(monat).padStart(2, '0') : ''}.csv`} />
          {writeOk && (
            <Link href="/buchhaltung/neu" className="btn-primary"><Plus size={16} strokeWidth={2} /> Buchung</Link>
          )}
        </div>
      </div>

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card !p-4">
          <p className="overline">Einnahmen (netto)</p>
          <p className="kpi text-hs-ok-fg mt-1">{fmtEuroMitZeichen(einnahmenNetto)}</p>
          <p className="text-xs text-hs-text-2 font-mono tabular-nums mt-0.5">brutto {fmtEuroMitZeichen(einnahmenBrutto)}</p>
        </div>
        <div className="card !p-4">
          <p className="overline">Ausgaben (netto)</p>
          <p className="kpi mt-1">{fmtEuroMitZeichen(ausgabenNetto)}</p>
          <p className="text-xs text-hs-text-2 font-mono tabular-nums mt-0.5">brutto {fmtEuroMitZeichen(ausgabenBrutto)}</p>
        </div>
        <div className="card !p-4">
          <p className="overline">Ergebnis (netto)</p>
          <p className={`kpi mt-1 ${ergebnis >= 0 ? 'text-hs-ok-fg' : 'text-hs-err-fg'}`}>{fmtEuroMitZeichen(ergebnis)}</p>
          <p className="text-xs text-hs-text-2 mt-0.5">Einnahmen − Ausgaben</p>
        </div>
        <div className="card !p-4">
          <p className="overline">USt / Vorsteuer</p>
          <p className="kpi mt-1">{fmtEuroMitZeichen(zahllast)}</p>
          <p className="text-xs text-hs-text-2 font-mono tabular-nums mt-0.5">USt {fmtEuroMitZeichen(ust)} · VSt {fmtEuroMitZeichen(vst)}</p>
        </div>
      </div>

      {/* Filter */}
      <form method="GET" className="card !p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 items-end">
        <div>
          <label className="form-label">Jahr</label>
          <select name="jahr" defaultValue={String(jahr)} className="input">
            {jahre.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Monat</label>
          <select name="monat" defaultValue={String(monat)} className="input">
            <option value="0">Ganzes Jahr</option>
            {MONATE.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Typ</label>
          <select name="typ" defaultValue={typFilter} className="input">
            <option value="">Alle</option>
            <option value="einnahme">Einnahmen</option>
            <option value="ausgabe">Ausgaben</option>
          </select>
        </div>
        <div>
          <label className="form-label">Kategorie</label>
          <select name="kategorie" defaultValue={katFilter} className="input">
            <option value="">Alle</option>
            <option value="ohne">– ohne Kategorie –</option>
            {kategorien.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Konto</label>
          <select name="konto" defaultValue={kontoFilter} className="input">
            <option value="">Alle</option>
            <option value="ohne">– ohne Konto –</option>
            {konten.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Suche</label>
          <input name="q" defaultValue={q} placeholder="Bezeichnung, Beleg-Nr …" className="input" />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-secondary flex-1">Filtern</button>
          {(typFilter || katFilter || kontoFilter || q || monat) ? (
            <Link href={`/buchhaltung?jahr=${jahr}`} className="btn-secondary" title="Filter zurücksetzen">×</Link>
          ) : null}
        </div>
      </form>

      {/* Tabelle */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="text-left px-4 py-2.5">Datum</th>
                <th className="text-left px-4 py-2.5">Bezeichnung</th>
                <th className="text-left px-4 py-2.5">Kategorie</th>
                <th className="text-left px-4 py-2.5 hidden md:table-cell">Konto</th>
                <th className="text-right px-4 py-2.5">USt</th>
                <th className="text-right px-4 py-2.5">Netto</th>
                <th className="text-right px-4 py-2.5">Brutto</th>
                <th className="px-3 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody>
              {buchungen.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <p className="text-sm text-hs-text-2">Keine Buchungen für {zeitraumLabel}{typFilter || katFilter || kontoFilter || q ? ' mit diesen Filtern' : ''}.</p>
                    {writeOk && <Link href="/buchhaltung/neu" className="btn-primary mt-3"><Plus size={16} strokeWidth={2} /> Erste Buchung anlegen</Link>}
                  </td>
                </tr>
              )}
              {buchungen.map(b => {
                const markiert = b.id === markiertId
                const hatBeleg = Array.isArray(b.ea_belege) && b.ea_belege.length > 0
                return (
                  <tr key={b.id} id={`b-${b.id}`}
                    className={`border-b border-hs-line last:border-0 transition-colors ${markiert ? 'bg-hs-blue-50' : 'hover:bg-hs-bg/60'}`}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-hs-text-1 font-mono tabular-nums text-[13px]">{fmtDatum(b.datum)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${b.typ === 'einnahme' ? 'bg-hs-ok' : 'bg-hs-grey'}`} />
                        <Link href={`/buchhaltung/${b.id}`} className="font-medium text-hs-text hover:text-hs-blue-700 truncate">{b.beschreibung}</Link>
                        {b.is_locked && (
                          <span title="Gesperrt (Monatsabschluss oder UVA übermittelt)"><Lock size={13} strokeWidth={1.75} className="text-hs-tertiary shrink-0" /></span>
                        )}
                        {hatBeleg && (
                          <Link href={`/buchhaltung/belege/${b.ea_belege[0].id}`} title="Beleg anzeigen"><Paperclip size={13} strokeWidth={1.75} className="text-hs-tertiary hover:text-hs-blue-700 shrink-0" /></Link>
                        )}
                      </div>
                      <p className="text-xs text-hs-text-2 truncate">
                        {[b.belegnummer, (b.firmen as R | null)?.name, b.import_quelle && b.import_quelle !== 'manuell' ? IMPORT_QUELLEN[b.import_quelle] : null].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-hs-text-1 text-[13px]">
                      {(b.ea_kategorien as R | null)?.name ?? <span className="text-hs-tertiary">–</span>}
                      {Number(b.abzugsfaehig_pct ?? 100) < 100 && (
                        <span className="pill bg-hs-warn-bg text-hs-warn-fg ml-1.5" title="Eingeschränkt abzugsfähig">{b.abzugsfaehig_pct} %</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-hs-text-2 text-[13px] hidden md:table-cell">{(b.konten as R | null)?.name ?? '–'}</td>
                    <td className="px-4 py-2.5 betrag text-hs-text-2 text-[13px]">{b.ust_satz} %</td>
                    <td className="px-4 py-2.5 betrag text-hs-text-1">{fmtEuroMitZeichen(b.betrag_netto)}</td>
                    <td className={`px-4 py-2.5 betrag font-semibold ${betragKlasse(b.typ)}`}>{fmtEuroMitZeichen(b.betrag_brutto)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/buchhaltung/${b.id}`} title={b.is_locked ? 'Anzeigen' : 'Bearbeiten'}
                          className="p-1.5 rounded-md text-hs-text-2 hover:text-hs-blue-700 hover:bg-hs-blue-50">
                          <Pencil size={15} strokeWidth={1.75} />
                        </Link>
                        {writeOk && !b.is_locked && (
                          <ConfirmDeleteForm
                            action={loescheBuchungForm.bind(null, b.id)}
                            message={`Buchung „${b.beschreibung}" (${fmtEuroMitZeichen(b.betrag_brutto)}) endgültig löschen?`}
                            title="Löschen"
                            label={<Trash2 size={15} strokeWidth={1.75} />}
                            className="p-1.5 rounded-md text-hs-text-2 hover:text-hs-err-fg hover:bg-hs-err-bg"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {buchungen.length > 0 && (
              <tfoot>
                <tr className="border-t border-hs-line-str bg-hs-bg/60 text-[13px]">
                  <td colSpan={3} className="px-4 py-2.5 text-hs-text-2">{buchungen.length} Buchung{buchungen.length === 1 ? '' : 'en'} · Saldo</td>
                  <td className="hidden md:table-cell" />
                  <td />
                  <td className="px-4 py-2.5 betrag font-semibold">{fmtEuroMitZeichen(ergebnis)}</td>
                  <td className="px-4 py-2.5 betrag font-semibold">{fmtEuroMitZeichen(einnahmenBrutto - ausgabenBrutto)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
