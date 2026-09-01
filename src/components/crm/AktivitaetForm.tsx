'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import { AKTIVITAET_ARTEN } from '@/lib/crm/types'
import { heuteIso } from '@/lib/format'
import { createAktivitaet, updateAktivitaet } from '@/app/(dashboard)/crm/actions'
import WiederholungFelder from './WiederholungFelder'
import type { AktivitaetMitDokumenten } from './crmUtils'

/**
 * Aktivität anlegen/bearbeiten (Detailseiten Kontakt/Firma).
 * Bei Neuanlage wird kontaktId/firmaId fix gesetzt; „E-Mail" ist nur bei bestehenden E-Mail-Einträgen wählbar.
 */
export default function AktivitaetForm({
  initial, kontaktId, firmaId, onDone, onCancel, compact = false,
}: {
  initial?: AktivitaetMitDokumenten | null
  kontaktId?: string | null
  firmaId?: string | null
  onDone: () => void
  onCancel: () => void
  compact?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [ganztags, setGanztags] = useState(initial?.ganztags ?? true)
  const [fehler, setFehler]     = useState<string | null>(null)
  const heute = heuteIso()
  const datumInitial = initial?.datum ?? heute
  const [datum, setDatum] = useState(datumInitial)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('ganztags', ganztags ? 'true' : 'false')
    fd.set('erledigt', fd.get('erledigt_check') === 'on' ? 'true' : 'false')
    fd.set('ist_privat', fd.get('privat_check') === 'on' ? 'true' : 'false')
    if (!initial) {
      if (kontaktId) fd.set('kontakt_id', kontaktId)
      if (firmaId)   fd.set('firma_id', firmaId)
    }
    setFehler(null)
    startTransition(async () => {
      const res = initial ? await updateAktivitaet(initial.id, fd) : await createAktivitaet(fd)
      if (res?.error) { setFehler(res.error); return }
      router.refresh()
      onDone()
    })
  }

  const arten = AKTIVITAET_ARTEN.filter(a => a.value !== 'email' || initial?.art === 'email')
  // Log-Einträge in der Vergangenheit sind standardmäßig „erledigt", künftige Termine offen
  const erledigtDefault = initial ? initial.erledigt : datum <= heute

  return (
    <form onSubmit={handleSubmit} className={`space-y-3 ${compact ? '' : 'card'}`}>
      {fehler && <p className="text-sm text-hs-err-fg bg-hs-err-bg border border-hs-err/30 rounded-lg px-3 py-2">{fehler}</p>}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="form-label">Art</label>
          <select name="art" defaultValue={initial?.art ?? 'notiz'} className="input" disabled={initial?.art === 'email'}>
            {arten.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          {initial?.art === 'email' && <input type="hidden" name="art" value="email" />}
        </div>
        <div>
          <label className="form-label">Datum *</label>
          <input name="datum" type="date" value={datum} onChange={e => setDatum(e.target.value)} required className="input" />
        </div>
      </div>
      <div>
        <label className="form-label">Betreff *</label>
        <input name="betreff" defaultValue={initial?.betreff ?? ''} required placeholder="z.B. Rückruf wegen Angebot" className="input" autoFocus />
      </div>
      <div>
        <label className="form-label">Bericht / Beschreibung</label>
        <textarea name="beschreibung" defaultValue={initial?.beschreibung ?? ''} rows={3} className="input resize-none" />
      </div>
      <div className="flex items-center gap-4 flex-wrap text-sm">
        <label className="flex items-center gap-1.5 cursor-pointer text-hs-text-1">
          <input type="checkbox" checked={ganztags} onChange={e => setGanztags(e.target.checked)} className="accent-hs-teal" />
          Ganztags
        </label>
        {!ganztags && (
          <div className="flex items-center gap-1.5">
            <input type="hidden" name="bis_datum" value="" />
            <input type="time" name="uhrzeit_von" step={900} defaultValue={initial?.uhrzeit_von?.slice(0, 5) ?? '09:00'} className="input w-28 py-1" />
            <span className="text-hs-text-2">–</span>
            <input type="time" name="uhrzeit_bis" step={900} defaultValue={initial?.uhrzeit_bis?.slice(0, 5) ?? ''} className="input w-28 py-1" />
          </div>
        )}
        {ganztags && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-hs-text-2">bis</span>
            <input type="date" name="bis_datum" defaultValue={initial?.bis_datum ?? ''} min={datum} className="input w-40 py-1" title="Enddatum (mehrtägig)" />
          </div>
        )}
      </div>
      {!initial && <WiederholungFelder startDatum={datum} />}
      <div className="flex items-center gap-4 flex-wrap text-sm">
        <label className="flex items-center gap-1.5 cursor-pointer text-hs-text-1">
          <input type="checkbox" name="erledigt_check" key={String(erledigtDefault)} defaultChecked={erledigtDefault} className="accent-hs-teal" />
          Erledigt
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer text-hs-text-1">
          <input type="checkbox" name="privat_check" defaultChecked={initial?.ist_privat ?? false} className="accent-hs-teal" />
          <Lock size={12} strokeWidth={1.75} /> Privat (nur für mich sichtbar)
        </label>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Speichern …' : initial ? 'Speichern' : 'Eintragen'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">Abbrechen</button>
      </div>
    </form>
  )
}
