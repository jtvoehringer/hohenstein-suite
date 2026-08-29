'use client'

// ── Visitenkarten-Scanner (portiert aus software:112, HC-CD) ──────────────────
// Kamera oder Foto-Upload → KI-Erkennung (/api/crm/visitenkarte) → Bestätigen →
// Kontakt (+ ggf. Firma) als Lead anlegen. Kamera-Handling inkl. iOS-Eigenheiten
// unverändert aus software:112 übernommen.

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Upload, X, ArrowLeft } from 'lucide-react'
import { createLeadAusVisitenkarte, type VisitenkartenKontakt } from '../../actions'

export default function VisitenkartenScannerPage() {
  const router = useRouter()
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef   = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<'start' | 'camera' | 'analyse' | 'bestaetigen' | 'speichern'>('start')
  const [videoReady, setVideoReady] = useState(false)
  const [foto, setFoto] = useState<string | null>(null)
  const [kontakt, setKontakt] = useState<VisitenkartenKontakt | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const kameraStarten = async () => {
    setVideoReady(false)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setFehler('Kamerazugriff wird von diesem Browser nicht unterstützt – bitte ein Foto hochladen.')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      streamRef.current = stream
      setPhase('camera')

      // iOS Safari: srcObject erst NACH dem Rendern setzen (Video-Element muss im DOM sein)
      await new Promise(r => setTimeout(r, 50))
      const video = videoRef.current
      if (!video) return
      const markReady = () => { if (video.videoWidth > 0) setVideoReady(true) }
      video.addEventListener('loadedmetadata', markReady, { once: true })
      video.addEventListener('canplay', markReady, { once: true })
      video.addEventListener('playing', markReady, { once: true })
      video.srcObject = stream
      try { await video.play() } catch { /* Autoplay-Policy ignorieren */ }
      let tries = 0
      const poll = setInterval(() => {
        tries++
        if (video.videoWidth > 0) { setVideoReady(true); clearInterval(poll) }
        else if (tries >= 25) clearInterval(poll)
      }, 200)
    } catch (err: unknown) {
      setFehler('Kamera konnte nicht geöffnet werden: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const kameraStop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const fotografieren = () => {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas) return
    if (!video.videoWidth || !video.videoHeight) { setFehler('Video ist noch nicht bereit – bitte kurz warten.'); return }
    const MAX = 1024
    const scale = Math.min(1, MAX / Math.max(video.videoWidth, video.videoHeight))
    canvas.width  = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    if (!dataUrl || dataUrl === 'data:,') { setFehler('Foto konnte nicht aufgenommen werden – bitte nochmal versuchen.'); return }
    setFoto(dataUrl)
    kameraStop()
    void analysieren(dataUrl)
  }

  const analysieren = async (dataUrl: string) => {
    setPhase('analyse')
    const base64 = dataUrl.split(',')[1]
    if (!base64) { setFehler('Kein Bild vorhanden – bitte erneut fotografieren oder hochladen.'); setPhase('start'); return }
    const mediaType = dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
    try {
      const res = await fetch('/api/crm/visitenkarte', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      })
      const data = await res.json()
      if (data.fehler) { setFehler(data.fehler); setPhase('start'); return }
      setKontakt(data.kontakt)
      setPhase('bestaetigen')
    } catch (e) {
      setFehler(String(e)); setPhase('start')
    }
  }

  const speichern = async () => {
    if (!kontakt) return
    setPhase('speichern')
    const { kontaktId, error } = await createLeadAusVisitenkarte(kontakt)
    if (kontaktId) router.push(`/crm/kontakte/${kontaktId}`)
    else { setFehler(error || 'Kontakt konnte nicht gespeichert werden.'); setPhase('bestaetigen') }
  }

  const zeile = (v: string | null | undefined, label: string) => v ? (
    <div key={label} className="flex gap-2 text-sm">
      <span className="w-20 shrink-0 text-hs-text-2 text-[12.5px] pt-px">{label}</span>
      <span className="text-hs-text">{v}</span>
    </div>
  ) : null

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <button type="button" onClick={() => { kameraStop(); router.back() }}
          className="text-sm text-hs-text-2 hover:text-hs-text inline-flex items-center gap-1"><ArrowLeft size={14} strokeWidth={1.75} /> Zurück</button>
        <h1 className="text-2xl mt-1">Visitenkarte scannen</h1>
        <p className="text-sm text-hs-text-2 mt-0.5">Foto aufnehmen oder hochladen – die KI liest die Karte aus und legt Kontakt und Firma als Lead an.</p>
      </div>

      {fehler && (
        <div className="rounded-lg border border-hs-err/40 bg-hs-err-bg text-hs-err-fg text-sm px-4 py-3 flex items-start justify-between gap-3">
          <span>{fehler}</span>
          <button type="button" onClick={() => { setFehler(null); setPhase('start') }} className="shrink-0 hover:opacity-70"><X size={16} /></button>
        </div>
      )}

      {phase === 'start' && (
        <div className="card text-center space-y-4 !py-8">
          <Camera size={40} strokeWidth={1.5} className="text-hs-blue-500 mx-auto" />
          <div className="space-y-2">
            <button type="button" onClick={kameraStarten} className="btn-primary w-full justify-center !py-3">
              <Camera size={16} strokeWidth={1.75} /> Kamera öffnen
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary w-full justify-center !py-3">
              <Upload size={16} strokeWidth={1.75} /> Foto hochladen
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={e => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = ev => { const url = ev.target?.result as string; setFoto(url); void analysieren(url) }
            reader.readAsDataURL(file)
          }} />
        </div>
      )}

      {phase === 'camera' && (
        <div className="space-y-3">
          <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-xl border-2 border-hs-blue-500" />
          <canvas ref={canvasRef} className="hidden" />
          {!videoReady && <p className="text-xs text-center text-hs-tertiary animate-pulse">Kamera wird gestartet …</p>}
          <button type="button" onClick={fotografieren} disabled={!videoReady}
            className={`w-full justify-center !py-3.5 text-[15px] ${videoReady ? 'btn-primary' : 'btn-secondary opacity-50 cursor-not-allowed'}`}>
            <Camera size={18} strokeWidth={1.75} /> Fotografieren
          </button>
        </div>
      )}

      {phase === 'analyse' && (
        <div className="card text-center space-y-3 !py-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {foto && <img src={foto} alt="Visitenkarte" className="w-full rounded-lg max-h-48 object-contain" />}
          <p className="text-sm text-hs-text-2 animate-pulse">Die KI liest die Visitenkarte aus …</p>
        </div>
      )}

      {phase === 'bestaetigen' && kontakt && (
        <div className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {foto && <img src={foto} alt="Visitenkarte" className="w-full rounded-lg max-h-32 object-contain border border-hs-line bg-white" />}
          <div className="card space-y-1.5">
            <p className="overline mb-2">Erkannte Daten</p>
            {zeile([kontakt.vorname, kontakt.nachname].filter(Boolean).join(' '), 'Name')}
            {zeile(kontakt.firma, 'Firma')}
            {zeile(kontakt.position, 'Position')}
            {zeile(kontakt.email, 'E-Mail')}
            {zeile(kontakt.telefon, 'Telefon')}
            {zeile(kontakt.mobil, 'Mobil')}
            {zeile([kontakt.strasse, [kontakt.plz, kontakt.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '), 'Adresse')}
            {zeile(kontakt.website, 'Website')}
            <p className="text-[11.5px] text-hs-tertiary pt-2">Kontakt und Firma werden als Lead angelegt (bestehende Firmen werden über den Namen wiederverwendet). Details lassen sich danach im Kontakt bearbeiten.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={speichern} className="btn-primary flex-1 justify-center !py-3">Als Lead speichern</button>
            <button type="button" onClick={() => { setFoto(null); setKontakt(null); setPhase('start') }} className="btn-secondary">Nochmal</button>
          </div>
        </div>
      )}

      {phase === 'speichern' && (
        <div className="card text-center !py-8">
          <p className="text-sm text-hs-text-2 animate-pulse">Kontakt wird angelegt …</p>
        </div>
      )}
    </div>
  )
}
