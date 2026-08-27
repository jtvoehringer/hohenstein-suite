import { NextRequest, NextResponse } from 'next/server'
import { ladeVerbindung, nichtVerbunden, fehlerAntwort } from '@/lib/email/verbindung'
import { mitImap, setzeGelesen } from '@/lib/email/imap'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/nachrichten/flag { folder, uid, seen: true|false }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { folder?: string; uid?: number; seen?: boolean }
  const folder = body.folder || 'INBOX'
  const uid = Number(body.uid)
  if (!uid) return NextResponse.json({ fehler: 'Keine Nachrichten-ID angegeben.' }, { status: 400 })

  const r = await ladeVerbindung()
  if (!r.ok) return nichtVerbunden(r)
  if (!r.v.imap) return NextResponse.json({ fehler: 'IMAP-Zugang unvollständig.', keinKonto: true }, { status: 400 })
  try {
    await mitImap(r.v.imap, c => setzeGelesen(c, folder, uid, body.seen !== false))
    return NextResponse.json({ ok: true, seen: body.seen !== false })
  } catch (e) {
    return fehlerAntwort(e, 502)
  }
}
