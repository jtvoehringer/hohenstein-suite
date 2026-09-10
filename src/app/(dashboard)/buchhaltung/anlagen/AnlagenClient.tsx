'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Check, X, Landmark, CalendarCheck, RotateCcw, Link2 } from 'lucide-react'
import { fmtEuro, fmtDatum } from '@/lib/format'
import {
  ANLAGE_GRUPPEN, AFA_METHODEN, afaImJahr, afaSatzProzent, buchwertEndeJahr, gruppeLabel, methodeLabel,
  type AnlageRow, type AnlageInput, type AfaMethode, type Anlagenspiegel, type AfaBuchungsStatus, type BuchungsKandidat,
} from '@/lib/ea/anlagen'
import Modal from '@/components/crm/Modal'
import { speichereAnlage, loescheAnlage, bucheAfa, afaZuruecknehmen } from '../actions'

type FormState = {
  id?: string
  bezeichnung: string
  gruppe: AnlageInput['gruppe']
  konto_nr: string
  anschaffungsdatum: string
  anschaffungskosten: string
  nutzungsdauer_jahre: string
  methode: AfaMethode
  degressiv_satz: string
  restwert: string
  abgang_datum: string
  abgang_erloes: string
  transaktion_id: string
  lieferant: string
  belegnummer: string
  notizen: string
}

const AFA_STATUS: Record<string, { label: string; cls: string }> = {
  gebucht:       { label: 'gebucht',    cls: 'bg-hs-ok-bg text-hs-ok-fg' },
  offen:         { label: 'offen',      cls: 'bg-hs-warn-bg text-hs-warn-fg' },
  abweichend:    { label: 'abweichend', cls: 'bg-hs-err-bg text-hs-err-fg' },
  ueberfluessig: { label: 'zu viel',    cls: 'bg-hs-err-bg text-hs-err-fg' },
}

const dez = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.'))

export default function AnlagenClient({
  anlagen, jahr, heute, spiegel, kandidaten, afaStatus, afaKategorieVorhanden, dezemberGesperrt, vorbelegungBuchungId, writeOk,
}: {
  anlagen: AnlageRow[]
  jahr: number
  heute: string
  spiegel: Anlagenspiegel
  /** Ausgaben in Kontenklasse 0 ohne Eintrag im Verzeichnis */
  kandidaten: BuchungsKandidat[]
  afaStatus: AfaBuchungsStatus
  afaKategorieVorhanden: boolean
  dezemberGesperrt: boolean
  /** ?buchung=<id>: Formular mit dieser Anschaffungsbuchung vorbelegt öffnen */
  vorbelegungBuchungId: string | null
  writeOk: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState<FormState | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [afaFehler, setAfaFehler] = useState<string | null>(null)
  const [zeigeAbgaenge, setZeigeAbgaenge] = useState(false)
  const [alleAfaZeilen, setAlleAfaZeilen] = useState(false)
  const laufend = jahr >= Number(heute.slice(0, 4))

  const zeilen = useMemo(() => anlagen
    .filter(a => Number(a.anschaffungsdatum.slice(0, 4)) <= jahr)
    .map(a => ({
      a,
      afa: afaImJahr(a, jahr),
      buchwert: buchwertEndeJahr(a, jahr),
      abgegangen: !!a.abgang_datum && Number(a.abgang_datum.slice(0, 4)) <= jahr,
    })), [anlagen, jahr])
  const sichtbar = zeilen.filter(z => zeigeAbgaenge || !z.abgegangen)
  const anzahlAbgaenge = zeilen.filter(z => z.abgegangen).length

  // Kandidaten-Liste für das Formular: offene Käufe + die bereits zugeordnete Buchung der bearbeiteten Anlage
  const kandidatenMap = useMemo(() => new Map(kandidaten.map(k => [k.id, k])), [kandidaten])

  function leeresFormular(): FormState {
    const g = ANLAGE_GRUPPEN[0]
    return { bezeichnung: '', gruppe: g.value, konto_nr: g.konto, anschaffungsdatum: heute, anschaffungskosten: '', nutzungsdauer_jahre: String(g.nutzungsdauer),
      methode: 'linear', degressiv_satz: '30', restwert: '0', abgang_datum: '', abgang_erloes: '', transaktion_id: '', lieferant: '', belegnummer: '', notizen: '' }
  }
  function neu(buchung?: BuchungsKandidat) {
    setFehler(null)
    const f = leeresFormular()
    if (buchung) uebernimmBuchung(f, buchung)
    setForm(f)
  }
  function uebernimmBuchung(f: FormState, b: BuchungsKandidat) {
    f.transaktion_id = b.id
    f.anschaffungsdatum = b.datum
    f.anschaffungskosten = String(b.betrag_netto).replace('.', ',')
    if (!f.bezeichnung) f.bezeichnung = b.beschreibung
    if (!f.belegnummer && b.belegnummer) f.belegnummer = b.belegnummer
    // GWG-Grenze: bis 1.000 € netto Sofortabschreibung vorschlagen
    if (!f.id && b.betrag_netto <= 1000) { f.methode = 'gwg'; f.nutzungsdauer_jahre = '1' }
  }
  function bearbeiten(a: AnlageRow) {
    setFehler(null)
    setForm({ id: a.id, bezeichnung: a.bezeichnung, gruppe: a.gruppe, konto_nr: a.konto_nr ?? '', anschaffungsdatum: a.anschaffungsdatum,
      anschaffungskosten: String(a.anschaffungskosten).replace('.', ','), nutzungsdauer_jahre: String(a.nutzungsdauer_jahre),
      methode: a.methode, degressiv_satz: a.degressiv_satz == null ? '30' : String(a.degressiv_satz),
      restwert: String(a.restwert).replace('.', ','), abgang_datum: a.abgang_datum ?? '',
      abgang_erloes: a.abgang_erloes == null ? '' : String(a.abgang_erloes).replace('.', ','),
      transaktion_id: a.transaktion_id ?? '', lieferant: a.lieferant ?? '',
      belegnummer: a.belegnummer ?? '', notizen: a.notizen ?? '' })
  }

  // ?buchung=<id> → Formular mit der Anschaffungsbuchung vorbelegt öffnen (einmalig)
  useEffect(() => {
    if (!vorbelegungBuchungId || !writeOk) return
    const b = kandidatenMap.get(vorbelegungBuchungId)
    if (b) neu(b)
    else if (anlagen.some(a => a.transaktion_id === vorbelegungBuchungId)) setFehler('Diese Buchung ist bereits einer Anlage zugeordnet.')
    router.replace(`/buchhaltung/anlagen?jahr=${jahr}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vorbelegungBuchungId])

  function speichern(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    const { id, ...f } = form
    const input: AnlageInput = {
      bezeichnung: f.bezeichnung, gruppe: f.gruppe, konto_nr: f.konto_nr || null, anschaffungsdatum: f.anschaffungsdatum,
      anschaffungskosten: dez(f.anschaffungskosten),
      nutzungsdauer_jahre: f.methode === 'gwg' ? 1 : Number(f.nutzungsdauer_jahre),
      methode: f.methode, degressiv_satz: f.methode === 'degressiv' ? dez(f.degressiv_satz) : null,
      restwert: dez(f.restwert) || 0,
      abgang_datum: f.abgang_datum || null,
      abgang_erloes: f.abgang_datum && f.abgang_erloes !== '' ? dez(f.abgang_erloes) : null,
      transaktion_id: f.transaktion_id || null,
      lieferant: f.lieferant || null, belegnummer: f.belegnummer || null, notizen: f.notizen || null,
    }
    setFehler(null)
    startTransition(async () => {
      const res = await speichereAnlage(input, id)
      if (!res.ok) { setFehler(res.error); return }
      setForm(null); router.refresh()
    })
  }

  function loeschen(a: AnlageRow) {
    if (!confirm(`Anlage „${a.bezeichnung}“ wirklich aus dem Verzeichnis löschen? (Bei Verkauf/Ausscheiden besser einen Abgang eintragen.)`)) return
    startTransition(async () => {
      const res = await loescheAnlage(a.id)
      if (!res.ok) { setFehler(res.error); return }
      router.refresh()
    })
  }

  // ── AfA-Buchung am Jahresende ──
  const zuBuchen = afaStatus.zeilen.filter(z => z.status !== 'gebucht' && !z.gesperrt)
  const gebuchte = afaStatus.zeilen.filter(z => z.buchungId && !z.gesperrt)
  const afaBlockiert = dezemberGesperrt || !afaKategorieVorhanden
  function afaBuchen() {
    if (zuBuchen.length === 0) return
    const summe = zuBuchen.reduce((s, z) => s + z.soll, 0)
    const text = zuBuchen.length === 1
      ? `AfA ${jahr} für „${zuBuchen[0].anlage.bezeichnung}“ (${fmtEuro(zuBuchen[0].soll)}) per 31.12.${jahr} buchen?`
      : `AfA ${jahr} für ${zuBuchen.length} Anlagen (${fmtEuro(summe)}) per 31.12.${jahr} buchen?`
    if (!confirm(text)) return
    setAfaFehler(null)
    startTransition(async () => {
      const res = await bucheAfa(jahr)
      if (!res.ok) { setAfaFehler(res.error); return }
      router.refresh()
    })
  }
  function afaZurueck() {
    if (gebuchte.length === 0) return
    if (!confirm(`Alle ${gebuchte.length} AfA-Buchungen ${jahr} löschen? Das Anlagenverzeichnis bleibt unverändert.`)) return
    setAfaFehler(null)
    startTransition(async () => {
      const res = await afaZuruecknehmen(jahr)
      if (!res.ok) { setAfaFehler(res.error); return }
      router.refresh()
    })
  }

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => prev ? { ...prev, [k]: e.target.value } : prev)

  const formKandidaten = useMemo(() => {
    if (!form) return kandidaten
    if (form.transaktion_id && !kandidatenMap.has(form.transaktion_id)) {
      // bereits zugeordnete Buchung der bearbeiteten Anlage bleibt wählbar
      const a = anlagen.find(x => x.id === form.id)
      return [{ id: form.transaktion_id, datum: a?.anschaffungsdatum ?? form.anschaffungsdatum, beschreibung: '(zugeordnete Anschaffungsbuchung)', betrag_netto: a?.anschaffungskosten ?? 0, kategorie: '', belegnummer: null }, ...kandidaten]
    }
    return kandidaten
  }, [form, kandidaten, kandidatenMap, anlagen])

  return (
    <div className="space-y-4">
      {kandidaten.length > 0 && (
        <div className="card py-4 border-hs-warn/40 bg-hs-warn-bg/30">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-base">{kandidaten.length} {kandidaten.length === 1 ? 'Anlagenkauf' : 'Anlagenkäufe'} ohne Eintrag im Verzeichnis</h2>
            <span className="pill bg-hs-warn-bg text-hs-warn-fg">zu erfassen</span>
          </div>
          <p className="text-xs text-hs-text-2 mb-2">Ausgaben in einer Kategorie der Kontenklasse 0 (Anlagevermögen), die noch keiner Anlage zugeordnet sind.</p>
          <ul className="divide-y divide-hs-line">
            {kandidaten.slice(0, 6).map(b => (
              <li key={b.id} className="flex items-center gap-3 py-1.5 text-sm">
                <span className="tabular-nums text-xs text-hs-text-2 shrink-0">{fmtDatum(b.datum)}</span>
                <span className="flex-1 min-w-0 truncate text-hs-text">{b.beschreibung || b.kategorie}</span>
                <span className="tabular-nums font-semibold text-hs-text shrink-0">{fmtEuro(b.betrag_netto)}</span>
                {writeOk && <button onClick={() => neu(b)} className="btn-secondary !py-1 !px-2.5 text-xs">Anlage anlegen</button>}
              </li>
            ))}
          </ul>
          {kandidaten.length > 6 && <p className="text-xs text-hs-text-2 mt-2">+ {kandidaten.length - 6} weitere – über „Anlage erfassen“ zuordenbar.</p>}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card py-3"><p className="overline">AK Bestand {jahr}</p><p className="text-xl font-semibold text-hs-text tabular-nums">{fmtEuro(spiegel.anschaffungskosten)}</p><p className="text-xs text-hs-text-2">{spiegel.anzahlAktiv} {spiegel.anzahlAktiv === 1 ? 'Anlage' : 'Anlagen'}</p></div>
        <div className="card py-3"><p className="overline">AfA {jahr}</p><p className="text-xl font-semibold text-hs-text tabular-nums">{fmtEuro(spiegel.afaJahr)}</p><p className="text-xs text-hs-text-2">Abschreibung des Jahres</p></div>
        <div className="card py-3"><p className="overline">Kumulierte AfA</p><p className="text-xl font-semibold text-hs-text tabular-nums">{fmtEuro(spiegel.kumulierteAfa)}</p><p className="text-xs text-hs-text-2">bis 31.12.{jahr}</p></div>
        <div className="card py-3"><p className="overline">Buchwert 31.12.{jahr}</p><p className="text-xl font-semibold text-hs-blue-700 tabular-nums">{fmtEuro(spiegel.buchwertEnde)}</p>
          <p className="text-xs text-hs-text-2">{spiegel.zugaenge > 0 ? `Zugänge ${fmtEuro(spiegel.zugaenge)}` : spiegel.abgaenge > 0 ? `Abgänge ${fmtEuro(spiegel.abgaenge)}` : 'keine Zu-/Abgänge'}</p></div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="flex items-center gap-1.5 text-sm text-hs-text-1 cursor-pointer">
          <input type="checkbox" checked={zeigeAbgaenge} onChange={e => setZeigeAbgaenge(e.target.checked)} className="accent-hs-teal" />
          Abgänge anzeigen {anzahlAbgaenge > 0 && `(${anzahlAbgaenge})`}
        </label>
        {writeOk && <button onClick={() => neu()} className="btn-primary"><Plus size={15} strokeWidth={2} /> Anlage erfassen</button>}
      </div>
      {fehler && !form && <p className="text-sm text-hs-err-fg bg-hs-err-bg border border-hs-err/30 rounded-lg px-3 py-2">{fehler}</p>}

      <div className="bg-white rounded-xl border border-hs-line overflow-hidden">
        {sichtbar.length === 0 ? (
          <div className="p-8 text-center text-sm text-hs-text-2 flex flex-col items-center gap-2">
            <Landmark size={26} strokeWidth={1.5} className="text-hs-tertiary" />
            {anlagen.length === 0
              ? 'Noch keine Anlagen erfasst – z. B. Notebooks, Büroausstattung oder Software-Lizenzen über 1.000 €.'
              : `Für ${jahr} keine Anlagen im Bestand.`}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="text-left px-4 py-2">Anlage</th>
                  <th className="text-left px-3 py-2 hidden md:table-cell">Konto</th>
                  <th className="text-left px-3 py-2">Anschaffung</th>
                  <th className="text-right px-3 py-2">AK netto</th>
                  <th className="text-left px-3 py-2 hidden sm:table-cell">ND / Methode</th>
                  <th className="text-right px-3 py-2 hidden lg:table-cell">AfA {jahr}</th>
                  <th className="text-right px-3 py-2">Buchwert 31.12.</th>
                  <th className="text-left px-3 py-2 hidden sm:table-cell">Status</th>
                  <th className="px-2 py-2 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-hs-line">
                {sichtbar.map(({ a, afa, buchwert, abgegangen }) => (
                  <tr key={a.id} className={`hover:bg-hs-bg/70 ${abgegangen ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-2">
                      <div className="font-medium text-hs-text">{a.bezeichnung}</div>
                      <div className="text-xs text-hs-text-2 flex items-center gap-1 flex-wrap">
                        <span>{[gruppeLabel(a.gruppe), a.lieferant, a.belegnummer].filter(Boolean).join(' · ')}</span>
                        {a.transaktion_id && <Link href={`/buchhaltung/${a.transaktion_id}`} title="Anschaffungsbuchung öffnen" className="text-hs-blue-700 hover:underline inline-flex items-center gap-0.5"><Link2 size={11} /> Buchung</Link>}
                      </div>
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell text-hs-text-2 tabular-nums">{a.konto_nr ?? '–'}</td>
                    <td className="px-3 py-2 text-hs-text-1 tabular-nums whitespace-nowrap">{fmtDatum(a.anschaffungsdatum)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtEuro(a.anschaffungskosten)}</td>
                    <td className="px-3 py-2 hidden sm:table-cell text-hs-text-1 whitespace-nowrap">
                      {a.methode === 'gwg' ? 'GWG' : `${a.nutzungsdauer_jahre} J. · ${methodeLabel(a.methode)}`}
                      <span className="text-xs text-hs-text-2 tabular-nums"> {afaSatzProzent(a).toLocaleString('de-AT')} %</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums hidden lg:table-cell text-hs-text-1">{afa > 0 ? fmtEuro(afa) : '–'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-hs-text">{fmtEuro(buchwert)}</td>
                    <td className="px-3 py-2 hidden sm:table-cell">
                      {abgegangen
                        ? <span className="pill bg-gray-100 text-gray-700">Abgang {a.abgang_datum ? fmtDatum(a.abgang_datum).slice(3) : ''}</span>
                        : buchwert <= a.restwert ? <span className="pill bg-hs-blue-50 text-hs-blue-700">abgeschrieben</span>
                        : <span className="pill bg-hs-ok-bg text-hs-ok-fg">aktiv</span>}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {writeOk && (
                        <span className="inline-flex items-center gap-0.5">
                          <button onClick={() => bearbeiten(a)} title="Bearbeiten" className="text-hs-tertiary hover:text-hs-blue-700 p-1"><Pencil size={14} strokeWidth={1.75} /></button>
                          <button onClick={() => loeschen(a)} disabled={pending} title="Löschen" className="text-hs-tertiary hover:text-hs-err p-1"><Trash2 size={14} strokeWidth={1.75} /></button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {afaStatus.zeilen.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <h2 className="text-base">AfA {jahr} buchen</h2>
            {afaStatus.komplett
              ? <span className="pill bg-hs-ok-bg text-hs-ok-fg">gebucht · {fmtEuro(afaStatus.ist)}</span>
              : <span className="pill bg-hs-warn-bg text-hs-warn-fg">{afaStatus.offen} {afaStatus.offen === 1 ? 'Position' : 'Positionen'} offen</span>}
          </div>
          <p className="text-[13px] text-hs-text-2 mb-3">
            AfA laut Verzeichnis <b className="tabular-nums text-hs-text">{fmtEuro(afaStatus.soll)}</b>, davon gebucht{' '}
            <b className="tabular-nums text-hs-text">{fmtEuro(afaStatus.ist)}</b>. Gebucht wird je Anlage eine Ausgabe
            „Abschreibung (AfA)“ per 31.12.{jahr} – ohne Zahlungskonto und ohne Umsatzsteuer, damit Kontostände und UVA
            unberührt bleiben. Im Reporting und im Steuerberater-Export erscheint sie als Betriebsausgabe.
          </p>
          {!afaKategorieVorhanden && <p className="text-sm text-hs-err-fg bg-hs-err-bg rounded-lg px-3 py-2 mb-3">Die Kategorie „Abschreibung (AfA)“ fehlt – bitte Migration 018 einspielen.</p>}
          {dezemberGesperrt && (
            <p className="text-sm text-hs-warn-fg bg-hs-warn-bg rounded-lg px-3 py-2 mb-3">
              Dezember {jahr} ist abgeschlossen. Zum Buchen oder Zurücknehmen der AfA bitte den Monat im{' '}
              <Link href="/buchhaltung/monatsabschluss" className="underline underline-offset-2">Monatsabschluss</Link> öffnen.
            </p>
          )}
          {laufend && !afaStatus.komplett && !dezemberGesperrt && (
            <p className="text-sm text-hs-blue-700 bg-hs-blue-50 rounded-lg px-3 py-2 mb-3">
              {jahr} läuft noch. Die AfA wird üblicherweise nach dem Jahresende gebucht, sobald alle Anschaffungen und
              Abgänge erfasst sind – buchen ist trotzdem jederzeit möglich, Abweichungen zeigt diese Karte später an.
            </p>
          )}
          {afaFehler && <p className="text-sm text-hs-err-fg bg-hs-err-bg rounded-lg px-3 py-2 mb-3">{afaFehler}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="text-left px-2 py-1.5">Anlage</th>
                  <th className="text-right px-2 py-1.5">AfA laut Verzeichnis</th>
                  <th className="text-right px-2 py-1.5">gebucht</th>
                  <th className="text-left px-2 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hs-line">
                {(alleAfaZeilen || afaStatus.zeilen.length <= 8 ? afaStatus.zeilen : afaStatus.zeilen.filter(z => z.status !== 'gebucht')).map(z => (
                  <tr key={z.anlage.id}>
                    <td className="px-2 py-1.5 text-hs-text">{z.anlage.bezeichnung}</td>
                    <td className="px-2 py-1.5 tabular-nums text-right text-hs-text">{z.soll > 0 ? fmtEuro(z.soll) : '–'}</td>
                    <td className="px-2 py-1.5 tabular-nums text-right text-hs-text-1">
                      {z.buchungId ? <Link href={`/buchhaltung/${z.buchungId}`} className="hover:underline">{fmtEuro(z.ist)}</Link> : '–'}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={`pill ${AFA_STATUS[z.status].cls}`}>{AFA_STATUS[z.status].label}</span>
                      {z.gesperrt && <span className="pill bg-gray-100 text-gray-700 ml-1" title="Monat abgeschlossen">gesperrt</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-hs-line-str">
                  <td className="px-2 pt-2 font-semibold text-hs-text">Summe</td>
                  <td className="px-2 pt-2 tabular-nums text-right font-semibold text-hs-text">{fmtEuro(afaStatus.soll)}</td>
                  <td className="px-2 pt-2 tabular-nums text-right font-semibold text-hs-text-1">{fmtEuro(afaStatus.ist)}</td>
                  <td className="px-2 pt-2" />
                </tr>
              </tfoot>
            </table>
          </div>
          {afaStatus.zeilen.length > 8 && !alleAfaZeilen && afaStatus.zeilen.some(z => z.status === 'gebucht') && (
            <button type="button" onClick={() => setAlleAfaZeilen(true)} className="mt-2 text-xs text-hs-blue-700 hover:underline underline-offset-2">
              Alle {afaStatus.zeilen.length} Positionen anzeigen
            </button>
          )}

          {writeOk && (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <button onClick={afaBuchen} disabled={pending || afaBlockiert || zuBuchen.length === 0} className="btn-primary">
                <CalendarCheck size={15} strokeWidth={2} />
                {zuBuchen.length === 0 ? `AfA ${jahr} gebucht` : `AfA ${jahr} buchen (${zuBuchen.length})`}
              </button>
              {gebuchte.length > 0 && (
                <button onClick={afaZurueck} disabled={pending || afaBlockiert} className="btn-danger">
                  <RotateCcw size={14} strokeWidth={2} /> AfA-Buchungen {jahr} zurücknehmen
                </button>
              )}
              {afaStatus.komplett && (
                <Link href={`/buchhaltung?jahr=${jahr}`} className="text-xs text-hs-blue-700 hover:underline underline-offset-2 ml-auto">Buchungen {jahr} ansehen →</Link>
              )}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-hs-text-2 leading-relaxed">
        Halbjahresregel: bei Inbetriebnahme im zweiten Halbjahr (bzw. Ausscheiden im ersten Halbjahr) nur die halbe Jahres-AfA. Degressive AfA
        mit max. 30 % vom Restbuchwert, Wechsel auf linear sobald günstiger. Geringwertige Wirtschaftsgüter (bis 1.000 € netto) werden im Jahr
        der Anschaffung voll abgeschrieben. Die Anschaffung selbst bleibt als Buchung in einer Kategorie der Kontenklasse 0 erfasst – so stimmen
        Vorsteuer, Kontostand und der Export für den Steuerberater; das Reporting rechnet sie aus den Aufwendungen heraus.
      </p>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Anlage bearbeiten' : 'Anlage erfassen'} width="max-w-2xl">
        {form && (
          <form onSubmit={speichern} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="form-label">Zugehörige Buchung (Anschaffung)</label>
                <select value={form.transaktion_id} onChange={e => {
                  const b = kandidatenMap.get(e.target.value)
                  setForm(p => { if (!p) return p; const f = { ...p, transaktion_id: e.target.value }; if (b) uebernimmBuchung(f, b); return f })
                }} className="input">
                  <option value="">– keine Buchung zugeordnet –</option>
                  {formKandidaten.map(b => (
                    <option key={b.id} value={b.id}>{fmtDatum(b.datum)} · {b.beschreibung || b.kategorie} · {fmtEuro(b.betrag_netto)}</option>
                  ))}
                </select>
                <p className="text-[11.5px] text-hs-text-2 mt-1">Ausgaben in einer Kategorie der Kontenklasse 0 – die Auswahl belegt Datum, Kosten und Bezeichnung vor.</p>
              </div>
              <div className="sm:col-span-2">
                <label className="form-label">Bezeichnung *</label>
                <input value={form.bezeichnung} onChange={set('bezeichnung')} className="input" placeholder="z. B. Notebook ThinkPad X1" required autoFocus />
              </div>
              <div>
                <label className="form-label">Gruppe</label>
                <select value={form.gruppe} onChange={e => {
                  const g = ANLAGE_GRUPPEN.find(x => x.value === e.target.value)
                  setForm(p => p ? { ...p, gruppe: e.target.value as AnlageInput['gruppe'],
                    nutzungsdauer_jahre: p.id ? p.nutzungsdauer_jahre : String(g?.nutzungsdauer ?? 5),
                    konto_nr: p.id && p.konto_nr ? p.konto_nr : (g?.konto ?? p.konto_nr) } : p)
                }} className="input">
                  {ANLAGE_GRUPPEN.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Konto-Nr. (Kontenklasse 0)</label>
                <input value={form.konto_nr} onChange={set('konto_nr')} className="input font-mono" placeholder="z. B. 0620" maxLength={6} />
              </div>
              <div>
                <label className="form-label">Anschaffungsdatum *</label>
                <input type="date" value={form.anschaffungsdatum} onChange={set('anschaffungsdatum')} className="input" required />
              </div>
              <div>
                <label className="form-label">Anschaffungskosten netto (€) *</label>
                <input type="text" inputMode="decimal" value={form.anschaffungskosten} onChange={set('anschaffungskosten')} className="input font-mono" placeholder="0,00" required />
              </div>
              <div>
                <label className="form-label">AfA-Methode</label>
                <select value={form.methode} onChange={e => setForm(p => p ? { ...p, methode: e.target.value as AfaMethode } : p)} className="input">
                  {AFA_METHODEN.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              {form.methode === 'degressiv' ? (
                <div>
                  <label className="form-label">Degressiver Satz (% vom Restbuchwert, max. 30)</label>
                  <input type="text" inputMode="decimal" value={form.degressiv_satz} onChange={set('degressiv_satz')} className="input font-mono" />
                </div>
              ) : <div className="hidden sm:block" />}
              <div>
                <label className="form-label">Nutzungsdauer (Jahre)</label>
                <input type="number" min={1} max={60} value={form.methode === 'gwg' ? '1' : form.nutzungsdauer_jahre} onChange={set('nutzungsdauer_jahre')} className="input font-mono" disabled={form.methode === 'gwg'} />
                {form.methode === 'gwg' && <p className="text-[11.5px] text-hs-text-2 mt-1">GWG: Sofortabschreibung im Anschaffungsjahr (bis 1.000 € netto).</p>}
              </div>
              <div>
                <label className="form-label">Restwert (€)</label>
                <input type="text" inputMode="decimal" value={form.restwert} onChange={set('restwert')} className="input font-mono" disabled={form.methode === 'gwg'} />
              </div>
              <div>
                <label className="form-label">Lieferant</label>
                <input value={form.lieferant} onChange={set('lieferant')} className="input" />
              </div>
              <div>
                <label className="form-label">Belegnummer</label>
                <input value={form.belegnummer} onChange={set('belegnummer')} className="input" />
              </div>
              <div>
                <label className="form-label">Abgang am</label>
                <input type="date" value={form.abgang_datum} onChange={set('abgang_datum')} className="input" min={form.anschaffungsdatum} />
              </div>
              {form.abgang_datum ? (
                <div>
                  <label className="form-label">Abgangserlös netto (€)</label>
                  <input type="text" inputMode="decimal" value={form.abgang_erloes} onChange={set('abgang_erloes')} className="input font-mono" placeholder="0,00" />
                </div>
              ) : <div className="hidden sm:block" />}
              <div className="sm:col-span-2">
                <label className="form-label">Notizen</label>
                <textarea value={form.notizen} onChange={set('notizen')} rows={2} className="input resize-none" />
              </div>
            </div>
            {fehler && <p className="text-sm text-hs-err-fg">{fehler}</p>}
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={pending} className="btn-primary"><Check size={15} strokeWidth={2} /> {pending ? 'Speichern …' : 'Speichern'}</button>
              <button type="button" onClick={() => setForm(null)} className="btn-secondary"><X size={15} strokeWidth={1.75} /> Abbrechen</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
