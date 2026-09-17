'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Download, Search, Users, Upload, Trash2, KanbanSquare, X, CheckSquare } from 'lucide-react'
import { SEGMENTE, BETRIEBSSTANDORTE } from '@/lib/crm/types'
import type { FirmaRow } from '@/lib/crm/types'
import ClickableTableRow from '@/components/ui/ClickableTableRow'
import Modal from '@/components/crm/Modal'
import FirmaForm from '@/components/crm/FirmaForm'
import { SegmentPill, LeadPill, FlagPill } from '@/components/crm/Pills'
import { fmtTelefon } from '@/components/crm/crmUtils'
import SammelChanceForm from '@/components/crm/SammelChanceForm'
import { deleteFirmen } from '../actions'

type Filter = 'alle' | 'lead' | 'kunde' | 'lieferant'

export default function FirmenClient({
  firmen, anzahlKontakte, mitglieder, writeOk, initialFilter = 'alle', openNeu = false, initialSegment,
}: {
  firmen: FirmaRow[]
  anzahlKontakte: Record<string, number>
  /** Team-Mitglieder des Mandanten für den Account-Manager-Filter */
  mitglieder: { id: string; name: string }[]
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
  const [quelle, setQuelle]     = useState('alle')
  const [manager, setManager]   = useState('alle')
  const [buchstabe, setBuchstabe] = useState('alle')
  // Sammelaktionen: Auswahl per Klickbox
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set())
  const [showPipeline, setShowPipeline] = useState(false)
  const [hinweis, setHinweis] = useState<React.ReactNode>(null)
  const [pending, startTransition] = useTransition()

  const quellen = useMemo(() =>
    [...new Set(firmen.map(f => f.quelle).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'de')),
  [firmen])

  // Alphaleiste: Anfangsbuchstabe des Firmennamens (Umlaute eingeordnet, Ziffern/Sonstiges unter „#")
  const anfangsBuchstabe = (name: string): string => {
    const c = (name.trim().charAt(0) || '').toUpperCase()
    const map: Record<string, string> = { 'Ä': 'A', 'Ö': 'O', 'Ü': 'U', 'É': 'E', 'È': 'E', 'À': 'A' }
    const b = map[c] ?? c
    return b >= 'A' && b <= 'Z' ? b : '#'
  }
  const buchstabenVorhanden = useMemo(() => {
    const s = new Set(firmen.map(f => anfangsBuchstabe(f.name)))
    return s
  }, [firmen])
  const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...(buchstabenVorhanden.has('#') ? ['#'] : [])]

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
      if (quelle !== 'alle' && f.quelle !== quelle) return false
      if (manager === 'ohne' && f.account_manager) return false
      if (manager !== 'alle' && manager !== 'ohne' && f.account_manager !== manager) return false
      if (buchstabe !== 'alle' && anfangsBuchstabe(f.name) !== buchstabe) return false
      if (!q) return true
      const text = [f.kundennummer, f.name, f.email, f.telefon, f.ort, f.plz, f.uid_nummer, f.website, f.betriebsstandort, f.region, f.quelle].filter(Boolean).join(' ').toLowerCase()
      return text.includes(q)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmen, suche, segment, filter, standort, region, quelle, manager, buchstabe])

  const nLead = firmen.filter(f => f.is_lead).length
  const nKunde = firmen.filter(f => f.ist_kunde && !f.is_lead).length
  const nLieferant = firmen.filter(f => f.ist_lieferant).length
  const chip = (aktiv: boolean) =>
    `px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${aktiv ? 'bg-hs-teal text-white' : 'bg-hs-bg text-hs-text-1 hover:text-hs-text'}`

  const gefiltertIds = useMemo(() => gefiltert.map(f => f.id), [gefiltert])
  const alleGefiltertGewaehlt = gefiltert.length > 0 && gefiltertIds.every(id => auswahl.has(id))
  const ausgewaehlteFirmen = useMemo(() => firmen.filter(f => auswahl.has(f.id)), [firmen, auswahl])
  function toggleAuswahl(id: string) {
    setAuswahl(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleAlle() {
    setAuswahl(prev => {
      const n = new Set(prev)
      if (alleGefiltertGewaehlt) gefiltertIds.forEach(id => n.delete(id)); else gefiltertIds.forEach(id => n.add(id))
      return n
    })
  }
  function sammelLoeschen() {
    const n = ausgewaehlteFirmen.length
    if (n === 0) return
    const namen = ausgewaehlteFirmen.slice(0, 5).map(f => f.name).join(', ') + (n > 5 ? ` … (+${n - 5})` : '')
    if (!confirm(`${n} ${n === 1 ? 'Firma' : 'Firmen'} endgültig löschen?\n${namen}\n\nVerknüpfte Kontakte bleiben erhalten; Termine und Chancen verlieren die Firmenzuordnung.`)) return
    setHinweis(null)
    startTransition(async () => {
      const res = await deleteFirmen([...auswahl])
      if (res?.error) { setHinweis(`Löschen fehlgeschlagen: ${res.error}`); return }
      setHinweis(`${res.anzahl ?? n} ${res.anzahl === 1 ? 'Firma' : 'Firmen'} gelöscht.`)
      setAuswahl(new Set())
      router.refresh()
    })
  }

  function schliesseNeu() {
    setShowNeu(false)
    if (openNeu) router.replace('/crm/firmen')
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-hs-line p-3 space-y-3">
        {/* Alphaleiste */}
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px] leading-none">
          <button type="button" onClick={() => setBuchstabe('alle')}
            className={`px-2 py-1 rounded-md font-medium transition-colors ${buchstabe === 'alle' ? 'bg-hs-teal text-white' : 'text-hs-text-1 hover:text-hs-text hover:bg-hs-bg'}`}>
            Alle
          </button>
          {ALPHABET.map(b => {
            const vorhanden = buchstabenVorhanden.has(b)
            return (
              <button key={b} type="button" disabled={!vorhanden}
                onClick={() => setBuchstabe(v => v === b ? 'alle' : b)}
                className={`w-7 py-1 rounded-md font-medium transition-colors ${
                  buchstabe === b ? 'bg-hs-teal text-white'
                  : vorhanden ? 'text-hs-text-1 hover:text-hs-text hover:bg-hs-bg'
                  : 'text-hs-tertiary/40 cursor-default'}`}>
                {b}
              </button>
            )
          })}
        </div>
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
          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            {mitglieder.length > 0 && (
              <select value={manager} onChange={e => setManager(e.target.value)}
                className="input !w-auto !py-1 text-xs" aria-label="Account Manager">
                <option value="alle">Alle Account Manager</option>
                {mitglieder.map(m => <option key={m.id} value={m.id}>{m.name} ({firmen.filter(f => f.account_manager === m.id).length})</option>)}
                <option value="ohne">Ohne Account Manager ({firmen.filter(f => !f.account_manager).length})</option>
              </select>
            )}
            {standorte.length > 0 && (
              <>
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
                {quellen.length > 0 && (
                  <select value={quelle} onChange={e => setQuelle(e.target.value)}
                    className="input !w-auto !py-1 text-xs" aria-label="Quelle">
                    <option value="alle">Alle Quellen</option>
                    {quellen.map(qu => <option key={qu} value={qu}>{qu} ({firmen.filter(f => f.quelle === qu).length})</option>)}
                  </select>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {hinweis && (
        <div className="flex items-center justify-between gap-2 text-sm rounded-lg px-3 py-2 bg-hs-blue-50 text-hs-blue-700">
          <span>{hinweis}</span>
          <button type="button" onClick={() => setHinweis(null)} className="p-0.5 hover:text-hs-text" aria-label="Hinweis schließen"><X size={14} /></button>
        </div>
      )}
      {writeOk && auswahl.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-hs-blue-300 bg-white shadow-sm px-3 py-2 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold text-hs-text">
            <CheckSquare size={15} strokeWidth={2} className="text-hs-teal" />
            {auswahl.size} {auswahl.size === 1 ? 'Firma' : 'Firmen'} ausgewählt
          </span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button type="button" onClick={() => setShowPipeline(true)} disabled={pending} className="btn-primary !py-1.5" title="Für jede ausgewählte Firma eine Verkaufschance anlegen (z. B. Kampagne)">
              <KanbanSquare size={15} strokeWidth={1.75} /> Pipeline
            </button>
            <button type="button" onClick={sammelLoeschen} disabled={pending} className="btn-danger !py-1.5">
              <Trash2 size={15} strokeWidth={1.75} /> Löschen
            </button>
            <button type="button" onClick={() => setAuswahl(new Set())} className="btn-secondary !py-1.5">
              <X size={15} strokeWidth={1.75} /> Auswahl aufheben
            </button>
          </div>
        </div>
      )}

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
                  {writeOk && (
                    <th className="px-3 py-2.5 w-8">
                      <input type="checkbox" checked={alleGefiltertGewaehlt} onChange={toggleAlle} className="accent-hs-teal cursor-pointer"
                        aria-label="Alle angezeigten Firmen auswählen" title={alleGefiltertGewaehlt ? 'Auswahl der angezeigten Firmen aufheben' : `Alle ${gefiltert.length} angezeigten Firmen auswählen`} />
                    </th>
                  )}
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
                  <ClickableTableRow key={f.id} href={`/crm/firmen/${f.id}`} className={`transition-colors ${auswahl.has(f.id) ? 'bg-hs-blue-50/60' : 'hover:bg-hs-bg/70'}`}>
                    {writeOk && (
                      <td className="px-3 py-2.5 w-8" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={auswahl.has(f.id)} onChange={() => toggleAuswahl(f.id)} className="accent-hs-teal cursor-pointer" aria-label={`${f.name} auswählen`} />
                      </td>
                    )}
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
            {auswahl.size > 0 && <> · {auswahl.size} ausgewählt</>}
          </div>
        )}
      </div>

      <Modal open={showPipeline} onClose={() => setShowPipeline(false)} title="Chancen anlegen" subtitle="Für jede ausgewählte Firma wird eine eigene Verkaufschance in der Pipeline angelegt." width="max-w-2xl">
        {showPipeline && (
          <SammelChanceForm
            firmen={ausgewaehlteFirmen.map(f => ({ id: f.id, name: f.name }))}
            onDone={({ angelegt, uebersprungen }) => {
              setShowPipeline(false)
              setHinweis(<>
                {angelegt} {angelegt === 1 ? 'Chance' : 'Chancen'} angelegt{uebersprungen > 0 ? `, ${uebersprungen} ${uebersprungen === 1 ? 'Firma' : 'Firmen'} übersprungen (bereits offene Chance)` : ''}.{' '}
                <Link href="/crm/pipeline" className="font-semibold underline underline-offset-2">Zur Pipeline →</Link>
              </>)
              setAuswahl(new Set())
            }}
            onCancel={() => setShowPipeline(false)}
          />
        )}
      </Modal>

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
