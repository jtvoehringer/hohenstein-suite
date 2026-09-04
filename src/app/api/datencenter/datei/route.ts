import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

const MAX_BYTES = 50 * 1024 * 1024

// POST /api/datencenter/datei – Datei hochladen (Bucket datencenter, Pfad <tenant>/<uuid>-<datei>)
// FormData: file (Pflicht), optional ordner_id, firma_id, kontakt_id
export async function POST(req: NextRequest) {
  const membership = await getCurrentMembership()
  if (!membership) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  if (!canWrite(membership.role)) return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
  const tenantId = membership.tenantId

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Keine Datei' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Datei zu groß (max. 50 MB)' }, { status: 413 })
  const typ = file.type || 'application/octet-stream'

  const ordnerId  = (formData.get('ordner_id') as string | null) || null
  const firmaId   = (formData.get('firma_id') as string | null) || null
  const kontaktId = (formData.get('kontakt_id') as string | null) || null

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

  const sicherName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePfad = `${tenantId}/${Date.now()}-${sicherName}`

  const { error: uploadErr } = await supabase.storage
    .from('datencenter')
    .upload(storagePfad, file, { contentType: typ, upsert: false })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const { data: dok, error: dbErr } = await (supabase.from('ablage_dateien') as any)
    .insert({
      tenant_id:     tenantId,
      ordner_id:     ordnerId,
      firma_id:      firmaId,
      kontakt_id:    kontaktId,
      dateiname:     file.name,
      dateityp:      typ,
      groesse_bytes: file.size,
      storage_pfad:  storagePfad,
      erstellt_von:  user.id,
    })
    .select('id, dateiname, dateityp, groesse_bytes, ordner_id, firma_id, kontakt_id, erstellt_am')
    .single()

  if (dbErr) {
    await supabase.storage.from('datencenter').remove([storagePfad])
    return NextResponse.json({ error: (dbErr as R).message }, { status: 500 })
  }
  return NextResponse.json(dok, { status: 201 })
}
