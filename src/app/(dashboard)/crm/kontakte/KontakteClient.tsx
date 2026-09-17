'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Download, Search, Upload, Camera, Trash2, KanbanSquare, X, CheckSquare } from 'lucide-react'
import { SEGMENTE } from '@/lib/crm/types'
import type { KontaktRow } from '@/lib/crm/types'
import ClickableTableRow from '@/components/ui/ClickableTableRow'
import StopPropagation from '@/components/ui/StopPropagation'
import Modal from '@/components/crm/Modal'
import KontaktForm, { type FirmaOption } from '@/components/crm/KontaktForm'
import { SegmentPill, LeadPill } from '@/components/crm/Pills'
import { fmtTelefon } from '@/components/crm/crmUtils'
import SammelChanceForm from '@/components/crm/SammelChanceForm'
import { deleteKontakte } from '../actions'

type LeadFilter = 'alle' | 'lead' | 'kunde'

export default function KontakteClient({
  kontakte, firmen, writeOk, initialFilter = 'alle', openNeu = false, initialSegment,
}: {
  kontakte: KontaktRow[]
  firmen: FirmaOption[]
  writeOk: boolean
  initialFilter?: LeadFilter
  openNeu?: boolean
  initialSegment?: string
}) {
  const router = useRouter()
  const [showNeu, setShowNeu]     = useState(openNeu && writeOk)
  useEffect(() => { if (openNeu && writeOk) setShowNeu(true) }, [openNeu, writeOk])
  const [suche, setSuche]         = useState('')
  const [segment, setSegment]     = useState<string>(initialSegment && SEGMENTE.some(s => s.value === initialSegment) ? initialSegment : 'alle')
  const [leadFilter, setLeadFilter] = useState<LeadFilter>(initialFilter)
  const [buchstabe, setBuchstabe] = useState<string>('')
  // Sammelaktionen: Auswahl per Klickbox
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set())
  const [showPipeline, setShowPipeline] = useState(false)
  const [hinweis, setHinweis] = useState<React.ReactNode>(null)
  const [pending, startTransition] = useTransition()

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase()
    return kontakte.filter(k => {
      if (segment !== 'alle' && k.segment !== segment) return false
      if (leadFilter === 'lead' && !k.is_lead) return false
      if (leadFilter === 'kunde' && k.is_lead) return false
      if (buchstabe && !(k.nachname ?? '').toUpperCase().startsWith(buchstabe)) return false
      if (!q) return true
      const text = [k.kundennummer, k.vorname, k.nachname, k.email, k.telefon, k.mobil, k.ort, k.firma_name, k.position, k.ansprechpartner_intern]
        .filter(Boolean).join(' ').toLowerCase()
      return text.includes(q)
    })
  }, [kontakte, suche, segment, leadFilter, buchstabe])

  const anzahlLeads  = kontakte.filter(k => k.is_lead).length
  const anzahlKunden = kontakte.length - anzahlLeads
  const chip = (aktiv: boolean) =>
    `px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${aktiv ? 'bg-hs-teal text-white' : 'bg-hs-bg text-hs-text-1 hover:text-hs-text'}`

  const kontaktName = (k: KontaktRow) => [k.vorname, k.nachname].filter(Boolean).join(' ') || k.nachname || 'Kontakt'
  const gefiltertIds = useMemo(() => gefiltert.map(k => k.id), [gefiltert])
  const alleGefiltertGewaehlt = gefiltert.length > 0 && gefiltertIds.every(id => auswahl.has(id))
  const ausgewaehlte = useMemo(() => kontakte.filter(k => auswahl.has(k.id)), [kontakte, auswahl])
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
    const n = ausgewaehlte.length
    if (n === 0) return
    const namen = ausgewaehlte.slice(0, 5).map(kontaktName).join(', ') + (n > 5 ? ` … (+${n - 5})` : '')
    if (!confirm(`${n} ${n === 1 ? 'Kontakt' : 'Kontakte'} endgültig löschen?\n${namen}\n\nFirmen bleiben erhalten; Termine und Chancen verlieren die Kontaktzuordnung.`)) return
    setHinweis(null)
    startTransition(async () => {
      const res = await deleteKontakte([...auswahl])
      if (res?.error) { setHinweis(`Löschen fehlgeschlagen: ${res.error}`); return }
      setHinweis(`${res.anzahl ?? n} ${res.anzahl === 1 ? 'Kontakt' : 'Kontakte'} gelöscht.`)
      setAuswahl(new Set())
      router.refresh()
    })
  }

  function schliesseNeu() {
    setShowNeu(false)
    if (openNeu) router.replace('/crm/kontakte')
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-hs-line p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search size={15} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-hs-tertiary" />
            <input type="search" value={suche} onChange={e => setSuche(e.target.value)}
              placeholder="Name, Firma, E-Mail, Telefon, Ort …" className="input pl-9" />
          </div>
          <div className="flex gap-1">
            <button onClick={() => setLeadFilter('alle')} className={chip(leadFilter === 'alle')}>Alle ({kontakte.length})</button>
            <button onClick={() => setLeadFilter('lead')} className={chip(leadFilter === 'lead')}>Leads ({anzahlLeads})</button>
            <button onClick={() => setLeadFilter('kunde')} className={chip(leadFilter === 'kunde')}>Kunden ({anzahlKunden})</button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a href="/api/export/kontakte" className="btn-secondary" title="Alle Kontakte als CSV exportieren">
              <Download size={15} strokeWidth={1.75} /> CSV
            </a>
            {writeOk && (
              <>
                <Link href="/crm/kontakte/visitenkarte" className="btn-secondary" title="Visitenkarte scannen"><Camera size={15} strokeWidth={1.75} /> Scan</Link>
                <Link href="/crm/import" className="btn-secondary" title="CSV-Import"><Upload size={15} strokeWidth={1.75} /> Import</Link>
                <button onClick={() => setShowNeu(true)} className="btn-primary">
                  <Plus size={15} strokeWidth={2} /> Neuer Kontakt
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button onClick={() => setSegment('alle')} className={chip(segment === 'alle')}>Alle Segmente</button>
          {SEGMENTE.map(s => {
            const n = kontakte.filter(k => k.segment === s.value).length
            if (n === 0 && segment !== s.value) return null
            return (
              <button key={s.value} onClick={() => setSegment(v => v === s.value ? 'alle' : s.value)} className={chip(segment === s.value)}>
                {s.label} ({n})
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-0.5">
          <button onClick={() => setBuchstabe('')}
            className={`min-w-[1.75rem] px-1 py-0.5 text-[11px] font-medium rounded ${buchstabe === '' ? 'bg-hs-teal text-white' : 'text-hs-text-2 hover:bg-hs-bg'}`}>Alle</button>
          {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(b => (
            <button key={b} onClick={() => setBuchstabe(x => x === b ? '' : b)}
              className={`min-w-[1.75rem] px-1 py-0.5 text-[11px] font-medium rounded ${buchstabe === b ? 'bg-hs-teal text-white' : 'text-hs-text-2 hover:bg-hs-bg'}`}>{b}</button>
          ))}
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
            {auswahl.size} {auswahl.size === 1 ? 'Kontakt' : 'Kontakte'} ausgewählt
          </span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button type="button" onClick={() => setShowPipeline(true)} disabled={pending} className="btn-primary !py-1.5" title="Für jeden ausgewählten Kontakt eine Verkaufschance anlegen (z. B. Kampagne)">
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

      {/* Tabelle */}
      <div className="bg-white rounded-xl border border-hs-line overflow-hidden">
        {gefiltert.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-hs-text-2">
              {kontakte.length === 0 ? 'Noch keine Kontakte angelegt.' : 'Keine Kontakte für diesen Filter.'}
            </p>
            {writeOk && kontakte.length === 0 && (
              <button onClick={() => setShowNeu(true)} className="btn-primary mt-4"><Plus size={15} strokeWidth={2} /> Ersten Kontakt anlegen</button>
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
                        aria-label="Alle angezeigten Kontakte auswählen" title={alleGefiltertGewaehlt ? 'Auswahl der angezeigten Kontakte aufheben' : `Alle ${gefiltert.length} angezeigten Kontakte auswählen`} />
                    </th>
                  )}
                  <th className="text-left px-4 py-2.5">Name</th>
                  <th className="text-left px-4 py-2.5">Firma</th>
                  <th className="text-left px-4 py-2.5">Segment</th>
                  <th className="text-left px-4 py-2.5 hidden md:table-cell">Kontakt</th>
                  <th className="text-left px-4 py-2.5 hidden lg:table-cell">Ort</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hs-line">
                {gefiltert.map(k => (
                  <ClickableTableRow key={k.id} href={`/crm/kontakte/${k.id}`} className={`transition-colors ${auswahl.has(k.id) ? 'bg-hs-blue-50/60' : 'hover:bg-hs-bg/70'}`}>
                    {writeOk && (
                      <td className="px-3 py-2.5 w-8" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={auswahl.has(k.id)} onChange={() => toggleAuswahl(k.id)} className="accent-hs-teal cursor-pointer" aria-label={`${kontaktName(k)} auswählen`} />
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-hs-text">{k.nachname}{k.vorname ? `, ${k.vorname}` : ''}</div>
                      <div className="text-xs text-hs-text-2">
                        {k.kundennummer && <span className="font-mono mr-2">{k.kundennummer}</span>}
                        {k.position}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-hs-text-1">
                      {k.firma_id && k.firma_name ? (
                        <StopPropagation className="inline">
                          <Link href={`/crm/firmen/${k.firma_id}`} className="hover:text-hs-blue-700 hover:underline">{k.firma_name}</Link>
                        </StopPropagation>
                      ) : <span className="text-hs-tertiary">–</span>}
                    </td>
                    <td className="px-4 py-2.5"><SegmentPill segment={k.segment} /></td>
                    <td className="px-4 py-2.5 hidden md:table-cell text-hs-text-1">
                      <div className="text-xs space-y-0.5">
                        {k.email && <div className="truncate max-w-[220px]">{k.email}</div>}
                        {(k.mobil || k.telefon) && <div className="tabular-nums">{fmtTelefon(k.mobil ? k.mobil_vorwahl : k.telefon_vorwahl, k.mobil ?? k.telefon)}</div>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 hidden lg:table-cell text-hs-text-1">
                      {k.ort ? `${k.plz ? k.plz + ' ' : ''}${k.ort}${k.land && k.land !== 'AT' ? ` (${k.land})` : ''}` : <span className="text-hs-tertiary">–</span>}
                    </td>
                    <td className="px-4 py-2.5"><LeadPill isLead={k.is_lead} /></td>
                  </ClickableTableRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {gefiltert.length > 0 && (
          <div className="px-4 py-2 border-t border-hs-line text-xs text-hs-text-2">
            {gefiltert.length} von {kontakte.length} {kontakte.length === 1 ? 'Kontakt' : 'Kontakten'}
            {auswahl.size > 0 && <> · {auswahl.size} ausgewählt</>}
          </div>
        )}
      </div>

      <Modal open={showPipeline} onClose={() => setShowPipeline(false)} title="Chancen anlegen" subtitle="Für jeden ausgewählten Kontakt wird eine eigene Verkaufschance in der Pipeline angelegt." width="max-w-2xl">
        {showPipeline && (
          <SammelChanceForm
            ziel="kontakte"
            firmen={ausgewaehlte.map(k => ({ id: k.id, name: `${kontaktName(k)}${k.firma_name ? ` (${k.firma_name})` : ''}` }))}
            onDone={({ angelegt, uebersprungen }) => {
              setShowPipeline(false)
              setHinweis(<>
                {angelegt} {angelegt === 1 ? 'Chance' : 'Chancen'} angelegt{uebersprungen > 0 ? `, ${uebersprungen} ${uebersprungen === 1 ? 'Kontakt' : 'Kontakte'} übersprungen (bereits offene Chance)` : ''}.{' '}
                <Link href="/crm/pipeline" className="font-semibold underline underline-offset-2">Zur Pipeline →</Link>
              </>)
              setAuswahl(new Set())
            }}
            onCancel={() => setShowPipeline(false)}
          />
        )}
      </Modal>

      <Modal open={showNeu} onClose={schliesseNeu} title="Neuer Kontakt" subtitle="Die Kundennummer wird automatisch vergeben." width="max-w-2xl">
        <KontaktForm
          firmen={firmen}
          defaultSegment={segment !== 'alle' ? segment : undefined}
          onDone={id => { schliesseNeu(); if (id) router.push(`/crm/kontakte/${id}`) }}
          onCancel={schliesseNeu}
        />
      </Modal>
    </div>
  )
}
