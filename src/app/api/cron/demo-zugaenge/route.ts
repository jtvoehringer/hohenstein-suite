import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { s112DemoUserAktiv, s112Konfiguriert } from '@/lib/s112/admin'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

// GET /api/cron/demo-zugaenge – täglich: abgelaufene Demo-Zugänge in software:112 sperren
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }
  if (!s112Konfiguriert()) return NextResponse.json({ ok: true, hinweis: 'software:112 nicht konfiguriert' })

  const admin = createSupabaseAdminClient()
  const heute = new Date().toISOString().slice(0, 10)
  const { data } = await (admin.from('demo_zugaenge') as any)
    .select('id, s112_user_id').eq('status', 'aktiv').lt('gueltig_bis', heute)
  let gesperrt = 0
  const fehler: string[] = []
  for (const z of (data ?? []) as R[]) {
    try {
      if (z.s112_user_id) await s112DemoUserAktiv(z.s112_user_id, false)
      await (admin.from('demo_zugaenge') as any).update({ status: 'abgelaufen' }).eq('id', z.id)
      gesperrt++
    } catch (e) { fehler.push(`${z.id}: ${e instanceof Error ? e.message : String(e)}`) }
  }
  return NextResponse.json({ ok: true, gesperrt, fehler })
}
