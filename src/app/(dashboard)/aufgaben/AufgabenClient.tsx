'use client'

// ── Aufgabenverwaltung (Client): Board/Liste, Filter, Panel zum Anlegen/Bearbeiten
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, LayoutGrid, List, Play, Check, RotateCcw, X, Trash2, Pencil, Search, Building2, User } from 'lucide-react'
import { fmtDatum } from '@/lib/format'
import {
  AUFGABE_BEREICHE, AUFGABE_PRIORITAET, AUFGABE_STATUS, bereichLabel, faelligkeit,
  type AufgabeRow, type MitgliedOption,
} from '@/lib/aufgaben/types'
import { StatusPill, PrioPunkt, FaelligAm } from '@/components/aufgaben/AufgabePills'
import { speichereAufgabeAction, setzeAufgabeStatusAction, loescheAufgabeAction, type AufgabeInput } from './actions'

type Option = { id: string; name: string }
type Panel = { modus: 'neu' } | { modus: 'bearbeiten'; id: string } | null

interface Props {
  aufgaben: AufgabeRow[]
  mitglieder: MitgliedOption[]
  kontakte: Option[]
  firmen: Option[]
  userId: string | null
  darfSchreiben: boolean
  heute: string
  initial: { neu: boolean; id: string | null; status: string | null; ueberfaellig: boolean }
}

const LEER_FORM: AufgabeInput = {
  titel: '', beschreibung: '', status: 'offen', prioritaet: 'normal',
  verantwortlich_id: '', faellig_am: '', bereich: '', kontakt_id: '', firma_id: '',
}

export default function AufgabenClient({ aufgaben, mitglieder, kontakte, firmen, userId, darfSchreiben, heute, initial }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)

  // Ansicht + Filter
  const [ansicht, setAnsicht] = useState<'board' | 'liste'>(initial.status ? 'liste' : 'board')
  const [suche, setSuche] = useState('')
  const [fVerantwortlich, setFVerantwortlich] = useState<string>('')
  const [fBereich, setFBereich] = useState<string>('')
  const [fStatus, setFStatus] = useState<string>(initial.status ?? '')
  const [nurMeine, setNurMeine] = useState(false)
  const [nurUeberfaellig, setNurUeberfaellig] = useState(initial.ueberfaellig)

  useEffect(() => {
    if (initial.status) return // Status-Filter aus der URL → Listenansicht beibehalten
    try {
      const v = window.localStorage.getItem('hs:aufgaben:ansicht')
      if (v === 'liste' || v === 'board') setAnsicht(v)
    } catch { /* ignorieren */ }
  }, [initial.status])
  const ansichtSetzen = (v: 'board' | 'liste') => {
    setAnsicht(v)
    try { window.localStorage.setItem('hs:aufgaben:ansicht', v) } catch { /* ignorieren */ }
  }

  // Panel (aus URL: ?neu=1 / ?id=…)
  const [panel, setPanel] = useState<Panel>(initial.neu ? { modus: 'neu' } : initial.id ? { modus: 'bearbeiten', id: initial.id } : null)
  useEffect(() => {
    const neu = searchParams.get('neu') === '1'
    const id = searchParams.get('id')
    if (neu) setPanel({ modus: 'neu' })
    else if (id) setPanel({ modus: 'bearbeiten', id })
  }, [searchParams])

  const panelSchliessen = () => {
    setPanel(null)
    setFehler(null)
    if (searchParams.get('neu') || searchParams.get('id')) router.replace('/aufgaben')
  }

  const namen = useMemo(() => new Map(mitglieder.map(m => [m.id, m.name])), [mitglieder])

  const gefiltert = useMemo(() => {
    const s = suche.trim().toLowerCase()
    return aufgaben.filter(a => {
      if (fVerantwortlich === 'niemand' ? a.verantwortlich_id !== null : fVerantwortlich && a.verantwortlich_id !== fVerantwortlich) return false
      if (fBereich && a.bereich !== fBereich) return false
      if (fStatus && a.status !== fStatus) return false
      if (nurMeine && a.verantwortlich_id !== userId) return false
      if (nurUeberfaellig && faelligkeit(a.faellig_am, a.status, heute) !== 'ueberfaellig') return false
      if (s && !`${a.titel} ${a.beschreibung ?? ''} ${a.kontakt_name ?? ''} ${a.firma_name ?? ''}`.toLowerCase().includes(s)) return false
      return true
    })
  }, [aufgaben, suche, fVerantwortlich, fBereich, fStatus, nurMeine, nurUeberfaellig, userId, heute])

  const statusSetzen = (id: string, status: string) => {
    setFehler(null)
    startTransition(async () => {
      const res = await setzeAufgabeStatusAction(id, status)
      if (res.fehler) setFehler(res.fehler)
      else router.refresh()
    })
  }

  const loeschen = (a: AufgabeRow) => {
    if (!confirm(`Aufgabe „${a.titel}" wirklich löschen?`)) return
    setFehler(null)
    startTransition(async () => {
      const res = await loescheAufgabeAction(a.id)
      if (res.fehler) setFehler(res.fehler)
      else { panelSchliessen(); router.refresh() }
    })
  }

  const aktuelle = panel?.modus === 'bearbeiten' ? aufgaben.find(a => a.id === panel.id) ?? null : null
  const filterAktiv = !!(suche || fVerantwortlich || fBereich || fStatus || nurMeine || nurUeberfaellig)
  const offenGesamt = aufgaben.filter(a => a.status !== 'erledigt').length
  const ueberfaelligGesamt = aufgaben.filter(a => faelligkeit(a.faellig_am, a.status, heute) === 'ueberfaellig').length

  return (
    <div className="space-y-5">
      {/* ── Kopf ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl">Aufgaben</h1>
          <p className="text-[13.5px] text-hs-text-2 mt-1">
            {offenGesamt} offen{ueberfaelligGesamt > 0 && <span className="text-hs-err-fg"> · {ueberfaelligGesamt} überfällig</span>} · erledigte Aufgaben der letzten 30 Tage
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-hs-line-str bg-white p-0.5" role="group" aria-label="Ansicht">
            <button type="button" onClick={() => ansichtSetzen('board')} title="Board"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12.5px] font-medium ${ansicht === 'board' ? 'bg-hs-blue-50 text-hs-blue-700' : 'text-hs-text-2 hover:text-hs-text'}`}>
              <LayoutGrid size={15} strokeWidth={1.75} /> Board
            </button>
            <button type="button" onClick={() => ansichtSetzen('liste')} title="Liste"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12.5px] font-medium ${ansicht === 'liste' ? 'bg-hs-blue-50 text-hs-blue-700' : 'text-hs-text-2 hover:text-hs-text'}`}>
              <List size={15} strokeWidth={1.75} /> Liste
            </button>
          </div>
          {darfSchreiben && (
            <button type="button" onClick={() => { setPanel({ modus: 'neu' }); setFehler(null) }} className="btn-primary">
              <Plus size={15} strokeWidth={2} /> Aufgabe
            </button>
          )}
        </div>
      </div>

      {fehler && <div className="bg-hs-err-bg border border-hs-err/30 text-hs-err-fg rounded-lg px-4 py-2.5 text-sm">{fehler}</div>}

      {/* ── Filter ───────────────────────────────────────────────────────── */}
      <div className="card !p-3 flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-hs-tertiary" />
          <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Suchen …" className="input !pl-8 !py-1.5" />
        </div>
        <select value={fVerantwortlich} onChange={e => setFVerantwortlich(e.target.value)} className="input !w-auto !py-1.5" aria-label="Verantwortlich">
          <option value="">Alle Verantwortlichen</option>
          <option value="niemand">Nicht zugewiesen</option>
          {mitglieder.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={fBereich} onChange={e => setFBereich(e.target.value)} className="input !w-auto !py-1.5" aria-label="Bereich">
          <option value="">Alle Bereiche</option>
          {AUFGABE_BEREICHE.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        {ansicht === 'liste' && (
          <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="input !w-auto !py-1.5" aria-label="Status">
            <option value="">Alle Status</option>
            {AUFGABE_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        )}
        {userId && (
          <label className="inline-flex items-center gap-1.5 text-[12.5px] text-hs-text-1 cursor-pointer">
            <input type="checkbox" checked={nurMeine} onChange={e => setNurMeine(e.target.checked)} className="accent-hs-teal" /> Nur meine
          </label>
        )}
        <label className="inline-flex items-center gap-1.5 text-[12.5px] text-hs-text-1 cursor-pointer">
          <input type="checkbox" checked={nurUeberfaellig} onChange={e => setNurUeberfaellig(e.target.checked)} className="accent-hs-teal" /> Nur überfällige
        </label>
        {filterAktiv && (
          <button type="button" className="text-[12px] text-hs-blue-700 hover:underline"
            onClick={() => { setSuche(''); setFVerantwortlich(''); setFBereich(''); setFStatus(''); setNurMeine(false); setNurUeberfaellig(false) }}>
            Filter zurücksetzen
          </button>
        )}
      </div>

      {/* ── Board ────────────────────────────────────────────────────────── */}
      {ansicht === 'board' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {AUFGABE_STATUS.map(sp => {
            const liste = gefiltert.filter(a => a.status === sp.value)
            return (
              <div key={sp.value} className="bg-[#F1F2F5] rounded-xl p-3 min-h-[200px]">
                <div className="flex items-center justify-between px-1 mb-2.5">
                  <span className={`pill ${sp.pill}`}>{sp.label}</span>
                  <span className="font-mono text-[11.5px] text-hs-text-2 tabular-nums">{liste.length}</span>
                </div>
                {liste.length === 0 ? (
                  <p className="text-[12.5px] text-hs-text-2 px-1 py-3">
                    {filterAktiv ? 'Keine Aufgaben mit diesen Filtern.' : sp.value === 'offen' ? 'Keine offenen Aufgaben.' : sp.value === 'in_arbeit' ? 'Nichts in Arbeit.' : 'Noch nichts erledigt.'}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {liste.map(a => (
                      <li key={a.id}>
                        <AufgabeKarte a={a} name={a.verantwortlich_id ? (namen.get(a.verantwortlich_id) ?? 'Unbekannt') : null} heute={heute}
                          darfSchreiben={darfSchreiben} isPending={isPending}
                          onOpen={() => { setPanel({ modus: 'bearbeiten', id: a.id }); setFehler(null) }}
                          onStatus={s => statusSetzen(a.id, s)} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* ── Liste ───────────────────────────────────────────────────────── */
        <div className="card !p-0 overflow-x-auto">
          {gefiltert.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[13px] text-hs-text-2">{filterAktiv ? 'Keine Aufgaben mit diesen Filtern.' : 'Noch keine Aufgaben.'}</p>
              {darfSchreiben && !filterAktiv && (
                <button type="button" onClick={() => setPanel({ modus: 'neu' })} className="btn-primary mt-3"><Plus size={15} strokeWidth={2} /> Erste Aufgabe anlegen</button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head">
                  <th className="px-4 py-2.5 text-left w-8"></th>
                  <th className="px-2 py-2.5 text-left">Aufgabe</th>
                  <th className="px-2 py-2.5 text-left">Bereich</th>
                  <th className="px-2 py-2.5 text-left">Verantwortlich</th>
                  <th className="px-2 py-2.5 text-left">Zu erledigen bis</th>
                  <th className="px-2 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {gefiltert.map(a => (
                  <tr key={a.id} className="border-b border-hs-line last:border-0 hover:bg-hs-bg cursor-pointer"
                    onClick={() => { setPanel({ modus: 'bearbeiten', id: a.id }); setFehler(null) }}>
                    <td className="px-4 py-2.5"><PrioPunkt prioritaet={a.prioritaet} /></td>
                    <td className="px-2 py-2.5">
                      <span className={`block font-medium ${a.status === 'erledigt' ? 'text-hs-text-2' : 'text-hs-text'}`}>{a.titel}</span>
                      {(a.firma_name || a.kontakt_name) && (
                        <span className="block text-[11.5px] text-hs-text-2">{[a.firma_name, a.kontakt_name].filter(Boolean).join(' · ')}</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-hs-text-2 text-[12.5px]">{a.bereich ? bereichLabel(a.bereich) : '–'}</td>
                    <td className="px-2 py-2.5 text-[12.5px]">{a.verantwortlich_id ? (namen.get(a.verantwortlich_id) ?? 'Unbekannt') : <span className="text-hs-tertiary">–</span>}</td>
                    <td className="px-2 py-2.5"><FaelligAm faelligAm={a.faellig_am} status={a.status} heuteIso={heute} kurz /></td>
                    <td className="px-2 py-2.5"><StatusPill status={a.status} /></td>
                    <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                      {darfSchreiben && (
                        <div className="inline-flex items-center gap-0.5">
                          {a.status === 'offen' && <IconBtn title="In Arbeit nehmen" onClick={() => statusSetzen(a.id, 'in_arbeit')} disabled={isPending}><Play size={14} strokeWidth={1.75} /></IconBtn>}
                          {a.status !== 'erledigt' && <IconBtn title="Erledigt" onClick={() => statusSetzen(a.id, 'erledigt')} disabled={isPending}><Check size={14} strokeWidth={1.75} /></IconBtn>}
                          {a.status === 'erledigt' && <IconBtn title="Wieder öffnen" onClick={() => statusSetzen(a.id, 'offen')} disabled={isPending}><RotateCcw size={14} strokeWidth={1.75} /></IconBtn>}
                          <IconBtn title="Bearbeiten" onClick={() => { setPanel({ modus: 'bearbeiten', id: a.id }); setFehler(null) }}><Pencil size={14} strokeWidth={1.75} /></IconBtn>
                          <IconBtn title="Löschen" onClick={() => loeschen(a)} disabled={isPending} danger><Trash2 size={14} strokeWidth={1.75} /></IconBtn>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Panel: Anlegen / Bearbeiten ──────────────────────────────────── */}
      {panel && (panel.modus === 'neu' || aktuelle) && (
        <AufgabePanel
          key={panel.modus === 'neu' ? 'neu' : panel.id}
          aufgabe={aktuelle}
          mitglieder={mitglieder} kontakte={kontakte} firmen={firmen}
          userId={userId} darfSchreiben={darfSchreiben} heute={heute}
          onClose={panelSchliessen}
          onDelete={aktuelle ? () => loeschen(aktuelle) : undefined}
          onSaved={() => { panelSchliessen(); router.refresh() }}
        />
      )}
      {panel?.modus === 'bearbeiten' && !aktuelle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-hs-navy/30" onClick={panelSchliessen}>
          <div className="card max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-hs-text-2">Diese Aufgabe wurde nicht gefunden – möglicherweise wurde sie gelöscht oder liegt länger als 30 Tage zurück.</p>
            <button type="button" className="btn-secondary mt-4" onClick={panelSchliessen}>Schließen</button>
          </div>
        </div>
      )}
    </div>
  )
}

function IconBtn({ children, title, onClick, disabled, danger }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled}
      className={`w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-40 ${
        danger ? 'text-hs-tertiary hover:text-hs-err-fg hover:bg-hs-err-bg' : 'text-hs-tertiary hover:text-hs-blue-700 hover:bg-hs-blue-50'}`}>
      {children}
    </button>
  )
}

function AufgabeKarte({ a, name, heute, darfSchreiben, isPending, onOpen, onStatus }: {
  a: AufgabeRow; name: string | null; heute: string; darfSchreiben: boolean; isPending: boolean
  onOpen: () => void; onStatus: (s: string) => void
}) {
  const ueber = faelligkeit(a.faellig_am, a.status, heute)
  return (
    <div className={`bg-white rounded-lg border p-3 hover:shadow-1 transition-shadow group ${ueber === 'ueberfaellig' ? 'border-hs-err/40' : 'border-hs-line'}`}>
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start gap-2">
          <PrioPunkt prioritaet={a.prioritaet} className="mt-[6px]" />
          <span className={`text-[13px] font-medium leading-snug ${a.status === 'erledigt' ? 'text-hs-text-2' : 'text-hs-text'}`}>{a.titel}</span>
        </div>
        {(a.firma_name || a.kontakt_name) && (
          <p className="text-[11.5px] text-hs-text-2 mt-1 pl-4 truncate flex items-center gap-1">
            {a.firma_name ? <Building2 size={11} strokeWidth={1.75} /> : <User size={11} strokeWidth={1.75} />}
            {[a.firma_name, a.kontakt_name].filter(Boolean).join(' · ')}
          </p>
        )}
      </button>
      <div className="flex items-center justify-between gap-2 mt-2 pl-4">
        <div className="min-w-0 text-[11.5px] text-hs-text-2 truncate">
          <span title="Verantwortlich">{name ?? <span className="text-hs-tertiary">Nicht zugewiesen</span>}</span>
          {a.bereich && <span className="text-hs-tertiary"> · {bereichLabel(a.bereich)}</span>}
        </div>
        <FaelligAm faelligAm={a.faellig_am} status={a.status} heuteIso={heute} kurz />
      </div>
      {darfSchreiben && (
        <div className="flex items-center justify-end gap-0.5 mt-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {a.status === 'offen' && <IconBtn title="In Arbeit nehmen" onClick={() => onStatus('in_arbeit')} disabled={isPending}><Play size={14} strokeWidth={1.75} /></IconBtn>}
          {a.status === 'in_arbeit' && <IconBtn title="Zurück auf offen" onClick={() => onStatus('offen')} disabled={isPending}><RotateCcw size={14} strokeWidth={1.75} /></IconBtn>}
          {a.status !== 'erledigt' && <IconBtn title="Erledigt" onClick={() => onStatus('erledigt')} disabled={isPending}><Check size={14} strokeWidth={1.75} /></IconBtn>}
          {a.status === 'erledigt' && <IconBtn title="Wieder öffnen" onClick={() => onStatus('offen')} disabled={isPending}><RotateCcw size={14} strokeWidth={1.75} /></IconBtn>}
          <IconBtn title="Bearbeiten" onClick={onOpen}><Pencil size={14} strokeWidth={1.75} /></IconBtn>
        </div>
      )}
    </div>
  )
}

// ── Panel zum Anlegen/Bearbeiten ─────────────────────────────────────────────
function AufgabePanel({ aufgabe, mitglieder, kontakte, firmen, userId, darfSchreiben, heute, onClose, onDelete, onSaved }: {
  aufgabe: AufgabeRow | null
  mitglieder: MitgliedOption[]; kontakte: Option[]; firmen: Option[]
  userId: string | null; darfSchreiben: boolean; heute: string
  onClose: () => void; onDelete?: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState<AufgabeInput>(() => aufgabe ? {
    id: aufgabe.id, titel: aufgabe.titel, beschreibung: aufgabe.beschreibung ?? '', status: aufgabe.status, prioritaet: aufgabe.prioritaet,
    verantwortlich_id: aufgabe.verantwortlich_id ?? '', faellig_am: aufgabe.faellig_am ?? '', bereich: aufgabe.bereich ?? '',
    kontakt_id: aufgabe.kontakt_id ?? '', firma_id: aufgabe.firma_id ?? '',
  } : { ...LEER_FORM, verantwortlich_id: userId ?? '' })
  const [saving, setSaving] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const set = <K extends keyof AufgabeInput>(k: K, v: AufgabeInput[K]) => setForm(f => ({ ...f, [k]: v }))
  const nurLesen = !darfSchreiben

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  async function speichern(e: React.FormEvent) {
    e.preventDefault()
    if (nurLesen) return
    setSaving(true); setFehler(null)
    const res = await speichereAufgabeAction(form)
    setSaving(false)
    if (res.fehler) setFehler(res.fehler)
    else onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-hs-navy/30" onClick={onClose}>
      <div className="w-full max-w-lg h-full bg-white shadow-xl flex flex-col" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-5 py-4 border-b border-hs-line">
          <div>
            <p className="overline">{aufgabe ? 'Aufgabe' : 'Neue Aufgabe'}</p>
            <h2 className="text-base mt-0.5">{aufgabe ? aufgabe.titel : 'Aufgabe anlegen'}</h2>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-hs-text-2 hover:bg-hs-bg" aria-label="Schließen">
            <X size={17} strokeWidth={1.75} />
          </button>
        </div>

        <form id="aufgabe-form" onSubmit={speichern} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="form-label">Titel *</label>
            <input value={form.titel} onChange={e => set('titel', e.target.value)} className="input" required autoFocus={!aufgabe} disabled={nurLesen} placeholder="Was ist zu tun?" />
          </div>
          <div>
            <label className="form-label">Beschreibung</label>
            <textarea value={form.beschreibung ?? ''} onChange={e => set('beschreibung', e.target.value)} className="input min-h-[90px]" disabled={nurLesen} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className="input" disabled={nurLesen}>
                {AUFGABE_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Priorität</label>
              <select value={form.prioritaet} onChange={e => set('prioritaet', e.target.value)} className="input" disabled={nurLesen}>
                {AUFGABE_PRIORITAET.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Verantwortlich</label>
              <select value={form.verantwortlich_id ?? ''} onChange={e => set('verantwortlich_id', e.target.value)} className="input" disabled={nurLesen}>
                <option value="">– Niemand –</option>
                {mitglieder.map(m => <option key={m.id} value={m.id}>{m.name}{m.id === userId ? ' (ich)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Zu erledigen bis</label>
              <input type="date" value={form.faellig_am ?? ''} onChange={e => set('faellig_am', e.target.value)} className="input" disabled={nurLesen} />
              {form.faellig_am && form.status !== 'erledigt' && form.faellig_am < heute && (
                <p className="text-[11.5px] text-hs-err-fg mt-1">Überfällig seit {fmtDatum(form.faellig_am)}</p>
              )}
            </div>
            <div>
              <label className="form-label">Bereich</label>
              <select value={form.bereich ?? ''} onChange={e => set('bereich', e.target.value)} className="input" disabled={nurLesen}>
                <option value="">– Kein Bereich –</option>
                {AUFGABE_BEREICHE.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Firma</label>
              <select value={form.firma_id ?? ''} onChange={e => set('firma_id', e.target.value)} className="input" disabled={nurLesen}>
                <option value="">– Keine –</option>
                {firmen.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Kontakt</label>
              <select value={form.kontakt_id ?? ''} onChange={e => set('kontakt_id', e.target.value)} className="input" disabled={nurLesen}>
                <option value="">– Keiner –</option>
                {kontakte.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>
          </div>

          {aufgabe && (
            <p className="text-[11.5px] text-hs-tertiary">
              Angelegt am {fmtDatum(aufgabe.erstellt_am)}{aufgabe.erledigt_am ? ` · erledigt am ${fmtDatum(aufgabe.erledigt_am)}` : ''}
            </p>
          )}
          {fehler && <p className="text-sm text-hs-err-fg">{fehler}</p>}
        </form>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-hs-line bg-hs-bg">
          <div>
            {aufgabe && darfSchreiben && onDelete && (
              <button type="button" onClick={onDelete} className="btn-danger !px-3"><Trash2 size={14} strokeWidth={1.75} /> Löschen</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">{nurLesen ? 'Schließen' : 'Abbrechen'}</button>
            {!nurLesen && (
              <button type="submit" form="aufgabe-form" disabled={saving || !form.titel.trim()} className="btn-primary">
                {saving ? 'Speichern …' : aufgabe ? 'Speichern' : 'Anlegen'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
