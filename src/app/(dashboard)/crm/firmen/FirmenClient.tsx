'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Download, Search, Users, Upload } from 'lucide-react'
import { SEGMENTE, BETRIEBSSTANDORTE } from '@/lib/crm/types'
import type { FirmaRow } from '@/lib/crm/types'
import ClickableTableRow from '@/components/ui/ClickableTableRow'
import Modal from '@/components/crm/Modal'
import FirmaForm from '@/components/crm/FirmaForm'
import { SegmentPill, LeadPill, FlagPill } from '@/components/crm/Pills'
import { fmtTelefon } from '@/components/crm/crmUtils'

type Filter = 'alle' | 'lead' | 'kunde' | 'lieferant'

export default function FirmenClient({
  firmen, anzahlKontakte, writeOk, initialFilter = 'alle', openNeu = false, initialSegment,
}: {
  firmen: FirmaRow[]
  anzahlKontakte: Record<string, number>
  writeOk: boolean
  initialFilter?: Filter
  openNeu?: boolean
  initialSegment?: string
}) {
  const router = useRouter()
  const [showNeu, setShowNeu] = useState(openNeu && writeOk)
  useEffect(() => { if (openNeu && writeOk) setShowNeu(true) }, [openNeu, writeOk])
  const [suche, setSuche]     = useState('')
  const [segment, setSegment] = useState<string>(initialSegment && SEGMENTE.some(s => s.value === initialSegment) ? initialSegment : 'alle')
  const [filter, setFilter]   = useState<Filter>(initialFilter)
  const [standort, setStandort] = useState('alle')
  const [region, setRegion]     = useState('alle')

  // Auswahllisten aus den tatsächlich vorhandenen Werten (Region abhängig vom Betriebsstandort)
  const standorte = useMemo(() => {
    const vorhanden = new Set(firmen.map(f => f.betriebsstandort).filter(Boolean) as string[])
    const bekannt = BETRIEBSSTANDORTE.map(b => b.value).filter(v => vorhanden.has(v))
    const sonstige = [...vorhanden].filter(v => !BETRIEBSSTANDORTE.some(b => b.value === v)).sort((a, b) => a.localeCompare(b, 'de'))
    return [...bekannt, ...sonstige]
  }, [firmen])
  const regionen = useMemo(() => {
    const basis = firmen.filter(f => standort === 'alle' || f.betriebsstandort === standort)
    return [...new Set(basis.map(f => f.region).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'de'))
  }, [firmen, standort])

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase()
    return firmen.filter(f => {
      if (segment !== 'alle' && f.segment !== segment) return false
      if (filter === 'lead' && !f.is_lead) return false
      if (filter === 'kunde' && !(f.ist_kunde && !f.is_lead)) return false
      if (filter === 'lieferant' && !f.ist_lieferant) return false
      if (standort !== 'alle' && f.betriebsstandort !== standort) return false
      if (region !== 'alle' && f.region !== region) return false
      if (!q) return true
      const text = [f.kundennummer, f.name, f.email, f.telefon, f.ort, f.plz, f.uid_nummer, f.website, f.betriebsstandort, f.region].filter(Boolean).join(' ').toLowerCase()
      return text.includes(q)
    })
  }, [firmen, suche, segment, filter, standort, region])

  const nLead = firmen.filter(f => f.is_lead).length
  const nKunde = firmen.filter(f => f.ist_kunde && !f.is_lead).length
  const nLieferant = firmen.filter(f => f.ist_lieferant).length
  const chip = (aktiv: boolean) =>
    `px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${aktiv ? 'bg-hs-teal text-white' : 'bg-hs-bg text-hs-text-1 hover:text-hs-text'}`

  function schliesseNeu() {
    setShowNeu(false)
    if (openNeu) router.replace('/crm/firmen')
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-hs-line p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search size={15} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-hs-tertiary" />
            <input type="search" value={suche} onChange={e => setSuche(e.target.value)}
              placeholder="Name, Ort, E-Mail, UID …" className="input pl-9" />
          </div>
          <div className="flex gap-1 flex-wrap">
            <button onClick={() => setFilter('alle')} className={chip(filter === 'alle')}>Alle ({firmen.length})</button>
            <button onClick={() => setFilter('lead')} className={chip(filter === 'lead')}>Leads ({nLead})</button>
            <button onClick={() => setFilter('kunde')} className={chip(filter === 'kunde')}>Kunden ({nKunde})</button>
            <button onClick={() => setFilter('lieferant')} className={chip(filter === 'lieferant')}>Lieferanten ({nLieferant})</button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a href="/api/export/firmen" className="btn-secondary" title="Alle Firmen als CSV exportieren">
              <Download size={15} strokeWidth={1.75} /> CSV
            </a>
            {writeOk && (
              <>
                <Link href="/crm/import" className="btn-secondary" title="CSV-Import"><Upload size={15} strokeWidth={1.75} /> Import</Link>
                <button onClick={() => setShowNeu(true)} className="btn-primary">
                  <Plus size={15} strokeWidth={2} /> Neue Firma
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button onClick={() => setSegment('alle')} className={chip(segment === 'alle')}>Alle Segmente</button>
          {SEGMENTE.map(s => {
            const n = firmen.filter(f => f.segment === s.value).length
            if (n === 0 && segment !== s.value) return null
            return (
              <button key={s.value} onClick={() => setSegment(v => v === s.value ? 'alle' : s.value)} className={chip(segment === s.value)}>
                {s.label} ({n})
              </button>
            )
          })}
          {standorte.length > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              <select value={standort} onChange={e => { setStandort(e.target.value); setRegion('alle') }}
                className="input !w-auto !py-1 text-xs" aria-label="Betriebsstandort">
                <option value="alle">Alle Betriebsstandorte</option>
                {standorte.map(s => <option key={s} value={s}>{s} ({firmen.filter(f => f.betriebsstandort === s).length})</option>)}
              </select>
              <select value={region} onChange={e => setRegion(e.target.value)}
                className="input !w-auto !py-1 text-xs" aria-label="Region" disabled={regionen.length === 0}>
                <option value="alle">Alle Regionen</option>
                {regionen.map(r => <option key={r} value={r}>{r} ({firmen.filter(f => f.region === r && (standort === 'alle' || f.betriebsstandort === standort)).length})</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-hs-line overflow-hidden">
        {gefiltert.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-hs-text-2">
              {firmen.length === 0 ? 'Noch keine Firmen angelegt.' : 'Keine Firmen für diesen Filter.'}
            </p>
            {writeOk && firmen.length === 0 && (
              <button onClick={() => setShowNeu(true)} className="btn-primary mt-4"><Plus size={15} strokeWidth={2} /> Erste Firma anlegen</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="text-left px-4 py-2.5">Firma</th>
                  <th className="text-left px-4 py-2.5">Segment</th>
                  <th className="text-left px-4 py-2.5 hidden md:table-cell">Ort</th>
                  <th className="text-left px-4 py-2.5 hidden lg:table-cell">Kontakt</th>
                  <th className="text-center px-4 py-2.5 hidden md:table-cell"><span className="inline-flex items-center gap-1"><Users size={12} strokeWidth={1.75} />Personen</span></th>
                  <th className="text-left px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hs-line">
                {gefiltert.map(f => (
                  <ClickableTableRow key={f.id} href={`/crm/firmen/${f.id}`} className="hover:bg-hs-bg/70 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-hs-text">{f.name}</div>
                      <div className="text-xs text-hs-text-2">
                        {f.kundennummer && <span className="font-mono mr-2">{f.kundennummer}</span>}
                        {f.uid_nummer}
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><SegmentPill segment={f.segment} /></td>
                    <td className="px-4 py-2.5 hidden md:table-cell text-hs-text-1">
                      {f.ort ? `${f.plz ? f.plz + ' ' : ''}${f.ort}${f.land && f.land !== 'AT' ? ` (${f.land})` : ''}` : <span className="text-hs-tertiary">–</span>}
                      {(f.betriebsstandort || f.region) && (
                        <div className="text-xs text-hs-text-2">{[f.betriebsstandort, f.region].filter(Boolean).join(' · ')}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 hidden lg:table-cell text-hs-text-1">
                      <div className="text-xs space-y-0.5">
                        {f.email && <div className="truncate max-w-[220px]">{f.email}</div>}
                        {f.telefon && <div className="tabular-nums">{fmtTelefon(f.telefon_vorwahl, f.telefon)}</div>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell text-center font-mono tabular-nums text-hs-text-1">
                      {anzahlKontakte[f.id] ?? 0}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        <LeadPill isLead={f.is_lead} />
                        {f.ist_lieferant && <FlagPill label="Lieferant" tone="neutral" />}
                      </div>
                    </td>
                  </ClickableTableRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {gefiltert.length > 0 && (
          <div className="px-4 py-2 border-t border-hs-line text-xs text-hs-text-2">
            {gefiltert.length} von {firmen.length} {firmen.length === 1 ? 'Firma' : 'Firmen'}
          </div>
        )}
      </div>

      <Modal open={showNeu} onClose={schliesseNeu} title="Neue Firma" subtitle="Die Kundennummer wird automatisch vergeben." width="max-w-2xl">
        <FirmaForm
          defaultSegment={segment !== 'alle' ? segment : undefined}
          onDone={id => { schliesseNeu(); if (id) router.push(`/crm/firmen/${id}`) }}
          onCancel={schliesseNeu}
        />
      </Modal>
    </div>
  )
}
