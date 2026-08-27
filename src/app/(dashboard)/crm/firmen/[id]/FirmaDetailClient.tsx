'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Pencil, Trash2, Mail, Phone, MapPin, Globe, Plus, Calendar, ChevronLeft, StickyNote, Users, X, Star, UserPlus,
} from 'lucide-react'
import type { FirmaRow } from '@/lib/crm/types'
import { AKTIVITAET_ARTEN } from '@/lib/crm/types'
import { fmtDatum } from '@/lib/format'
import { deleteFirma, addKontaktZuFirma, removeKontaktVonFirma } from '../../actions'
import Modal from '@/components/crm/Modal'
import FirmaForm from '@/components/crm/FirmaForm'
import KontaktForm from '@/components/crm/KontaktForm'
import AktivitaetForm from '@/components/crm/AktivitaetForm'
import AktivitaetKarte from '@/components/crm/AktivitaetKarte'
import PipelineForm from '@/components/crm/PipelineForm'
import PipelineListe from '@/components/crm/PipelineListe'
import KundenSuche from '@/components/crm/KundenSuche'
import { SegmentPill, LeadPill, FlagPill } from '@/components/crm/Pills'
import { fmtTelefon, telHref, mapsHref, LAENDER, type AktivitaetMitDokumenten, type PipelineKurz } from '@/components/crm/crmUtils'

export type Ansprechpartner = {
  id: string
  name: string
  position: string | null
  email: string | null
  telefon_vorwahl: string | null
  telefon: string | null
  mobil_vorwahl: string | null
  mobil: string | null
  segment: string
  is_lead: boolean
  hauptkontakt: boolean
  /** primaer = kontakte.firma_id, zuordnung = kontakt_firmen */
  quelle: 'primaer' | 'zuordnung'
}

export default function FirmaDetailClient({
  firma, ansprechpartner, aktivitaeten, pipeline, alleKontakte, writeOk,
}: {
  firma: FirmaRow
  ansprechpartner: Ansprechpartner[]
  aktivitaeten: AktivitaetMitDokumenten[]
  pipeline: PipelineKurz[]
  alleKontakte: { id: string; name: string; sub?: string | null }[]
  writeOk: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [edit, setEdit]                   = useState(false)
  const [showAktForm, setShowAktForm]     = useState(false)
  const [showPipeForm, setShowPipeForm]   = useState(false)
  const [showNeuKontakt, setShowNeuKontakt] = useState(false)
  const [showZuordnen, setShowZuordnen]   = useState(false)
  const [zuordnenId, setZuordnenId]       = useState('')
  const [zuordnenPos, setZuordnenPos]     = useState('')
  const [zuordnenHaupt, setZuordnenHaupt] = useState(false)
  const [artFilter, setArtFilter]         = useState<string>('alle')
  const [fehler, setFehler]               = useState<string | null>(null)

  function handleDelete() {
    if (!confirm(`Firma „${firma.name}" wirklich löschen? Kontakte, Aktivitäten und Verkaufschancen bleiben erhalten (ohne Zuordnung).`)) return
    startTransition(async () => {
      const res = await deleteFirma(firma.id)
      if (res?.error) { setFehler(res.error); return }
      router.push('/crm/firmen'); router.refresh()
    })
  }

  function handleZuordnen(e: React.FormEvent) {
    e.preventDefault()
    if (!zuordnenId) return
    startTransition(async () => {
      const res = await addKontaktZuFirma(firma.id, zuordnenId, zuordnenPos || null, zuordnenHaupt)
      if (res?.error) { setFehler(res.error); return }
      setShowZuordnen(false); setZuordnenId(''); setZuordnenPos(''); setZuordnenHaupt(false)
      router.refresh()
    })
  }

  function handleZuordnungEntfernen(ap: Ansprechpartner) {
    if (!confirm(`Zuordnung von „${ap.name}" zu dieser Firma entfernen?`)) return
    startTransition(async () => {
      const res = await removeKontaktVonFirma(firma.id, ap.id)
      if (res?.error) { setFehler(res.error); return }
      router.refresh()
    })
  }

  const vorhandeneArten = useMemo(() => AKTIVITAET_ARTEN.filter(a => aktivitaeten.some(x => x.art === a.value)), [aktivitaeten])
  const gefiltert = useMemo(() => {
    const list = artFilter === 'alle' ? aktivitaeten : aktivitaeten.filter(a => a.art === artFilter)
    return [...list].sort((a, b) => {
      const ao = a.art === 'aufgabe' && !a.erledigt ? 0 : 1
      const bo = b.art === 'aufgabe' && !b.erledigt ? 0 : 1
      if (ao !== bo) return ao - bo
      return b.datum.localeCompare(a.datum)
    })
  }, [aktivitaeten, artFilter])

  const landLabel = LAENDER.find(l => l.code === firma.land)?.label ?? firma.land
  const adresse = [firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(' ')].filter(Boolean)
  const website = firma.website ? (firma.website.startsWith('http') ? firma.website : `https://${firma.website}`) : null
  const zuordenbar = alleKontakte.filter(k => !ansprechpartner.some(a => a.id === k.id))

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-1.5 text-sm text-hs-text-2">
        <Link href="/crm/firmen" className="inline-flex items-center gap-1 hover:text-hs-blue-700"><ChevronLeft size={14} strokeWidth={1.75} />Firmen</Link>
        <span>/</span>
        <span className="text-hs-text font-medium truncate">{firma.name}</span>
      </nav>

      {/* Kopf */}
      <div className="bg-white rounded-xl border border-hs-line p-5 flex items-start gap-4 flex-wrap">
        <div className="flex flex-col items-center justify-center bg-hs-bg border border-hs-line rounded-lg px-3 py-2 min-w-[80px]">
          <span className="overline">Kd.-Nr.</span>
          <span className="font-mono text-sm font-semibold text-hs-blue-700 tabular-nums">{firma.kundennummer ?? '–'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl">{firma.name}</h1>
          <p className="text-sm text-hs-text-2 mt-1">
            {[firma.ort ? `${firma.plz ?? ''} ${firma.ort}`.trim() : null, firma.uid_nummer].filter(Boolean).join(' · ') || 'Firma'}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <SegmentPill segment={firma.segment} />
            <LeadPill isLead={firma.is_lead} />
            {firma.ist_kunde && !firma.is_lead && <FlagPill label="Kunde" tone="ok" />}
            {firma.ist_lieferant && <FlagPill label="Lieferant" tone="neutral" />}
          </div>
        </div>
        {writeOk && (
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => setEdit(true)} className="btn-secondary"><Pencil size={15} strokeWidth={1.75} /> Bearbeiten</button>
            <button onClick={handleDelete} disabled={pending} className="btn-danger" title="Firma löschen"><Trash2 size={15} strokeWidth={1.75} /></button>
          </div>
        )}
        {fehler && <p className="w-full text-sm text-hs-err-fg">{fehler}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Ansprechpartner */}
          <div className="bg-white rounded-xl border border-hs-line overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-hs-line">
              <h2 className="text-sm inline-flex items-center gap-1.5"><Users size={15} strokeWidth={1.75} className="text-hs-text-2" />Ansprechpartner ({ansprechpartner.length})</h2>
              {writeOk && (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setShowZuordnen(true)} className="btn-secondary py-1 px-2.5" title="Bestehenden Kontakt zuordnen">
                    <UserPlus size={14} strokeWidth={1.75} /> Zuordnen
                  </button>
                  <button onClick={() => setShowNeuKontakt(true)} className="btn-primary py-1 px-2.5">
                    <Plus size={14} strokeWidth={2} /> Kontakt
                  </button>
                </div>
              )}
            </div>
            {ansprechpartner.length === 0 ? (
              <p className="px-4 py-5 text-sm text-hs-text-2">Noch keine Ansprechpartner hinterlegt.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="text-left px-4 py-2">Name</th>
                    <th className="text-left px-4 py-2 hidden sm:table-cell">Position</th>
                    <th className="text-left px-4 py-2 hidden md:table-cell">Kontakt</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-hs-line">
                  {ansprechpartner.map(ap => (
                    <tr key={ap.id} className="hover:bg-hs-bg/70">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <Link href={`/crm/kontakte/${ap.id}`} className="font-medium text-hs-text hover:text-hs-blue-700 hover:underline">{ap.name}</Link>
                          {ap.hauptkontakt && <Star size={13} strokeWidth={1.75} className="text-hs-warn" aria-label="Hauptkontakt" />}
                          {ap.is_lead && <span className="pill bg-hs-warn-bg text-hs-warn-fg">Lead</span>}
                        </div>
                        <div className="text-xs text-hs-text-2 sm:hidden">{ap.position}</div>
                      </td>
                      <td className="px-4 py-2 hidden sm:table-cell text-hs-text-1">{ap.position ?? <span className="text-hs-tertiary">–</span>}</td>
                      <td className="px-4 py-2 hidden md:table-cell text-xs text-hs-text-1 space-y-0.5">
                        {ap.email && <div><a href={`mailto:${ap.email}`} className="hover:text-hs-blue-700">{ap.email}</a></div>}
                        {(ap.mobil || ap.telefon) && (
                          <div className="tabular-nums">
                            <a href={telHref(ap.mobil ? ap.mobil_vorwahl : ap.telefon_vorwahl, ap.mobil ?? ap.telefon)} className="hover:text-hs-blue-700">
                              {fmtTelefon(ap.mobil ? ap.mobil_vorwahl : ap.telefon_vorwahl, ap.mobil ?? ap.telefon)}
                            </a>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {writeOk && ap.quelle === 'zuordnung' && (
                          <button onClick={() => handleZuordnungEntfernen(ap)} disabled={pending} title="Zuordnung entfernen" aria-label="Zuordnung entfernen"
                            className="text-hs-tertiary hover:text-hs-err p-1">
                            <X size={14} strokeWidth={1.75} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Aktivitäten */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-3">
                <h2 className="text-base">Aktivitäten</h2>
                <Link href="/crm" className="text-xs text-hs-text-2 hover:text-hs-blue-700 inline-flex items-center gap-1"><Calendar size={12} strokeWidth={1.75} />Kalender</Link>
              </div>
              {writeOk && !showAktForm && (
                <button onClick={() => setShowAktForm(true)} className="btn-primary"><Plus size={15} strokeWidth={2} /> Aktivität</button>
              )}
            </div>
            {vorhandeneArten.length > 1 && (
              <div className="flex flex-wrap gap-1">
                <button onClick={() => setArtFilter('alle')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium ${artFilter === 'alle' ? 'bg-hs-teal text-white' : 'bg-white border border-hs-line text-hs-text-1'}`}>
                  Alle ({aktivitaeten.length})
                </button>
                {vorhandeneArten.map(a => (
                  <button key={a.value} onClick={() => setArtFilter(v => v === a.value ? 'alle' : a.value)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium ${artFilter === a.value ? 'bg-hs-teal text-white' : 'bg-white border border-hs-line text-hs-text-1'}`}>
                    {a.label} ({aktivitaeten.filter(x => x.art === a.value).length})
                  </button>
                ))}
              </div>
            )}
            {showAktForm && (
              <AktivitaetForm firmaId={firma.id} onDone={() => setShowAktForm(false)} onCancel={() => setShowAktForm(false)} />
            )}
            {gefiltert.length === 0 ? (
              <div className="bg-white rounded-xl border border-hs-line p-6 text-center">
                <p className="text-sm text-hs-text-2">Noch keine Aktivitäten erfasst.</p>
                {writeOk && !showAktForm && (
                  <button onClick={() => setShowAktForm(true)} className="btn-secondary mt-3"><StickyNote size={15} strokeWidth={1.75} /> Erste Aktivität eintragen</button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {gefiltert.map(a => <AktivitaetKarte key={a.id} a={a} writeOk={writeOk} zeigeZuordnung />)}
              </div>
            )}
          </div>
        </div>

        {/* Seitenleiste */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-hs-line p-4 space-y-2.5">
            <h2 className="text-sm">Firmendaten</h2>
            {firma.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail size={16} strokeWidth={1.75} className="text-hs-text-2 flex-shrink-0" />
                <a href={`mailto:${firma.email}`} className="text-hs-blue-700 hover:underline truncate">{firma.email}</a>
              </div>
            )}
            {firma.telefon && (
              <div className="flex items-center gap-2 text-sm">
                <Phone size={16} strokeWidth={1.75} className="text-hs-text-2 flex-shrink-0" />
                <a href={telHref(firma.telefon_vorwahl, firma.telefon)} className="text-hs-text hover:text-hs-blue-700 tabular-nums">{fmtTelefon(firma.telefon_vorwahl, firma.telefon)}</a>
              </div>
            )}
            {website && (
              <div className="flex items-center gap-2 text-sm">
                <Globe size={16} strokeWidth={1.75} className="text-hs-text-2 flex-shrink-0" />
                <a href={website} target="_blank" rel="noopener noreferrer" className="text-hs-blue-700 hover:underline truncate">{firma.website}</a>
              </div>
            )}
            {adresse.length > 0 && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin size={16} strokeWidth={1.75} className="text-hs-text-2 flex-shrink-0 mt-0.5" />
                <a href={mapsHref([firma.strasse, firma.plz, firma.ort, landLabel])} target="_blank" rel="noopener noreferrer" className="text-hs-text hover:text-hs-blue-700">
                  {adresse.map((z, i) => <span key={i} className="block">{z}</span>)}
                  {firma.land && firma.land !== 'AT' && <span className="block text-hs-text-2">{landLabel}</span>}
                </a>
              </div>
            )}
            {!firma.email && !firma.telefon && !website && adresse.length === 0 && (
              <p className="text-sm text-hs-text-2">Keine Kontaktdaten hinterlegt.</p>
            )}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs pt-2 border-t border-hs-line">
              <dt className="text-hs-text-2">UID-Nummer</dt><dd className="text-hs-text font-mono">{firma.uid_nummer ?? '–'}</dd>
              <dt className="text-hs-text-2">Zahlungsziel</dt><dd className="text-hs-text">{firma.zahlungsziel_tage === 0 ? 'bei Erhalt' : `${firma.zahlungsziel_tage} Tage`}</dd>
            </dl>
            {firma.notizen && (
              <p className="text-xs text-hs-text-1 whitespace-pre-wrap pt-2 border-t border-hs-line">{firma.notizen}</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-hs-line p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm">Verkaufschancen</h2>
              {writeOk && !showPipeForm && (
                <button onClick={() => setShowPipeForm(true)} className="text-xs font-medium text-hs-blue-700 hover:underline inline-flex items-center gap-1">
                  <Plus size={12} strokeWidth={2} /> Chance
                </button>
              )}
            </div>
            <PipelineListe eintraege={pipeline} />
          </div>

          <p className="text-xs text-hs-tertiary px-1">Angelegt am {fmtDatum(firma.erstellt_am)}</p>
        </div>
      </div>

      <Modal open={edit} onClose={() => setEdit(false)} title="Firma bearbeiten" subtitle={firma.name} width="max-w-2xl">
        <FirmaForm initial={firma} onDone={() => setEdit(false)} onCancel={() => setEdit(false)} />
      </Modal>

      <Modal open={showNeuKontakt} onClose={() => setShowNeuKontakt(false)} title="Neuer Ansprechpartner" subtitle={firma.name} width="max-w-2xl">
        <KontaktForm
          firmen={[{ id: firma.id, name: firma.name }]}
          defaultFirmaId={firma.id}
          defaultSegment={firma.segment}
          onDone={() => setShowNeuKontakt(false)}
          onCancel={() => setShowNeuKontakt(false)}
        />
      </Modal>

      <Modal open={showZuordnen} onClose={() => setShowZuordnen(false)} title="Bestehenden Kontakt zuordnen" subtitle="Für Personen, die mehrere Firmen vertreten">
        <form onSubmit={handleZuordnen} className="space-y-3">
          <div>
            <label className="form-label">Kontakt *</label>
            <KundenSuche items={zuordenbar.map(k => ({ id: k.id, label: k.name, sub: k.sub }))} value={zuordnenId} onChange={setZuordnenId} placeholder="Name suchen …" />
          </div>
          <div>
            <label className="form-label">Position bei dieser Firma</label>
            <input value={zuordnenPos} onChange={e => setZuordnenPos(e.target.value)} className="input" placeholder="optional" />
          </div>
          <label className="flex items-center gap-2 text-sm text-hs-text-1 cursor-pointer">
            <input type="checkbox" checked={zuordnenHaupt} onChange={e => setZuordnenHaupt(e.target.checked)} className="accent-hs-teal" />
            Hauptkontakt
          </label>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={pending || !zuordnenId} className="btn-primary">Zuordnen</button>
            <button type="button" onClick={() => setShowZuordnen(false)} className="btn-secondary">Abbrechen</button>
          </div>
        </form>
      </Modal>

      <Modal open={showPipeForm} onClose={() => setShowPipeForm(false)} title="Neue Verkaufschance" subtitle={firma.name} width="max-w-2xl">
        <PipelineForm
          kontakte={ansprechpartner.map(a => ({ id: a.id, name: a.name }))}
          firmen={[{ id: firma.id, name: firma.name }]}
          fixFirmaId={firma.id}
          onDone={() => setShowPipeForm(false)}
          onCancel={() => setShowPipeForm(false)}
        />
      </Modal>
    </div>
  )
}
