import { NextRequest, NextResponse } from 'next/server'
import { ladeVerbindung, nichtVerbunden, fehlerAntwort } from '@/lib/email/verbindung'
import { mitImap, loescheNachricht } from '@/lib/email/imap'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/nachrichten/delete { folder, uid }
// Verschiebt in den Papierkorb; im Papierkorb selbst wird endgültig gelöscht.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { folder?: string; uid?: number }
  const folder = body.folder || 'INBOX'
  const uid = Number(body.uid)
  if (!uid) return NextResponse.json({ fehler: 'Keine Nachrichten-ID angegeben.' }, { status: 400 })

  const r = await ladeVerbindung()
  if (!r.ok) return nichtVerbunden(r)
  if (!r.v.imap) return NextResponse.json({ fehler: 'IMAP-Zugang unvollständig.', keinKonto: true }, { status: 400 })
  try {
    const art = await mitImap(r.v.imap, c => loescheNachricht(c, folder, uid))
    return NextResponse.json({ ok: true, art })
  } catch (e) {
    return fehlerAntwort(e, 502)
  }
}

export const DELETE = POST
