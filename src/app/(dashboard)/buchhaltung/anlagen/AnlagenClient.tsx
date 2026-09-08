'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Check, X, Landmark } from 'lucide-react'
import { fmtEuro, fmtDatum } from '@/lib/format'
import { ANLAGE_GRUPPEN, afaZumStichtag, gruppeLabel, type AnlageRow, type AnlageInput } from '@/lib/ea/anlagen'
import Modal from '@/components/crm/Modal'
import { speichereAnlage, loescheAnlage } from '../actions'

type FormState = {
  id?: string
  bezeichnung: string
  gruppe: AnlageInput['gruppe']
  anschaffungsdatum: string
  anschaffungskosten: string
  nutzungsdauer_jahre: string
  sofortabschreibung: boolean
  restwert: string
  abgang_datum: string
  abgang_erloes: string
  lieferant: string
  belegnummer: string
  notizen: string
}

export default function AnlagenClient({ anlagen, heute, writeOk }: { anlagen: AnlageRow[]; heute: string; writeOk: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState<FormState | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [zeigeAbgaenge, setZeigeAbgaenge] = useState(false)

  const zeilen = useMemo(() => anlagen.map(a => ({ a, afa: afaZumStichtag(a, heute) })), [anlagen, heute])
  const sichtbar = zeilen.filter(z => zeigeAbgaenge || z.afa.imBestand || z.a.anschaffungsdatum > heute)
  const anzahlAbgaenge = zeilen.filter(z => !z.afa.imBestand && z.a.abgang_datum).length
  const summen = zeilen.filter(z => z.afa.imBestand).reduce((s, z) => ({
    ak: s.ak + z.a.anschaffungskosten, afaJahr: s.afaJahr + z.afa.afaJahr, buchwert: s.buchwert + z.afa.buchwert,
  }), { ak: 0, afaJahr: 0, buchwert: 0 })

  function neu() {
    setFehler(null)
    setForm({ bezeichnung: '', gruppe: 'edv', anschaffungsdatum: heute, anschaffungskosten: '', nutzungsdauer_jahre: '3',
      sofortabschreibung: false, restwert: '0', abgang_datum: '', abgang_erloes: '', lieferant: '', belegnummer: '', notizen: '' })
  }
  function bearbeiten(a: AnlageRow) {
    setFehler(null)
    setForm({ id: a.id, bezeichnung: a.bezeichnung, gruppe: a.gruppe, anschaffungsdatum: a.anschaffungsdatum,
      anschaffungskosten: String(a.anschaffungskosten), nutzungsdauer_jahre: String(a.nutzungsdauer_jahre),
      sofortabschreibung: a.sofortabschreibung, restwert: String(a.restwert), abgang_datum: a.abgang_datum ?? '',
      abgang_erloes: a.abgang_erloes == null ? '' : String(a.abgang_erloes), lieferant: a.lieferant ?? '',
      belegnummer: a.belegnummer ?? '', notizen: a.notizen ?? '' })
  }

  function speichern(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    const { id, ...f } = form
    const input: AnlageInput = {
      bezeichnung: f.bezeichnung, gruppe: f.gruppe, anschaffungsdatum: f.anschaffungsdatum,
      anschaffungskosten: Number(String(f.anschaffungskosten).replace(',', '.')),
      nutzungsdauer_jahre: Number(f.nutzungsdauer_jahre), sofortabschreibung: f.sofortabschreibung,
      restwert: Number(String(f.restwert).replace(',', '.')) || 0,
      abgang_datum: f.abgang_datum || null,
      abgang_erloes: f.abgang_datum && f.abgang_erloes !== '' ? Number(String(f.abgang_erloes).replace(',', '.')) : null,
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
    if (!confirm(`Anlage „${a.bezeichnung}" wirklich aus dem Verzeichnis löschen? (Bei Verkauf/Ausscheiden besser einen Abgang eintragen.)`)) return
    startTransition(async () => {
      const res = await loescheAnlage(a.id)
      if (!res.ok) { setFehler(res.error); return }
      router.refresh()
    })
  }

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => prev ? { ...prev, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value } : prev)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card py-3"><p className="overline">Anschaffungskosten (Bestand)</p><p className="text-xl font-semibold text-hs-text tabular-nums">{fmtEuro(summen.ak)}</p></div>
        <div className="card py-3"><p className="overline">AfA {heute.slice(0, 4)}</p><p className="text-xl font-semibold text-hs-text tabular-nums">{fmtEuro(summen.afaJahr)}</p></div>
        <div className="card py-3"><p className="overline">Buchwert per {fmtDatum(heute)}</p><p className="text-xl font-semibold text-hs-blue-700 tabular-nums">{fmtEuro(summen.buchwert)}</p></div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="flex items-center gap-1.5 text-sm text-hs-text-1 cursor-pointer">
          <input type="checkbox" checked={zeigeAbgaenge} onChange={e => setZeigeAbgaenge(e.target.checked)} className="accent-hs-teal" />
          Abgänge anzeigen {anzahlAbgaenge > 0 && `(${anzahlAbgaenge})`}
        </label>
        {writeOk && <button onClick={neu} className="btn-primary"><Plus size={15} strokeWidth={2} /> Anlage erfassen</button>}
      </div>
      {fehler && <p className="text-sm text-hs-err-fg bg-hs-err-bg border border-hs-err/30 rounded-lg px-3 py-2">{fehler}</p>}

      <div className="bg-white rounded-xl border border-hs-line overflow-hidden">
        {sichtbar.length === 0 ? (
          <div className="p-8 text-center text-sm text-hs-text-2 flex flex-col items-center gap-2">
            <Landmark size={26} strokeWidth={1.5} className="text-hs-tertiary" />
            Noch keine Anlagen erfasst – z. B. Notebooks, Büroausstattung oder Software-Lizenzen über 1.000 €.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="text-left px-4 py-2">Anlage</th>
                  <th className="text-left px-4 py-2 hidden md:table-cell">Gruppe</th>
                  <th className="text-left px-4 py-2">Anschaffung</th>
                  <th className="text-right px-4 py-2">AK</th>
                  <th className="text-center px-4 py-2 hidden sm:table-cell">ND</th>
                  <th className="text-right px-4 py-2 hidden lg:table-cell">AfA {heute.slice(0, 4)}</th>
                  <th className="text-right px-4 py-2 hidden lg:table-cell">AfA kum.</th>
                  <th className="text-right px-4 py-2">Buchwert</th>
                  <th className="px-2 py-2 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-hs-line">
                {sichtbar.map(({ a, afa }) => (
                  <tr key={a.id} className={`hover:bg-hs-bg/70 ${!afa.imBestand ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-2">
                      <div className="font-medium text-hs-text">{a.bezeichnung}</div>
                      <div className="text-xs text-hs-text-2">{[a.lieferant, a.belegnummer].filter(Boolean).join(' · ')}
                        {a.abgang_datum && <span className="ml-1 pill bg-gray-100 text-gray-700">Abgang {fmtDatum(a.abgang_datum)}</span>}
                        {a.sofortabschreibung && <span className="ml-1 pill bg-hs-blue-50 text-hs-blue-700">GWG</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2 hidden md:table-cell text-hs-text-1">{gruppeLabel(a.gruppe)}</td>
                    <td className="px-4 py-2 text-hs-text-1 tabular-nums">{fmtDatum(a.anschaffungsdatum)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtEuro(a.anschaffungskosten)}</td>
                    <td className="px-4 py-2 text-center hidden sm:table-cell text-hs-text-1">{a.sofortabschreibung ? '–' : `${a.nutzungsdauer_jahre} J.`}</td>
                    <td className="px-4 py-2 text-right tabular-nums hidden lg:table-cell text-hs-text-1">{fmtEuro(afa.afaJahr)}</td>
                    <td className="px-4 py-2 text-right tabular-nums hidden lg:table-cell text-hs-text-1">{fmtEuro(afa.afaKumuliert)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-hs-text">{fmtEuro(afa.buchwert)}</td>
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

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Anlage bearbeiten' : 'Anlage erfassen'} width="max-w-2xl">
        {form && (
          <form onSubmit={speichern} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="form-label">Bezeichnung *</label>
                <input value={form.bezeichnung} onChange={set('bezeichnung')} className="input" placeholder="z. B. Notebook ThinkPad X1" required autoFocus />
              </div>
              <div>
                <label className="form-label">Gruppe</label>
                <select value={form.gruppe} onChange={e => {
                  const g = ANLAGE_GRUPPEN.find(x => x.value === e.target.value)
                  setForm(p => p ? { ...p, gruppe: e.target.value as AnlageInput['gruppe'], nutzungsdauer_jahre: p.id ? p.nutzungsdauer_jahre : String(g?.nutzungsdauer ?? 5) } : p)
                }} className="input">
                  {ANLAGE_GRUPPEN.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
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
                <label className="form-label">Nutzungsdauer (Jahre)</label>
                <input type="number" min={0} max={60} value={form.nutzungsdauer_jahre} onChange={set('nutzungsdauer_jahre')} className="input font-mono" disabled={form.sofortabschreibung} />
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm text-hs-text-1 cursor-pointer">
                  <input type="checkbox" checked={form.sofortabschreibung} onChange={set('sofortabschreibung')} className="accent-hs-teal" />
                  Sofortabschreibung (geringwertiges Wirtschaftsgut, bis 1.000 € netto)
                </label>
              </div>
              <div>
                <label className="form-label">Restwert (€)</label>
                <input type="text" inputMode="decimal" value={form.restwert} onChange={set('restwert')} className="input font-mono" />
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
              {form.abgang_datum && (
                <div>
                  <label className="form-label">Abgangserlös (€)</label>
                  <input type="text" inputMode="decimal" value={form.abgang_erloes} onChange={set('abgang_erloes')} className="input font-mono" placeholder="0,00" />
                </div>
              )}
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
