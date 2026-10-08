// ── Wie wird eine Datei per Klick geöffnet? ──────────────────────────────────
// • PDF/Bilder/Text/Medien: inline im neuen Browser-Tab
// • Word/Excel/PowerPoint: direkt in der Office-App über das Office-URI-Schema
//   (ms-word:ofv|u|<url>) – der Browser kann diese Dateien nicht anzeigen, nur speichern
// • alles andere: Download mit echtem Dateinamen

const ANZEIGBAR_ENDUNG = /\.(pdf|png|jpe?g|gif|webp|svg|bmp|txt|csv|mp4|webm|mp3|wav|ogg)$/i

export function imBrowserAnzeigbar(typ: string | null | undefined, dateiname?: string | null): boolean {
  const t = (typ ?? '').toLowerCase()
  if (t === 'application/pdf' || t.startsWith('image/') || t.startsWith('video/') || t.startsWith('audio/')) return true
  if (t === 'text/plain' || t === 'text/csv') return true
  if ((!t || t === 'application/octet-stream') && dateiname) return ANZEIGBAR_ENDUNG.test(dateiname)
  return false
}

export function officeProtokoll(dateiname: string | null | undefined): 'ms-word' | 'ms-excel' | 'ms-powerpoint' | null {
  const n = (dateiname ?? '').toLowerCase()
  if (/\.(docx?|docm|dotx?|rtf)$/.test(n)) return 'ms-word'
  if (/\.(xlsx?|xlsm|xltx?)$/.test(n)) return 'ms-excel'
  if (/\.(pptx?|pptm|potx?|ppsx?)$/.test(n)) return 'ms-powerpoint'
  return null
}

/** Zusatz-Props für den Datei-Link (<a href="/api/datencenter/datei/<id>">) je nach Dateiart. */
export function dateiLinkProps(d: { id: string; dateiname: string; dateityp: string | null }) {
  if (imBrowserAnzeigbar(d.dateityp, d.dateiname)) return { target: '_blank', rel: 'noopener' }
  const protokoll = officeProtokoll(d.dateiname)
  if (protokoll) return {
    title: `${d.dateiname} in ${protokoll === 'ms-word' ? 'Word' : protokoll === 'ms-excel' ? 'Excel' : 'PowerPoint'} öffnen`,
    onClick: (e: { preventDefault(): void }) => { e.preventDefault(); void inOfficeOeffnen(d.id, protokoll) },
  }
  return {}
}

/** Klick auf eine Office-Datei: signierte URL holen und an Word/Excel/PowerPoint übergeben (nur lesen). */
export async function inOfficeOeffnen(id: string, protokoll: string): Promise<void> {
  const res = await fetch(`/api/datencenter/datei/${id}?office=1`)
  const json = await res.json().catch(() => ({})) as { url?: string; error?: string }
  if (!res.ok || !json.url) {
    alert(json.error ?? 'Datei konnte nicht geöffnet werden.')
    return
  }
  window.location.href = `${protokoll}:ofv|u|${json.url}`
}
