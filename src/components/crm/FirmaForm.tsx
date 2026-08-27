'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SEGMENTE } from '@/lib/crm/types'
import type { FirmaRow } from '@/lib/crm/types'
import { createFirma, updateFirma } from '@/app/(dashboard)/crm/actions'
import { LAENDER, VORWAHLEN } from './crmUtils'

/** Anlegen/Bearbeiten einer Firma. Felder exakt lt. Migration 002 (firmen). */
export default function FirmaForm({
  initial, defaultSegment, onDone, onCancel,
}: {
  initial?: FirmaRow | null
  defaultSegment?: string
  onDone: (id?: string) => void
  onCancel: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [isLead, setIsLead]             = useState(initial?.is_lead ?? true)
  const [istKunde, setIstKunde]         = useState(initial?.ist_kunde ?? true)
  const [istLieferant, setIstLieferant] = useState(initial?.ist_lieferant ?? false)
  const [fehler, setFehler]             = useState<string | null>(null)
  const v = (f: keyof FirmaRow) => (initial?.[f] ?? '') as string

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('is_lead', isLead ? 'true' : 'false')
    fd.set('ist_kunde', istKunde ? 'true' : 'false')
    fd.set('ist_lieferant', istLieferant ? 'true' : 'false')
    setFehler(null)
    startTransition(async () => {
      const res = initial ? await updateFirma(initial.id, fd) : await createFirma(fd)
      if (res?.error) { setFehler(res.error); return }
      router.refresh()
      onDone(res?.id)
    })
  }

  const check = 'accent-hs-teal w-4 h-4'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fehler && <p className="text-sm text-hs-err-fg bg-hs-err-bg border border-hs-err/30 rounded-lg px-3 py-2">{fehler}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="form-label">Firmenname *</label>
          <input name="name" defaultValue={v('name')} required className="input" autoFocus={!initial} />
        </div>
        <div>
          <label className="form-label">Segment *</label>
          <select name="segment" defaultValue={initial?.segment ?? defaultSegment ?? 'weinbau'} required className="input">
            {SEGMENTE.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">UID-Nummer</label>
          <input name="uid_nummer" defaultValue={v('uid_nummer')} placeholder="ATU12345678" className="input" />
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
          <select name="land" defaultValue={initial?.land ?? 'AT'} className="input">
            {LAENDER.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
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
          <label className="form-label">E-Mail</label>
          <input name="email" type="email" defaultValue={v('email')} className="input" />
        </div>
        <div>
          <label className="form-label">Website</label>
          <input name="website" defaultValue={v('website')} placeholder="https://" className="input" />
        </div>
        <div>
          <label className="form-label">Zahlungsziel (Tage)</label>
          <input name="zahlungsziel_tage" type="number" min={0} max={365} defaultValue={initial?.zahlungsziel_tage ?? 14} className="input" />
        </div>
        <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-2 bg-hs-bg border border-hs-line rounded-lg px-4 py-3">
          <label className="flex items-center gap-2 text-sm text-hs-text cursor-pointer">
            <input type="checkbox" checked={isLead} onChange={e => setIsLead(e.target.checked)} className={check} />
            Lead (Interessent)
          </label>
          <label className="flex items-center gap-2 text-sm text-hs-text cursor-pointer">
            <input type="checkbox" checked={istKunde} onChange={e => setIstKunde(e.target.checked)} className={check} />
            Kunde
          </label>
          <label className="flex items-center gap-2 text-sm text-hs-text cursor-pointer">
            <input type="checkbox" checked={istLieferant} onChange={e => setIstLieferant(e.target.checked)} className={check} />
            Lieferant
          </label>
        </div>
        <div className="sm:col-span-2">
          <label className="form-label">Notizen</label>
          <textarea name="notizen" defaultValue={v('notizen')} rows={3} className="input resize-none" />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Speichern …' : initial ? 'Speichern' : 'Firma anlegen'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">Abbrechen</button>
      </div>
    </form>
  )
}
