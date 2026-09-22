import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

const MAX_BYTES = 50 * 1024 * 1024
// Ausführbare Dateien bleiben draußen – alles andere (PDF, Office, Bilder, Vorlagen, Mails, Zips …) ist erlaubt
const GESPERRTE_ENDUNGEN = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|js|jar|dll|sh)$/i

// POST /api/datencenter/datei – Upload in zwei Schritten (JSON), die Datei selbst geht
// direkt aus dem Browser in den Bucket (signierte Upload-URL, s. src/lib/datencenter/upload.ts):
//   { schritt: 'start',  name, size, type, ordner_id?, firma_id?, kontakt_id?, aufgabe_id? } → { pfad, token }
//   { schritt: 'fertig', pfad, name, size, type, ordner_id?, firma_id?, kontakt_id? } → Datensatz ablage_dateien
// Der frühere Multipart-Upload über diese Function scheiterte an Vercels 4,5-MB-Body-Limit.
export async function POST(req: NextRequest) {
  const membership = await getCurrentMembership()
  if (!membership) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  if (!canWrite(membership.role)) return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
  const tenantId = membership.tenantId

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  if (!(req.headers.get('content-type') ?? '').includes('application/json')) {
    return NextResponse.json({ error: 'Bitte die Seite neu laden – der Upload läuft jetzt direkt in den Speicher.' }, { status: 400 })
  }
  const body = (await req.json().catch(() => null)) as R | null
  if (!body) return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })

  const name = String(body.name ?? '').trim()
  const size = Number(body.size)
  const typ  = String(body.type || 'application/octet-stream')
  if (!name) return NextResponse.json({ error: 'Kein Dateiname' }, { status: 400 })
  if (GESPERRTE_ENDUNGEN.test(name)) return NextResponse.json({ error: 'Dieser Dateityp ist nicht erlaubt.' }, { status: 415 })
  if (!Number.isFinite(size) || size < 0) return NextResponse.json({ error: 'Ungültige Dateigröße' }, { status: 400 })
  if (size > MAX_BYTES) return NextResponse.json({ error: 'Datei zu groß (max. 50 MB)' }, { status: 413 })

  const ordnerId  = (body.ordner_id as string | null) || null
  const firmaId   = (body.firma_id as string | null) || null
  const kontaktId = (body.kontakt_id as string | null) || null
  const aufgabeId = (body.aufgabe_id as string | null) || null

  // Zuordnungen gegen den Mandanten prüfen
  if (ordnerId) {
    const { data } = await (supabase.from('ablage_ordner') as any).select('id').eq('id', ordnerId).eq('tenant_id', tenantId).maybeSingle()
    if (!data) return NextResponse.json({ error: 'Ordner nicht gefunden' }, { status: 404 })
  }
  if (firmaId) {
    const { data } = await (supabase.from('firmen') as any).select('id').eq('id', firmaId).eq('tenant_id', tenantId).maybeSingle()
    if (!data) return NextResponse.json({ error: 'Firma nicht gefunden' }, { status: 404 })
  }
  if (kontaktId) {
    const { data } = await (supabase.from('kontakte') as any).select('id').eq('id', kontaktId).eq('tenant_id', tenantId).maybeSingle()
    if (!data) return NextResponse.json({ error: 'Kontakt nicht gefunden' }, { status: 404 })
  }
  if (aufgabeId) {
    const { data } = await (supabase.from('aufgaben') as any).select('id').eq('id', aufgabeId).eq('tenant_id', tenantId).maybeSingle()
    if (!data) return NextResponse.json({ error: 'Aufgabe nicht gefunden' }, { status: 404 })
  }

  // ── Schritt 1: signierte Upload-URL ──
  if (body.schritt === 'start') {
    const sicherName = name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePfad = `${tenantId}/${Date.now()}-${sicherName}`
    const { data, error } = await supabase.storage.from('datencenter').createSignedUploadUrl(storagePfad)
    if (error || !data?.token) return NextResponse.json({ error: error?.message ?? 'Upload-Link konnte nicht erstellt werden' }, { status: 500 })
    return NextResponse.json({ pfad: storagePfad, token: data.token })
  }

  // ── Schritt 2: Datensatz anlegen, nachdem die Datei im Bucket liegt ──
  if (body.schritt === 'fertig') {
    const pfad = String(body.pfad ?? '')
    if (!pfad.startsWith(`${tenantId}/`) || pfad.includes('..')) return NextResponse.json({ error: 'Ungültiger Speicherpfad' }, { status: 400 })
    const teile = pfad.split('/')
    const { data: objekte, error: listErr } = await supabase.storage.from('datencenter').list(teile[0], { search: teile[1], limit: 5 })
    const objekt = (objekte ?? []).find(o => o.name === teile[1])
    if (listErr || !objekt) return NextResponse.json({ error: 'Die Datei ist nicht im Speicher angekommen.' }, { status: 409 })
    const groesse = Number((objekt.metadata as R | null)?.size ?? size)

    const { data: dok, error: dbErr } = await (supabase.from('ablage_dateien') as any)
      .insert({
        tenant_id:     tenantId,
        ordner_id:     ordnerId,
        firma_id:      firmaId,
        kontakt_id:    kontaktId,
        aufgabe_id:    aufgabeId,
        dateiname:     name,
        dateityp:      typ,
        groesse_bytes: groesse,
        storage_pfad:  pfad,
        erstellt_von:  user.id,
      })
      .select('id, dateiname, dateityp, groesse_bytes, ordner_id, firma_id, kontakt_id, aufgabe_id, erstellt_am')
      .single()

    if (dbErr) {
      await supabase.storage.from('datencenter').remove([pfad])
      return NextResponse.json({ error: (dbErr as R).message }, { status: 500 })
    }
    return NextResponse.json(dok, { status: 201 })
  }

  return NextResponse.json({ error: 'Unbekannter Schritt' }, { status: 400 })
}
