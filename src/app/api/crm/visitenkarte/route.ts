import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

// POST /api/crm/visitenkarte – Foto einer Visitenkarte per KI auslesen
// (portiert aus software:112; Modell wie bei der Beleg-Erkennung über ANTHROPIC_API_KEY)
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ fehler: 'Die KI-Erkennung ist nicht konfiguriert (ANTHROPIC_API_KEY fehlt in Vercel).' }, { status: 500 })
  }
  const membership = await getCurrentMembership()
  if (!membership) return NextResponse.json({ fehler: 'Nicht angemeldet' }, { status: 401 })
  if (!canWrite(membership.role)) return NextResponse.json({ fehler: 'Keine Berechtigung' }, { status: 403 })

  const { imageBase64, mediaType } = await req.json() as R
  if (typeof imageBase64 !== 'string' || imageBase64.length < 100 || imageBase64.length > 8_000_000) {
    return NextResponse.json({ fehler: 'Kein gültiges Bild übermittelt.' }, { status: 400 })
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: (mediaType ?? 'image/jpeg') as 'image/jpeg', data: imageBase64 },
          },
          {
            type: 'text',
            text: `Lies diese Visitenkarte und extrahiere die Kontaktdaten. Antworte NUR mit validem JSON ohne Kommentare oder Markdown-Blöcke:
{
  "vorname": "...",
  "nachname": "...",
  "firma": "...",
  "position": "...",
  "email": "...",
  "telefon": "...",
  "mobil": "...",
  "strasse": "...",
  "plz": "...",
  "ort": "...",
  "land": "AT",
  "website": "..."
}
Fehlende Felder als null. Telefon/Mobil mit Vorwahl. "land" als Zwei-Buchstaben-Code (AT, DE, CH …).`,
          },
        ],
      }],
    })
    const rawText = (msg.content[0] as R).text as string
    const cleaned = rawText.replace(/```json?\s*/gi, '').replace(/```\s*/gi, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    const kontakt = JSON.parse(match?.[0] ?? cleaned)
    return NextResponse.json({ kontakt })
  } catch (err: unknown) {
    const m = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ fehler: `Analyse fehlgeschlagen: ${m}` }, { status: 500 })
  }
}
