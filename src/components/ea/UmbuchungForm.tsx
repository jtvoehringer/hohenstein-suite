'use client'

// Umbuchung zwischen zwei Konten (z. B. Bank → Kassa). Wird auf /konten und in
// der Kontoabstimmung verwendet; `festesKonto` belegt eine Seite vor.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftRight, X } from 'lucide-react'
import { heuteIso } from '@/lib/format'
import { parseBetrag, type KontoOption } from '@/lib/ea/types'
import { erstelleUmbuchung } from '@/app/(dashboard)/konten/actions'

export default function UmbuchungForm({ konten, festesKonto, kompakt = false }: {
  konten: KontoOption[]
  festesKonto?: KontoOption
  kompakt?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [offen, setOffen] = useState(!kompakt)
  const [fehler, setFehler] = useState<string | null>(null)
  const [richtung, setRichtung] = useState<'von' | 'nach'>('von')
  const andere = festesKonto ? konten.filter(k => k.id !== festesKonto.id) : konten
  const [vonId, setVonId]   = useState(festesKonto?.id ?? konten[0]?.id ?? '')
  const [nachId, setNachId] = useState(andere[0]?.id ?? '')
  const [zielId, setZielId] = useState(andere[0]?.id ?? '')
  const [betrag, setBetrag] = useState('')
  const [datum, setDatum]   = useState(heuteIso())
  const [beschreibung, setBeschreibung] = useState('')

  if (konten.length < 2) return null

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setFehler(null)
    const b = parseBetrag(betrag)
    if (!Number.isFinite(b) || b <= 0) { setFehler('Bitte einen Betrag größer 0 eingeben.'); return }
    const von  = festesKonto ? (richtung === 'von' ? festesKonto.id : zielId) : vonId
    const nach = festesKonto ? (richtung === 'von' ? zielId : festesKonto.id) : nachId
    startTransition(async () => {
      const res = await erstelleUmbuchung({ von_konto_id: von, nach_konto_id: nach, betrag: b, datum, beschreibung: beschreibung || null })
      if (!res.ok) { setFehler(res.error); return }
      setBetrag(''); setBeschreibung('')
      if (kompakt) setOffen(false)
      router.refresh()
    })
  }

  if (kompakt && !offen) {
    return (
      <button type="button" onClick={() => setOffen(true)} className="btn-secondary">
        <ArrowLeftRight size={15} strokeWidth={1.75} /> Umbuchung erfassen
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base flex items-center gap-2"><ArrowLeftRight size={17} strokeWidth={1.75} className="text-hs-blue-500" /> Umbuchung erfassen</h2>
        {kompakt && <button type="button" onClick={() => setOffen(false)} className="text-hs-text-2 hover:text-hs-text"><X size={16} /></button>}
      </div>
      {fehler && <p className="text-sm text-hs-err-fg">{fehler}</p>}

      {festesKonto ? (
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={richtung === 'von'} onChange={() => setRichtung('von')} className="accent-hs-teal" />
            Von <strong>{festesKonto.name}</strong> an …
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={richtung === 'nach'} onChange={() => setRichtung('nach')} className="accent-hs-teal" />
            Auf <strong>{festesKonto.name}</strong> von …
          </label>
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {festesKonto ? (
          <div>
            <label className="form-label">{richtung === 'von' ? 'Zielkonto' : 'Quellkonto'}</label>
            <select value={zielId} onChange={e => setZielId(e.target.value)} className="input">
              {andere.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </div>
        ) : (
          <>
            <div>
              <label className="form-label">Von Konto</label>
              <select value={vonId} onChange={e => setVonId(e.target.value)} className="input">
                {konten.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Nach Konto</label>
              <select value={nachId} onChange={e => setNachId(e.target.value)} className="input">
                {konten.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>
          </>
        )}
        <div>
          <label className="form-label">Datum</label>
          <input type="date" value={datum} onChange={e => setDatum(e.target.value)} className="input" required />
        </div>
        <div>
          <label className="form-label">Betrag (€)</label>
          <input inputMode="decimal" value={betrag} onChange={e => setBetrag(e.target.value)} placeholder="0,00" className="input font-mono text-right" required />
        </div>
        <div className={festesKonto ? 'col-span-2 md:col-span-2' : ''}>
          <label className="form-label">Notiz</label>
          <input value={beschreibung} onChange={e => setBeschreibung(e.target.value)} placeholder="Optional" className="input" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="btn-primary">{pending ? 'Buchen …' : 'Umbuchung buchen'}</button>
        {kompakt && <button type="button" onClick={() => setOffen(false)} className="btn-secondary">Abbrechen</button>}
      </div>
    </form>
  )
}
