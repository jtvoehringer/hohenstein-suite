'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2 } from 'lucide-react'

export default function BelegUpload({ kiAktiv }: { kiAktiv: boolean }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [fehler, setFehler] = useState<string[]>([])
  const [fortschritt, setFortschritt] = useState('')

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setLaeuft(true); setFehler([])
    const probleme: string[] = []
    const liste = Array.from(files)
    const neueIds: string[] = []
    for (let i = 0; i < liste.length; i++) {
      const file = liste[i]
      setFortschritt(liste.length > 1 ? `${i + 1} / ${liste.length}: ${file.name}` : file.name)
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/buchhaltung/belege', { method: 'POST', body: fd })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) probleme.push(`${file.name}: ${json.error ?? 'Upload fehlgeschlagen'}`)
        else if (json.id) neueIds.push(json.id as string)
      } catch {
        probleme.push(`${file.name}: Upload fehlgeschlagen – bitte erneut versuchen.`)
      }
    }
    setFehler(probleme)
    setLaeuft(false); setFortschritt('')
    if (inputRef.current) inputRef.current.value = ''
    // Ein einzelner Beleg → direkt zum Verbuchen; mehrere → Liste aktualisieren
    if (neueIds.length === 1 && liste.length === 1 && probleme.length === 0) router.push(`/buchhaltung/belege/${neueIds[0]}`)
    else if (neueIds.length > 0) router.refresh()
  }

  return (
    <div
      className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors bg-white ${dragOver ? 'border-hs-blue-300 bg-hs-blue-50' : 'border-hs-line-str'}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
    >
      <input ref={inputRef} id="beleg-upload-input" type="file" multiple className="hidden"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={e => handleFiles(e.target.files)} disabled={laeuft} />
      <label htmlFor="beleg-upload-input" className={`inline-flex flex-col items-center gap-2 ${laeuft ? 'cursor-wait' : 'cursor-pointer'}`}>
        {laeuft
          ? <Loader2 size={28} strokeWidth={1.5} className="text-hs-blue-500 animate-spin" />
          : <Upload size={28} strokeWidth={1.5} className="text-hs-blue-500" />}
        <span className="text-sm font-medium text-hs-text">
          {laeuft ? (kiAktiv ? 'Wird hochgeladen und erkannt …' : 'Wird hochgeladen …') : 'Beleg hierher ziehen oder klicken'}
        </span>
        <span className="text-xs text-hs-text-2">
          {laeuft && fortschritt ? fortschritt : 'PDF, JPEG, PNG oder WebP · max. 15 MB je Datei'}
        </span>
      </label>
      {fehler.length > 0 && (
        <ul className="mt-3 text-xs text-hs-err-fg space-y-0.5">
          {fehler.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      )}
    </div>
  )
}
