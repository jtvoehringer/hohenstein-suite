'use client'

// ── Befehlspalette (Strg K / ⌘K) ─────────────────────────────────────────────
// Seiten aufrufen, Aktionen starten, Kontakte/Firmen/Buchungen/Aufgaben finden.
// Tastatur: ↑↓ wählen, ↵ öffnen, Esc schließen. Datensuche über /api/global-search.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Camera,
  Search, Plus, Calendar, LogOut, Users, Building2, ReceiptText, CheckSquare, FlaskConical, Building, ScanLine, Kanban, FileText,
  type LucideIcon,
} from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { PALETTE_EVENT } from '@/components/layout/Topbar'
import type { NavGroup } from '@/lib/navigation'
import type { MandantKontext, MandantOption } from '@/app/(dashboard)/layout'

export type SearchResult = {
  kategorie: 'kontakt' | 'firma' | 'buchung' | 'aufgabe' | 'pipeline'
  id: string
  titel: string
  untertitel?: string
  href: string
}

type Gruppe = 'Aktionen' | 'Seiten' | 'Kontakte' | 'Firmen' | 'Buchungen' | 'Aufgaben' | 'Pipeline'

type Eintrag = {
  id: string
  gruppe: Gruppe
  label: string
  detail?: string
  icon: LucideIcon
  href?: string
  run?: () => void | Promise<void>
  keywords?: string
}

const GRUPPEN_REIHENFOLGE: Gruppe[] = ['Aktionen', 'Seiten', 'Aufgaben', 'Kontakte', 'Firmen', 'Pipeline', 'Buchungen']

const KATEGORIE: Record<SearchResult['kategorie'], { gruppe: Gruppe; icon: LucideIcon }> = {
  kontakt:  { gruppe: 'Kontakte',  icon: Users },
  firma:    { gruppe: 'Firmen',    icon: Building2 },
  buchung:  { gruppe: 'Buchungen', icon: ReceiptText },
  aufgabe:  { gruppe: 'Aufgaben',  icon: CheckSquare },
  pipeline: { gruppe: 'Pipeline',  icon: Kanban },
}

function norm(s: string) {
  return s.toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function passt(e: Eintrag, q: string) {
  const heu = norm(`${e.label} ${e.keywords ?? ''} ${e.detail ?? ''}`)
  return norm(q).split(/\s+/).filter(Boolean).every(w => heu.includes(w))
}

export default function CommandPalette({ groups, darfSchreiben, mandanten, mandant }: {
  groups: NavGroup[]
  darfSchreiben: boolean
  mandanten: MandantOption[]
  mandant: MandantKontext
}) {
  const router = useRouter()
  const [offen, setOffen] = useState(false)
  const [q, setQ] = useState('')
  const [auswahl, setAuswahl] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listeRef = useRef<HTMLDivElement>(null)
  const anfrageNr = useRef(0)

  const statisch = useMemo<Eintrag[]>(() => {
    const seiten: Eintrag[] = groups.flatMap(g =>
      g.items.map(i => ({
        id: `s:${g.key}:${i.href}`, gruppe: 'Seiten' as const, label: i.label, detail: g.label, icon: g.icon, href: i.href,
        keywords: `${g.label} ${i.keywords ?? ''}`,
      })),
    )
    const aktionen: Eintrag[] = darfSchreiben ? [
      { id: 'a:aufgabe',    gruppe: 'Aktionen', label: 'Neue Aufgabe',              icon: CheckSquare, href: '/aufgaben?neu=1',          keywords: 'todo anlegen' },
      { id: 'a:aktivitaet', gruppe: 'Aktionen', label: 'Termin / Aktivität anlegen', icon: Calendar,   href: '/crm?neu=1',               keywords: 'kalender neu' },
      { id: 'a:kontakt',    gruppe: 'Aktionen', label: 'Neuer Kontakt',             icon: Users,       href: '/crm/kontakte?neu=1',      keywords: 'person anlegen' },
      { id: 'a:firma',      gruppe: 'Aktionen', label: 'Neue Firma',                icon: Building2,   href: '/crm/firmen?neu=1',        keywords: 'weingut betrieb anlegen' },
      { id: 'a:buchung',    gruppe: 'Aktionen', label: 'Neue Buchung (E&A)',        icon: Plus,        href: '/buchhaltung/neu',         keywords: 'einnahme ausgabe erfassen' },
      { id: 'a:beleg',      gruppe: 'Aktionen', label: 'Beleg hochladen',           icon: ScanLine,    href: '/buchhaltung/belege',      keywords: 'scan foto pdf' },
      { id: 'a:rechnung',   gruppe: 'Aktionen', label: 'Neue Rechnung',             icon: FileText,    href: '/rechnungen/neu?art=rechnung', keywords: 'faktura fakturieren beleg' },
      { id: 'a:angebot',    gruppe: 'Aktionen', label: 'Neues Angebot',             icon: FileText,    href: '/rechnungen/neu?art=angebot',  keywords: 'offert' },
      { id: 'a:eingang',    gruppe: 'Aktionen', label: 'Eingangsrechnung erfassen', icon: FileText,    href: '/rechnungen/verbindlichkeiten?neu=1', keywords: 'lieferant verbindlichkeit zahlbar' },
      { id: 'a:visit',      gruppe: 'Aktionen', label: 'Visitenkarte scannen',      icon: Camera,      href: '/crm/kontakte/visitenkarte', keywords: 'scan foto lead kontakt' },
    ] : []
    if (groups.some(g => g.key === 'demo')) {
      aktionen.push({ id: 'a:demo', gruppe: 'Aktionen', label: 'Demo software:112 verwalten', icon: FlaskConical, href: '/demo', keywords: 'demo vorführen team zurücksetzen musterhof' })
    }
    const andere = mandanten.find(m => m.tenantId !== mandant.tenantId)
    if (andere) {
      aktionen.push({ id: 'a:mandant', gruppe: 'Aktionen', label: `Zu ${andere.name} wechseln`, icon: Building, keywords: 'mandant wechseln', href: '/mandant-waehlen' })
    }
    aktionen.push({
      id: 'a:logout', gruppe: 'Aktionen', label: 'Abmelden', icon: LogOut, keywords: 'logout ausloggen',
      run: async () => { await createSupabaseBrowserClient().auth.signOut(); window.location.href = '/login' },
    })
    return [...aktionen, ...seiten]
  }, [groups, darfSchreiben, mandanten, mandant.tenantId])

  useEffect(() => {
    const oeffnen = () => { setQ(''); setAuswahl(0); setOffen(true) }
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOffen(o => { if (o) return false; setQ(''); setAuswahl(0); return true })
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener(PALETTE_EVENT, oeffnen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(PALETTE_EVENT, oeffnen) }
  }, [])

  useEffect(() => {
    if (!offen) return
    const t = setTimeout(() => inputRef.current?.focus(), 10)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { clearTimeout(t); document.body.style.overflow = prev }
  }, [offen])

  const frage = q.trim()
  const statischGefiltert = useMemo(() => {
    const stat = frage ? statisch.filter(e => passt(e, frage)) : statisch
    return frage
      ? [...stat].sort((a, b) => Number(norm(b.label).startsWith(norm(frage))) - Number(norm(a.label).startsWith(norm(frage))))
      : stat
  }, [frage, statisch])

  const datenSuche = frage.length >= 2
  const [daten, setDaten] = useState<{ frage: string; items: Eintrag[] }>({ frage: '', items: [] })
  const sucheLaeuft = datenSuche && daten.frage !== frage

  useEffect(() => {
    if (!offen || !datenSuche) return
    const nr = ++anfrageNr.current
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/global-search?q=${encodeURIComponent(frage)}`)
        const json = await res.json().catch(() => ({ results: [] }))
        if (nr !== anfrageNr.current) return
        const items: Eintrag[] = ((json.results ?? []) as SearchResult[]).map(r => {
          const k = KATEGORIE[r.kategorie] ?? { gruppe: 'Seiten' as const, icon: Search }
          return { id: `d:${r.kategorie}:${r.id}`, gruppe: k.gruppe, label: r.titel, detail: r.untertitel, icon: k.icon, href: r.href }
        })
        setDaten({ frage, items })
      } catch {
        if (nr === anfrageNr.current) setDaten({ frage, items: [] })
      }
    }, 180)
    return () => clearTimeout(t)
  }, [frage, offen, datenSuche])

  const treffer = useMemo(
    () => [...statischGefiltert, ...(datenSuche && daten.frage === frage ? daten.items : [])],
    [statischGefiltert, datenSuche, daten, frage],
  )
  const gruppiert = useMemo(() =>
    GRUPPEN_REIHENFOLGE.map(g => ({ g, items: treffer.filter(e => e.gruppe === g) })).filter(x => x.items.length > 0),
  [treffer])
  const flach = useMemo(() => gruppiert.flatMap(x => x.items), [gruppiert])

  const ausfuehren = useCallback((e: Eintrag) => {
    setOffen(false)
    if (e.run) void e.run()
    else if (e.href) router.push(e.href)
  }, [router])

  useEffect(() => {
    if (!offen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')         { e.preventDefault(); setOffen(false) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setAuswahl(i => Math.min(flach.length - 1, i + 1)) }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setAuswahl(i => Math.max(0, i - 1)) }
      else if (e.key === 'Home')      { e.preventDefault(); setAuswahl(0) }
      else if (e.key === 'End')       { e.preventDefault(); setAuswahl(Math.max(0, flach.length - 1)) }
      else if (e.key === 'Enter')     { e.preventDefault(); const t = flach[auswahl]; if (t) ausfuehren(t) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [offen, flach, auswahl, ausfuehren])

  useEffect(() => {
    const el = listeRef.current?.querySelector<HTMLElement>(`[data-idx="${auswahl}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [auswahl, flach])

  if (!offen) return null

  return (
    <div className="fixed inset-0 z-[100] bg-[rgba(29,31,36,.5)] px-4 pt-[10vh] pb-8 overflow-y-auto"
      onMouseDown={e => { if (e.target === e.currentTarget) setOffen(false) }}>
      <div role="dialog" aria-modal="true" aria-label="Befehlspalette"
        className="max-w-[640px] mx-auto bg-white rounded-xl border border-hs-line shadow-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 h-[52px] border-b border-hs-line">
          <Search size={18} strokeWidth={1.75} className="text-hs-tertiary shrink-0" />
          <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setAuswahl(0) }}
            placeholder="Seite, Aktion, Kontakt, Firma, Aufgabe oder Buchung …" aria-label="Suchen oder Befehl eingeben"
            className="flex-1 min-w-0 bg-transparent text-[15px] text-hs-text placeholder:text-hs-tertiary focus:outline-none"
            autoComplete="off" spellCheck={false} />
          {sucheLaeuft && <span className="font-mono text-[11px] text-hs-tertiary">■ sucht …</span>}
          <button type="button" onClick={() => setOffen(false)} aria-label="Schließen"
            className="font-mono text-[10.5px] text-hs-tertiary border border-hs-line-str rounded-sm px-1.5 py-0.5 hover:bg-hs-bg hover:text-hs-text transition-colors">ESC</button>
        </div>

        <div ref={listeRef} className="max-h-[60vh] overflow-y-auto py-2">
          {flach.length === 0 && (
            <p className="px-4 py-8 text-center text-[13.5px] text-hs-tertiary">
              {sucheLaeuft ? 'Wird gesucht …' : `Nichts gefunden für „${q}“.`}
            </p>
          )}
          {gruppiert.map(({ g, items }) => (
            <div key={g} className="px-2 pb-1">
              <p className="px-2 pt-2 pb-1 overline">{g}</p>
              {items.map(e => {
                const idx = flach.indexOf(e)
                const aktiv = idx === auswahl
                const Icon = e.icon
                return (
                  <button key={e.id} type="button" data-idx={idx} onMouseEnter={() => setAuswahl(idx)} onClick={() => ausfuehren(e)}
                    className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-md text-left transition-colors ${aktiv ? 'bg-hs-blue-50 text-hs-blue-700' : 'text-hs-text hover:bg-hs-bg'}`}>
                    <Icon size={16} strokeWidth={1.75} className={`shrink-0 ${aktiv ? 'text-hs-blue-700' : 'text-hs-tertiary'}`} />
                    <span className="flex-1 min-w-0 truncate text-[13.5px] font-medium">{e.label}</span>
                    {e.detail && <span className="shrink-0 max-w-[45%] truncate text-[11.5px] text-hs-text-2">{e.detail}</span>}
                    {aktiv && <kbd className="font-mono text-[10.5px] text-hs-tertiary shrink-0">↵</kbd>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-hs-line bg-hs-bg font-mono text-[10.5px] text-hs-tertiary">
          <span>↑↓ wählen · ↵ öffnen · esc schließen</span>
          <span className="hidden sm:inline">Strg K öffnet von überall</span>
        </div>
      </div>
    </div>
  )
}
