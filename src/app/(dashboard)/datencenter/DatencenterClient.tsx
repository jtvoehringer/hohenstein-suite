'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Folder, FolderOpen, FolderPlus, FileText, FileSpreadsheet, FileImage, File as FileIcon, FileArchive,
  Upload, Download, Trash2, Pencil, ChevronRight, Search, Loader2, X, Link2, FolderInput, HardDrive, Paperclip,
} from 'lucide-react'
import { fmtDatum } from '@/lib/format'
import { createOrdner, renameOrdner, deleteOrdner, moveDatei, renameDatei } from './actions'

export type AblageOrdner = { id: string; parent_id: string | null; name: string }
export type AblageDatei = {
  id: string
  ordner_id: string | null
  firma_id: string | null
  kontakt_id: string | null
  dateiname: string
  dateityp: string | null
  groesse_bytes: number | null
  erstellt_am: string
  /** Name der verknüpften Firma bzw. des Kontakts (CRM-Anhänge) */
  verknuepfung: string | null
}

/** aktuelle Ansicht: Ordner-ID, 'wurzel' oder die virtuelle CRM-Sammlung */
type Ansicht = { typ: 'ordner'; id: string | null } | { typ: 'crm' }

export function fmtBytes(b: number | null): string {
  if (b == null) return '–'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export function DateiTypIcon({ typ }: { typ: string | null }) {
  const p = { size: 16, strokeWidth: 1.75 }
  const t = typ ?? ''
  if (t.startsWith('image/')) return <FileImage {...p} className="text-hs-teal" />
  if (t.includes('spreadsheet') || t.includes('excel') || t === 'text/csv') return <FileSpreadsheet {...p} className="text-hs-ok-fg" />
  if (t.includes('zip')) return <FileArchive {...p} className="text-hs-warn-fg" />
  if (t === 'application/pdf' || t.includes('word') || t.startsWith('text/')) return <FileText {...p} className="text-hs-blue-700" />
  return <FileIcon {...p} className="text-hs-text-2" />
}

export default function DatencenterClient({
  ordner, dateien, writeOk,
}: {
  ordner: AblageOrdner[]
  dateien: AblageDatei[]
  writeOk: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [ansicht, setAnsicht] = useState<Ansicht>({ typ: 'ordner', id: null })
  const [suche, setSuche]     = useState('')
  const [fehler, setFehler]   = useState<string | null>(null)
  const [neuOrdner, setNeuOrdner] = useState(false)
  const [neuName, setNeuName]     = useState('')
  const [umbenennen, setUmbenennen] = useState<{ typ: 'ordner' | 'datei'; id: string; name: string } | null>(null)
  const [verschieben, setVerschieben] = useState<AblageDatei | null>(null)
  const [uploading, setUploading]   = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)

  const kinder = useMemo(() => {
    const m = new Map<string | null, AblageOrdner[]>()
    for (const o of ordner) {
      const p = o.parent_id ?? null
      m.set(p, [...(m.get(p) ?? []), o])
    }
    for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'de'))
    return m
  }, [ordner])

  const byId = useMemo(() => new Map(ordner.map(o => [o.id, o])), [ordner])
  const crmDateien = useMemo(() => dateien.filter(d => d.firma_id || d.kontakt_id), [dateien])

  const aktuellerOrdnerId = ansicht.typ === 'ordner' ? ansicht.id : null
  const breadcrumb = useMemo(() => {
    const out: AblageOrdner[] = []
    let cur = aktuellerOrdnerId ? byId.get(aktuellerOrdnerId) : undefined
    let guard = 0
    while (cur && guard++ < 30) { out.unshift(cur); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined }
    return out
  }, [aktuellerOrdnerId, byId])

  const q = suche.trim().toLowerCase()
  const sichtbareDateien = useMemo(() => {
    if (q) {
      // Suche geht über die gesamte Ablage
      return dateien.filter(d => (d.dateiname + ' ' + (d.verknuepfung ?? '')).toLowerCase().includes(q))
    }
    if (ansicht.typ === 'crm') return crmDateien
    return dateien.filter(d => (d.ordner_id ?? null) === ansicht.id && !d.firma_id && !d.kontakt_id)
  }, [dateien, crmDateien, ansicht, q])

  const sichtbareOrdner = q ? [] : (ansicht.typ === 'ordner' ? (kinder.get(ansicht.id) ?? []) : [])

  function ordnerPfad(id: string | null): string {
    if (!id) return 'Ablage'
    const teile: string[] = []
    let cur = byId.get(id); let guard = 0
    while (cur && guard++ < 30) { teile.unshift(cur.name); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined }
    return 'Ablage / ' + teile.join(' / ')
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setFehler(null); setUploading(files.length)
    for (const f of files) {
      const fd = new FormData()
      fd.set('file', f)
      if (aktuellerOrdnerId) fd.set('ordner_id', aktuellerOrdnerId)
      try {
        const res = await fetch('/api/datencenter/datei', { method: 'POST', body: fd })
        if (!res.ok) { const j = await res.json().catch(() => ({})); setFehler(`${f.name}: ${j.error ?? 'Upload fehlgeschlagen'}`) }
      } catch (err) { setFehler(`${f.name}: ${err instanceof Error ? err.message : 'Upload fehlgeschlagen'}`) }
      setUploading(n => n - 1)
    }
    router.refresh()
  }

  function handleNeuOrdner(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await createOrdner(neuName, aktuellerOrdnerId)
      if (res?.error) { setFehler(res.error); return }
      setNeuOrdner(false); setNeuName('')
      router.refresh()
    })
  }

  function handleUmbenennen(e: React.FormEvent) {
    e.preventDefault()
    if (!umbenennen) return
    startTransition(async () => {
      const res = umbenennen.typ === 'ordner'
        ? await renameOrdner(umbenennen.id, umbenennen.name)
        : await renameDatei(umbenennen.id, umbenennen.name)
      if (res?.error) { setFehler(res.error); return }
      setUmbenennen(null)
      router.refresh()
    })
  }

  function handleOrdnerLoeschen(o: AblageOrdner) {
    const n = dateien.filter(d => d.ordner_id === o.id).length
    if (!confirm(`Ordner „${o.name}" ${n > 0 ? `samt Inhalt (${n} Datei(en) und alle Unterordner) ` : ''}wirklich löschen?`)) return
    startTransition(async () => {
      const res = await deleteOrdner(o.id)
      if (res?.error) { setFehler(res.error); return }
      if (ansicht.typ === 'ordner' && ansicht.id === o.id) setAnsicht({ typ: 'ordner', id: o.parent_id ?? null })
      router.refresh()
    })
  }

  function handleDateiLoeschen(d: AblageDatei) {
    if (!confirm(`Datei „${d.dateiname}" wirklich löschen?`)) return
    startTransition(async () => {
      const res = await fetch(`/api/datencenter/datei/${d.id}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setFehler(j.error ?? 'Löschen fehlgeschlagen'); return }
      router.refresh()
    })
  }

  function handleVerschieben(zielId: string | null) {
    if (!verschieben) return
    startTransition(async () => {
      const res = await moveDatei(verschieben.id, zielId)
      if (res?.error) { setFehler(res.error); return }
      setVerschieben(null)
      router.refresh()
    })
  }

  /** Ordnerbaum rekursiv rendern */
  function Baum({ parent, ebene }: { parent: string | null; ebene: number }) {
    const list = kinder.get(parent) ?? []
    return (
      <>
        {list.map(o => {
          const aktiv = ansicht.typ === 'ordner' && ansicht.id === o.id
          return (
            <div key={o.id}>
              <button onClick={() => { setSuche(''); setAnsicht({ typ: 'ordner', id: o.id }) }}
                className={`w-full flex items-center gap-2 py-1.5 pr-2 text-left text-[13px] rounded-md transition-colors ${aktiv ? 'bg-hs-blue-50 text-hs-blue-700 font-semibold' : 'text-hs-text-1 hover:bg-hs-bg'}`}
                style={{ paddingLeft: `${10 + ebene * 14}px` }}>
                {aktiv ? <FolderOpen size={15} strokeWidth={1.75} /> : <Folder size={15} strokeWidth={1.75} />}
                <span className="flex-1 truncate">{o.name}</span>
              </button>
              <Baum parent={o.id} ebene={ebene + 1} />
            </div>
          )
        })}
      </>
    )
  }

  const wurzelAktiv = ansicht.typ === 'ordner' && ansicht.id === null

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl">Datencenter</h1>
          <p className="text-sm text-hs-text-2 mt-1">Gemeinsame Dateiablage des Teams – {dateien.length} {dateien.length === 1 ? 'Datei' : 'Dateien'}</p>
        </div>
        {writeOk && (
          <div className="flex items-center gap-2">
            <button onClick={() => { setNeuName(''); setNeuOrdner(true) }} className="btn-secondary" disabled={ansicht.typ === 'crm'}>
              <FolderPlus size={15} strokeWidth={1.75} /> Neuer Ordner
            </button>
            <button onClick={() => fileInput.current?.click()} className="btn-primary" disabled={uploading > 0 || ansicht.typ === 'crm'}>
              {uploading > 0 ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} strokeWidth={1.75} />}
              {uploading > 0 ? `Lade hoch (${uploading}) …` : 'Hochladen'}
            </button>
            <input ref={fileInput} type="file" multiple hidden onChange={handleUpload} />
          </div>
        )}
      </div>

      {fehler && (
        <p className="text-sm text-hs-err-fg bg-hs-err-bg border border-hs-err/30 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
          <span>{fehler}</span>
          <button onClick={() => setFehler(null)}><X size={14} /></button>
        </p>
      )}

      <div className="bg-white rounded-xl border border-hs-line flex min-h-[480px] overflow-hidden">
        {/* ── Ordnerbaum ── */}
        <div className="w-[250px] shrink-0 border-r border-hs-line p-2 overflow-y-auto">
          <button onClick={() => { setSuche(''); setAnsicht({ typ: 'ordner', id: null }) }}
            className={`w-full flex items-center gap-2 py-1.5 px-2.5 text-left text-[13px] rounded-md transition-colors ${wurzelAktiv ? 'bg-hs-blue-50 text-hs-blue-700 font-semibold' : 'text-hs-text-1 hover:bg-hs-bg'}`}>
            <HardDrive size={15} strokeWidth={1.75} />
            <span className="flex-1">Ablage</span>
          </button>
          <Baum parent={null} ebene={1} />
          <div className="border-t border-hs-line mt-2 pt-2">
            <button onClick={() => { setSuche(''); setAnsicht({ typ: 'crm' }) }}
              className={`w-full flex items-center gap-2 py-1.5 px-2.5 text-left text-[13px] rounded-md transition-colors ${ansicht.typ === 'crm' ? 'bg-hs-blue-50 text-hs-blue-700 font-semibold' : 'text-hs-text-1 hover:bg-hs-bg'}`}
              title="Dateien, die an Firmen oder Kontakten hängen">
              <Paperclip size={15} strokeWidth={1.75} />
              <span className="flex-1">CRM-Anhänge</span>
              <span className="font-mono text-[11px] text-hs-tertiary">{crmDateien.length}</span>
            </button>
          </div>
        </div>

        {/* ── Inhalt ── */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-hs-line flex-wrap">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 text-[13px] flex-1 min-w-0 flex-wrap">
              {ansicht.typ === 'crm' ? (
                <span className="font-semibold text-hs-text">CRM-Anhänge</span>
              ) : (
                <>
                  <button onClick={() => setAnsicht({ typ: 'ordner', id: null })} className={breadcrumb.length === 0 ? 'font-semibold text-hs-text' : 'text-hs-text-2 hover:text-hs-blue-700'}>Ablage</button>
                  {breadcrumb.map((o, i) => (
                    <span key={o.id} className="flex items-center gap-1">
                      <ChevronRight size={13} strokeWidth={1.75} className="text-hs-tertiary" />
                      <button onClick={() => setAnsicht({ typ: 'ordner', id: o.id })}
                        className={i === breadcrumb.length - 1 ? 'font-semibold text-hs-text' : 'text-hs-text-2 hover:text-hs-blue-700'}>
                        {o.name}
                      </button>
                    </span>
                  ))}
                </>
              )}
            </nav>
            <div className="relative w-56">
              <Search size={14} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-hs-tertiary" />
              <input type="search" value={suche} onChange={e => setSuche(e.target.value)}
                placeholder="Gesamte Ablage durchsuchen …" className="input pl-8 !py-1.5 text-[13px]" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {sichtbareOrdner.length === 0 && sichtbareDateien.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-hs-text-2">
                <FolderOpen size={28} strokeWidth={1.5} className="text-hs-tertiary" />
                <p className="text-[13px]">{q ? 'Keine Treffer.' : 'Dieser Ordner ist leer.'}</p>
                {writeOk && !q && ansicht.typ !== 'crm' && (
                  <button onClick={() => fileInput.current?.click()} className="btn-secondary mt-1"><Upload size={14} strokeWidth={1.75} /> Dateien hochladen</button>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="text-left px-4 py-2">Name</th>
                    <th className="text-left px-4 py-2 hidden md:table-cell w-44">{q || ansicht.typ === 'crm' ? 'Ablageort / Verknüpfung' : 'Verknüpfung'}</th>
                    <th className="text-right px-4 py-2 w-24 hidden sm:table-cell">Größe</th>
                    <th className="text-left px-4 py-2 w-28 hidden lg:table-cell">Datum</th>
                    <th className="px-2 py-2 w-32" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-hs-line">
                  {sichtbareOrdner.map(o => (
                    <tr key={o.id} className="hover:bg-hs-bg/70 cursor-pointer" onClick={() => setAnsicht({ typ: 'ordner', id: o.id })}>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-2 font-medium text-hs-text">
                          <Folder size={16} strokeWidth={1.75} className="text-hs-warn" />{o.name}
                        </span>
                      </td>
                      <td className="px-4 py-2 hidden md:table-cell text-hs-tertiary text-xs">Ordner</td>
                      <td className="px-4 py-2 hidden sm:table-cell" />
                      <td className="px-4 py-2 hidden lg:table-cell" />
                      <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                        {writeOk && (
                          <span className="inline-flex items-center gap-0.5">
                            <button onClick={() => setUmbenennen({ typ: 'ordner', id: o.id, name: o.name })} title="Umbenennen" className="text-hs-tertiary hover:text-hs-blue-700 p-1"><Pencil size={14} strokeWidth={1.75} /></button>
                            <button onClick={() => handleOrdnerLoeschen(o)} disabled={pending} title="Ordner löschen" className="text-hs-tertiary hover:text-hs-err p-1"><Trash2 size={14} strokeWidth={1.75} /></button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {sichtbareDateien.map(d => (
                    <tr key={d.id} className="hover:bg-hs-bg/70">
                      <td className="px-4 py-2">
                        <a href={`/api/datencenter/datei/${d.id}`} className="inline-flex items-center gap-2 text-hs-text hover:text-hs-blue-700" title="Herunterladen">
                          <DateiTypIcon typ={d.dateityp} />
                          <span className="truncate max-w-[380px]">{d.dateiname}</span>
                        </a>
                      </td>
                      <td className="px-4 py-2 hidden md:table-cell text-xs text-hs-text-2">
                        {d.verknuepfung ? (
                          <span className="inline-flex items-center gap-1"><Link2 size={12} strokeWidth={1.75} />{d.verknuepfung}</span>
                        ) : q ? ordnerPfad(d.ordner_id) : <span className="text-hs-tertiary">–</span>}
                      </td>
                      <td className="px-4 py-2 hidden sm:table-cell text-right font-mono tabular-nums text-xs text-hs-text-1">{fmtBytes(d.groesse_bytes)}</td>
                      <td className="px-4 py-2 hidden lg:table-cell text-xs text-hs-text-1">{fmtDatum(d.erstellt_am)}</td>
                      <td className="px-2 py-2 text-right">
                        <span className="inline-flex items-center gap-0.5">
                          <a href={`/api/datencenter/datei/${d.id}`} title="Herunterladen" className="text-hs-tertiary hover:text-hs-blue-700 p-1"><Download size={14} strokeWidth={1.75} /></a>
                          {writeOk && !d.firma_id && !d.kontakt_id && (
                            <button onClick={() => setVerschieben(d)} title="In Ordner verschieben" className="text-hs-tertiary hover:text-hs-blue-700 p-1"><FolderInput size={14} strokeWidth={1.75} /></button>
                          )}
                          {writeOk && (
                            <>
                              <button onClick={() => setUmbenennen({ typ: 'datei', id: d.id, name: d.dateiname })} title="Umbenennen" className="text-hs-tertiary hover:text-hs-blue-700 p-1"><Pencil size={14} strokeWidth={1.75} /></button>
                              <button onClick={() => handleDateiLoeschen(d)} disabled={pending} title="Löschen" className="text-hs-tertiary hover:text-hs-err p-1"><Trash2 size={14} strokeWidth={1.75} /></button>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Neuer Ordner */}
      {neuOrdner && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setNeuOrdner(false)}>
          <form onSubmit={handleNeuOrdner} onClick={e => e.stopPropagation()} className="bg-white rounded-xl border border-hs-line shadow-lg p-5 w-full max-w-sm space-y-3">
            <h2 className="text-base">Neuer Ordner</h2>
            <p className="text-xs text-hs-text-2">in {ordnerPfad(aktuellerOrdnerId)}</p>
            <input value={neuName} onChange={e => setNeuName(e.target.value)} className="input" placeholder="Ordnername" autoFocus required />
            <div className="flex gap-2">
              <button type="submit" disabled={pending || !neuName.trim()} className="btn-primary">Anlegen</button>
              <button type="button" onClick={() => setNeuOrdner(false)} className="btn-secondary">Abbrechen</button>
            </div>
          </form>
        </div>
      )}

      {/* Umbenennen */}
      {umbenennen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setUmbenennen(null)}>
          <form onSubmit={handleUmbenennen} onClick={e => e.stopPropagation()} className="bg-white rounded-xl border border-hs-line shadow-lg p-5 w-full max-w-sm space-y-3">
            <h2 className="text-base">{umbenennen.typ === 'ordner' ? 'Ordner umbenennen' : 'Datei umbenennen'}</h2>
            <input value={umbenennen.name} onChange={e => setUmbenennen(u => u ? { ...u, name: e.target.value } : u)} className="input" autoFocus required />
            <div className="flex gap-2">
              <button type="submit" disabled={pending} className="btn-primary">Speichern</button>
              <button type="button" onClick={() => setUmbenennen(null)} className="btn-secondary">Abbrechen</button>
            </div>
          </form>
        </div>
      )}

      {/* Verschieben */}
      {verschieben && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setVerschieben(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl border border-hs-line shadow-lg p-5 w-full max-w-sm space-y-3">
            <h2 className="text-base">„{verschieben.dateiname}" verschieben</h2>
            <div className="max-h-64 overflow-y-auto border border-hs-line rounded-lg divide-y divide-hs-line">
              <button onClick={() => handleVerschieben(null)} className="w-full text-left px-3 py-2 text-[13px] hover:bg-hs-bg inline-flex items-center gap-2">
                <HardDrive size={14} strokeWidth={1.75} /> Ablage (Wurzel)
              </button>
              {ordner.map(o => (
                <button key={o.id} onClick={() => handleVerschieben(o.id)}
                  className="w-full text-left px-3 py-2 text-[13px] hover:bg-hs-bg inline-flex items-center gap-2"
                  disabled={o.id === verschieben.ordner_id}>
                  <Folder size={14} strokeWidth={1.75} className="text-hs-warn" /> {ordnerPfad(o.id).replace(/^Ablage \/ /, '')}
                </button>
              ))}
            </div>
            <button onClick={() => setVerschieben(null)} className="btn-secondary">Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  )
}
