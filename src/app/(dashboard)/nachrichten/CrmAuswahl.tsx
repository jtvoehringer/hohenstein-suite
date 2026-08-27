'use client'

import { useEffect, useState } from 'react'
import { Search, User, Building2, X, Loader2 } from 'lucide-react'
import type { CrmSuchTreffer } from '@/lib/email/types'

// Kontakt/Firma per Suche auswählen (wenn keine automatische Zuordnung möglich war)
export default function CrmAuswahl({
  hinweis, vorschlag, onWahl, onAbbrechen,
}: {
  hinweis?: string
  vorschlag?: string
  onWahl: (t: CrmSuchTreffer) => void
  onAbbrechen: () => void
}) {
  const [q, setQ] = useState(vorschlag ? vorschlag.split('@')[1]?.split('.')[0] ?? '' : '')
  const [treffer, setTreffer] = useState<CrmSuchTreffer[]>([])
  const [laden, setLaden] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) { setTreffer([]); return }
    const t = setTimeout(async () => {
      setLaden(true)
      try {
        const res = await fetch(`/api/nachrichten/crm-suche?q=${encodeURIComponent(q.trim())}`)
        const d = await res.json()
        setTreffer(d.ergebnisse ?? [])
      } catch { setTreffer([]) }
      setLaden(false)
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="rounded-xl border border-hs-line bg-hs-bg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-semibold text-hs-text">Im CRM zuordnen</p>
        <button type="button" onClick={onAbbrechen} className="text-hs-tertiary hover:text-hs-text"><X size={16} strokeWidth={1.75} /></button>
      </div>
      {hinweis && <p className="text-[12px] text-hs-text-2">{hinweis}</p>}
      <div className="relative">
        <Search size={15} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-hs-tertiary" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Kontakt oder Firma suchen …" className="input pl-8 text-[13px] py-1.5" />
        {laden && <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-hs-tertiary" />}
      </div>
      <div className="max-h-56 overflow-y-auto divide-y divide-hs-line rounded-lg border border-hs-line bg-white">
        {treffer.map(t => (
          <button key={`${t.typ}-${t.id}`} type="button" onClick={() => onWahl(t)}
            className="w-full text-left px-3 py-2 hover:bg-hs-blue-50 flex items-center gap-2.5">
            {t.typ === 'kontakt' ? <User size={15} strokeWidth={1.75} className="text-hs-blue-700 shrink-0" /> : <Building2 size={15} strokeWidth={1.75} className="text-hs-blue-700 shrink-0" />}
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-hs-text truncate">{t.name}</span>
              <span className="block text-[11.5px] text-hs-text-2 truncate">{[t.email, t.zusatz].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="pill bg-hs-bg text-hs-text-2">{t.typ === 'kontakt' ? 'Kontakt' : 'Firma'}</span>
          </button>
        ))}
        {!laden && q.trim().length >= 2 && treffer.length === 0 && (
          <p className="px-3 py-3 text-[12.5px] text-hs-text-2">Keine Treffer.</p>
        )}
        {q.trim().length < 2 && (
          <p className="px-3 py-3 text-[12.5px] text-hs-tertiary">Mindestens zwei Zeichen eingeben.</p>
        )}
      </div>
    </div>
  )
}
