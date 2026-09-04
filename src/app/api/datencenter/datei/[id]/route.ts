import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

// GET /api/datencenter/datei/[id] – signierte Download-URL (Redirect, 60 s gültig)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const membership = await getCurrentMembership()
  if (!membership) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const supabase = await createSupabaseServerClient()
  const { data: dok } = await (supabase.from('ablage_dateien') as any)
    .select('storage_pfad, dateiname')
    .eq('id', id).eq('tenant_id', membership.tenantId)
    .maybeSingle()
  if (!dok) return NextResponse.json({ error: 'Datei nicht gefunden' }, { status: 404 })

  const { data: signed, error } = await supabase.storage
    .from('datencenter')
    .createSignedUrl((dok as R).storage_pfad, 60, { download: (dok as R).dateiname })
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
