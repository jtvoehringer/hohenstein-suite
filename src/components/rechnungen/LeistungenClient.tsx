'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import Modal from '@/components/crm/Modal'
import { fmtEuroMitZeichen } from '@/lib/format'
import { EINHEITEN, UST_SAETZE_FAKT, type LeistungInput, type LeistungRow } from '@/lib/rechnungen/types'
import { speichereLeistung, setzeLeistungAktiv, loescheLeistung } from '@/app/(dashboard)/rechnungen/actions'

type KategorieOpt = { id: string; name: string }
type FormState = LeistungInput & { id?: string }

const LEER: FormState = { bezeichnung: '', beschreibung: null, einheit: 'Tag', preis_netto: 0, ust_satz: 20, ea_kategorie_id: null, aktiv: true, sortierung: 0 }

export default function LeistungenClient({ leistungen, kategorien, writeOk }: {
  leistungen: LeistungRow[]
  kategorien: KategorieOpt[]
  writeOk: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState<FormState | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [zeigeInaktive, setZeigeInaktive] = useState(false)

  const sichtbar = leistungen.filter(l => zeigeInaktive || l.aktiv)
  const anzahlInaktiv = leistungen.filter(l => !l.aktiv).length
  const katName = (id: string | null) => kategorien.find(k => k.id === id)?.name ?? null

  function neu() {
    setFehler(null)
    setForm({ ...LEER, sortierung: Math.max(0, ...leistungen.map(l => l.sortierung)) + 10 })
  }
  function bearbeiten(l: LeistungRow) {
    setFehler(null)
    setForm({ id: l.id, bezeichnung: l.bezeichnung, beschreibung: l.beschreibung, einheit: l.einheit, preis_netto: l.preis_netto, ust_satz: l.ust_satz, ea_kategorie_id: l.ea_kategorie_id, aktiv: l.aktiv, sortierung: l.sortierung })
  }
  function speichern(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setFehler(null)
    startTransition(async () => {
      const { id, ...input } = form
      const res = await speichereLeistung(input, id)
      if (!res.ok) { setFehler(res.error); return }
      setForm(null)
      router.refresh()
    })
  }
  function aktivSetzen(l: LeistungRow, aktiv: boolean) {
    setFehler(null)
    startTransition(async () => {
      const res = await setzeLeistungAktiv(l.id, aktiv)
      if (!res.ok) { setFehler(res.error); return }
      router.refresh()
    })
  }
  function loeschen(l: LeistungRow) {
    if (!confirm(`„${l.bezeichnung}" endgültig löschen? Bestehende Belegpositionen bleiben erhalten.`)) return
    setFehler(null)
    startTransition(async () => {
      const res = await loescheLeistung(l.id)
      if (!res.ok) { setFehler(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {fehler && <div className="rounded-lg border border-hs-err/40 bg-hs-err-bg text-hs-err-fg text-sm px-4 py-3">{fehler}</div>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs text-hs-text-2 inline-flex items-center gap-2">
          <input type="checkbox" checked={zeigeInaktive} onChange={e => setZeigeInaktive(e.target.checked)} />
          Inaktive anzeigen{anzahlInaktiv ? ` (${anzahlInaktiv})` : ''}
        </label>
        {writeOk && <button type="button" onClick={neu} className="btn-primary"><Plus size={16} strokeWidth={2} /> Leistung</button>}
      </div>

      {sichtbar.length === 0 ? (
        <div className="card text-sm text-hs-text-2">
          Noch keine Leistungen im Katalog.{writeOk && <> <button type="button" onClick={neu} className="text-hs-blue-700 hover:underline">Erste Leistung anlegen</button></>}
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-2.5 text-left">Bezeichnung</th>
                  <th className="px-4 py-2.5 text-left hidden md:table-cell">Einheit</th>
                  <th className="px-4 py-2.5 text-right">Netto</th>
                  <th className="px-4 py-2.5 text-right hidden sm:table-cell">USt</th>
                  <th className="px-4 py-2.5 text-left hidden lg:table-cell">E&A-Kategorie</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {sichtbar.map(l => (
                  <tr key={l.id} className={`border-b border-hs-line last:border-0 ${l.aktiv ? 'hover:bg-hs-bg/60' : 'opacity-50'}`}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{l.bezeichnung}{!l.aktiv && <span className="pill bg-hs-bg text-hs-text-2 ml-2">inaktiv</span>}</p>
                      {l.beschreibung && <p className="text-xs text-hs-text-2 truncate max-w-md">{l.beschreibung}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-hs-text-2 hidden md:table-cell">{l.einheit}</td>
                    <td className="px-4 py-2.5 betrag font-medium">{fmtEuroMitZeichen(l.preis_netto)}</td>
                    <td className="px-4 py-2.5 betrag text-hs-text-2 hidden sm:table-cell">{l.ust_satz} %</td>
                    <td className="px-4 py-2.5 text-hs-text-2 hidden lg:table-cell">{katName(l.ea_kategorie_id) ?? <span className="text-hs-tertiary">Standard</span>}</td>
                    <td className="px-3 py-2.5">
                      {writeOk && (
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => bearbeiten(l)} title="Bearbeiten" className="p-1.5 rounded-md text-hs-text-2 hover:text-hs-blue-700 hover:bg-hs-blue-50"><Pencil size={15} strokeWidth={1.75} /></button>
                          <button type="button" disabled={pending} onClick={() => aktivSetzen(l, !l.aktiv)} className="text-xs text-hs-text-2 hover:text-hs-text px-1.5 py-1 rounded-md hover:bg-hs-bg">
                            {l.aktiv ? 'Deaktivieren' : 'Aktivieren'}
                          </button>
                          <button type="button" disabled={pending} onClick={() => loeschen(l)} title="Löschen" className="p-1.5 rounded-md text-hs-text-2 hover:text-hs-err-fg hover:bg-hs-err-bg"><Trash2 size={15} strokeWidth={1.75} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Leistung bearbeiten' : 'Leistung anlegen'}>
        {form && (
          <form onSubmit={speichern} className="space-y-3">
            <div>
              <label className="form-label">Bezeichnung *</label>
              <input className="input" value={form.bezeichnung} onChange={e => setForm({ ...form, bezeichnung: e.target.value })} required autoFocus />
            </div>
            <div>
              <label className="form-label">Beschreibung (erscheint am Beleg)</label>
              <textarea className="input" rows={2} value={form.beschreibung ?? ''} onChange={e => setForm({ ...form, beschreibung: e.target.value || null })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="form-label">Einheit</label>
                <select className="input" value={form.einheit} onChange={e => setForm({ ...form, einheit: e.target.value })}>
                  {EINHEITEN.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Preis netto *</label>
                <input type="number" step="0.01" min={0} className="input text-right" value={form.preis_netto} onChange={e => setForm({ ...form, preis_netto: Number(e.target.value) })} required />
              </div>
              <div>
                <label className="form-label">USt</label>
                <select className="input" value={form.ust_satz} onChange={e => setForm({ ...form, ust_satz: Number(e.target.value) })}>
                  {UST_SAETZE_FAKT.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <div>
                <label className="form-label">E&A-Kategorie</label>
                <select className="input" value={form.ea_kategorie_id ?? ''} onChange={e => setForm({ ...form, ea_kategorie_id: e.target.value || null })}>
                  <option value="">Standard (Beratungshonorare)</option>
                  {kategorien.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Sortierung</label>
                <input type="number" className="input text-right" value={form.sortierung} onChange={e => setForm({ ...form, sortierung: Number(e.target.value) })} />
              </div>
            </div>
            <label className="text-sm inline-flex items-center gap-2">
              <input type="checkbox" checked={form.aktiv} onChange={e => setForm({ ...form, aktiv: e.target.checked })} /> Aktiv
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn-secondary" onClick={() => setForm(null)}>Abbrechen</button>
              <button type="submit" disabled={pending} className="btn-primary">{pending ? 'Speichern …' : 'Speichern'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
