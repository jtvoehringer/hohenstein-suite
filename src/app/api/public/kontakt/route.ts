import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { sendeAllgemeineKontaktBenachrichtigung, transaktionalKonfiguriert } from '@/lib/email/transaktional'
import { findeBestehendeFirma } from '@/lib/public/firmaMatch'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

// Allgemeines Kontaktformular der Website ("Gespräch vereinbaren") – im Unterschied
// zu /api/public/trial ohne software:112-Provisionierung, dafür auch ohne
// verpflichtende Firmenangabe. Landet ebenfalls im CRM (Firmen bzw. Kontakte),
// damit alles Interesse von der Website an einer Stelle sichtbar ist.
const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const MAX_ANFRAGEN_PRO_TAG = 5

function corsHeaders(req: NextRequest): HeadersInit {
  const erlaubt = (process.env.TRIAL_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const origin = req.headers.get('origin') ?? ''
  const treffer = erlaubt.includes(origin) ? origin : erlaubt[0]
  return { 'Access-Control-Allow-Origin': treffer ?? '', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' }
}
export async function OPTIONS(req: NextRequest) { return new NextResponse(null, { status: 204, headers: corsHeaders(req) }) }
function json(req: NextRequest, body: R, status = 200) { return NextResponse.json(body, { status, headers: corsHeaders(req) }) }
function istGueltigeEmail(email: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) }

export async function POST(req: NextRequest) {
  const admin = createSupabaseAdminClient()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unbekannt'
  const userAgent = req.headers.get('user-agent') ?? null
  async function protokolliere(felder: Partial<R>) {
    try { await (admin.from('trial_anfragen') as any).insert({ ip, user_agent: userAgent, herkunft: 'hohenstein-partner.at:kontakt', ...felder }) } catch { /* best effort */ }
  }

  let body: R
  try { body = await req.json() } catch { return json(req, { ok: false, fehler: 'Ungültige Anfrage.' }, 400) }

  const honeypot = String(body.website_url ?? '').trim()
  const ts = Number(body.ts ?? 0)
  if (honeypot || !ts || Date.now() - ts < 3000) {
    await protokolliere({ email: String(body.email ?? ''), firma_name: String(body.firma ?? ''), ergebnis: 'abgelehnt', hinweis: 'Bot-Filter (Honeypot/Zeit)' })
    return json(req, { ok: true })
  }

  const email = String(body.email ?? '').trim().toLowerCase()
  const name = String(body.name ?? '').trim()
  const firmaName = body.firma ? String(body.firma).trim() : null
  const telefon = body.telefon ? String(body.telefon).trim() : null
  const nachricht = String(body.nachricht ?? '').trim().slice(0, 4000)

  if (!email || !istGueltigeEmail(email) || !name || !nachricht) {
    await protokolliere({ email, firma_name: firmaName, ergebnis: 'abgelehnt', hinweis: 'Pflichtfelder fehlen/ungültig' })
    return json(req, { ok: false, fehler: 'Bitte Name, eine gültige E-Mail-Adresse und eine Nachricht angeben.' }, 400)
  }

  const seit24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await (admin.from('trial_anfragen') as any)
    .select('id', { count: 'exact', head: true }).gte('erstellt_am', seit24h).or(`email.eq.${email},ip.eq.${ip}`)
  if ((count ?? 0) >= MAX_ANFRAGEN_PRO_TAG) {
    await protokolliere({ email, firma_name: firmaName, ergebnis: 'abgelehnt', hinweis: 'Rate-Limit erreicht' })
    return json(req, { ok: false, fehler: 'Zu viele Anfragen. Bitte später erneut versuchen.' }, 429)
  }

  try {
    const notizZeile = `Anfrage über hohenstein-partner.at (Kontaktformular) am ${new Date().toLocaleDateString('de-AT')}: ${nachricht}`
    // Dublettenschutz wie beim Trial-Endpunkt (E-Mail/Name/Domain gegen die ~5.000 bestehenden Firmen) –
    // Details: src/lib/public/firmaMatch.ts
    let firmaId: string | null = null
    if (firmaName) {
      const treffer = await findeBestehendeFirma(admin, TENANT_ID, email, firmaName)
      if (treffer) {
        firmaId = treffer.id
        const update: R = { notizen: [treffer.notizen, notizZeile].filter(Boolean).join('\n') }
        if (!treffer.telefon && telefon) update.telefon = telefon
        await (admin.from('firmen') as any).update(update).eq('id', firmaId)
      } else {
        const { data: neu, error } = await (admin.from('firmen') as any).insert({
          tenant_id: TENANT_ID, name: firmaName, segment: 'weinbau', email, telefon,
          is_lead: true, ist_kunde: false, quelle: 'Website-Kontakt', notizen: notizZeile,
        }).select('id').single()
        if (error) throw new Error(error.message)
        firmaId = (neu as R).id
      }
    }

    const [vorname, ...rest] = name.split(' ')
    const nachname = rest.join(' ') || vorname
    const { data: bestKontakt } = await (admin.from('kontakte') as any).select('id, notizen').eq('tenant_id', TENANT_ID).eq('email', email).limit(1).maybeSingle()
    if ((bestKontakt as R | null)?.id) {
      const neueNotiz = [(bestKontakt as R).notizen, notizZeile].filter(Boolean).join('\n')
      await (admin.from('kontakte') as any).update({ notizen: neueNotiz, firma_id: firmaId ?? undefined }).eq('id', (bestKontakt as R).id)
    } else {
      await (admin.from('kontakte') as any).insert({
        tenant_id: TENANT_ID, vorname: rest.length ? vorname : null, nachname, segment: 'weinbau',
        firma_id: firmaId, email, telefon, is_lead: true, notizen: `Quelle: Website-Kontakt.\n${notizZeile}`,
      })
    }

    await protokolliere({ email, firma_name: firmaName, firma_id: firmaId, ergebnis: 'erfolgreich' })

    try {
      if (transaktionalKonfiguriert()) await sendeAllgemeineKontaktBenachrichtigung({ name, email, firma: firmaName, telefon, nachricht })
    } catch (mailFehler) {
      await protokolliere({ email, firma_name: firmaName, firma_id: firmaId, ergebnis: 'fehler', hinweis: 'Mailversand: ' + (mailFehler instanceof Error ? mailFehler.message : String(mailFehler)) })
    }

    return json(req, { ok: true })
  } catch (e) {
    const fehler = e instanceof Error ? e.message : String(e)
    await protokolliere({ email, firma_name: firmaName, ergebnis: 'fehler', hinweis: fehler })
    return json(req, { ok: false, fehler: 'Die Nachricht konnte nicht übermittelt werden. Bitte direkt per E-Mail melden.' }, 500)
  }
}
