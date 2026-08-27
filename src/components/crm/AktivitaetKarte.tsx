'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Phone, Mail, StickyNote, CheckSquare, Handshake, Presentation, Tent, Car, FileText,
  Ellipsis, TreePalm, UserX, Pencil, Trash2, Check, Lock, Paperclip, Download, Upload, X,
} from 'lucide-react'
import { aktivitaetLabel } from '@/lib/crm/types'
import { fmtDatum } from '@/lib/format'
import { toggleAktivitaetErledigt, deleteAktivitaet } from '@/app/(dashboard)/crm/actions'
import AktivitaetForm from './AktivitaetForm'
import { fmtUhrzeit, fmtBytes, type AktivitaetMitDokumenten } from './crmUtils'

const AKT_ICON: Record<string, typeof Phone> = {
  notiz: StickyNote, email: Mail, anruf: Phone, aufgabe: CheckSquare, besprechung: Handshake,
  demo: Presentation, messe: Tent, besuch: Car, angebot: FileText, sonstiges: Ellipsis,
  urlaub: TreePalm, abwesenheit: UserX,
}

/** Ein Eintrag im Aktivitäten-Log (Kontakt-/Firmen-Detail) inkl. Dokumente. */
export default function AktivitaetKarte({
  a, writeOk, zeigeZuordnung = false,
}: {
  a: AktivitaetMitDokumenten
  writeOk: boolean
  /** Kontakt-/Firmenname mit anzeigen (z.B. in Firmen-Detail bei Kontakt-Aktivitäten) */
  zeigeZuordnung?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [edit, setEdit]         = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [uploadFehler, setUploadFehler] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const Icon = AKT_ICON[a.art] ?? StickyNote
  const von = fmtUhrzeit(a.uhrzeit_von)
  const bis = fmtUhrzeit(a.uhrzeit_bis)

  function handleErledigt() {
    startTransition(async () => { await toggleAktivitaetErledigt(a.id, !a.erledigt); router.refresh() })
  }
  function handleDelete() {
    if (!confirm(`„${a.betreff ?? aktivitaetLabel(a.art)}" wirklich löschen?`)) return
    startTransition(async () => { await deleteAktivitaet(a.id); router.refresh() })
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadFehler(null)
    try {
      const fd = new FormData()
      fd.set('file', file)
      const res = await fetch(`/api/crm/aktivitaet/${a.id}/dokument`, { method: 'POST', body: fd })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setUploadFehler(json.error ?? `Fehler ${res.status}`); return }
      router.refresh()
    } catch (err) {
      setUploadFehler(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDokLoeschen(dokId: string, name: string) {
    if (!confirm(`Dokument „${name}" löschen?`)) return
    const res = await fetch(`/api/crm/aktivitaet/${a.id}/dokument/${dokId}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setUploadFehler(j.error ?? 'Löschen fehlgeschlagen'); return }
    router.refresh()
  }

  if (edit) {
    return (
      <div className="bg-white rounded-xl border border-hs-blue-300 p-4">
        <AktivitaetForm initial={a} compact onDone={() => setEdit(false)} onCancel={() => setEdit(false)} />
      </div>
    )
  }

  return (
    <div className={`bg-white rounded-xl border border-hs-line p-4 flex gap-3 ${a.erledigt && a.art === 'aufgabe' ? 'opacity-60' : ''}`}>
      {writeOk ? (
        <button type="button" onClick={handleErledigt} disabled={pending}
          title={a.erledigt ? 'Als offen markieren' : 'Als erledigt markieren'}
          className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-50 ${
            a.erledigt ? 'bg-hs-ok border-hs-ok text-white' : 'bg-white border-hs-line-str hover:border-hs-ok text-transparent'}`}>
          <Check size={12} strokeWidth={3} />
        </button>
      ) : (
        <span className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
          a.erledigt ? 'bg-hs-ok border-hs-ok text-white' : 'border-hs-line-str text-transparent'}`}>
          <Check size={12} strokeWidth={3} />
        </span>
      )}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-hs-bg flex items-center justify-center text-hs-text-1">
        <Icon size={16} strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap text-xs text-hs-text-2">
          <span className="tabular-nums">{fmtDatum(a.datum)}{a.bis_datum && a.bis_datum !== a.datum ? ` – ${fmtDatum(a.bis_datum)}` : ''}</span>
          {!a.ganztags && von && <span className="font-medium text-hs-blue-700 tabular-nums">{von}{bis ? `–${bis}` : ''}</span>}
          <span>{aktivitaetLabel(a.art)}</span>
          {a.ist_privat && <span className="inline-flex items-center gap-1"><Lock size={11} strokeWidth={1.75} />Privat</span>}
          {zeigeZuordnung && a.kontakt_name && a.kontakt_id && (
            <Link href={`/crm/kontakte/${a.kontakt_id}`} className="text-hs-blue-700 hover:underline">{a.kontakt_name}</Link>
          )}
          {zeigeZuordnung && !a.kontakt_name && a.firma_name && a.firma_id && (
            <Link href={`/crm/firmen/${a.firma_id}`} className="text-hs-blue-700 hover:underline">{a.firma_name}</Link>
          )}
        </div>
        {a.art === 'email' ? (
          <button type="button" onClick={() => setEmailOpen(v => !v)}
            className="text-sm font-medium text-left text-hs-blue-700 hover:underline mt-0.5">
            {a.betreff ?? '(kein Betreff)'}
          </button>
        ) : (
          <p className={`text-sm font-medium mt-0.5 ${a.erledigt && a.art === 'aufgabe' ? 'line-through text-hs-text-2' : 'text-hs-text'}`}>
            {a.betreff ?? aktivitaetLabel(a.art)}
          </p>
        )}
        {a.art === 'email' && emailOpen && (
          <div className="mt-2 border border-hs-line rounded-lg overflow-hidden">
            <div className="bg-hs-bg px-3 py-1.5 text-[11px] text-hs-text-2 space-y-0.5 border-b border-hs-line">
              {a.email_von && <div><span className="font-medium">Von:</span> {a.email_von_name ? `${a.email_von_name} <${a.email_von}>` : a.email_von}</div>}
              {a.email_an && <div><span className="font-medium">An:</span> {a.email_an}</div>}
            </div>
            {a.email_body
              ? <pre className="px-3 py-2 text-xs text-hs-text-1 whitespace-pre-wrap font-sans max-h-64 overflow-y-auto">{a.email_body}</pre>
              : <p className="px-3 py-2 text-xs text-hs-text-2">Kein Inhalt gespeichert – im Posteingang öffnen.</p>}
          </div>
        )}
        {a.beschreibung && a.art !== 'email' && (
          <p className="text-xs text-hs-text-1 mt-1 whitespace-pre-wrap">{a.beschreibung}</p>
        )}

        {/* Dokumente */}
        {(a.dokumente.length > 0 || writeOk) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {a.dokumente.map(d => (
              <span key={d.id} className="inline-flex items-center gap-1 text-xs bg-hs-bg border border-hs-line rounded-lg pl-2 pr-1 py-0.5">
                <Paperclip size={11} strokeWidth={1.75} className="text-hs-text-2" />
                <a href={`/api/crm/aktivitaet/${a.id}/dokument/${d.id}`} target="_blank" rel="noopener noreferrer"
                  className="text-hs-blue-700 hover:underline max-w-[180px] truncate" title={`${d.dateiname} (${fmtBytes(d.groesse_bytes)})`}>
                  {d.dateiname}
                </a>
                <a href={`/api/crm/aktivitaet/${a.id}/dokument/${d.id}`} aria-label="Herunterladen" className="text-hs-text-2 hover:text-hs-text p-0.5">
                  <Download size={11} strokeWidth={1.75} />
                </a>
                {writeOk && (
                  <button type="button" onClick={() => handleDokLoeschen(d.id, d.dateiname)} aria-label="Dokument löschen"
                    className="text-hs-text-2 hover:text-hs-err p-0.5">
                    <X size={11} strokeWidth={1.75} />
                  </button>
                )}
              </span>
            ))}
            {writeOk && (
              <>
                <input ref={fileRef} type="file" className="hidden" onChange={handleUpload}
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xlsx,.txt" />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="inline-flex items-center gap-1 text-xs text-hs-text-2 hover:text-hs-blue-700 border border-dashed border-hs-line-str rounded-lg px-2 py-0.5 disabled:opacity-50">
                  <Upload size={11} strokeWidth={1.75} />{uploading ? 'Lädt …' : 'Datei'}
                </button>
              </>
            )}
          </div>
        )}
        {uploadFehler && <p className="text-xs text-hs-err-fg mt-1">{uploadFehler}</p>}
      </div>
      {writeOk && (
        <div className="flex flex-col gap-1 flex-shrink-0">
          {a.art !== 'email' && (
            <button type="button" onClick={() => setEdit(true)} title="Bearbeiten" aria-label="Bearbeiten"
              className="text-hs-tertiary hover:text-hs-blue-700 transition-colors p-0.5">
              <Pencil size={14} strokeWidth={1.75} />
            </button>
          )}
          <button type="button" onClick={handleDelete} disabled={pending} title="Löschen" aria-label="Löschen"
            className="text-hs-tertiary hover:text-hs-err transition-colors p-0.5">
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </div>
      )}
    </div>
  )
}
