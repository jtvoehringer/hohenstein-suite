'use client'

import { useState } from 'react'
import { Repeat } from 'lucide-react'

/**
 * Wiederholungs-Auswahl für neue Termine (Serientermine, Migration 014).
 * Sendet die Formularfelder `wiederholung` und `wiederholung_bis`;
 * die Instanzen erzeugt createAktivitaet serverseitig.
 */
export default function WiederholungFelder({ startDatum }: { startDatum: string }) {
  const [regel, setRegel] = useState('keine')

  // Vorschlag fürs Enddatum: 3 Monate nach dem ersten Termin
  const vorschlag = (() => {
    const d = new Date(startDatum + 'T12:00:00')
    d.setMonth(d.getMonth() + 3)
    return d.toISOString().slice(0, 10)
  })()
  const max = (() => {
    const d = new Date(startDatum + 'T12:00:00')
    d.setFullYear(d.getFullYear() + 2)
    return d.toISOString().slice(0, 10)
  })()

  return (
    <div className="flex items-center gap-3 flex-wrap text-sm">
      <label className="form-label !mb-0 inline-flex items-center gap-1.5">
        <Repeat size={13} strokeWidth={2} className="text-hs-text-2" /> Wiederholung
      </label>
      <select name="wiederholung" value={regel} onChange={e => setRegel(e.target.value)} className="input !w-auto py-1">
        <option value="keine">Keine</option>
        <option value="taeglich">Täglich</option>
        <option value="woechentlich">Wöchentlich</option>
        <option value="zweiwoechentlich">Alle 2 Wochen</option>
        <option value="monatlich">Monatlich</option>
      </select>
      {regel !== 'keine' && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-hs-text-2">bis</span>
          <input type="date" name="wiederholung_bis" required defaultValue={vorschlag}
            min={startDatum} max={max} className="input w-40 py-1" title="Letzter Termin der Serie (max. 2 Jahre)" />
        </div>
      )}
    </div>
  )
}
