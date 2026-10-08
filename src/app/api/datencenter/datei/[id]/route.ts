import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { imBrowserAnzeigbar } from '@/lib/datencenter/anzeige'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

// GET /api/datencenter/datei/[id] – signierte URL (Redirect, 60 s gültig)
// Standard: inline öffnen, wenn der Browser den Typ anzeigen kann (PDF/Bild/Text);
// Office-Dateien u. Ä. immer als Download mit echtem Dateinamen. ?download=1 erzwingt den Download.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const membership = await getCurrentMembership()
  if (!membership) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const supabase = await createSupabaseServerClient()
  const { data: dok } = await (supabase.from('ablage_dateien') as any)
    .select('storage_pfad, dateiname, dateityp')
    .eq('id', id).eq('tenant_id', membership.tenantId)
    .maybeSingle()
  if (!dok) return NextResponse.json({ error: 'Datei nicht gefunden' }, { status: 404 })
  const alsDownload = req.nextUrl.searchParams.get('download') === '1'
    || !imBrowserAnzeigbar((dok as R).dateityp, (dok as R).dateiname)

  const { data: signed, error } = await supabase.storage
    .from('datencenter')
    .createSignedUrl((dok as R).storage_pfad, 60, alsDownload ? { download: (dok as R).dateiname } : undefined)
  if (error || !signed?.signedUrl) return NextResponse.json({ error: 'Download-Link konnte nicht erstellt werden' }, { status: 500 })

  return NextResponse.redirect(signed.signedUrl)
}

// DELETE /api/datencenter/datei/[id] – Datei löschen (Storage + DB)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const membership = await getCurrentMembership()
  if (!membership) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  if (!canWrite(membership.role)) return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
  const tenantId = membership.tenantId

  const supabase = await createSupabaseServerClient()
  const { data: dok } = await (supabase.from('ablage_dateien') as any)
    .select('id, storage_pfad')
    .eq('id', id).eq('tenant_id', tenantId)
    .maybeSingle()
  if (!dok) return NextResponse.json({ error: 'Datei nicht gefunden' }, { status: 404 })

  await supabase.storage.from('datencenter').remove([(dok as R).storage_pfad])
  const { error } = await (supabase.from('ablage_dateien') as any)
    .delete().eq('id', id).eq('tenant_id', tenantId)
  if (error) return NextResponse.json({ error: (error as R).message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
