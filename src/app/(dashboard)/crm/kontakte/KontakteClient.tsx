'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Download, Search, Upload } from 'lucide-react'
import { SEGMENTE } from '@/lib/crm/types'
import type { KontaktRow } from '@/lib/crm/types'
import ClickableTableRow from '@/components/ui/ClickableTableRow'
import StopPropagation from '@/components/ui/StopPropagation'
import Modal from '@/components/crm/Modal'
import KontaktForm, { type FirmaOption } from '@/components/crm/KontaktForm'
import { SegmentPill, LeadPill } from '@/components/crm/Pills'
import { fmtTelefon } from '@/components/crm/crmUtils'

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
                  <ClickableTableRow key={k.id} href={`/crm/kontakte/${k.id}`} className="hover:bg-hs-bg/70 transition-colors">
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
          </div>
        )}
      </div>

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
