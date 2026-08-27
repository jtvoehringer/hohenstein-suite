'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Pencil, Trash2, Mail, Phone, Smartphone, MapPin, Building2, Cake, Languages, User, Plus, Calendar, ChevronLeft, StickyNote,
} from 'lucide-react'
import type { KontaktRow } from '@/lib/crm/types'
import { kontaktName, AKTIVITAET_ARTEN } from '@/lib/crm/types'
import { fmtDatum } from '@/lib/format'
import { deleteKontakt } from '../../actions'
import Modal from '@/components/crm/Modal'
import KontaktForm, { type FirmaOption } from '@/components/crm/KontaktForm'
import AktivitaetForm from '@/components/crm/AktivitaetForm'
import AktivitaetKarte from '@/components/crm/AktivitaetKarte'
import PipelineForm from '@/components/crm/PipelineForm'
import PipelineListe from '@/components/crm/PipelineListe'
import { SegmentPill, LeadPill } from '@/components/crm/Pills'
import { fmtTelefon, telHref, mapsHref, type AktivitaetMitDokumenten, type PipelineKurz } from '@/components/crm/crmUtils'
import { LAENDER, SPRACHEN } from '@/components/crm/crmUtils'

type WeitereFirma = { id: string; name: string; segment: string; position: string | null; hauptkontakt: boolean }

export default function KontaktDetailClient({
  kontakt, firmaSegment, weitereFirmen, aktivitaeten, pipeline, firmen, writeOk,
}: {
  kontakt: KontaktRow
  firmaSegment: string | null
  weitereFirmen: WeitereFirma[]
  aktivitaeten: AktivitaetMitDokumenten[]
  pipeline: PipelineKurz[]
  firmen: FirmaOption[]
  writeOk: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [edit, setEdit]                 = useState(false)
  const [showAktForm, setShowAktForm]   = useState(false)
  const [showPipeForm, setShowPipeForm] = useState(false)
  const [artFilter, setArtFilter]       = useState<string>('alle')
  const [fehler, setFehler]             = useState<string | null>(null)
  const name = kontaktName(kontakt)

  function handleDelete() {
    if (!confirm(`Kontakt „${name}" wirklich löschen? Aktivitäten und Verkaufschancen bleiben erhalten (ohne Zuordnung).`)) return
    startTransition(async () => {
      const res = await deleteKontakt(kontakt.id)
      if (res?.error) { setFehler(res.error); return }
      router.push('/crm/kontakte'); router.refresh()
    })
  }

  const vorhandeneArten = useMemo(() => AKTIVITAET_ARTEN.filter(a => aktivitaeten.some(x => x.art === a.value)), [aktivitaeten])
  const gefiltert = useMemo(() => {
    const list = artFilter === 'alle' ? aktivitaeten : aktivitaeten.filter(a => a.art === artFilter)
    // offene Aufgaben zuerst, danach chronologisch absteigend
    return [...list].sort((a, b) => {
      const ao = a.art === 'aufgabe' && !a.erledigt ? 0 : 1
      const bo = b.art === 'aufgabe' && !b.erledigt ? 0 : 1
      if (ao !== bo) return ao - bo
      return b.datum.localeCompare(a.datum)
    })
  }, [aktivitaeten, artFilter])

  const landLabel = LAENDER.find(l => l.code === kontakt.land)?.label ?? kontakt.land
  const spracheLabel = SPRACHEN.find(s => s.code === kontakt.sprache)?.label ?? kontakt.sprache
  const adresse = [kontakt.strasse, [kontakt.plz, kontakt.ort].filter(Boolean).join(' ')].filter(Boolean)

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-1.5 text-sm text-hs-text-2">
        <Link href="/crm/kontakte" className="inline-flex items-center gap-1 hover:text-hs-blue-700"><ChevronLeft size={14} strokeWidth={1.75} />Kontakte</Link>
        <span>/</span>
        <span className="text-hs-text font-medium truncate">{name}</span>
      </nav>

      {/* Kopf */}
      <div className="bg-white rounded-xl border border-hs-line p-5 flex items-start gap-4 flex-wrap">
        <div className="flex flex-col items-center justify-center bg-hs-bg border border-hs-line rounded-lg px-3 py-2 min-w-[80px]">
          <span className="overline">Kd.-Nr.</span>
          <span className="font-mono text-sm font-semibold text-hs-blue-700 tabular-nums">{kontakt.kundennummer ?? '–'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl">{name}</h1>
          <p className="text-sm text-hs-text-2 mt-1">
            {[kontakt.position, kontakt.firma_name].filter(Boolean).join(' · ') || 'Kontakt'}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <SegmentPill segment={kontakt.segment} />
            <LeadPill isLead={kontakt.is_lead} />
          </div>
        </div>
        {writeOk && (
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => setEdit(true)} className="btn-secondary"><Pencil size={15} strokeWidth={1.75} /> Bearbeiten</button>
            <button onClick={handleDelete} disabled={pending} className="btn-danger" title="Kontakt löschen"><Trash2 size={15} strokeWidth={1.75} /></button>
          </div>
        )}
        {fehler && <p className="w-full text-sm text-hs-err-fg">{fehler}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Aktivitäten */}
        <div className="lg:col-span-2 space-y-3">
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
            <AktivitaetForm kontaktId={kontakt.id} firmaId={kontakt.firma_id} onDone={() => setShowAktForm(false)} onCancel={() => setShowAktForm(false)} />
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
              {gefiltert.map(a => <AktivitaetKarte key={a.id} a={a} writeOk={writeOk} />)}
            </div>
          )}
        </div>

        {/* Seitenleiste */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-hs-line p-4 space-y-2.5">
            <h2 className="text-sm">Kontaktdaten</h2>
            {kontakt.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail size={16} strokeWidth={1.75} className="text-hs-text-2 flex-shrink-0" />
                <a href={`mailto:${kontakt.email}`} className="text-hs-blue-700 hover:underline truncate">{kontakt.email}</a>
              </div>
            )}
            {kontakt.telefon && (
              <div className="flex items-center gap-2 text-sm">
                <Phone size={16} strokeWidth={1.75} className="text-hs-text-2 flex-shrink-0" />
                <a href={telHref(kontakt.telefon_vorwahl, kontakt.telefon)} className="text-hs-text hover:text-hs-blue-700 tabular-nums">{fmtTelefon(kontakt.telefon_vorwahl, kontakt.telefon)}</a>
              </div>
            )}
            {kontakt.mobil && (
              <div className="flex items-center gap-2 text-sm">
                <Smartphone size={16} strokeWidth={1.75} className="text-hs-text-2 flex-shrink-0" />
                <a href={telHref(kontakt.mobil_vorwahl, kontakt.mobil)} className="text-hs-text hover:text-hs-blue-700 tabular-nums">{fmtTelefon(kontakt.mobil_vorwahl, kontakt.mobil)}</a>
              </div>
            )}
            {adresse.length > 0 && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin size={16} strokeWidth={1.75} className="text-hs-text-2 flex-shrink-0 mt-0.5" />
                <a href={mapsHref([kontakt.strasse, kontakt.plz, kontakt.ort, landLabel])} target="_blank" rel="noopener noreferrer" className="text-hs-text hover:text-hs-blue-700">
                  {adresse.map((z, i) => <span key={i} className="block">{z}</span>)}
                  {kontakt.land && kontakt.land !== 'AT' && <span className="block text-hs-text-2">{landLabel}</span>}
                </a>
              </div>
            )}
            {kontakt.geburtsdatum && (
              <div className="flex items-center gap-2 text-sm">
                <Cake size={16} strokeWidth={1.75} className="text-hs-text-2 flex-shrink-0" />
                <span className="text-hs-text">{fmtDatum(kontakt.geburtsdatum)}</span>
              </div>
            )}
            {kontakt.sprache && kontakt.sprache !== 'de' && (
              <div className="flex items-center gap-2 text-sm">
                <Languages size={16} strokeWidth={1.75} className="text-hs-text-2 flex-shrink-0" />
                <span className="text-hs-text">{spracheLabel}</span>
              </div>
            )}
            {kontakt.ansprechpartner_intern && (
              <div className="flex items-center gap-2 text-sm">
                <User size={16} strokeWidth={1.75} className="text-hs-text-2 flex-shrink-0" />
                <span className="text-hs-text">Betreut von {kontakt.ansprechpartner_intern}</span>
              </div>
            )}
            {!kontakt.email && !kontakt.telefon && !kontakt.mobil && adresse.length === 0 && (
              <p className="text-sm text-hs-text-2">Keine Kontaktdaten hinterlegt.</p>
            )}
            {kontakt.notizen && (
              <p className="text-xs text-hs-text-1 whitespace-pre-wrap pt-2 border-t border-hs-line">{kontakt.notizen}</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-hs-line p-4 space-y-2.5">
            <h2 className="text-sm">Firma</h2>
            {kontakt.firma_id && kontakt.firma_name ? (
              <div className="flex items-center gap-2 text-sm">
                <Building2 size={16} strokeWidth={1.75} className="text-hs-text-2 flex-shrink-0" />
                <Link href={`/crm/firmen/${kontakt.firma_id}`} className="text-hs-blue-700 hover:underline truncate">{kontakt.firma_name}</Link>
                {firmaSegment && <SegmentPill segment={firmaSegment} />}
              </div>
            ) : (
              <p className="text-sm text-hs-text-2">Keine Firma zugeordnet.</p>
            )}
            {weitereFirmen.length > 0 && (
              <div className="pt-2 border-t border-hs-line space-y-1.5">
                <p className="overline">Weitere Zuordnungen</p>
                {weitereFirmen.map(f => (
                  <div key={f.id} className="flex items-center gap-2 text-sm">
                    <Link href={`/crm/firmen/${f.id}`} className="text-hs-blue-700 hover:underline truncate">{f.name}</Link>
                    {f.position && <span className="text-xs text-hs-text-2">{f.position}</span>}
                    {f.hauptkontakt && <span className="pill bg-hs-blue-50 text-hs-blue-700">Hauptkontakt</span>}
                  </div>
                ))}
              </div>
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

          <p className="text-xs text-hs-tertiary px-1">Angelegt am {fmtDatum(kontakt.erstellt_am)}</p>
        </div>
      </div>

      <Modal open={edit} onClose={() => setEdit(false)} title="Kontakt bearbeiten" subtitle={name} width="max-w-2xl">
        <KontaktForm initial={kontakt} firmen={firmen} onDone={() => setEdit(false)} onCancel={() => setEdit(false)} />
      </Modal>

      <Modal open={showPipeForm} onClose={() => setShowPipeForm(false)} title="Neue Verkaufschance" subtitle={name} width="max-w-2xl">
        <PipelineForm
          kontakte={[{ id: kontakt.id, name }]}
          firmen={firmen}
          fixKontaktId={kontakt.id}
          fixFirmaId={kontakt.firma_id}
          onDone={() => setShowPipeForm(false)}
          onCancel={() => setShowPipeForm(false)}
        />
      </Modal>
    </div>
  )
}
