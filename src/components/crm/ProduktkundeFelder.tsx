'use client'

import { PRODUKTE, type ProduktEintrag, type ProduktKey } from '@/lib/crm/types'

/**
 * Produktkunde-Block für Firmen- und Kontaktformular (Migration 020):
 * Toggle „Produktkunde“ → Mehrfachauswahl der Produkte, je Produkt eine
 * Kundennummer im jeweiligen Produktsystem. Die Werte werden vom Formular als
 * `produktkunde` (true/false) und `produkte` (JSON) mitgeschickt.
 */
export default function ProduktkundeFelder({
  produktkunde, produkte, onChange,
}: {
  produktkunde: boolean
  produkte: ProduktEintrag[]
  onChange: (next: { produktkunde: boolean; produkte: ProduktEintrag[] }) => void
}) {
  const eintrag = (p: ProduktKey) => produkte.find(e => e.produkt === p)

  function toggleProdukt(p: ProduktKey, an: boolean) {
    const rest = produkte.filter(e => e.produkt !== p)
    const next = an ? [...rest, { produkt: p, kundennummer: null }] : rest
    // Reihenfolge wie in PRODUKTE halten
    next.sort((a, b) => PRODUKTE.findIndex(x => x.value === a.produkt) - PRODUKTE.findIndex(x => x.value === b.produkt))
    onChange({ produktkunde, produkte: next })
  }
  function setKundennummer(p: ProduktKey, wert: string) {
    onChange({ produktkunde, produkte: produkte.map(e => e.produkt === p ? { ...e, kundennummer: wert.trim() ? wert : null } : e) })
  }

  return (
    <div className="bg-hs-bg border border-hs-line rounded-lg px-4 py-3 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="produktkunde-toggle" className="text-sm font-medium text-hs-text cursor-pointer select-none">
          Produktkunde
          <span className="block text-[11.5px] font-normal text-hs-text-2">Nutzt eines unserer Produkte (software:112, Webpage, Weinshop)</span>
        </label>
        <button type="button" id="produktkunde-toggle" role="switch" aria-checked={produktkunde}
          onClick={() => onChange({ produktkunde: !produktkunde, produkte })}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-4 focus:ring-hs-blue-50 ${produktkunde ? 'bg-hs-teal' : 'bg-hs-line-str'}`}>
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${produktkunde ? 'translate-x-5' : 'translate-x-0.5'}`} />
          <span className="sr-only">Produktkunde {produktkunde ? 'ja' : 'nein'}</span>
        </button>
      </div>

      {produktkunde && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-hs-line">
          {PRODUKTE.map(p => {
            const e = eintrag(p.value)
            return (
              <div key={p.value} className="space-y-1">
                <label className="flex items-center gap-2 text-sm text-hs-text cursor-pointer select-none">
                  <input type="checkbox" checked={!!e} onChange={ev => toggleProdukt(p.value, ev.target.checked)} className="accent-hs-teal w-4 h-4" />
                  {p.label}
                </label>
                <input type="text" value={e?.kundennummer ?? ''} disabled={!e} onChange={ev => setKundennummer(p.value, ev.target.value)}
                  placeholder={e ? 'Kundennummer' : '–'} aria-label={`Kundennummer ${p.label}`} className="input !py-1.5 text-sm font-mono" />
              </div>
            )
          })}
          {produkte.length === 0 && <p className="sm:col-span-3 text-[11.5px] text-hs-warn-fg">Bitte mindestens ein Produkt auswählen.</p>}
        </div>
      )}
    </div>
  )
}
