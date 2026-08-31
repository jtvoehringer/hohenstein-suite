import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { s112DemoReset, s112Konfiguriert } from '@/lib/s112/admin'

export const dynamic = 'force-dynamic'

// GET /api/cron/demo-reset – nächtlich: Demo-Daten neu erzeugen.
// Ergänzung zum manuellen Reset (Seite /demo), seit Trialzugänge über die
// Website automatisch und ohne Freigabe vergeben werden (s.o. Migration 014) –
// verhindert, dass sich Änderungen mehrerer gleichzeitiger Trial-Nutzer in der
// gemeinsam genutzten Demo-Umgebung aufsummieren oder Beispieldaten verändert
// bleiben. Nutzt dieselbe Funktion wie der manuelle Reset-Button.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }
  if (!s112Konfiguriert()) return NextResponse.json({ ok: true, hinweis: 'software:112 nicht konfiguriert' })

  try {
    await s112DemoReset()
    const admin = createSupabaseAdminClient()
    await (admin.from('demo_resets') as any).insert({ tenant_id: '11111111-1111-4111-8111-111111111111', ausgeloest_von: null })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
