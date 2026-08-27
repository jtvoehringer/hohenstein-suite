import { segmentFarbe, segmentLabel, PIPELINE_STUFEN, aktivitaetLabel } from '@/lib/crm/types'

export function SegmentPill({ segment }: { segment: string | null | undefined }) {
  return <span className={`pill ${segmentFarbe(segment)}`}>{segmentLabel(segment)}</span>
}

export function StufePill({ stufe }: { stufe: string }) {
  const def = PIPELINE_STUFEN.find(s => s.value === stufe)
  return <span className={`pill ${def?.farbe ?? 'bg-gray-100 text-gray-700'}`}>{def?.label ?? stufe}</span>
}

export function LeadPill({ isLead }: { isLead: boolean }) {
  return isLead
    ? <span className="pill bg-hs-warn-bg text-hs-warn-fg">Lead</span>
    : <span className="pill bg-hs-blue-50 text-hs-blue-700">Kunde</span>
}

export function FlagPill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'ok' | 'warn' | 'blue' }) {
  const cls = tone === 'ok' ? 'bg-hs-ok-bg text-hs-ok-fg'
    : tone === 'warn' ? 'bg-hs-warn-bg text-hs-warn-fg'
    : tone === 'blue' ? 'bg-hs-blue-50 text-hs-blue-700'
    : 'bg-gray-100 text-gray-700'
  return <span className={`pill ${cls}`}>{label}</span>
}

/** Farben der Aktivitäts-Arten (Kalender-Chips + Timeline) */
export const ART_FARBEN: Record<string, string> = {
  anruf:       'bg-hs-ok-bg text-hs-ok-fg border-hs-ok/30',
  besprechung: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  aufgabe:     'bg-pink-50 text-pink-800 border-pink-200',
  email:       'bg-orange-50 text-orange-800 border-orange-200',
  demo:        'bg-purple-50 text-purple-800 border-purple-200',
  besuch:      'bg-hs-blue-50 text-hs-blue-700 border-hs-blue-100',
  messe:       'bg-indigo-50 text-indigo-800 border-indigo-200',
  angebot:     'bg-hs-warn-bg text-hs-warn-fg border-hs-warn/30',
  notiz:       'bg-gray-50 text-gray-700 border-gray-200',
  sonstiges:   'bg-gray-50 text-gray-700 border-gray-200',
  urlaub:      'bg-amber-50 text-amber-800 border-amber-200',
  abwesenheit: 'bg-slate-50 text-slate-700 border-slate-200',
}

export function ArtPill({ art }: { art: string }) {
  const cls = ART_FARBEN[art] ?? 'bg-gray-100 text-gray-700'
  return <span className={`pill ${cls.split(' ').filter(c => !c.startsWith('border')).join(' ')}`}>{aktivitaetLabel(art)}</span>
}
