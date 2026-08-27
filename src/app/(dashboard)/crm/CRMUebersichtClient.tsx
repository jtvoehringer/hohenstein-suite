'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Plus, Lock, Pencil, Trash2, Check, X, Calendar, ArrowRight } from 'lucide-react'
import { AKTIVITAET_ARTEN, aktivitaetLabel } from '@/lib/crm/types'
import { MONATE, MONATE_KURZ, fmtDatum } from '@/lib/format'
import { createAktivitaet, updateAktivitaet, moveAktivitaet, toggleAktivitaetErledigt, deleteAktivitaet } from './actions'
import KundenSuche from '@/components/crm/KundenSuche'
import Modal from '@/components/crm/Modal'
import { ART_FARBEN } from '@/components/crm/Pills'

// ── Typen ─────────────────────────────────────────────────────────────────────

export type KalenderEintrag = {
  id: string
  datum: string             // YYYY-MM-DD
  bis_datum: string | null  // Enddatum bei mehrtägigen Ganztags-Terminen
  titel: string
  art: string
  beschreibung: string | null
  ganztags: boolean
  uhrzeit_von: string | null
  uhrzeit_bis: string | null
  erledigt: boolean
  ueberfaellig: boolean
  ist_privat: boolean
  erstellt_von: string | null
  kontakt_id: string | null
  firma_id: string | null
  kontaktName: string | null
  firmaName: string | null
}

type Option = { id: string; name: string; sub?: string | null }
type ViewMode = 'woche' | 'monat' | 'jahr'
type NeuState = { datum: string; von: string; bis: string; ganztags: boolean }

// ── Datum-Hilfsfunktionen ─────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date { const d = new Date(date); d.setDate(d.getDate() + days); return d }
function startOfWeek(date: Date): Date {
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); return d
}
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseDate(s: string): Date { return new Date(s + 'T12:00:00') }
function fmtT(t: string | null | undefined): string | null { return t ? t.slice(0, 5) : null }
function toMin(t: string): number { const [h, m] = t.split(':').map(Number); return h * 60 + m }
function wochentagLang(s: string): string { return parseDate(s).toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' }) }

const WOCHENTAGE      = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const WOCHENTAGE_KURZ = ['M', 'D', 'M', 'D', 'F', 'S', 'S']
const HOUR_H = 56
const KALENDER_ARTEN = AKTIVITAET_ARTEN.filter(a => !('nurAnzeige' in a && a.nurAnzeige))

function chipFarbe(e: KalenderEintrag): string {
  if (e.erledigt) return 'bg-gray-50 text-gray-400 border-gray-200 opacity-70'
  if (e.ueberfaellig) return 'bg-hs-err text-white border-hs-err'
  return ART_FARBEN[e.art] ?? 'bg-gray-50 text-gray-700 border-gray-200'
}

/** Ein mehrtägiger Eintrag zählt an jedem Tag des Zeitraums */
function tageVon(e: KalenderEintrag): string[] {
  if (!e.bis_datum || e.bis_datum <= e.datum) return [e.datum]
  const out: string[] = []
  let d = parseDate(e.datum)
  const end = parseDate(e.bis_datum)
  let guard = 0
  while (d <= end && guard++ < 370) { out.push(toDateStr(d)); d = addDays(d, 1) }
  return out
}

// ── Chip ──────────────────────────────────────────────────────────────────────

function EintragChip({ e, compact = false, onOpen }: { e: KalenderEintrag; compact?: boolean; onOpen: (e: KalenderEintrag) => void }) {
  const von = !e.ganztags ? fmtT(e.uhrzeit_von) : null
  const bis = !e.ganztags ? fmtT(e.uhrzeit_bis) : null
  return (
    <div onClick={ev => { ev.stopPropagation(); onOpen(e) }}
      title={`${e.titel}${e.kontaktName ? ` – ${e.kontaktName}` : ''}${e.firmaName ? ` (${e.firmaName})` : ''}`}
      className={`border rounded truncate leading-snug cursor-pointer hover:opacity-80 transition-opacity ${compact ? 'text-[10px] px-1 py-px' : 'text-xs px-2 py-1'} ${chipFarbe(e)}`}>
      {von && <span className="font-semibold mr-1 tabular-nums">{compact ? von : bis ? `${von}–${bis}` : von}</span>}
      {e.ist_privat && <Lock size={9} strokeWidth={2} className="inline mr-0.5 -mt-px" />}
      <span className="font-medium">{e.titel}</span>
      {!compact && (e.kontaktName || e.firmaName) && (
        <span className="block text-[10px] opacity-70 truncate">{e.kontaktName ?? e.firmaName}</span>
      )}
    </div>
  )
}

// ── Wochen-Ansicht (Zeitachse) ────────────────────────────────────────────────

function WochenView({
  eintraege, current, heute, writeOk, onOpen, onNeu, onMove,
}: {
  eintraege: KalenderEintrag[]
  current: Date
  heute: string
  writeOk: boolean
  onOpen: (e: KalenderEintrag) => void
  onNeu: (n: NeuState) => void
  onMove: (id: string, datum: string, von: string, bis: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const monday = useMemo(() => startOfWeek(current), [current])
  const days   = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday])
  const weekStart = toDateStr(days[0])
  const weekEnd   = toDateStr(days[6])
  const [dragInfo, setDragInfo]     = useState<{ id: string; duration: number; ganztags: boolean } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, 7 * HOUR_H)
  }, [monday])

  const byDay = useMemo(() => {
    const map: Record<string, { ganztags: KalenderEintrag[]; timed: KalenderEintrag[] }> = {}
    days.forEach(d => { map[toDateStr(d)] = { ganztags: [], timed: [] } })
    for (const e of eintraege) {
      if (e.bis_datum && e.bis_datum > e.datum) continue   // mehrtägig → Balken
      if (!map[e.datum]) continue
      if (e.ganztags || !e.uhrzeit_von) map[e.datum].ganztags.push(e)
      else map[e.datum].timed.push(e)
    }
    return map
  }, [eintraege, days])

  const multiDay = useMemo(
    () => eintraege.filter(e => e.bis_datum && e.bis_datum > e.datum && e.datum <= weekEnd && e.bis_datum >= weekStart),
    [eintraege, weekStart, weekEnd])

  const now = new Date()
  const nowTop = (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_H

  function vonTop(t: string) { return toMin(t) / 60 * HOUR_H }
  function blockHeight(von: string, bis: string | null) {
    if (!bis) return HOUR_H / 2
    return Math.max(HOUR_H / 2, (toMin(bis) - toMin(von)) / 60 * HOUR_H)
  }

  /** Überlappende Termine nebeneinander (Greedy-Spalten je Cluster) */
  function layoutOverlaps(items: KalenderEintrag[]): Map<string, { col: number; cols: number }> {
    const result = new Map<string, { col: number; cols: number }>()
    type Ev = { id: string; start: number; end: number }
    const evs: Ev[] = items.map(e => {
      const start = e.uhrzeit_von ? toMin(e.uhrzeit_von) : 0
      return { id: e.id, start, end: e.uhrzeit_bis ? toMin(e.uhrzeit_bis) : start + 30 }
    }).sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))
    function flush(cluster: Ev[]) {
      const colEnds: number[] = []; const colOf = new Map<string, number>()
      for (const e of cluster) {
        let c = colEnds.findIndex(end => end <= e.start)
        if (c === -1) { c = colEnds.length; colEnds.push(e.end) } else colEnds[c] = e.end
        colOf.set(e.id, c)
      }
      cluster.forEach(e => result.set(e.id, { col: colOf.get(e.id)!, cols: colEnds.length }))
    }
    let cluster: Ev[] = []; let clusterEnd = -Infinity
    for (const e of evs) {
      if (cluster.length === 0 || e.start < clusterEnd) { cluster.push(e); clusterEnd = Math.max(clusterEnd, e.end) }
      else { flush(cluster); cluster = [e]; clusterEnd = e.end }
    }
    if (cluster.length) flush(cluster)
    return result
  }

  function snapTime(clientY: number, rect: DOMRect, duration = 30) {
    const y = Math.max(0, clientY - rect.top)
    const mins = Math.floor(Math.min(23.5 * 60, y / HOUR_H * 60) / 30) * 30
    const endMins = Math.min(mins + duration, 24 * 60)
    const f = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    return { von: f(mins), bis: f(endMins) }
  }

  const gridCols = { gridTemplateColumns: '52px repeat(7, minmax(0, 1fr))' }

  return (
    <div className="bg-white rounded-xl border border-hs-line overflow-hidden">
      {/* Kopf + Ganztags */}
      <div className="sticky top-0 z-20 bg-white">
        <div className="grid border-b border-hs-line" style={gridCols}>
          <div className="bg-hs-bg border-r border-hs-line" />
          {days.map((d, i) => {
            const isToday = toDateStr(d) === heute
            return (
              <div key={i} className={`px-2 py-2 text-center border-l border-hs-line ${isToday ? 'bg-hs-teal text-white' : 'bg-hs-bg'}`}>
                <div className={`text-[10px] font-medium ${isToday ? 'text-white/80' : 'text-hs-text-2'}`}>{WOCHENTAGE[i]}</div>
                <div className={`text-lg font-semibold leading-tight font-display ${isToday ? 'text-white' : 'text-hs-text'}`}>{d.getDate()}</div>
              </div>
            )
          })}
        </div>

        {multiDay.length > 0 && (
          <div className="relative border-b border-hs-line" style={{ height: `${multiDay.length * 20 + 4}px` }}>
            <div className="absolute left-0 top-0 h-full w-[52px] bg-hs-bg border-r border-hs-line z-10 flex items-end justify-end pb-1 pr-1">
              <span className="text-[9px] text-hs-tertiary leading-none">mehrtägig</span>
            </div>
            {days.map((_, i) => (
              <div key={i} className="absolute top-0 h-full border-l border-hs-line/60 pointer-events-none"
                style={{ left: `calc(52px + ${i} * ((100% - 52px) / 7))` }} />
            ))}
            {multiDay.map((e, idx) => {
              const start = e.datum < weekStart ? weekStart : e.datum
              const end   = (e.bis_datum ?? e.datum) > weekEnd ? weekEnd : (e.bis_datum ?? e.datum)
              const si = days.findIndex(d => toDateStr(d) === start)
              const ei = days.findIndex(d => toDateStr(d) === end)
              if (si < 0 || ei < 0) return null
              const early = e.datum < weekStart, late = (e.bis_datum ?? e.datum) > weekEnd
              const colW = '((100% - 52px) / 7)'
              return (
                <div key={e.id} onClick={() => onOpen(e)} title={e.titel}
                  className={`absolute flex items-center gap-1 px-2 overflow-hidden cursor-pointer hover:opacity-80 z-20 text-[10px] font-semibold select-none border ${chipFarbe(e)}`}
                  style={{
                    top: `${2 + idx * 20}px`, height: '18px',
                    left: `calc(52px + ${si} * ${colW}${early ? '' : ' + 2px'})`,
                    width: `calc(${ei - si + 1} * ${colW}${late ? '' : ' - 4px'})`,
                    borderRadius: early && late ? 0 : early ? '0 4px 4px 0' : late ? '4px 0 0 4px' : 4,
                  }}>
                  {early && <ChevronLeft size={10} strokeWidth={2} className="flex-shrink-0" />}
                  <span className="truncate">{e.titel}</span>
                  {late && <ChevronRight size={10} strokeWidth={2} className="flex-shrink-0" />}
                </div>
              )
            })}
          </div>
        )}

        <div className="grid border-b border-hs-line" style={gridCols}>
          <div className="bg-hs-bg border-r border-hs-line flex items-center justify-end px-1">
            <span className="text-[9px] text-hs-tertiary leading-none">ganztags</span>
          </div>
          {days.map((d, i) => {
            const ds = toDateStr(d)
            const items = byDay[ds]?.ganztags ?? []
            const isDrop = dropTarget === ds && dragInfo?.ganztags
            return (
              <div key={i}
                className={`border-l border-hs-line p-1 space-y-0.5 min-h-[30px] transition-colors ${writeOk ? 'cursor-pointer' : ''} ${isDrop ? 'bg-hs-blue-50' : 'hover:bg-hs-bg/60'}`}
                onClick={() => { if (writeOk && !dragInfo) onNeu({ datum: ds, von: '', bis: '', ganztags: true }) }}
                onDragOver={ev => { if (dragInfo?.ganztags) { ev.preventDefault(); setDropTarget(ds) } }}
                onDragLeave={() => setDropTarget(p => p === ds ? null : p)}
                onDrop={ev => { ev.preventDefault(); if (dragInfo?.ganztags) { onMove(dragInfo.id, ds, '', '') } setDragInfo(null); setDropTarget(null) }}>
                {items.map(e => (
                  <div key={e.id} draggable={writeOk}
                    onDragStart={writeOk ? ev => { ev.dataTransfer.setData('text/plain', e.id); setDragInfo({ id: e.id, duration: 0, ganztags: true }) } : undefined}
                    onDragEnd={() => { setDragInfo(null); setDropTarget(null) }}
                    className={writeOk ? 'cursor-grab active:cursor-grabbing' : ''}>
                    <EintragChip e={e} compact onOpen={onOpen} />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Zeitraster */}
      <div ref={scrollRef} className="overflow-y-auto" style={{ height: '540px' }}>
        <div className="relative" style={{ height: `${24 * HOUR_H}px` }}>
          <div className="absolute inset-0 grid pointer-events-none" style={gridCols}>
            <div className="relative bg-hs-bg border-r border-hs-line">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="absolute w-full flex justify-end pr-2" style={{ top: `${h * HOUR_H}px`, height: `${HOUR_H}px` }}>
                  <span className="text-[10px] text-hs-tertiary tabular-nums mt-1 font-mono">{String(h).padStart(2, '0')}:00</span>
                </div>
              ))}
            </div>
            {days.map((_, i) => (
              <div key={i} className="relative border-l border-hs-line/60">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="absolute w-full" style={{ top: `${h * HOUR_H}px`, height: `${HOUR_H}px` }}>
                    <div className="absolute top-0 w-full border-t border-hs-line" />
                    <div className="absolute top-1/2 w-full border-t border-hs-line/50 border-dashed" />
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="absolute inset-0 grid" style={gridCols}>
            <div />
            {days.map((d, i) => {
              const ds = toDateStr(d)
              const items = byDay[ds]?.timed ?? []
              const layout = layoutOverlaps(items)
              const isDrop = dropTarget === ds && !!dragInfo && !dragInfo.ganztags
              return (
                <div key={i}
                  className={`relative border-l border-hs-line/60 ${writeOk ? 'cursor-crosshair' : ''} ${isDrop ? 'bg-hs-blue-50/60' : ''}`}
                  onClick={ev => {
                    if (!writeOk || dragInfo) return
                    if ((ev.target as HTMLElement).closest('[data-chip]')) return
                    const { von, bis } = snapTime(ev.clientY, ev.currentTarget.getBoundingClientRect())
                    onNeu({ datum: ds, von, bis, ganztags: false })
                  }}
                  onDragOver={ev => { if (dragInfo && !dragInfo.ganztags) { ev.preventDefault(); setDropTarget(ds) } }}
                  onDragLeave={() => setDropTarget(p => p === ds ? null : p)}
                  onDrop={ev => {
                    ev.preventDefault()
                    if (dragInfo && !dragInfo.ganztags) {
                      const { von, bis } = snapTime(ev.clientY, ev.currentTarget.getBoundingClientRect(), dragInfo.duration)
                      onMove(dragInfo.id, ds, von, bis)
                    }
                    setDragInfo(null); setDropTarget(null)
                  }}>
                  {items.map(e => {
                    const top = vonTop(e.uhrzeit_von!)
                    const h   = blockHeight(e.uhrzeit_von!, e.uhrzeit_bis)
                    const dur = e.uhrzeit_bis ? Math.max(30, toMin(e.uhrzeit_bis) - toMin(e.uhrzeit_von!)) : 30
                    const { col, cols } = layout.get(e.id) ?? { col: 0, cols: 1 }
                    const w = 100 / cols
                    return (
                      <div key={e.id} data-chip
                        draggable={writeOk}
                        onDragStart={writeOk ? ev => { ev.dataTransfer.setData('text/plain', e.id); setDragInfo({ id: e.id, duration: dur, ganztags: false }) } : undefined}
                        onDragEnd={() => { setDragInfo(null); setDropTarget(null) }}
                        onClick={ev => { ev.stopPropagation(); if (!dragInfo) onOpen(e) }}
                        className={`absolute overflow-hidden rounded border ${chipFarbe(e)} ${writeOk ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${dragInfo?.id === e.id ? 'opacity-30' : 'hover:opacity-85'}`}
                        style={{ top: `${top}px`, height: `${h}px`, left: `calc(${col * w}% + 2px)`, width: `calc(${w}% - 4px)`, zIndex: 10 + col }}>
                        <div className="px-1.5 py-0.5">
                          <div className="text-[10px] font-semibold tabular-nums leading-tight">{fmtT(e.uhrzeit_von)}{e.uhrzeit_bis ? `–${fmtT(e.uhrzeit_bis)}` : ''}</div>
                          <div className="text-[10px] font-medium truncate leading-tight">{e.ist_privat && <Lock size={9} strokeWidth={2} className="inline mr-0.5 -mt-px" />}{e.titel}</div>
                          {h > 44 && (e.kontaktName || e.firmaName) && <div className="text-[9px] opacity-70 truncate">{e.kontaktName ?? e.firmaName}</div>}
                        </div>
                      </div>
                    )
                  })}
                  {ds === heute && (
                    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: `${nowTop}px` }}>
                      <div className="relative border-t-2 border-hs-err">
                        <div className="absolute -left-1.5 -top-[5px] w-2.5 h-2.5 rounded-full bg-hs-err" />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Monats-Ansicht ────────────────────────────────────────────────────────────

function wochenImMonat(year: number, month: number): Date[][] {
  const start = startOfWeek(new Date(year, month, 1))
  const end   = addDays(startOfWeek(new Date(year, month + 1, 0)), 6)
  const ws: Date[][] = []
  let d = new Date(start)
  while (d <= end) { ws.push(Array.from({ length: 7 }, (_, i) => addDays(d, i))); d = addDays(d, 7) }
  return ws
}

function MonatView({
  byDay, current, heute, writeOk, onOpen, onNeu,
}: {
  byDay: Record<string, KalenderEintrag[]>
  current: Date
  heute: string
  writeOk: boolean
  onOpen: (e: KalenderEintrag) => void
  onNeu: (n: NeuState) => void
}) {
  const year = current.getFullYear(), month = current.getMonth()
  const weeks = useMemo(() => wochenImMonat(year, month), [year, month])
  return (
    <div className="bg-white rounded-xl border border-hs-line overflow-hidden">
      <div className="grid grid-cols-7 table-head">
        {WOCHENTAGE.map(d => <div key={d} className="text-center py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flatMap((week, wi) => week.map((day, di) => {
          const ds = toDateStr(day)
          const items = byDay[ds] ?? []
          const inMonth = day.getMonth() === month
          const isToday = ds === heute
          const hasOverdue = items.some(e => e.ueberfaellig)
          const extra = items.length - 4
          return (
            <div key={`${wi}-${di}`}
              onClick={() => { if (writeOk) onNeu({ datum: ds, von: '', bis: '', ganztags: true }) }}
              className={`min-h-[96px] p-1.5 border-t border-hs-line ${di > 0 ? 'border-l' : ''} ${!inMonth ? 'bg-hs-bg/60' : 'bg-white'} ${writeOk ? 'cursor-pointer hover:bg-hs-bg/40' : ''} ${isToday ? 'ring-2 ring-inset ring-hs-blue-300' : ''}`}>
              <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold mb-1 font-mono
                ${isToday ? 'bg-hs-teal text-white' : hasOverdue ? 'bg-hs-err text-white' : inMonth ? 'text-hs-text' : 'text-hs-tertiary'}`}>
                {day.getDate()}
              </div>
              <div className="space-y-0.5">
                {items.slice(0, 4).map(e => <EintragChip key={e.id} e={e} compact onOpen={onOpen} />)}
                {extra > 0 && <div className="text-[10px] text-hs-text-2 pl-0.5">+{extra} weitere</div>}
              </div>
            </div>
          )
        }))}
      </div>
    </div>
  )
}

// ── Jahres-Ansicht ────────────────────────────────────────────────────────────

function JahrView({ byDay, current, heute, onTag }: {
  byDay: Record<string, KalenderEintrag[]>; current: Date; heute: string; onTag: (datum: string) => void
}) {
  const year = current.getFullYear()
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: 12 }, (_, m) => {
        const weeks = wochenImMonat(year, m)
        return (
          <div key={m} className="bg-white rounded-xl border border-hs-line p-3">
            <div className="text-xs font-semibold text-hs-text text-center mb-2 font-display">{MONATE_KURZ[m]}</div>
            <div className="grid grid-cols-7 mb-0.5">
              {WOCHENTAGE_KURZ.map((d, i) => <div key={i} className="text-center text-[9px] text-hs-tertiary">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {weeks.flatMap((week, wi) => week.map((day, di) => {
                const ds = toDateStr(day)
                const items = byDay[ds] ?? []
                const inMonth = day.getMonth() === m
                const isToday = ds === heute
                const overdue = items.some(e => e.ueberfaellig)
                return (
                  <button key={`${wi}-${di}`} type="button" onClick={() => onTag(ds)} className="flex items-center justify-center py-px">
                    <span className={`w-[20px] h-[20px] flex items-center justify-center rounded-full text-[10px] font-mono
                      ${!inMonth ? 'opacity-20' : ''}
                      ${isToday ? 'bg-hs-teal text-white' : overdue ? 'bg-hs-err text-white' : items.length > 0 ? 'bg-hs-blue-50 text-hs-blue-700 font-semibold' : 'text-hs-text-2 hover:bg-hs-bg'}`}>
                      {day.getDate()}
                    </span>
                  </button>
                )
              }))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function CRMUebersichtClient({
  eintraege, heute, kontakte, firmen, userProfiles, currentUserId, writeOk, initialDatum, openNeu = false,
}: {
  eintraege: KalenderEintrag[]
  heute: string
  kontakte: Option[]
  firmen: Option[]
  userProfiles: Record<string, string>
  currentUserId: string | null
  writeOk: boolean
  initialDatum: string | null
  openNeu?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [view, setView]         = useState<ViewMode>('woche')
  const [current, setCurrent]   = useState<Date>(() => initialDatum ? parseDate(initialDatum) : new Date())
  const [artFilter, setArtFilter]   = useState<string>('alle')
  const [userFilter, setUserFilter] = useState<string>('alle')
  const [viewAkt, setViewAkt]   = useState<KalenderEintrag | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [neu, setNeu]           = useState<NeuState | null>(() => openNeu && writeOk ? { datum: initialDatum ?? heute, von: '', bis: '', ganztags: true } : null)
  const [neuKontakt, setNeuKontakt] = useState('')
  const [neuFirma, setNeuFirma]     = useState('')
  const [neuGanztags, setNeuGanztags] = useState(true)
  const [fehler, setFehler]     = useState<string | null>(null)

  useEffect(() => { if (neu) setNeuGanztags(neu.ganztags) }, [neu])
  useEffect(() => { if (initialDatum) setCurrent(parseDate(initialDatum)) }, [initialDatum])
  useEffect(() => {
    if (openNeu && writeOk) { setFehler(null); setNeuKontakt(''); setNeuFirma(''); setNeu({ datum: initialDatum ?? heute, von: '', bis: '', ganztags: true }) }
  }, [openNeu, writeOk, initialDatum, heute])

  const uniqueUsers = useMemo(
    () => [...new Set(eintraege.map(e => e.erstellt_von).filter((u): u is string => !!u))].filter(u => !!userProfiles[u]),
    [eintraege, userProfiles])
  const vorhandeneArten = useMemo(() => KALENDER_ARTEN.filter(a => eintraege.some(e => e.art === a.value)), [eintraege])

  const gefiltert = useMemo(() => eintraege.filter(e => {
    if (artFilter !== 'alle' && e.art !== artFilter) return false
    if (userFilter !== 'alle' && e.erstellt_von && e.erstellt_von !== userFilter) return false
    return true
  }), [eintraege, artFilter, userFilter])

  const byDay = useMemo(() => {
    const map: Record<string, KalenderEintrag[]> = {}
    for (const e of gefiltert) for (const d of tageVon(e)) (map[d] ??= []).push(e)
    return map
  }, [gefiltert])

  function navigate(dir: number) {
    setCurrent(prev => {
      const d = new Date(prev)
      if (view === 'woche') d.setDate(d.getDate() + dir * 7)
      else if (view === 'monat') d.setMonth(d.getMonth() + dir)
      else d.setFullYear(d.getFullYear() + dir)
      return d
    })
  }

  const periodLabel = useMemo(() => {
    if (view === 'woche') {
      const mon = startOfWeek(current), sun = addDays(mon, 6)
      if (mon.getMonth() === sun.getMonth()) return `${mon.getDate()}.–${sun.getDate()}. ${MONATE[mon.getMonth()]} ${mon.getFullYear()}`
      if (mon.getFullYear() === sun.getFullYear()) return `${mon.getDate()}. ${MONATE_KURZ[mon.getMonth()]} – ${sun.getDate()}. ${MONATE_KURZ[sun.getMonth()]} ${sun.getFullYear()}`
      return `${mon.getDate()}. ${MONATE_KURZ[mon.getMonth()]} ${mon.getFullYear()} – ${sun.getDate()}. ${MONATE_KURZ[sun.getMonth()]} ${sun.getFullYear()}`
    }
    if (view === 'monat') return `${MONATE[current.getMonth()]} ${current.getFullYear()}`
    return String(current.getFullYear())
  }, [view, current])

  const heuteCount = (byDay[heute] ?? []).length
  const ueberfaelligCount = gefiltert.filter(e => e.ueberfaellig).length

  function openNeuModal(n: NeuState) { setFehler(null); setNeuKontakt(''); setNeuFirma(''); setNeu(n) }
  function closeNeu() { setNeu(null); if (openNeu) router.replace('/crm') }
  function closeView() { setViewAkt(null); setEditMode(false); setFehler(null) }

  function handleSaveNeu(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('ganztags', neuGanztags ? 'true' : 'false')
    fd.set('kontakt_id', neuKontakt)
    fd.set('firma_id', neuFirma)
    fd.set('ist_privat', fd.get('privat_check') === 'on' ? 'true' : 'false')
    fd.set('erledigt', 'false')
    setFehler(null)
    startTransition(async () => {
      const res = await createAktivitaet(fd)
      if (res?.error) { setFehler(res.error); return }
      closeNeu(); router.refresh()
    })
  }

  function handleSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!viewAkt) return
    const fd = new FormData(e.currentTarget)
    const ganztags = fd.get('ganztags_check') === 'on'
    fd.set('ganztags', ganztags ? 'true' : 'false')
    fd.set('erledigt', fd.get('erledigt_check') === 'on' ? 'true' : 'false')
    fd.set('ist_privat', fd.get('privat_check') === 'on' ? 'true' : 'false')
    setFehler(null)
    startTransition(async () => {
      const res = await updateAktivitaet(viewAkt.id, fd)
      if (res?.error) { setFehler(res.error); return }
      closeView(); router.refresh()
    })
  }

  function handleMove(id: string, datum: string, von: string, bis: string) {
    startTransition(async () => { await moveAktivitaet(id, datum, von, bis); router.refresh() })
  }

  const segBtn = (aktiv: boolean) =>
    `px-3 py-1.5 text-xs font-medium transition-colors ${aktiv ? 'bg-hs-teal text-white' : 'bg-white text-hs-text-1 hover:bg-hs-bg'}`
  const chip = (aktiv: boolean) =>
    `px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${aktiv ? 'bg-hs-teal text-white' : 'bg-hs-bg text-hs-text-1 hover:text-hs-text'}`

  return (
    <div className="space-y-4">
      {/* Titel */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl">Kalender</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-sm text-hs-text-2">Termine und Aktivitäten des Teams</p>
            {heuteCount > 0 && <span className="pill bg-hs-blue-50 text-hs-blue-700">{heuteCount} heute</span>}
            {ueberfaelligCount > 0 && <span className="pill bg-hs-err-bg text-hs-err-fg">{ueberfaelligCount} überfällig</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-hs-line-str rounded-lg overflow-hidden">
            {([['woche', 'Woche'], ['monat', 'Monat'], ['jahr', 'Jahr']] as [ViewMode, string][]).map(([v, l]) => (
              <button key={v} onClick={() => setView(v)} className={segBtn(view === v)}>{l}</button>
            ))}
          </div>
          {writeOk && (
            <button onClick={() => openNeuModal({ datum: toDateStr(current) < heute ? heute : toDateStr(current), von: '', bis: '', ganztags: true })} className="btn-primary">
              <Plus size={15} strokeWidth={2} /> Termin
            </button>
          )}
        </div>
      </div>

      {/* Navigation + Filter */}
      <div className="bg-white rounded-xl border border-hs-line p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => navigate(-1)} aria-label="Zurück" className="btn-secondary px-2 py-1.5"><ChevronLeft size={16} strokeWidth={1.75} /></button>
          <span className="text-sm font-semibold text-hs-text min-w-[200px] text-center px-1 font-display">{periodLabel}</span>
          <button onClick={() => navigate(1)} aria-label="Vor" className="btn-secondary px-2 py-1.5"><ChevronRight size={16} strokeWidth={1.75} /></button>
          <button onClick={() => setCurrent(new Date())} className="btn-secondary py-1.5 ml-1">Heute</button>
        </div>
        <div className="flex flex-wrap items-center gap-1 ml-auto">
          <button onClick={() => setArtFilter('alle')} className={chip(artFilter === 'alle')}>Alle Arten</button>
          {vorhandeneArten.map(a => (
            <button key={a.value} onClick={() => setArtFilter(v => v === a.value ? 'alle' : a.value)} className={chip(artFilter === a.value)}>{a.label}</button>
          ))}
        </div>
        {uniqueUsers.length > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-hs-text-2 mr-1">Person:</span>
            <button onClick={() => setUserFilter('alle')} className={chip(userFilter === 'alle')}>Alle</button>
            {uniqueUsers.map(u => (
              <button key={u} onClick={() => setUserFilter(v => v === u ? 'alle' : u)} className={chip(userFilter === u)}>{userProfiles[u]}</button>
            ))}
          </div>
        )}
      </div>

      {/* Kalender */}
      {view === 'woche' && <WochenView eintraege={gefiltert} current={current} heute={heute} writeOk={writeOk} onOpen={e => { setViewAkt(e); setEditMode(false) }} onNeu={openNeuModal} onMove={handleMove} />}
      {view === 'monat' && <MonatView byDay={byDay} current={current} heute={heute} writeOk={writeOk} onOpen={e => { setViewAkt(e); setEditMode(false) }} onNeu={openNeuModal} />}
      {view === 'jahr'  && <JahrView byDay={byDay} current={current} heute={heute} onTag={d => { setCurrent(parseDate(d)); setView('woche') }} />}

      {/* Legende */}
      <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap">
        <span className="overline">Legende</span>
        {[{ farbe: 'bg-hs-err border-hs-err', label: 'Überfällig' }, ...KALENDER_ARTEN.map(a => ({ farbe: ART_FARBEN[a.value] ?? '', label: a.label }))].map(({ farbe, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded border ${farbe}`} />
            <span className="text-[11px] text-hs-text-2">{label}</span>
          </div>
        ))}
      </div>

      {eintraege.length === 0 && (
        <div className="bg-white rounded-xl border border-hs-line p-8 text-center">
          <p className="text-sm text-hs-text-2">Noch keine Termine oder Aktivitäten vorhanden.</p>
          {writeOk && <button onClick={() => openNeuModal({ datum: heute, von: '', bis: '', ganztags: true })} className="btn-primary mt-4"><Plus size={15} strokeWidth={2} /> Ersten Termin anlegen</button>}
        </div>
      )}

      {/* Detail / Bearbeiten */}
      <Modal open={!!viewAkt} onClose={closeView} title={viewAkt?.titel ?? ''} subtitle={viewAkt ? aktivitaetLabel(viewAkt.art) : null}>
        {viewAkt && !editMode && (
          <div className="space-y-4">
            <dl className="space-y-1.5 text-sm">
              <div className="flex gap-2"><dt className="text-hs-text-2 w-24 flex-shrink-0">Datum</dt>
                <dd className="text-hs-text">
                  {viewAkt.bis_datum && viewAkt.bis_datum !== viewAkt.datum
                    ? `${fmtDatum(viewAkt.datum)} – ${fmtDatum(viewAkt.bis_datum)}`
                    : wochentagLang(viewAkt.datum)}
                  {!viewAkt.ganztags && viewAkt.uhrzeit_von && <span className="ml-2 font-mono tabular-nums">{fmtT(viewAkt.uhrzeit_von)}{viewAkt.uhrzeit_bis ? `–${fmtT(viewAkt.uhrzeit_bis)}` : ''}</span>}
                </dd></div>
              {viewAkt.kontaktName && <div className="flex gap-2"><dt className="text-hs-text-2 w-24 flex-shrink-0">Kontakt</dt><dd>{viewAkt.kontakt_id ? <Link href={`/crm/kontakte/${viewAkt.kontakt_id}`} className="text-hs-blue-700 hover:underline">{viewAkt.kontaktName}</Link> : viewAkt.kontaktName}</dd></div>}
              {viewAkt.firmaName && <div className="flex gap-2"><dt className="text-hs-text-2 w-24 flex-shrink-0">Firma</dt><dd>{viewAkt.firma_id ? <Link href={`/crm/firmen/${viewAkt.firma_id}`} className="text-hs-blue-700 hover:underline">{viewAkt.firmaName}</Link> : viewAkt.firmaName}</dd></div>}
              <div className="flex gap-2"><dt className="text-hs-text-2 w-24 flex-shrink-0">Erstellt von</dt><dd className="text-hs-text">{viewAkt.erstellt_von && userProfiles[viewAkt.erstellt_von] ? userProfiles[viewAkt.erstellt_von] : <span className="text-hs-tertiary">–</span>}</dd></div>
              <div className="flex gap-2"><dt className="text-hs-text-2 w-24 flex-shrink-0">Status</dt>
                <dd>{viewAkt.erledigt ? <span className="pill bg-hs-ok-bg text-hs-ok-fg">Erledigt</span> : viewAkt.ueberfaellig ? <span className="pill bg-hs-err-bg text-hs-err-fg">Überfällig</span> : <span className="pill bg-hs-blue-50 text-hs-blue-700">Offen</span>}
                  {viewAkt.ist_privat && <span className="pill bg-gray-100 text-gray-700 ml-1 inline-flex items-center gap-1"><Lock size={10} strokeWidth={2} />Privat</span>}
                </dd></div>
            </dl>
            {viewAkt.beschreibung && <p className="text-sm text-hs-text-1 whitespace-pre-wrap bg-hs-bg rounded-lg p-3">{viewAkt.beschreibung}</p>}
            {fehler && <p className="text-sm text-hs-err-fg">{fehler}</p>}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-hs-line">
              {writeOk && (
                <>
                  <button onClick={() => setEditMode(true)} className="btn-primary"><Pencil size={14} strokeWidth={1.75} /> Bearbeiten</button>
                  <button disabled={pending} className="btn-secondary"
                    onClick={() => startTransition(async () => { await toggleAktivitaetErledigt(viewAkt.id, !viewAkt.erledigt); closeView(); router.refresh() })}>
                    <Check size={14} strokeWidth={2} /> {viewAkt.erledigt ? 'Als offen markieren' : 'Erledigt'}
                  </button>
                  <button disabled={pending} className="btn-danger"
                    onClick={() => { if (!confirm(`„${viewAkt.titel}" wirklich löschen?`)) return; startTransition(async () => { const r = await deleteAktivitaet(viewAkt.id); if (r?.error) { setFehler(r.error); return } closeView(); router.refresh() }) }}>
                    <Trash2 size={14} strokeWidth={1.75} /> Löschen
                  </button>
                </>
              )}
              {(viewAkt.kontakt_id || viewAkt.firma_id) && (
                <Link href={viewAkt.kontakt_id ? `/crm/kontakte/${viewAkt.kontakt_id}` : `/crm/firmen/${viewAkt.firma_id}`} className="btn-secondary ml-auto">
                  {viewAkt.kontakt_id ? 'Zum Kontakt' : 'Zur Firma'} <ArrowRight size={14} strokeWidth={1.75} />
                </Link>
              )}
            </div>
          </div>
        )}
        {viewAkt && editMode && (
          <form onSubmit={handleSaveEdit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="form-label">Art</label>
                <select name="art" defaultValue={viewAkt.art} className="input">
                  {KALENDER_ARTEN.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Datum *</label>
                <input type="date" name="datum" defaultValue={viewAkt.datum} required className="input" />
              </div>
            </div>
            <div>
              <label className="form-label">Betreff *</label>
              <input name="betreff" defaultValue={viewAkt.titel} required className="input" />
            </div>
            <EditZeit viewAkt={viewAkt} />
            <div>
              <label className="form-label">Beschreibung</label>
              <textarea name="beschreibung" defaultValue={viewAkt.beschreibung ?? ''} rows={3} className="input resize-none" />
            </div>
            <div className="flex items-center gap-4 flex-wrap text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer text-hs-text-1"><input type="checkbox" name="erledigt_check" defaultChecked={viewAkt.erledigt} className="accent-hs-teal" />Erledigt</label>
              {(!viewAkt.erstellt_von || viewAkt.erstellt_von === currentUserId) && (
                <label className="flex items-center gap-1.5 cursor-pointer text-hs-text-1"><input type="checkbox" name="privat_check" defaultChecked={viewAkt.ist_privat} className="accent-hs-teal" /><Lock size={12} strokeWidth={1.75} /> Privat</label>
              )}
            </div>
            {fehler && <p className="text-sm text-hs-err-fg">{fehler}</p>}
            <div className="flex items-center gap-2 pt-1">
              <button type="submit" disabled={pending} className="btn-primary">{pending ? 'Speichern …' : 'Speichern'}</button>
              <button type="button" onClick={() => setEditMode(false)} className="btn-secondary">Abbrechen</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Neu */}
      <Modal open={!!neu} onClose={closeNeu}
        title={<span className="inline-flex items-center gap-2"><Calendar size={16} strokeWidth={1.75} className="text-hs-text-2" />Neuer Termin</span>}
        subtitle={neu ? wochentagLang(neu.datum) : null}>
        {neu && (
          <form onSubmit={handleSaveNeu} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="form-label">Art</label>
                <select name="art" defaultValue="besprechung" className="input">
                  {KALENDER_ARTEN.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Datum *</label>
                <input type="date" name="datum" defaultValue={neu.datum} required className="input" />
              </div>
            </div>
            <div>
              <label className="form-label">Betreff *</label>
              <input name="betreff" required autoFocus placeholder="z.B. Demo software:112, Rückruf …" className="input" />
            </div>
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer text-hs-text-1">
                <input type="checkbox" checked={neuGanztags} onChange={e => setNeuGanztags(e.target.checked)} className="accent-hs-teal" />Ganztags
              </label>
              {neuGanztags ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-hs-text-2">bis</span>
                  <input type="date" name="bis_datum" min={neu.datum} className="input w-40 py-1" title="Enddatum (mehrtägig)" />
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input type="time" name="uhrzeit_von" step={900} defaultValue={neu.von || '09:00'} className="input w-28 py-1" />
                  <span className="text-hs-text-2">–</span>
                  <input type="time" name="uhrzeit_bis" step={900} defaultValue={neu.bis || '10:00'} className="input w-28 py-1" />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="form-label">Kontakt</label>
                <KundenSuche items={kontakte.map(k => ({ id: k.id, label: k.name, sub: k.sub }))} value={neuKontakt} onChange={setNeuKontakt} placeholder="Name suchen …" />
              </div>
              <div>
                <label className="form-label">Firma</label>
                <KundenSuche items={firmen.map(f => ({ id: f.id, label: f.name, sub: f.sub }))} value={neuFirma} onChange={setNeuFirma} placeholder="Firma suchen …" />
              </div>
            </div>
            <div>
              <label className="form-label">Beschreibung</label>
              <textarea name="beschreibung" rows={2} placeholder="optional" className="input resize-none" />
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer text-sm text-hs-text-1">
              <input type="checkbox" name="privat_check" className="accent-hs-teal" /><Lock size={12} strokeWidth={1.75} /> Privater Termin (nur für mich sichtbar)
            </label>
            {fehler && <p className="text-sm text-hs-err-fg">{fehler}</p>}
            <div className="flex items-center gap-2 pt-1">
              <button type="submit" disabled={pending} className="btn-primary">{pending ? 'Speichern …' : 'Speichern'}</button>
              <button type="button" onClick={closeNeu} className="btn-secondary"><X size={14} strokeWidth={1.75} /> Abbrechen</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

/** Zeit-Block im Bearbeiten-Formular (Ganztags-Toggle mit eigenem State) */
function EditZeit({ viewAkt }: { viewAkt: KalenderEintrag }) {
  const [ganztags, setGanztags] = useState(viewAkt.ganztags)
  return (
    <div className="flex items-center gap-3 flex-wrap text-sm">
      <label className="flex items-center gap-1.5 cursor-pointer text-hs-text-1">
        <input type="checkbox" name="ganztags_check" checked={ganztags} onChange={e => setGanztags(e.target.checked)} className="accent-hs-teal" />Ganztags
      </label>
      {ganztags ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-hs-text-2">bis</span>
          <input type="date" name="bis_datum" defaultValue={viewAkt.bis_datum ?? ''} className="input w-40 py-1" title="Enddatum (mehrtägig)" />
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <input type="hidden" name="bis_datum" value="" />
          <input type="time" name="uhrzeit_von" step={900} defaultValue={viewAkt.uhrzeit_von?.slice(0, 5) ?? '09:00'} className="input w-28 py-1" />
          <span className="text-hs-text-2">–</span>
          <input type="time" name="uhrzeit_bis" step={900} defaultValue={viewAkt.uhrzeit_bis?.slice(0, 5) ?? ''} className="input w-28 py-1" />
        </div>
      )}
    </div>
  )
}
