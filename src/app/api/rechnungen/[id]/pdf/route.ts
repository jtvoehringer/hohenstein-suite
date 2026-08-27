import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership } from '@/lib/auth/roles'
import { erzeugeBelegPdf } from '@/lib/rechnungen/belegPdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/rechnungen/[id]/pdf – Beleg als PDF (Rechnung_RE-2026-0007.pdf).
// ?inline=1 zeigt das PDF im Browser statt als Download.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) return NextResponse.json({ fehler: 'Nicht angemeldet oder kein aktiver Mandant.' }, { status: 401 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ fehler: 'Ungültige Beleg-ID.' }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  try {
    const erg = await erzeugeBelegPdf(supabase, membership.tenantId, id)
    if (!erg) return NextResponse.json({ fehler: 'Beleg nicht gefunden.' }, { status: 404 })
    const inline = req.nextUrl.searchParams.get('inline') === '1'
    return new NextResponse(new Uint8Array(erg.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${erg.dateiname}"`,
        'Content-Length': String(erg.buffer.length),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ fehler: 'PDF konnte nicht erzeugt werden: ' + msg }, { status: 500 })
  }
}
