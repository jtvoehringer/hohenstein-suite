import { NextRequest, NextResponse } from 'next/server'
import { ladeVerbindung, nichtVerbunden, fehlerAntwort } from '@/lib/email/verbindung'
import { mitImap, ladeQuelle } from '@/lib/email/imap'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/nachrichten/anhang?folder=INBOX&uid=123&index=0 – Anhang herunterladen
export async function GET(req: NextRequest) {
  const folder = req.nextUrl.searchParams.get('folder') || 'INBOX'
  const uid    = parseInt(req.nextUrl.searchParams.get('uid') ?? '', 10)
  const index  = parseInt(req.nextUrl.searchParams.get('index') ?? '', 10)
  if (!uid || Number.isNaN(index)) return NextResponse.json({ fehler: 'Ungültige Anfrage.' }, { status: 400 })

  const r = await ladeVerbindung()
  if (!r.ok) return nichtVerbunden(r)
  if (!r.v.imap) return NextResponse.json({ fehler: 'IMAP-Zugang unvollständig.', keinKonto: true }, { status: 400 })
  try {
    const q = await mitImap(r.v.imap, c => ladeQuelle(c, folder, uid))
    const a = q?.parsed.attachments[index]
    if (!a) return NextResponse.json({ fehler: 'Anhang nicht gefunden.' }, { status: 404 })
    const name = (a.filename ?? `anhang-${index + 1}`).replace(/[\r\n"]/g, '')
    return new NextResponse(new Uint8Array(a.content), {
      headers: {
        'Content-Type': a.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Content-Length': String(a.content.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (e) {
    return fehlerAntwort(e, 502)
  }
}
