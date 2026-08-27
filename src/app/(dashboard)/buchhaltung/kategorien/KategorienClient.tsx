'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Download, Check, X } from 'lucide-react'
import { UST_SAETZE, typLabel, typPillKlasse, type KategorieOption } from '@/lib/ea/types'
import { speichereKategorie, setzeKategorieAktiv, standardkategorienUebernehmenAction, type KategorieInput } from '../actions'

type FormState = KategorieInput & { id?: string }

const LEER: FormState = { typ: 'ausgabe', name: '', konto_nr: null, ust_satz_std: 20, abzugsfaehig_pct: 100, sortierung: 0 }

export default function KategorienClient({ kategorien, writeOk, fehlendeVorlagen }: {
  kategorien: KategorieOption[]
  writeOk: boolean
  fehlendeVorlagen: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState<FormState | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [zeigeInaktive, setZeigeInaktive] = useState(false)

  const sichtbar = kategorien.filter(k => zeigeInaktive || k.aktiv)
  const einnahmen = sichtbar.filter(k => k.typ === 'einnahme' || k.typ === 'beides')
  const ausgaben  = sichtbar.filter(k => k.typ === 'ausgabe')
  const anzahlInaktiv = kategorien.filter(k => !k.aktiv).length

  function neu(typ: 'einnahme' | 'ausgabe' = 'ausgabe') {
    setFehler(null); setMeldung(null)
    setForm({ ...LEER, typ, sortierung: (Math.max(0, ...kategorien.map(k => k.sortierung)) + 10) })
  }
  function bearbeiten(k: KategorieOption) {
    setFehler(null); setMeldung(null)
    setForm({ id: k.id, typ: k.typ, name: k.name, konto_nr: k.konto_nr, ust_satz_std: k.ust_satz_std, abzugsfaehig_pct: k.abzugsfaehig_pct, sortierung: k.sortierung })
  }

  function speichern(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setFehler(null)
    startTransition(async () => {
      const { id, ...input } = form
      const res = await speichereKategorie(input, id)
      if (!res.ok) { setFehler(res.error); return }
      setForm(null); setMeldung(id ? 'Kategorie gespeichert.' : 'Kategorie angelegt.')
      router.refresh()
    })
  }

  function aktivSetzen(k: KategorieOption, aktiv: boolean) {
    setFehler(null)
    startTransition(async () => {
      const res = await setzeKategorieAktiv(k.id, aktiv)
      if (!res.ok) { setFehler(res.error); return }
      router.refresh()
    })
  }

  function vorlageUebernehmen() {
    setFehler(null); setMeldung(null)
    startTransition(async () => {
      const res = await standardkategorienUebernehmenAction()
      if (!res.ok) { setFehler(res.error); return }
      setMeldung(res.data?.neu ? `${res.data.neu} Standardkategorie${res.data.neu === 1 ? '' : 'n'} übernommen.` : 'Alle Standardkategorien sind bereits vorhanden.')
      router.refresh()
    })
  }

  function Zeile({ k }: { k: KategorieOption }) {
    return (
      <tr className={`border-b border-hs-line last:border-0 ${k.aktiv ? 'hover:bg-hs-bg/60' : 'opacity-50'}`}>
        <td className="px-4 py-2 font-mono tabular-nums text-hs-text-2 text-[13px]">{k.konto_nr ?? '–'}</td>
        <td className="px-4 py-2 font-medium">{k.name}{!k.aktiv && <span className="pill bg-hs-bg text-hs-text-2 ml-2">inaktiv</span>}</td>
        <td className="px-4 py-2"><span className={typPillKlasse(k.typ)}>{typLabel(k.typ)}</span></td>
        <td className="px-4 py-2 betrag text-hs-text-2 text-[13px]">{k.ust_satz_std} %</td>
        <td className="px-4 py-2 text-right">
          {k.abzugsfaehig_pct < 100
            ? <span className="pill bg-hs-warn-bg text-hs-warn-fg">{k.abzugsfaehig_pct} %</span>
            : <span className="text-hs-tertiary text-[13px] font-mono">100 %</span>}
        </td>
        <td className="px-4 py-2 font-mono tabular-nums text-hs-tertiary text-[12px] text-right hidden md:table-cell">{k.sortierung}</td>
        <td className="px-3 py-2">
          {writeOk && (
            <div className="flex items-center justify-end gap-1">
              <button type="button" onClick={() => bearbeiten(k)} title="Bearbeiten"
                className="p-1.5 rounded-md text-hs-text-2 hover:text-hs-blue-700 hover:bg-hs-blue-50">
                <Pencil size={15} strokeWidth={1.75} />
              </button>
              <button type="button" disabled={pending} onClick={() => aktivSetzen(k, !k.aktiv)}
                className="text-xs text-hs-text-2 hover:text-hs-text px-1.5 py-1 rounded-md hover:bg-hs-bg">
                {k.aktiv ? 'Deaktivieren' : 'Aktivieren'}
              </button>
            </div>
          )}
        </td>
      </tr>
    )
  }

  function Tabelle({ titel, rows, typ }: { titel: string; rows: KategorieOption[]; typ: 'einnahme' | 'ausgabe' }) {
    return (
      <div className="card !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-hs-line flex items-center justify-between">
          <h2 className="text-sm font-semibold">{titel} <span className="text-hs-text-2 font-normal">({rows.length})</span></h2>
          {writeOk && <button type="button" onClick={() => neu(typ)} className="text-xs text-hs-blue-700 hover:underline inline-flex items-center gap-1"><Plus size={13} strokeWidth={2} /> Neu</button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="text-left px-4 py-2">Konto</th>
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-left px-4 py-2">Typ</th>
                <th className="text-right px-4 py-2">USt</th>
                <th className="text-right px-4 py-2">Abzugsfähig</th>
                <th className="text-right px-4 py-2 hidden md:table-cell">Sort.</th>
                <th className="px-3 py-2 w-40" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-hs-text-2">Keine Kategorien.</td></tr>}
              {rows.map(k => <Zeile key={k.id} k={k} />)}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          {anzahlInaktiv > 0 && (
            <label className="inline-flex items-center gap-1.5 text-hs-text-2 cursor-pointer">
              <input type="checkbox" checked={zeigeInaktive} onChange={e => setZeigeInaktive(e.target.checked)} className="accent-hs-teal" />
              Inaktive anzeigen ({anzahlInaktiv})
            </label>
          )}
        </div>
        {writeOk && (
          <div className="flex items-center gap-2">
            {fehlendeVorlagen > 0 && (
              <button type="button" onClick={vorlageUebernehmen} disabled={pending} className="btn-secondary">
                <Download size={15} strokeWidth={1.75} /> {kategorien.length === 0 ? 'Standardkategorien übernehmen' : `${fehlendeVorlagen} fehlende Standardkategorien ergänzen`}
              </button>
            )}
            <button type="button" onClick={() => neu()} className="btn-primary"><Plus size={16} strokeWidth={2} /> Kategorie</button>
          </div>
        )}
      </div>

      {meldung && <p className="text-sm text-hs-ok-fg inline-flex items-center gap-1"><Check size={14} strokeWidth={2.25} />{meldung}</p>}
      {fehler && <p className="text-sm text-hs-err-fg inline-flex items-center gap-1"><X size={14} strokeWidth={2.25} />{fehler}</p>}

      {form && (
        <form onSubmit={speichern} className="card space-y-4 border-hs-blue-300">
          <h2 className="text-base">{form.id ? 'Kategorie bearbeiten' : 'Neue Kategorie'}</h2>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="md:col-span-2">
              <label className="form-label">Name *</label>
              <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" placeholder="z. B. Beratungshonorare" />
            </div>
            <div>
              <label className="form-label">Typ *</label>
              <select value={form.typ} onChange={e => setForm({ ...form, typ: e.target.value as FormState['typ'] })} className="input">
                <option value="einnahme">Einnahme</option>
                <option value="ausgabe">Ausgabe</option>
                <option value="beides">Beides</option>
              </select>
            </div>
            <div>
              <label className="form-label">Konto-Nr. (EKR)</label>
              <input type="number" min={0} max={9999} value={form.konto_nr ?? ''} placeholder="z. B. 4000"
                onChange={e => setForm({ ...form, konto_nr: e.target.value === '' ? null : Number(e.target.value) })} className="input font-mono" />
            </div>
            <div>
              <label className="form-label">USt-Satz</label>
              <select value={form.ust_satz_std} onChange={e => setForm({ ...form, ust_satz_std: Number(e.target.value) })} className="input">
                {UST_SAETZE.map(u => <option key={u.value} value={u.value}>{u.value} %</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Abzugsfähig %</label>
              <input type="number" min={0} max={100} step={1} value={form.abzugsfaehig_pct}
                onChange={e => setForm({ ...form, abzugsfaehig_pct: Number(e.target.value) })} className="input font-mono text-right" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
            <div>
              <label className="form-label">Sortierung</label>
              <input type="number" value={form.sortierung} onChange={e => setForm({ ...form, sortierung: Number(e.target.value) })} className="input font-mono text-right" />
            </div>
            <p className="md:col-span-5 text-xs text-hs-text-2">
              Abzugsfähig unter 100 % bei gesetzlich beschränkt abzugsfähigen Ausgaben (z. B. 50 % Bewirtung/Repräsentation, § 20 EStG) – der Prozentsatz wird beim Buchen vorbelegt und gilt auch für die Vorsteuer.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending} className="btn-primary">{pending ? 'Speichern …' : 'Speichern'}</button>
            <button type="button" onClick={() => setForm(null)} className="btn-secondary">Abbrechen</button>
          </div>
        </form>
      )}

      {kategorien.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-sm text-hs-text-2">Noch keine Kategorien angelegt.</p>
          {writeOk && (
            <button type="button" onClick={vorlageUebernehmen} disabled={pending} className="btn-primary mt-3">
              <Download size={16} strokeWidth={1.75} /> Standardkategorien übernehmen
            </button>
          )}
        </div>
      ) : (
        <>
          <Tabelle titel="Einnahmen" rows={einnahmen} typ="einnahme" />
          <Tabelle titel="Ausgaben" rows={ausgaben} typ="ausgabe" />
        </>
      )}
    </div>
  )
}
