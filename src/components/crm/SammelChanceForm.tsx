'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PIPELINE_STUFEN, PIPELINE_KATEGORIEN } from '@/lib/crm/types'
import { createPipelineEintraegeFuerFirmen } from '@/app/(dashboard)/crm/actions'

/**
 * Sammelaktion „Pipeline“ aus der Firmen-Liste: legt für jede ausgewählte Firma
 * eine Verkaufschance an (Titel + „ – Firmenname“), z. B. um eine Gruppe von
 * Accounts einer Kampagne zuzuordnen.
 */
export default function SammelChanceForm({
  firmen, onDone, onCancel,
}: {
  firmen: { id: string; name: string }[]
  onDone: (ergebnis: { angelegt: number; uebersprungen: number }) => void
  onCancel: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)
  const [titel, setTitel] = useState('')
  const [zeigeAlle, setZeigeAlle] = useState(false)
  const beispiel = firmen[0]?.name ?? 'Weingut Muster'

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setFehler(null)
    startTransition(async () => {
      const res = await createPipelineEintraegeFuerFirmen(firmen.map(f => f.id), fd)
      if (res?.error) { setFehler(res.error); return }
      router.refresh()
      onDone({ angelegt: res.angelegt ?? 0, uebersprungen: res.uebersprungen ?? 0 })
    })
  }

  const sichtbar = zeigeAlle ? firmen : firmen.slice(0, 8)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fehler && <p className="text-sm text-hs-err-fg bg-hs-err-bg border border-hs-err/30 rounded-lg px-3 py-2">{fehler}</p>}

      <div className="rounded-lg bg-hs-bg px-3 py-2 text-xs text-hs-text-1">
        <div className="font-semibold text-hs-text mb-1">{firmen.length} {firmen.length === 1 ? 'Firma' : 'Firmen'} ausgewählt</div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          {sichtbar.map(f => <span key={f.id} className="truncate max-w-[220px]">{f.name}</span>)}
          {!zeigeAlle && firmen.length > sichtbar.length && (
            <button type="button" onClick={() => setZeigeAlle(true)} className="text-hs-blue-700 hover:underline">+ {firmen.length - sichtbar.length} weitere</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="form-label">Titel / Kampagne *</label>
          <input name="titel" value={titel} onChange={e => setTitel(e.target.value)} required autoFocus
            placeholder="z. B. Herbstkampagne software:112 2026" className="input" />
          <p className="text-[11.5px] text-hs-text-2 mt-1">
            Je Firma entsteht eine eigene Chance, benannt „{titel.trim() || 'Titel'} – {beispiel}“.
          </p>
        </div>
        <div>
          <label className="form-label">Stufe *</label>
          <select name="stufe" defaultValue="interessent" required className="input">
            {PIPELINE_STUFEN.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Kategorie</label>
          <select name="kategorie" defaultValue="software112" className="input">
            <option value="">– keine –</option>
            {PIPELINE_KATEGORIEN.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Wert je Firma (€)</label>
          <input name="wert_euro" type="number" min={0} step="0.01" placeholder="z. B. 2400" className="input" />
        </div>
        <div>
          <label className="form-label">Wahrscheinlichkeit (%)</label>
          <input name="wahrscheinlichkeit" type="number" min={0} max={100} step={5} placeholder="z. B. 20" className="input" />
        </div>
        <div>
          <label className="form-label">Erwarteter Abschluss</label>
          <input name="erwartetes_datum" type="date" className="input" />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-start gap-2 text-sm text-hs-text-1 cursor-pointer select-none">
            <input type="checkbox" name="nur_ohne_offene" value="true" defaultChecked className="accent-hs-teal mt-0.5" />
            <span>Firmen überspringen, die bereits eine offene Chance haben</span>
          </label>
        </div>
        <div className="sm:col-span-2">
          <label className="form-label">Notizen (für alle Chancen)</label>
          <textarea name="notizen" rows={2} className="input resize-none" placeholder="z. B. Mailing am 20.09., Nachfassen ab KW 40" />
        </div>
      </div>
      <p className="text-[11.5px] text-hs-text-2">Der Hauptkontakt der jeweiligen Firma wird als Kontakt der Chance übernommen, sofern vorhanden.</p>

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Anlegen …' : `${firmen.length} ${firmen.length === 1 ? 'Chance' : 'Chancen'} anlegen`}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">Abbrechen</button>
      </div>
    </form>
  )
}
