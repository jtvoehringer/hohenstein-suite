'use client'

// ── Dateien an Firma/Kontakt (Ablage im Datencenter, Bucket datencenter) ──────
// Upload/Download/Löschen über /api/datencenter/datei; die Dateien erscheinen
// im Datencenter unter „CRM-Anhänge".

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip, Upload, Download, Trash2, Loader2, X } from 'lucide-react'
import { fmtDatum } from '@/lib/format'
import { DateiTypIcon, fmtBytes } from '@/app/(dashboard)/datencenter/DatencenterClient'

export type KarteDatei = {
  id: string
  dateiname: string
  dateityp: string | null
  groesse_bytes: number | null
  erstellt_am: string
}

export default function DateienKarte({
  dateien, firmaId, kontaktId, writeOk,
}: {
  dateien: KarteDatei[]
  firmaId?: string | null
  kontaktId?: string | null
  writeOk: boolean
}) {
  const router = useRouter()
  const [uploading, setUploading] = useState(0)
  const [fehler, setFehler] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setFehler(null); setUploading(files.length)
    for (const f of files) {
      const fd = new FormData()
      fd.set('file', f)
      if (firmaId)   fd.set('firma_id', firmaId)
      if (kontaktId) fd.set('kontakt_id', kontaktId)
      try {
        const res = await fetch('/api/datencenter/datei', { method: 'POST', body: fd })
        if (!res.ok) { const j = await res.json().catch(() => ({})); setFehler(`${f.name}: ${j.error ?? 'Upload fehlgeschlagen'}`) }
      } catch (err) { setFehler(`${f.name}: ${err instanceof Error ? err.message : 'Upload fehlgeschlagen'}`) }
      setUploading(n => n - 1)
    }
    router.refresh()
  }

  async function handleLoeschen(d: KarteDatei) {
    if (!confirm(`Datei „${d.dateiname}" wirklich löschen?`)) return
    const res = await fetch(`/api/datencenter/datei/${d.id}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setFehler(j.error ?? 'Löschen fehlgeschlagen'); return }
    router.refresh()
  }

  return (
    <div className="bg-white rounded-xl border border-hs-line p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm inline-flex items-center gap-1.5">
          <Paperclip size={14} strokeWidth={1.75} className="text-hs-text-2" />Dateien ({dateien.length})
        </h2>
        {writeOk && (
          <button onClick={() => fileInput.current?.click()} disabled={uploading > 0}
            className="text-xs font-medium text-hs-blue-700 hover:underline inline-flex items-center gap-1">
            {uploading > 0 ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} strokeWidth={2} />}
            {uploading > 0 ? `Lade hoch (${uploading}) …` : 'Hochladen'}
          </button>
        )}
        <input ref={fileInput} type="file" multiple hidden onChange={handleUpload} />
      </div>
      {fehler && (
        <p className="text-xs text-hs-err-fg flex items-start justify-between gap-2">
          <span>{fehler}</span>
          <button onClick={() => setFehler(null)}><X size={12} /></button>
        </p>
      )}
      {dateien.length === 0 ? (
        <p className="text-xs text-hs-text-2">Noch keine Dateien angehängt.</p>
      ) : (
        <ul className="divide-y divide-hs-line -mx-1">
          {dateien.map(d => (
            <li key={d.id} className="flex items-center gap-2 px-1 py-1.5 group">
              <DateiTypIcon typ={d.dateityp} />
              <a href={`/api/datencenter/datei/${d.id}`} className="flex-1 min-w-0 text-[12.5px] text-hs-text hover:text-hs-blue-700 truncate" title={`${d.dateiname} herunterladen`}>
                {d.dateiname}
              </a>
              <span className="font-mono text-[10.5px] text-hs-tertiary shrink-0 tabular-nums hidden sm:inline">{fmtBytes(d.groesse_bytes)} · {fmtDatum(d.erstellt_am)}</span>
              <a href={`/api/datencenter/datei/${d.id}`} title="Herunterladen" className="text-hs-tertiary hover:text-hs-blue-700 p-0.5"><Download size={13} strokeWidth={1.75} /></a>
              {writeOk && (
                <button onClick={() => handleLoeschen(d)} title="Löschen" className="text-hs-tertiary hover:text-hs-err p-0.5">
                  <Trash2 size={13} strokeWidth={1.75} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
