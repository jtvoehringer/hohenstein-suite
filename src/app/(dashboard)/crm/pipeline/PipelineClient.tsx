'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Check, GripVertical, Building2, User, Calendar, History, X,
} from 'lucide-react'
import { PIPELINE_STUFEN, PIPELINE_KATEGORIEN } from '@/lib/crm/types'
import type { PipelineRow, PipelineStufe } from '@/lib/crm/types'
import { fmtEuroMitZeichen, fmtDatum, fmtDatumZeit, heuteIso } from '@/lib/format'
import { updatePipelineStufe, togglePipelineErledigt, deletePipelineEintrag } from '../actions'
import Modal from '@/components/crm/Modal'
import PipelineForm, { type Option } from '@/components/crm/PipelineForm'
import { StufePill } from '@/components/crm/Pills'

export type VerlaufRow = {
  id: string
  stufe_von: string | null
  stufe_nach: string
  notizen: string | null
  geaendert_am: string
  geaendert_von_name: string | null
}

type Status = 'offen' | 'alle' | 'erledigt'

const STUFEN_KEYS = PIPELINE_STUFEN.map(s => s.value) as PipelineStufe[]
function stufeLabel(v: string) { return PIPELINE_STUFEN.find(s => s.value === v)?.label ?? v }
function kategorieLabel(v: string | null) { return v ? (PIPELINE_KATEGORIEN.find(k => k.value === v)?.label ?? v) : null }
function gewichtet(e: PipelineRow): number {
  if (e.wert_euro == null) return 0
  return e.wert_euro * ((e.wahrscheinlichkeit ?? 100) / 100)
}

// ── Karte ─────────────────────────────────────────────────────────────────────

function ChanceKarte({
  e, writeOk, highlighted, onEdit, onOpen, onDragStart, onDragEnd, dragging,
}: {
  e: PipelineRow
  writeOk: boolean
  highlighted: boolean
  onEdit: () => void
  onOpen: () => void
  onDragStart: () => void
  onDragEnd: () => void
  dragging: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const idx = STUFEN_KEYS.indexOf(e.stufe)
  const heute = heuteIso()
  const ueberfaellig = !e.erledigt && e.erwartetes_datum != null && e.erwartetes_datum < heute && !['abschluss', 'bestandskunde', 'verloren'].includes(e.stufe)

  function move(dir: -1 | 1) {
    const ziel = STUFEN_KEYS[idx + dir]
    if (!ziel) return
    startTransition(async () => { await updatePipelineStufe(e.id, ziel); router.refresh() })
  }
  function toggle() {
    startTransition(async () => { await togglePipelineErledigt(e.id, !e.erledigt); router.refresh() })
  }
  function remove() {
    if (!confirm(`„${e.titel}" wirklich löschen?`)) return
    startTransition(async () => { await deletePipelineEintrag(e.id); router.refresh() })
  }

  return (
    <div
      draggable={writeOk}
      onDragStart={writeOk ? ev => { ev.dataTransfer.setData('text/plain', e.id); ev.dataTransfer.effectAllowed = 'move'; onDragStart() } : undefined}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={`group bg-white rounded-lg border p-3 space-y-1.5 cursor-pointer transition-all
        ${highlighted ? 'border-hs-blue-500 ring-4 ring-hs-blue-50' : 'border-hs-line hover:border-hs-blue-300'}
        ${dragging ? 'opacity-40' : ''} ${e.erledigt ? 'opacity-60' : ''} ${pending ? 'pointer-events-none opacity-50' : ''}`}>
      <div className="flex items-start gap-1.5">
        {writeOk && <GripVertical size={14} strokeWidth={1.5} className="text-hs-tertiary mt-0.5 flex-shrink-0 cursor-grab" />}
        <p className={`text-sm font-medium flex-1 min-w-0 leading-snug ${e.erledigt ? 'line-through text-hs-text-2' : 'text-hs-text'}`}>{e.titel}</p>
        {writeOk && (
          <button type="button" onClick={ev => { ev.stopPropagation(); toggle() }}
            title={e.erledigt ? 'Als offen markieren' : 'Als erledigt markieren'}
            className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 ${
              e.erledigt ? 'bg-hs-ok border-hs-ok text-white' : 'border-hs-line-str text-transparent hover:border-hs-ok'}`}>
            <Check size={10} strokeWidth={3} />
          </button>
        )}
      </div>
      {(e.kontakt_name || e.firma_name) && (
        <div className="text-xs text-hs-text-2 space-y-0.5 pl-0.5">
          {e.firma_name && <div className="inline-flex items-center gap-1 max-w-full"><Building2 size={11} strokeWidth={1.75} className="flex-shrink-0" /><span className="truncate">{e.firma_name}</span></div>}
          {e.kontakt_name && <div className="inline-flex items-center gap-1 max-w-full"><User size={11} strokeWidth={1.75} className="flex-shrink-0" /><span className="truncate">{e.kontakt_name}</span></div>}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        {e.wert_euro != null && <span className="font-mono tabular-nums font-semibold text-hs-blue-700">{fmtEuroMitZeichen(e.wert_euro)}</span>}
        {e.wahrscheinlichkeit != null && <span className="text-hs-text-2">{e.wahrscheinlichkeit} %</span>}
        {e.erwartetes_datum && (
          <span className={`inline-flex items-center gap-1 ${ueberfaellig ? 'text-hs-err-fg font-medium' : 'text-hs-text-2'}`}>
            <Calendar size={11} strokeWidth={1.75} />{fmtDatum(e.erwartetes_datum)}
          </span>
        )}
        {kategorieLabel(e.kategorie) && <span className="text-hs-tertiary">{kategorieLabel(e.kategorie)}</span>}
      </div>
      {writeOk && (
        <div className="flex items-center gap-1 pt-1 border-t border-hs-line opacity-0 group-hover:opacity-100 transition-opacity" onClick={ev => ev.stopPropagation()}>
          <button type="button" onClick={() => move(-1)} disabled={idx <= 0} title={idx > 0 ? `Zurück zu „${stufeLabel(STUFEN_KEYS[idx - 1])}"` : ''}
            className="p-1 rounded text-hs-text-2 hover:bg-hs-bg hover:text-hs-text disabled:opacity-30"><ChevronLeft size={14} strokeWidth={1.75} /></button>
          <button type="button" onClick={() => move(1)} disabled={idx >= STUFEN_KEYS.length - 1} title={idx < STUFEN_KEYS.length - 1 ? `Weiter zu „${stufeLabel(STUFEN_KEYS[idx + 1])}"` : ''}
            className="p-1 rounded text-hs-text-2 hover:bg-hs-bg hover:text-hs-text disabled:opacity-30"><ChevronRight size={14} strokeWidth={1.75} /></button>
          <span className="flex-1" />
          <button type="button" onClick={onEdit} title="Bearbeiten" className="p-1 rounded text-hs-text-2 hover:bg-hs-bg hover:text-hs-blue-700"><Pencil size={13} strokeWidth={1.75} /></button>
          <button type="button" onClick={remove} title="Löschen" className="p-1 rounded text-hs-text-2 hover:bg-hs-err-bg hover:text-hs-err"><Trash2 size={13} strokeWidth={1.75} /></button>
        </div>
      )}
    </div>
  )
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function PipelineClient({
  eintraege, kontakte, firmen, writeOk, highlightId, verlauf, openNeu = false,
}: {
  eintraege: PipelineRow[]
  kontakte: Option[]
  firmen: Option[]
  writeOk: boolean
  highlightId: string | null
  verlauf: VerlaufRow[]
  openNeu?: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [status, setStatus]       = useState<Status>('offen')
  const [kategorie, setKategorie] = useState<string>('alle')
  const [showNeu, setShowNeu]     = useState(openNeu && writeOk)
  const [neuStufe, setNeuStufe]   = useState<string | undefined>(undefined)
  const [editItem, setEditItem]   = useState<PipelineRow | null>(null)
  const [detail, setDetail]       = useState<PipelineRow | null>(() => eintraege.find(e => e.id === highlightId) ?? null)
  const [dragId, setDragId]       = useState<string | null>(null)
  const [dropStufe, setDropStufe] = useState<string | null>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (highlightId) {
      setDetail(eintraege.find(e => e.id === highlightId) ?? null)
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId])
  useEffect(() => { if (openNeu && writeOk) setShowNeu(true) }, [openNeu, writeOk])

  const vorhandeneKategorien = useMemo(
    () => PIPELINE_KATEGORIEN.filter(k => eintraege.some(e => e.kategorie === k.value)), [eintraege])

  const gefiltert = useMemo(() => eintraege.filter(e => {
    if (status === 'offen' && e.erledigt) return false
    if (status === 'erledigt' && !e.erledigt) return false
    if (kategorie !== 'alle' && e.kategorie !== kategorie) return false
    return true
  }), [eintraege, status, kategorie])

  const proStufe = useMemo(() => {
    const map: Record<string, PipelineRow[]> = {}
    for (const s of STUFEN_KEYS) map[s] = []
    for (const e of gefiltert) (map[e.stufe] ??= []).push(e)
    return map
  }, [gefiltert])

  const aktiveStufen = STUFEN_KEYS.filter(s => !['abschluss', 'bestandskunde', 'verloren'].includes(s))
  const kpiOffen     = eintraege.filter(e => !e.erledigt && aktiveStufen.includes(e.stufe))
  const kpiWert      = kpiOffen.reduce((s, e) => s + (e.wert_euro ?? 0), 0)
  const kpiGewichtet = kpiOffen.reduce((s, e) => s + gewichtet(e), 0)
  const kpiAbschluss = eintraege.filter(e => e.stufe === 'abschluss' || e.stufe === 'bestandskunde').length

  function handleDrop(stufe: string) {
    const id = dragId
    setDragId(null); setDropStufe(null)
    if (!id) return
    const item = eintraege.find(e => e.id === id)
    if (!item || item.stufe === stufe) return
    startTransition(async () => { await updatePipelineStufe(id, stufe); router.refresh() })
  }

  function closeDetail() {
    setDetail(null)
    if (highlightId) router.replace('/crm/pipeline')
  }
  function closeNeu() {
    setShowNeu(false); setNeuStufe(undefined)
    if (openNeu) router.replace('/crm/pipeline')
  }

  const segBtn = (aktiv: boolean) =>
    `px-3 py-1.5 text-xs font-medium transition-colors ${aktiv ? 'bg-hs-teal text-white' : 'bg-white text-hs-text-1 hover:bg-hs-bg'}`

  return (
    <div className="space-y-4">
      {/* KPIs + Toolbar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-hs-line px-4 py-3">
          <p className="overline">Offene Chancen</p>
          <p className="kpi mt-1">{kpiOffen.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-hs-line px-4 py-3">
          <p className="overline">Potenzial</p>
          <p className="kpi mt-1 text-hs-blue-700">{fmtEuroMitZeichen(kpiWert)}</p>
        </div>
        <div className="bg-white rounded-xl border border-hs-line px-4 py-3">
          <p className="overline">Gewichtet</p>
          <p className="kpi mt-1">{fmtEuroMitZeichen(kpiGewichtet)}</p>
        </div>
        <div className="bg-white rounded-xl border border-hs-line px-4 py-3">
          <p className="overline">Gewonnen</p>
          <p className="kpi mt-1 text-hs-ok-fg">{kpiAbschluss}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-hs-line p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center border border-hs-line-str rounded-lg overflow-hidden">
          {(['offen', 'alle', 'erledigt'] as const).map(s => (
            <button key={s} onClick={() => setStatus(s)} className={segBtn(status === s)}>
              {s === 'offen' ? 'Offen' : s === 'erledigt' ? 'Erledigt' : 'Alle'}
            </button>
          ))}
        </div>
        {vorhandeneKategorien.length > 0 && (
          <select value={kategorie} onChange={e => setKategorie(e.target.value)} className="input w-auto py-1.5 text-xs">
            <option value="alle">Alle Kategorien</option>
            {vorhandeneKategorien.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        )}
        <span className="text-xs text-hs-text-2">{gefiltert.length} {gefiltert.length === 1 ? 'Eintrag' : 'Einträge'}</span>
        {writeOk && (
          <button onClick={() => setShowNeu(true)} className="btn-primary ml-auto"><Plus size={15} strokeWidth={2} /> Neue Chance</button>
        )}
      </div>

      {/* Kanban */}
      {eintraege.length === 0 ? (
        <div className="bg-white rounded-xl border border-hs-line p-8 text-center">
          <p className="text-sm text-hs-text-2">Noch keine Verkaufschancen angelegt.</p>
          {writeOk && <button onClick={() => setShowNeu(true)} className="btn-primary mt-4"><Plus size={15} strokeWidth={2} /> Erste Chance anlegen</button>}
        </div>
      ) : (
        <div className="overflow-x-auto pb-2 -mx-1 px-1">
          <div className="flex gap-3 min-w-max items-start">
            {PIPELINE_STUFEN.map(stufe => {
              const items = proStufe[stufe.value] ?? []
              const summe = items.reduce((s, e) => s + (e.wert_euro ?? 0), 0)
              const gew   = items.reduce((s, e) => s + gewichtet(e), 0)
              const isDrop = dropStufe === stufe.value && dragId != null
              return (
                <div key={stufe.value}
                  onDragOver={ev => { if (dragId) { ev.preventDefault(); setDropStufe(stufe.value) } }}
                  onDragLeave={() => setDropStufe(prev => prev === stufe.value ? null : prev)}
                  onDrop={ev => { ev.preventDefault(); handleDrop(stufe.value) }}
                  className={`w-[260px] flex-shrink-0 rounded-xl border transition-colors ${isDrop ? 'border-hs-blue-500 bg-hs-blue-50/60' : 'border-hs-line bg-hs-bg/60'}`}>
                  <div className="px-3 py-2.5 border-b border-hs-line bg-white rounded-t-xl">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`pill ${stufe.farbe}`}>{stufe.label}</span>
                      <span className="text-xs font-mono tabular-nums text-hs-text-2">{items.length}</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 mt-1.5 text-[11px]">
                      <span className="text-hs-text-2">Summe <span className="font-mono tabular-nums text-hs-text">{summe > 0 ? fmtEuroMitZeichen(summe) : '–'}</span></span>
                      <span className="text-hs-text-2">gew. <span className="font-mono tabular-nums text-hs-text">{gew > 0 ? fmtEuroMitZeichen(gew) : '–'}</span></span>
                    </div>
                  </div>
                  <div className="p-2 space-y-2 min-h-[120px]">
                    {items.length === 0 && (
                      <p className="text-[11px] text-hs-tertiary text-center py-6 select-none">{isDrop ? 'Hier ablegen' : 'Keine Einträge'}</p>
                    )}
                    {items.map(e => (
                      <div key={e.id} ref={e.id === highlightId ? highlightRef : undefined}>
                        <ChanceKarte
                          e={e} writeOk={writeOk} highlighted={e.id === highlightId}
                          onEdit={() => setEditItem(e)} onOpen={() => setDetail(e)}
                          onDragStart={() => setDragId(e.id)} onDragEnd={() => { setDragId(null); setDropStufe(null) }}
                          dragging={dragId === e.id} />
                      </div>
                    ))}
                    {writeOk && (
                      <button type="button" onClick={() => { setNeuStufe(stufe.value); setShowNeu(true) }}
                        className="w-full text-[11px] text-hs-text-2 hover:text-hs-blue-700 border border-dashed border-hs-line-str rounded-lg py-1.5 inline-flex items-center justify-center gap-1">
                        <Plus size={11} strokeWidth={2} /> Chance
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Detail */}
      <Modal open={!!detail} onClose={closeDetail} title={detail?.titel ?? ''} subtitle={detail ? <StufePill stufe={detail.stufe} /> : null} width="max-w-xl">
        {detail && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-hs-text-2">Firma</dt>
              <dd>{detail.firma_id && detail.firma_name ? <Link href={`/crm/firmen/${detail.firma_id}`} className="text-hs-blue-700 hover:underline">{detail.firma_name}</Link> : '–'}</dd>
              <dt className="text-hs-text-2">Kontakt</dt>
              <dd>{detail.kontakt_id && detail.kontakt_name ? <Link href={`/crm/kontakte/${detail.kontakt_id}`} className="text-hs-blue-700 hover:underline">{detail.kontakt_name}</Link> : '–'}</dd>
              <dt className="text-hs-text-2">Kategorie</dt><dd>{kategorieLabel(detail.kategorie) ?? '–'}</dd>
              <dt className="text-hs-text-2">Wert</dt><dd className="font-mono tabular-nums">{fmtEuroMitZeichen(detail.wert_euro)}</dd>
              <dt className="text-hs-text-2">Wahrscheinlichkeit</dt><dd>{detail.wahrscheinlichkeit != null ? `${detail.wahrscheinlichkeit} %` : '–'}</dd>
              <dt className="text-hs-text-2">Gewichtet</dt><dd className="font-mono tabular-nums">{detail.wert_euro != null ? fmtEuroMitZeichen(gewichtet(detail)) : '–'}</dd>
              <dt className="text-hs-text-2">Erwarteter Abschluss</dt>
              <dd>{detail.erwartetes_datum ? `${fmtDatum(detail.erwartetes_datum)}${!detail.ganztags && detail.uhrzeit_von ? `, ${detail.uhrzeit_von.slice(0, 5)}${detail.uhrzeit_bis ? `–${detail.uhrzeit_bis.slice(0, 5)}` : ''}` : ''}` : '–'}</dd>
              <dt className="text-hs-text-2">Status</dt>
              <dd>{detail.erledigt ? <span className="pill bg-hs-ok-bg text-hs-ok-fg">Erledigt{detail.erledigt_am ? ` · ${fmtDatum(detail.erledigt_am)}` : ''}</span> : <span className="pill bg-hs-blue-50 text-hs-blue-700">Offen</span>}</dd>
            </dl>
            {detail.notizen && <p className="text-sm text-hs-text-1 whitespace-pre-wrap bg-hs-bg rounded-lg p-3">{detail.notizen}</p>}

            {writeOk && (
              <div>
                <p className="form-label">Stufe wechseln</p>
                <div className="flex flex-wrap gap-1">
                  {PIPELINE_STUFEN.map(s => (
                    <button key={s.value} type="button" disabled={s.value === detail.stufe}
                      onClick={() => startTransition(async () => { await updatePipelineStufe(detail.id, s.value); setDetail({ ...detail, stufe: s.value }); router.refresh() })}
                      className={`pill border transition-colors ${s.value === detail.stufe ? `${s.farbe} border-transparent` : 'bg-white border-hs-line text-hs-text-1 hover:border-hs-blue-300'}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {detail.id === highlightId && (
              <div>
                <p className="form-label inline-flex items-center gap-1"><History size={12} strokeWidth={1.75} />Verlauf</p>
                {verlauf.length === 0 ? (
                  <p className="text-xs text-hs-text-2">Kein Verlauf protokolliert.</p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {verlauf.map(v => (
                      <li key={v.id} className="flex items-center gap-2 flex-wrap">
                        <span className="text-hs-text-2 tabular-nums w-32 flex-shrink-0">{fmtDatumZeit(v.geaendert_am)}</span>
                        {v.stufe_von ? <><StufePill stufe={v.stufe_von} /><span className="text-hs-tertiary">→</span></> : null}
                        <StufePill stufe={v.stufe_nach} />
                        {v.geaendert_von_name && <span className="text-hs-text-2">· {v.geaendert_von_name}</span>}
                        {v.notizen && <span className="text-hs-text-2">· {v.notizen}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {detail.id !== highlightId && (
              <Link href={`/crm/pipeline?id=${detail.id}`} className="text-xs text-hs-blue-700 hover:underline inline-flex items-center gap-1">
                <History size={12} strokeWidth={1.75} />Verlauf anzeigen
              </Link>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-hs-line">
              {writeOk && <button onClick={() => { setEditItem(detail); setDetail(null) }} className="btn-primary"><Pencil size={14} strokeWidth={1.75} /> Bearbeiten</button>}
              <button onClick={closeDetail} className="btn-secondary"><X size={14} strokeWidth={1.75} /> Schließen</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showNeu} onClose={closeNeu} title="Neue Verkaufschance" width="max-w-2xl">
        <PipelineForm kontakte={kontakte} firmen={firmen} defaultStufe={neuStufe} onDone={closeNeu} onCancel={closeNeu} />
      </Modal>

      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Verkaufschance bearbeiten" subtitle={editItem?.titel} width="max-w-2xl">
        {editItem && <PipelineForm initial={editItem} kontakte={kontakte} firmen={firmen} onDone={() => setEditItem(null)} onCancel={() => setEditItem(null)} />}
      </Modal>
    </div>
  )
}
