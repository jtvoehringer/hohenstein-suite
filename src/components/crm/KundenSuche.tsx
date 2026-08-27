'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

export type SucheItem = { id: string; label: string; sub?: string | null }

/** Typeahead für Kontakt-/Firmenauswahl. Gibt die gewählte ID über `onChange` zurück (leer = keine Auswahl). */
export default function KundenSuche({
  items, value, onChange, placeholder, name,
}: {
  items: SucheItem[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /** optional: hidden input mit diesem Namen für FormData */
  name?: string
}) {
  const [query, setQuery] = useState('')
  const [open,  setOpen]  = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = items.find(i => i.id === value)
  const q = query.trim().toLowerCase()
  const treffer = (q.length === 0
    ? items
    : items.filter(i => `${i.label} ${i.sub ?? ''}`.toLowerCase().includes(q))
  ).slice(0, 40)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} className="relative">
      {name && <input type="hidden" name={name} value={value} />}
      {selected ? (
        <div className="flex items-center gap-1.5 border border-hs-line-str rounded-lg px-3 py-2 bg-hs-bg text-sm">
          <span className="flex-1 truncate text-hs-text">{selected.label}</span>
          <button type="button" onClick={() => { onChange(''); setQuery('') }} aria-label="Auswahl entfernen"
            className="text-hs-text-2 hover:text-hs-text flex-shrink-0">
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>
      ) : (
        <>
          <input type="text" value={query} className="input"
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder ?? 'Suchen …'} />
          {open && treffer.length > 0 && (
            <ul className="absolute z-40 mt-1 w-full bg-white border border-hs-line rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {treffer.map(i => (
                <li key={i.id}
                  onMouseDown={e => { e.preventDefault(); onChange(i.id); setQuery(''); setOpen(false) }}
                  className="px-3 py-2 hover:bg-hs-bg cursor-pointer">
                  <span className="text-sm text-hs-text">{i.label}</span>
                  {i.sub && <span className="text-xs text-hs-text-2 ml-1.5">{i.sub}</span>}
                </li>
              ))}
            </ul>
          )}
          {open && q.length > 0 && treffer.length === 0 && (
            <div className="absolute z-40 mt-1 w-full bg-white border border-hs-line rounded-lg shadow-lg px-3 py-2 text-xs text-hs-text-2">
              Keine Treffer
            </div>
          )}
        </>
      )}
    </div>
  )
}
