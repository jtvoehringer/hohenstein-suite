import { NextRequest, NextResponse } from 'next/server'
import { ladeVerbindung, nichtVerbunden, fehlerAntwort } from '@/lib/email/verbindung'
import { mitImap, verschiebeNachricht } from '@/lib/email/imap'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/nachrichten/move { folder, uid, ziel }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { folder?: string; uid?: number; ziel?: string }
  const folder = body.folder || 'INBOX'
  const uid = Number(body.uid)
  const ziel = (body.ziel ?? '').trim()
  if (!uid) return NextResponse.json({ fehler: 'Keine Nachrichten-ID angegeben.' }, { status: 400 })
  if (!ziel) return NextResponse.json({ fehler: 'Kein Zielordner angegeben.' }, { status: 400 })
  if (ziel === folder) return NextResponse.json({ fehler: 'Die Nachricht befindet sich bereits in diesem Ordner.' }, { status: 400 })

  const r = await ladeVerbindung()
  if (!r.ok) return nichtVerbunden(r)
  if (!r.v.imap) return NextResponse.json({ fehler: 'IMAP-Zugang unvollständig.', keinKonto: true }, { status: 400 })
  try {
    await mitImap(r.v.imap, c => verschiebeNachricht(c, folder, uid, ziel))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return fehlerAntwort(e, 502)
  }
}
