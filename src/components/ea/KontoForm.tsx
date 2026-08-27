'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { heuteIso } from '@/lib/format'
import { KONTO_TYPEN, parseBetrag } from '@/lib/ea/types'
import { speichereKonto, type KontoInput } from '@/app/(dashboard)/konten/actions'

export default function KontoForm({ initial, id }: { initial?: Partial<KontoInput>; id?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)
  const [name, setName] = useState(initial?.name ?? '')
  const [typ, setTyp]   = useState<KontoInput['typ']>(initial?.typ ?? 'giro')
  const [iban, setIban] = useState(initial?.iban ?? '')
  const [datum, setDatum] = useState(initial?.eroeffnungsdatum ?? heuteIso())
  const [saldo, setSaldo] = useState(initial?.eroeffnungssaldo != null ? initial.eroeffnungssaldo.toFixed(2).replace('.', ',') : '0,00')
  const [sortierung, setSortierung] = useState(initial?.sortierung ?? 0)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setFehler(null)
    const s = parseBetrag(saldo)
    if (!Number.isFinite(s)) { setFehler('Bitte einen gültigen Eröffnungssaldo eingeben.'); return }
    startTransition(async () => {
      const res = await speichereKonto({ name, typ, iban: iban || null, eroeffnungsdatum: datum, eroeffnungssaldo: s, sortierung }, id)
      if (!res.ok) { setFehler(res.error); return }
      router.push(id ? `/konten/${id}/abstimmung` : '/konten')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      {fehler && <p className="text-sm text-hs-err-fg">{fehler}</p>}
      <div>
        <label className="form-label">Bezeichnung *</label>
        <input required value={name} onChange={e => setName(e.target.value)} placeholder="z. B. Raiffeisen Girokonto" className="input" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="form-label">Typ</label>
          <select value={typ} onChange={e => setTyp(e.target.value as KontoInput['typ'])} className="input">
            {KONTO_TYPEN.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">IBAN</label>
          <input value={iban} onChange={e => setIban(e.target.value)} placeholder="Optional" className="input font-mono" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="form-label">Eröffnungsdatum *</label>
          <input type="date" required value={datum} onChange={e => setDatum(e.target.value)} className="input" />
          <p className="text-xs text-hs-text-2 mt-1">Datum des letzten Kontoauszugs, ab dem hier weitergeführt wird. Bewegungen bis einschließlich dieses Datums stecken im Eröffnungssaldo.</p>
        </div>
        <div>
          <label className="form-label">Eröffnungssaldo (€) *</label>
          <input inputMode="decimal" required value={saldo} onChange={e => setSaldo(e.target.value)} className="input font-mono text-right" />
        </div>
      </div>
      <div className="w-32">
        <label className="form-label">Sortierung</label>
        <input type="number" value={sortierung} onChange={e => setSortierung(Number(e.target.value) || 0)} className="input font-mono text-right" />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={pending} className="btn-primary">{pending ? 'Speichern …' : id ? 'Änderungen speichern' : 'Konto anlegen'}</button>
        <Link href={id ? `/konten/${id}/abstimmung` : '/konten'} className="btn-secondary">Abbrechen</Link>
      </div>
    </form>
  )
}
