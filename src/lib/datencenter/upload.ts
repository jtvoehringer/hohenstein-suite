'use client'

// ── Upload ins Datencenter (Bucket datencenter) ──────────────────────────────
// Die Datei geht DIREKT aus dem Browser an Supabase Storage (signierte Upload-URL),
// nicht über die Vercel-Function – deren Request-Body ist auf 4,5 MB begrenzt,
// größere PDFs schlugen dort ohne brauchbare Fehlermeldung fehl.
// Ablauf: 1) POST /api/datencenter/datei {schritt:'start'} → Pfad + Token
//         2) uploadToSignedUrl(…)  3) POST {schritt:'fertig'} → Datensatz ablage_dateien

import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export const DATEI_MAX_BYTES = 50 * 1024 * 1024

export type UploadZiel = { ordner_id?: string | null; firma_id?: string | null; kontakt_id?: string | null }
export type UploadErgebnis = { ok: true; id: string } | { ok: false; error: string }

async function api(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch('/api/datencenter/datei', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({})) as Record<string, unknown>
  return { ok: res.ok, status: res.status, json }
}

export async function dateiHochladen(file: File, ziel: UploadZiel): Promise<UploadErgebnis> {
  if (file.size > DATEI_MAX_BYTES) return { ok: false, error: 'Datei zu groß (max. 50 MB)' }
  const typ = file.type || 'application/octet-stream'
  const meta = { name: file.name, size: file.size, type: typ, ordner_id: ziel.ordner_id ?? null, firma_id: ziel.firma_id ?? null, kontakt_id: ziel.kontakt_id ?? null }

  const start = await api({ schritt: 'start', ...meta })
  if (!start.ok) return { ok: false, error: String(start.json.error ?? `Upload konnte nicht gestartet werden (${start.status})`) }
  const pfad = start.json.pfad as string, token = start.json.token as string
  if (!pfad || !token) return { ok: false, error: 'Upload konnte nicht gestartet werden.' }

  const supabase = createSupabaseBrowserClient()
  const { error: upErr } = await supabase.storage.from('datencenter').uploadToSignedUrl(pfad, token, file, { contentType: typ, upsert: false })
  if (upErr) return { ok: false, error: upErr.message || 'Übertragung an den Speicher fehlgeschlagen' }

  const fertig = await api({ schritt: 'fertig', pfad, ...meta })
  if (!fertig.ok) return { ok: false, error: String(fertig.json.error ?? `Datei konnte nicht abgelegt werden (${fertig.status})`) }
  return { ok: true, id: String(fertig.json.id) }
}
