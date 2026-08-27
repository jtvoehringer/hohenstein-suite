// Kleine Client-Helfer für das Nachrichten-Modul (kein Server-Code!)
import type { NachrichtDetail } from '@/lib/email/types'

export function fmtListenDatum(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const heute = new Date()
  if (d.toDateString() === heute.toDateString()) return d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
  if (d.getFullYear() === heute.getFullYear()) return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })
  return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function fmtVollDatum(iso: string): string {
  if (!iso) return '–'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '–'
  return d.toLocaleString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toLocaleString('de-AT', { maximumFractionDigits: 1 })} MB`
}

/** „Name <adresse>" → nur die Adresse */
export function nurAdresse(s: string): string {
  return s.match(/<([^>]+)>/)?.[1]?.trim() ?? s.trim()
}

export function adressListe(s: string): string[] {
  return s.split(',').map(x => x.trim()).filter(Boolean)
}

export function betreffMitPrefix(betreff: string, prefix: 'Re' | 'Fwd'): string {
  const b = betreff.trim()
  const re = prefix === 'Re' ? /^(re|aw|antw)\s*:/i : /^(fwd|fw|wg)\s*:/i
  return re.test(b) ? b : `${prefix}: ${b}`
}

/** Zitat für Antworten */
export function zitat(d: NachrichtDetail): string {
  const kopf = `Am ${fmtVollDatum(d.datum)} schrieb ${d.vonName ? `${d.vonName} <${d.von}>` : d.von}:`
  const zeilen = (d.text || '').split('\n').map(z => '> ' + z).join('\n')
  return `${kopf}\n${zeilen}`
}

/** Kopfblock für Weiterleitungen */
export function weiterleitungsBlock(d: NachrichtDetail): string {
  return [
    '-------- Weitergeleitete Nachricht --------',
    `Betreff: ${d.betreff}`,
    `Datum: ${fmtVollDatum(d.datum)}`,
    `Von: ${d.vonName ? `${d.vonName} <${d.von}>` : d.von}`,
    `An: ${d.an}`,
    d.cc ? `Cc: ${d.cc}` : null,
    '',
    d.text || '',
  ].filter(x => x !== null).join('\n')
}

/** Datei → Base64 (ohne data:-Prefix) */
export function dateiZuBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
