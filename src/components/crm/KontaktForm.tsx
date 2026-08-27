'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SEGMENTE } from '@/lib/crm/types'
import type { KontaktRow } from '@/lib/crm/types'
import { createKontakt, updateKontakt } from '@/app/(dashboard)/crm/actions'
import { LAENDER, VORWAHLEN, SPRACHEN } from './crmUtils'

export type FirmaOption = { id: string; name: string }

/**
 * Anlegen/Bearbeiten eines Kontakts. Felder exakt lt. Migration 002 (kontakte).
 * onDone(id) wird nach erfolgreichem Speichern aufgerufen.
 */
export default function KontaktForm({
  initial, firmen = [], defaultFirmaId, defaultSegment, onDone, onCancel,
}: {
  initial?: KontaktRow | null
  firmen?: FirmaOption[]
  defaultFirmaId?: string | null
  defaultSegment?: string
  onDone: (id?: string) => void
  onCancel: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [isLead, setIsLead]   = useState(initial?.is_lead ?? true)
  const [land, setLand]       = useState(initial?.land ?? 'AT')
  const [fehler, setFehler]   = useState<string | null>(null)
  const v = (f: keyof KontaktRow) => (initial?.[f] ?? '') as string

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('is_lead', isLead ? 'true' : 'false')
    setFehler(null)
    startTransition(async () => {
      const res = initial ? await updateKontakt(initial.id, fd) : await createKontakt(fd)
      if (res?.error) { setFehler(res.error); return }
      router.refresh()
      onDone(res?.id)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fehler && <p className="text-sm text-hs-err-fg bg-hs-err-bg border border-hs-err/30 rounded-lg px-3 py-2">{fehler}</p>}

      {/* Lead / Kunde */}
      <div className="flex items-center justify-between bg-hs-bg border border-hs-line rounded-lg px-4 py-2.5">
        <div>
          <p className="text-sm font-semibold text-hs-text">{isLead ? 'Lead' : 'Kunde'}</p>
          <p className="text-xs text-hs-text-2">{isLead ? 'Interessent – noch kein Auftrag' : 'Bestehende Geschäftsbeziehung'}</p>
        </div>
        <button type="button" role="switch" aria-checked={!isLead} onClick={() => setIsLead(x => !x)}
          className={`relative w-10 h-5 rounded-full transition-colors ${isLead ? 'bg-hs-warn' : 'bg-hs-teal'}`}>
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isLead ? '' : 'translate-x-5'}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="form-label">Vorname</label>
          <input name="vorname" defaultValue={v('vorname')} className="input" autoFocus={!initial} />
        </div>
        <div>
          <label className="form-label">Nachname *</label>
          <input name="nachname" defaultValue={v('nachname')} required className="input" />
        </div>
        <div>
          <label className="form-label">Segment *</label>
          <select name="segment" defaultValue={initial?.segment ?? defaultSegment ?? 'weinbau'} required className="input">
            {SEGMENTE.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Firma</label>
          <select name="firma_id" defaultValue={initial?.firma_id ?? defaultFirmaId ?? ''} className="input">
            <option value="">– keine –</option>
            {firmen.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Position / Funktion</label>
          <input name="position" defaultValue={v('position')} placeholder="z.B. Betriebsleiter, Kellermeisterin" className="input" />
        </div>
        <div>
          <label className="form-label">E-Mail</label>
          <input name="email" type="email" defaultValue={v('email')} className="input" />
        </div>
        <div>
          <label className="form-label">Telefon</label>
          <div className="flex gap-1.5">
            <select name="telefon_vorwahl" defaultValue={initial?.telefon_vorwahl ?? '+43'} className="input w-24 flex-shrink-0 px-2">
              {VORWAHLEN.map(d => <option key={d.code} value={d.code}>{d.code} {d.iso}</option>)}
            </select>
            <input name="telefon" defaultValue={v('telefon')} className="input" />
          </div>
        </div>
        <div>
          <label className="form-label">Mobil</label>
          <div className="flex gap-1.5">
            <select name="mobil_vorwahl" defaultValue={initial?.mobil_vorwahl ?? '+43'} className="input w-24 flex-shrink-0 px-2">
              {VORWAHLEN.map(d => <option key={d.code} value={d.code}>{d.code} {d.iso}</option>)}
            </select>
            <input name="mobil" defaultValue={v('mobil')} className="input" />
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="form-label">Straße</label>
          <input name="strasse" defaultValue={v('strasse')} className="input" />
        </div>
        <div className="flex gap-2">
          <div className="w-24 flex-shrink-0">
            <label className="form-label">PLZ</label>
            <input name="plz" defaultValue={v('plz')} className="input" />
          </div>
          <div className="flex-1">
            <label className="form-label">Ort</label>
            <input name="ort" defaultValue={v('ort')} className="input" />
          </div>
        </div>
        <div>
          <label className="form-label">Land</label>
          <select name="land" value={land} onChange={e => setLand(e.target.value)} className="input">
            {LAENDER.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Geburtsdatum</label>
          <input name="geburtsdatum" type="date" defaultValue={v('geburtsdatum')} className="input" />
        </div>
        <div>
          <label className="form-label">Sprache</label>
          <select name="sprache" defaultValue={initial?.sprache ?? 'de'} className="input">
            {SPRACHEN.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="form-label">Interner Ansprechpartner</label>
          <input name="ansprechpartner_intern" defaultValue={v('ansprechpartner_intern')} placeholder="Wer betreut diesen Kontakt bei uns?" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="form-label">Notizen</label>
          <textarea name="notizen" defaultValue={v('notizen')} rows={3} className="input resize-none" />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Speichern …' : initial ? 'Speichern' : 'Kontakt anlegen'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">Abbrechen</button>
      </div>
    </form>
  )
}
