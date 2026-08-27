'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PIPELINE_STUFEN, PIPELINE_KATEGORIEN } from '@/lib/crm/types'
import type { PipelineRow } from '@/lib/crm/types'
import { createPipelineEintrag, updatePipelineEintrag } from '@/app/(dashboard)/crm/actions'
import KundenSuche from './KundenSuche'

export type Option = { id: string; name: string; sub?: string | null }

/**
 * Verkaufschance anlegen/bearbeiten. Kontakt/Firma per Typeahead – bei fixer
 * Zuordnung (Detailseite) über `fixKontaktId`/`fixFirmaId` vorbelegen.
 */
export default function PipelineForm({
  initial, kontakte, firmen, fixKontaktId, fixFirmaId, defaultStufe, onDone, onCancel,
}: {
  initial?: PipelineRow | null
  kontakte: Option[]
  firmen: Option[]
  fixKontaktId?: string | null
  fixFirmaId?: string | null
  defaultStufe?: string
  onDone: (id?: string) => void
  onCancel: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [ganztags, setGanztags]   = useState(initial?.ganztags ?? true)
  const [kontaktId, setKontaktId] = useState(initial?.kontakt_id ?? fixKontaktId ?? '')
  const [firmaId, setFirmaId]     = useState(initial?.firma_id ?? fixFirmaId ?? '')
  const [fehler, setFehler]       = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('ganztags', ganztags ? 'true' : 'false')
    fd.set('kontakt_id', kontaktId)
    fd.set('firma_id', firmaId)
    setFehler(null)
    startTransition(async () => {
      const res = initial ? await updatePipelineEintrag(initial.id, fd) : await createPipelineEintrag(fd)
      if (res?.error) { setFehler(res.error); return }
      router.refresh()
      onDone(res?.id)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fehler && <p className="text-sm text-hs-err-fg bg-hs-err-bg border border-hs-err/30 rounded-lg px-3 py-2">{fehler}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="form-label">Titel *</label>
          <input name="titel" defaultValue={initial?.titel ?? ''} required autoFocus
            placeholder="z.B. software:112 Einführung – Weingut Muster" className="input" />
        </div>
        <div>
          <label className="form-label">Stufe *</label>
          <select name="stufe" defaultValue={initial?.stufe ?? defaultStufe ?? 'interessent'} required className="input">
            {PIPELINE_STUFEN.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Kategorie</label>
          <select name="kategorie" defaultValue={initial?.kategorie ?? ''} className="input">
            <option value="">– keine –</option>
            {PIPELINE_KATEGORIEN.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Kontakt</label>
          <KundenSuche items={kontakte.map(k => ({ id: k.id, label: k.name, sub: k.sub }))}
            value={kontaktId} onChange={setKontaktId} placeholder="Name suchen …" />
        </div>
        <div>
          <label className="form-label">Firma</label>
          <KundenSuche items={firmen.map(f => ({ id: f.id, label: f.name, sub: f.sub }))}
            value={firmaId} onChange={setFirmaId} placeholder="Firma suchen …" />
        </div>
        <div>
          <label className="form-label">Wert (€)</label>
          <input name="wert_euro" type="number" min={0} step="0.01" defaultValue={initial?.wert_euro ?? ''} placeholder="z.B. 2400" className="input" />
        </div>
        <div>
          <label className="form-label">Wahrscheinlichkeit (%)</label>
          <input name="wahrscheinlichkeit" type="number" min={0} max={100} step={5} defaultValue={initial?.wahrscheinlichkeit ?? ''} placeholder="z.B. 60" className="input" />
        </div>
        <div>
          <label className="form-label">Erwarteter Abschluss</label>
          <input name="erwartetes_datum" type="date" defaultValue={initial?.erwartetes_datum ?? ''} className="input" />
        </div>
        <div>
          <label className="form-label">Uhrzeit</label>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-sm text-hs-text-1 cursor-pointer select-none">
              <input type="checkbox" checked={ganztags} onChange={e => setGanztags(e.target.checked)} className="accent-hs-teal" />
              Ganztags
            </label>
            {!ganztags && (
              <>
                <input name="uhrzeit_von" type="time" step={900} defaultValue={initial?.uhrzeit_von?.slice(0, 5) ?? ''} className="input w-24 py-1" />
                <span className="text-hs-text-2 text-xs">–</span>
                <input name="uhrzeit_bis" type="time" step={900} defaultValue={initial?.uhrzeit_bis?.slice(0, 5) ?? ''} className="input w-24 py-1" />
              </>
            )}
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="form-label">Notizen</label>
          <textarea name="notizen" defaultValue={initial?.notizen ?? ''} rows={3} className="input resize-none" />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Speichern …' : initial ? 'Speichern' : 'Chance anlegen'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">Abbrechen</button>
      </div>
    </form>
  )
}
