'use client'

// ── Verbindlichkeiten: Liste + Dialoge (Anlegen/Bearbeiten, Bezahlen) ─────────

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Banknote, Pencil, Plus, RotateCcw, Trash2, Ban, ExternalLink } from 'lucide-react'
import Modal from '@/components/crm/Modal'
import KundenSuche from '@/components/crm/KundenSuche'
import { fmtDatum, fmtEuroMitZeichen, heuteIso } from '@/lib/format'
import { UST_SAETZE_FAKT, ZAHLUNG_ARTEN, datumPlusTage, tageDifferenz, zahlungArtLabel, type ZahlungArt } from '@/lib/rechnungen/types'
import {
  ER_STATUS_LABEL, erBrutto, erNettoAusBrutto, erStatusKlasse,
  type EingangsrechnungInput, type EingangsrechnungRow,
} from '@/lib/rechnungen/verbindlichkeiten'
import {
  speichereEingangsrechnung, bezahleEingangsrechnung, zahlungZuruecknehmen, storniereEingangsrechnung, loescheEingangsrechnung,
} from '@/app/(dashboard)/rechnungen/verbindlichkeiten/actions'

type KategorieOpt = { id: string; name: string; ust_satz_std: number; abzugsfaehig_pct: number }
type KontoOpt = { id: string; name: string }
type FirmaOpt = { id: string; name: string; ort: string | null; lieferant: boolean }
type FormState = EingangsrechnungInput & { id?: string }

function leer(heute: string): FormState {
  return {
    firma_id: null, lieferant: '', rechnungsnummer: null, beschreibung: '', datum: heute, faellig_am: datumPlusTage(heute, 14),
    betrag_netto: 0, ust_satz: 20, abzugsfaehig_pct: 100, kategorie_id: null, notizen: null,
  }
}

const FILTER: { key: 'offen' | 'bezahlt' | 'alle'; label: string }[] = [
  { key: 'offen', label: 'Offen' }, { key: 'bezahlt', label: 'Bezahlt' }, { key: 'alle', label: 'Alle' },
]

export default function VerbindlichkeitenClient({ rows, filter, kategorien, konten, firmen, writeOk, heute, autoNeu = false }: {
  rows: EingangsrechnungRow[]
  filter: 'offen' | 'bezahlt' | 'alle'
  kategorien: KategorieOpt[]
  konten: KontoOpt[]
  firmen: FirmaOpt[]
  writeOk: boolean
  heute: string
  /** Dialog „Eingangsrechnung erfassen" sofort öffnen (Befehlspalette: ?neu=1) */
  autoNeu?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [bruttoEingabe, setBruttoEingabe] = useState(true)
  const [bruttoText, setBruttoText] = useState('')
  const [zahlung, setZahlung] = useState<{ row: EingangsrechnungRow; datum: string; art: ZahlungArt; konto_id: string } | null>(null)

  const firmenItems = useMemo(() => firmen.map(f => ({ id: f.id, label: f.name, sub: [f.lieferant ? 'Lieferant' : null, f.ort].filter(Boolean).join(' · ') || null })), [firmen])
  const katName = (id: string | null) => kategorien.find(k => k.id === id)?.name ?? null

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, erfolg: string) {
    setFehler(null); setMeldung(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) { setFehler(res.error ?? 'Fehler'); return }
      setForm(null); setZahlung(null); setMeldung(erfolg)
      router.refresh()
    })
  }

  function oeffneNeu() {
    setFehler(null); setBruttoEingabe(true); setBruttoText('')
    setForm(leer(heute))
  }
  function oeffneBearbeiten(r: EingangsrechnungRow) {
    setFehler(null); setBruttoEingabe(false); setBruttoText(String(r.betrag_brutto))
    setForm({
      id: r.id, firma_id: r.firma_id, lieferant: r.lieferant, rechnungsnummer: r.rechnungsnummer, beschreibung: r.beschreibung,
      datum: r.datum, faellig_am: r.faellig_am, betrag_netto: r.betrag_netto, ust_satz: r.ust_satz, abzugsfaehig_pct: r.abzugsfaehig_pct,
      kategorie_id: r.kategorie_id, notizen: r.notizen,
    })
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => f ? { ...f, [k]: v } : f)

  function waehleFirma(id: string) {
    const f = firmen.find(x => x.id === id)
    setForm(s => s ? { ...s, firma_id: id || null, lieferant: f ? f.name : s.lieferant } : s)
  }
  function waehleKategorie(id: string) {
    const k = kategorien.find(x => x.id === id)
    setForm(s => s ? { ...s, kategorie_id: id || null, ust_satz: k ? k.ust_satz_std : s.ust_satz, abzugsfaehig_pct: k ? k.abzugsfaehig_pct : s.abzugsfaehig_pct } : s)
  }
  /** Bruttoeingabe → Netto zurückrechnen */
  function setzeBrutto(text: string, satz = form?.ust_satz ?? 20) {
    setBruttoText(text)
    const b = Number(text.replace(',', '.'))
    if (Number.isFinite(b)) set('betrag_netto', erNettoAusBrutto(b, satz))
  }

  const brutto = form ? erBrutto(form.betrag_netto, form.ust_satz) : 0

  useEffect(() => {
    if (autoNeu) { setFehler(null); setBruttoEingabe(true); setBruttoText(''); setForm(leer(heute)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoNeu])

  return (
    <div className="space-y-4">
      {fehler && !form && !zahlung && <div className="rounded-lg border border-hs-err/40 bg-hs-err-bg text-hs-err-fg text-sm px-4 py-3">{fehler}</div>}
      {meldung && <div className="rounded-lg border border-hs-ok/40 bg-hs-ok-bg text-hs-ok-fg text-sm px-4 py-3">{meldung}</div>}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-lg border border-hs-line bg-white p-0.5">
          {FILTER.map(f => (
            <Link key={f.key} href={f.key === 'offen' ? '/rechnungen/verbindlichkeiten' : `/rechnungen/verbindlichkeiten?filter=${f.key}`}
              className={`px-3 py-1.5 rounded-md text-[13px] ${filter === f.key ? 'bg-hs-navy text-white font-medium' : 'text-hs-text-2 hover:text-hs-text'}`}>{f.label}</Link>
          ))}
        </div>
        {writeOk && (
          <button type="button" onClick={oeffneNeu} className="btn-primary ml-auto"><Plus size={16} strokeWidth={2} /> Eingangsrechnung</button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="card text-sm text-hs-text-2">
          {filter === 'offen' ? 'Keine offenen Verbindlichkeiten.' : 'Keine Eingangsrechnungen vorhanden.'}
          {writeOk && filter === 'offen' && <> Lieferantenrechnungen hier erfassen – die Fälligkeit erscheint dann in den Hinweisen.</>}
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-2.5 text-left">Lieferant</th>
                  <th className="px-4 py-2.5 text-left">Bezeichnung</th>
                  <th className="px-4 py-2.5 text-left hidden md:table-cell">Rechnungs-Nr.</th>
                  <th className="px-4 py-2.5 text-left hidden md:table-cell">Datum</th>
                  <th className="px-4 py-2.5 text-left">Fällig</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-right hidden lg:table-cell">Netto</th>
                  <th className="px-4 py-2.5 text-right">Brutto</th>
                  <th className="px-4 py-2.5 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const tage = r.status === 'offen' ? tageDifferenz(r.faellig_am, heute) : 0
                  const ueber = r.status === 'offen' && tage > 0
                  return (
                    <tr key={r.id} className="border-b border-hs-line last:border-0 hover:bg-hs-bg/60">
                      <td className="px-4 py-2.5 font-medium max-w-[220px] truncate">{r.lieferant}</td>
                      <td className="px-4 py-2.5 max-w-[260px]">
                        <span className="block truncate">{r.beschreibung}</span>
                        {katName(r.kategorie_id) && <span className="block text-[11px] text-hs-tertiary truncate">{katName(r.kategorie_id)}</span>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[12.5px] text-hs-text-2 hidden md:table-cell">{r.rechnungsnummer ?? '–'}</td>
                      <td className="px-4 py-2.5 text-hs-text-2 hidden md:table-cell">{fmtDatum(r.datum)}</td>
                      <td className={`px-4 py-2.5 whitespace-nowrap ${ueber ? 'text-hs-err-fg font-medium' : 'text-hs-text-2'}`}>
                        {fmtDatum(r.faellig_am)}
                        {r.status === 'offen' && <span className="block text-[11px]">{tage > 0 ? `${tage} T. überfällig` : tage === 0 ? 'heute' : `in ${-tage} T.`}</span>}
                        {r.status === 'bezahlt' && r.bezahlt_am && <span className="block text-[11px] text-hs-tertiary">bezahlt {fmtDatum(r.bezahlt_am)}{r.zahlungsart ? ` · ${zahlungArtLabel(r.zahlungsart)}` : ''}</span>}
                      </td>
                      <td className="px-4 py-2.5"><span className={erStatusKlasse(r.status, ueber)}>{ueber ? 'Überfällig' : ER_STATUS_LABEL[r.status]}</span></td>
                      <td className="px-4 py-2.5 betrag text-hs-text-2 hidden lg:table-cell">{fmtEuroMitZeichen(r.betrag_netto)}</td>
                      <td className={`px-4 py-2.5 betrag font-semibold ${r.status === 'offen' ? 'text-hs-err-fg' : ''}`}>{fmtEuroMitZeichen(r.betrag_brutto)}</td>
                      <td className="px-2 py-2.5">
                        {writeOk && (
                          <div className="flex items-center justify-end gap-0.5">
                            {r.status === 'offen' && (
                              <>
                                <button type="button" disabled={pending} title="Bezahlen (E&A-Ausgabe buchen)" className="p-1.5 rounded text-hs-blue-700 hover:bg-hs-blue-50"
                                  onClick={() => { setFehler(null); setZahlung({ row: r, datum: heuteIso(), art: 'bank', konto_id: konten[0]?.id ?? '' }) }}>
                                  <Banknote size={16} strokeWidth={1.75} />
                                </button>
                                <button type="button" disabled={pending} title="Bearbeiten" className="p-1.5 rounded text-hs-text-2 hover:bg-hs-bg hover:text-hs-text" onClick={() => oeffneBearbeiten(r)}>
                                  <Pencil size={15} strokeWidth={1.75} />
                                </button>
                                <button type="button" disabled={pending} title="Stornieren (Rechnung wird nicht bezahlt)" className="p-1.5 rounded text-hs-text-2 hover:bg-hs-bg hover:text-hs-text"
                                  onClick={() => { if (confirm('Eingangsrechnung stornieren? Sie bleibt zur Nachvollziehbarkeit erhalten.')) run(() => storniereEingangsrechnung(r.id), 'Eingangsrechnung storniert.') }}>
                                  <Ban size={15} strokeWidth={1.75} />
                                </button>
                              </>
                            )}
                            {r.status === 'bezahlt' && (
                              <>
                                {r.ea_transaktion_id && (
                                  <Link href={`/buchhaltung?id=${r.ea_transaktion_id}&jahr=${(r.bezahlt_am ?? r.datum).slice(0, 4)}`} title="E&A-Buchung anzeigen" className="p-1.5 rounded text-hs-text-2 hover:bg-hs-bg hover:text-hs-text">
                                    <ExternalLink size={15} strokeWidth={1.75} />
                                  </Link>
                                )}
                                <button type="button" disabled={pending} title="Zahlung zurücknehmen (E&A-Buchung löschen)" className="p-1.5 rounded text-hs-text-2 hover:bg-hs-warn-bg hover:text-hs-warn-fg"
                                  onClick={() => { if (confirm('Zahlung zurücknehmen? Die E&A-Ausgabe wird gelöscht und die Rechnung ist wieder offen.')) run(() => zahlungZuruecknehmen(r.id), 'Zahlung zurückgenommen.') }}>
                                  <RotateCcw size={15} strokeWidth={1.75} />
                                </button>
                              </>
                            )}
                            {r.status !== 'bezahlt' && (
                              <button type="button" disabled={pending} title="Löschen" className="p-1.5 rounded text-hs-text-2 hover:bg-hs-err-bg hover:text-hs-err-fg"
                                onClick={() => { if (confirm('Eingangsrechnung endgültig löschen?')) run(() => loescheEingangsrechnung(r.id), 'Eingangsrechnung gelöscht.') }}>
                                <Trash2 size={15} strokeWidth={1.75} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {filter === 'offen' && (
                <tfoot>
                  <tr className="bg-hs-bg/60 font-semibold">
                    <td className="px-4 py-2.5" colSpan={6}>Summe offen</td>
                    <td className="px-4 py-2.5 betrag hidden lg:table-cell">{fmtEuroMitZeichen(rows.reduce((s, r) => s + r.betrag_netto, 0))}</td>
                    <td className="px-4 py-2.5 betrag text-hs-err-fg">{fmtEuroMitZeichen(rows.reduce((s, r) => s + r.betrag_brutto, 0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── Dialog: Anlegen / Bearbeiten ─────────────────────────────────────── */}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Eingangsrechnung bearbeiten' : 'Eingangsrechnung erfassen'}
        subtitle="Lieferantenrechnung mit Fälligkeit – die E&A-Ausgabe entsteht erst beim Bezahlen." width="max-w-2xl">
        {form && (
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); const { id, ...input } = form; run(() => speichereEingangsrechnung(input, id), id ? 'Eingangsrechnung gespeichert.' : 'Eingangsrechnung erfasst.') }}>
            {fehler && <div className="rounded-lg border border-hs-err/40 bg-hs-err-bg text-hs-err-fg text-sm px-3 py-2">{fehler}</div>}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="form-label">Firma aus dem CRM (optional)</label>
                <KundenSuche items={firmenItems} value={form.firma_id ?? ''} onChange={waehleFirma} placeholder="Lieferant suchen …" />
              </div>
              <div>
                <label className="form-label" htmlFor="er-lieferant">Lieferant *</label>
                <input id="er-lieferant" className="input" value={form.lieferant} onChange={e => set('lieferant', e.target.value)} required placeholder="z.B. IC&P Consultants e.U." />
              </div>
              <div className="sm:col-span-2">
                <label className="form-label" htmlFor="er-beschreibung">Bezeichnung *</label>
                <input id="er-beschreibung" className="input" value={form.beschreibung} onChange={e => set('beschreibung', e.target.value)} required placeholder="z.B. Hosting Rechenzentrum August 2026" />
              </div>
              <div>
                <label className="form-label" htmlFor="er-nummer">Rechnungsnummer des Lieferanten</label>
                <input id="er-nummer" className="input font-mono" value={form.rechnungsnummer ?? ''} onChange={e => set('rechnungsnummer', e.target.value || null)} />
              </div>
              <div>
                <label className="form-label" htmlFor="er-kategorie">E&A-Kategorie</label>
                <select id="er-kategorie" className="input" value={form.kategorie_id ?? ''} onChange={e => waehleKategorie(e.target.value)}>
                  <option value="">Sonstige Betriebsausgaben (Standard)</option>
                  {kategorien.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="er-datum">Rechnungsdatum *</label>
                <input id="er-datum" type="date" className="input" value={form.datum} required
                  onChange={e => { const d = e.target.value; setForm(f => f ? { ...f, datum: d, faellig_am: f.faellig_am < d ? datumPlusTage(d, 14) : f.faellig_am } : f) }} />
              </div>
              <div>
                <label className="form-label" htmlFor="er-faellig">Fällig am *</label>
                <input id="er-faellig" type="date" className="input" value={form.faellig_am} required min={form.datum} onChange={e => set('faellig_am', e.target.value)} />
                <div className="flex gap-1.5 mt-1">
                  {[0, 7, 14, 30].map(t => (
                    <button key={t} type="button" onClick={() => set('faellig_am', datumPlusTage(form.datum, t))}
                      className="text-[11px] px-1.5 py-0.5 rounded border border-hs-line text-hs-text-2 hover:bg-hs-bg">{t === 0 ? 'sofort' : `+${t} T.`}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="form-label" htmlFor="er-betrag">{bruttoEingabe ? 'Betrag brutto *' : 'Betrag netto *'}</label>
                  <button type="button" className="text-[11px] text-hs-blue-700 hover:underline mb-1" onClick={() => { setBruttoEingabe(b => !b); setBruttoText(String(brutto)) }}>
                    {bruttoEingabe ? 'netto eingeben' : 'brutto eingeben'}
                  </button>
                </div>
                {bruttoEingabe
                  ? <input id="er-betrag" type="number" step="0.01" min={0} className="input betrag" value={bruttoText} onChange={e => setzeBrutto(e.target.value)} required />
                  : <input id="er-betrag" type="number" step="0.01" min={0} className="input betrag" value={form.betrag_netto} onChange={e => set('betrag_netto', Number(e.target.value))} required />}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label" htmlFor="er-ust">USt / Vorsteuer</label>
                  <select id="er-ust" className="input" value={form.ust_satz} onChange={e => { const s = Number(e.target.value); set('ust_satz', s); if (bruttoEingabe) setzeBrutto(bruttoText, s) }}>
                    {UST_SAETZE_FAKT.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label" htmlFor="er-abz">Abzugsfähig %</label>
                  <input id="er-abz" type="number" min={0} max={100} className="input betrag" value={form.abzugsfaehig_pct} onChange={e => set('abzugsfaehig_pct', Number(e.target.value))} />
                </div>
              </div>
              <div className="sm:col-span-2 rounded-lg bg-hs-bg px-3 py-2 text-[12.5px] flex flex-wrap gap-x-5 gap-y-1">
                <span>Netto <span className="font-mono">{fmtEuroMitZeichen(form.betrag_netto)}</span></span>
                <span>USt {form.ust_satz} % <span className="font-mono">{fmtEuroMitZeichen(brutto - form.betrag_netto)}</span></span>
                <span className="font-semibold">Brutto <span className="font-mono">{fmtEuroMitZeichen(brutto)}</span></span>
              </div>
              <div className="sm:col-span-2">
                <label className="form-label" htmlFor="er-notiz">Notiz</label>
                <textarea id="er-notiz" className="input" rows={2} value={form.notizen ?? ''} onChange={e => set('notizen', e.target.value || null)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn-secondary" onClick={() => setForm(null)}>Abbrechen</button>
              <button type="submit" disabled={pending} className="btn-primary">{pending ? 'Speichern …' : form.id ? 'Speichern' : 'Erfassen'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Dialog: Bezahlen ─────────────────────────────────────────────────── */}
      <Modal open={!!zahlung} onClose={() => setZahlung(null)} title="Eingangsrechnung bezahlen"
        subtitle={zahlung ? `${zahlung.row.lieferant} · ${fmtEuroMitZeichen(zahlung.row.betrag_brutto)} – es wird automatisch eine E&A-Ausgabe gebucht.` : undefined}>
        {zahlung && (
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); run(() => bezahleEingangsrechnung(zahlung.row.id, { datum: zahlung.datum, art: zahlung.art, konto_id: zahlung.konto_id || null }), 'Bezahlt und in der E&A gebucht.') }}>
            {fehler && <div className="rounded-lg border border-hs-err/40 bg-hs-err-bg text-hs-err-fg text-sm px-3 py-2">{fehler}</div>}
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="form-label" htmlFor="ez-datum">Zahlungsdatum</label>
                <input id="ez-datum" type="date" className="input" value={zahlung.datum} required onChange={e => setZahlung(z => z ? { ...z, datum: e.target.value } : z)} />
              </div>
              <div>
                <label className="form-label" htmlFor="ez-art">Zahlungsart</label>
                <select id="ez-art" className="input" value={zahlung.art} onChange={e => setZahlung(z => z ? { ...z, art: e.target.value as ZahlungArt } : z)}>
                  {ZAHLUNG_ARTEN.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="ez-konto">Konto</label>
                <select id="ez-konto" className="input" value={zahlung.konto_id} onChange={e => setZahlung(z => z ? { ...z, konto_id: e.target.value } : z)}>
                  <option value="">– kein Konto –</option>
                  {konten.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              </div>
            </div>
            <p className="text-[12px] text-hs-text-2">Gebucht wird: Ausgabe „{zahlung.row.beschreibung} – {zahlung.row.lieferant}", netto {fmtEuroMitZeichen(zahlung.row.betrag_netto)}, Vorsteuer {zahlung.row.ust_satz} %, Kategorie {katName(zahlung.row.kategorie_id) ?? 'Sonstige Betriebsausgaben'}.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn-secondary" onClick={() => setZahlung(null)}>Abbrechen</button>
              <button type="submit" disabled={pending} className="btn-primary"><Banknote size={16} strokeWidth={1.75} /> {pending ? 'Buchen …' : 'Bezahlt – buchen'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
