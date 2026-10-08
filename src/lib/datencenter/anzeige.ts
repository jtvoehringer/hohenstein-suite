// ── Welche Dateien kann der Browser selbst anzeigen? ─────────────────────────
// Nur diese werden per Klick inline in einem neuen Tab geöffnet. Office-Dateien
// (docx, xlsx, pptx …) kann kein Browser darstellen – die werden mit dem echten
// Dateinamen heruntergeladen und dann in Word/Excel geöffnet.

const ANZEIGBAR_ENDUNG = /\.(pdf|png|jpe?g|gif|webp|svg|bmp|txt|csv|mp4|webm|mp3|wav|ogg)$/i

export function imBrowserAnzeigbar(typ: string | null | undefined, dateiname?: string | null): boolean {
  const t = (typ ?? '').toLowerCase()
  if (t === 'application/pdf' || t.startsWith('image/') || t.startsWith('video/') || t.startsWith('audio/')) return true
  if (t === 'text/plain' || t === 'text/csv') return true
  if ((!t || t === 'application/octet-stream') && dateiname) return ANZEIGBAR_ENDUNG.test(dateiname)
  return false
}
