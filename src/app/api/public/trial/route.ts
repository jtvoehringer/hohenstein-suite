import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { s112DemoUserAnlegen, demoPasswort, s112Konfiguriert, S112_APP_URL } from '@/lib/s112/admin'
import { sendeTrialZugangMail, sendeInterneTrialBenachrichtigung, transaktionalKonfiguriert } from '@/lib/email/transaktional'
import { findeBestehendeFirma, accountManagerName } from '@/lib/public/firmaMatch'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

// Alleiniger Echt-Mandant der Suite (Hohenstein Consulting OG, siehe Migration 005/CLAUDE.md).
const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const TRIAL_DAUER_TAGE = Number(process.env.TRIAL_DAUER_TAGE ?? 14)
// Vorsichtiger Standard: automatisch vergebene Website-Trials bekommen Lesezugriff
// auf die gemeinsam genutzte Demo-Umgebung, keinen Schreibzugriff. Das lässt sich
// hier auf 'winzer' ändern, sobald ein Ablauf zur Bereinigung/Isolation steht.
const TRIAL_ROLLE: 'winzer' | 'leser' = 'leser'
const MAX_ANFRAGEN_PRO_TAG = 3

function corsHeaders(req: NextRequest): HeadersInit {
  const erlaubt = (process.env.TRIAL_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const origin = req.headers.get('origin') ?? ''
  const treffer = erlaubt.includes(origin) ? origin : erlaubt[0]
  return {
    'Access-Control-Allow-Origin': treffer ?? '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) })
}

function json(req: NextRequest, body: R, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders(req) })
}

function istGueltigeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(req: NextRequest) {
  const admin = createSupabaseAdminClient()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unbekannt'
  const userAgent = req.headers.get('user-agent') ?? null

  async function protokolliere(felder: Partial<R>) {
    try { await (admin.from('trial_anfragen') as any).insert({ ip, user_agent: userAgent, ...felder }) } catch { /* Protokoll ist best effort */ }
  }

  let body: R
  try { body = await req.json() } catch { return json(req, { ok: false, fehler: 'Ungültige Anfrage.' }, 400) }

  // Honeypot: unsichtbares Feld, das nur Bots ausfüllen. Formular sendet außerdem
  // "ts" = Zeitpunkt (ms) des Seitenaufrufs – eine Anfrage innerhalb von 3s gilt als Bot.
  const honeypot = String(body.website_url ?? '').trim()
  const ts = Number(body.ts ?? 0)
  if (honeypot || !ts || Date.now() - ts < 3000) {
    await protokolliere({ email: String(body.email ?? ''), firma_name: String(body.firma ?? ''), ergebnis: 'abgelehnt', hinweis: 'Bot-Filter (Honeypot/Zeit)' })
    // Bewusst ein "Erfolg" nach außen, damit ein Bot keinen Rückschluss auf den Filter ziehen kann.
    return json(req, { ok: true })
  }

  const email = String(body.email ?? '').trim().toLowerCase()
  const name = String(body.name ?? '').trim()
  const firmaName = String(body.firma ?? '').trim()
  const telefon = body.telefon ? String(body.telefon).trim() : null
  const nachricht = body.nachricht ? String(body.nachricht).trim().slice(0, 2000) : null

  if (!email || !istGueltigeEmail(email) || !name || !firmaName) {
    await protokolliere({ email, firma_name: firmaName, ergebnis: 'abgelehnt', hinweis: 'Pflichtfelder fehlen/ungültig' })
    return json(req, { ok: false, fehler: 'Bitte Firma, Name und eine gültige E-Mail-Adresse angeben.' }, 400)
  }
  if (!s112Konfiguriert() || !transaktionalKonfiguriert()) {
    await protokolliere({ email, firma_name: firmaName, ergebnis: 'fehler', hinweis: 'Anbindung nicht konfiguriert' })
    return json(req, { ok: false, fehler: 'Der Trialzugang ist derzeit nicht verfügbar. Bitte über das Kontaktformular melden.' }, 503)
  }

  // Rate-Limit: max. MAX_ANFRAGEN_PRO_TAG erfolgreiche/abgelehnte Versuche je E-Mail oder IP in 24h.
  const seit24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await (admin.from('trial_anfragen') as any)
    .select('id', { count: 'exact', head: true })
    .gte('erstellt_am', seit24h)
    .or(`email.eq.${email},ip.eq.${ip}`)
  if ((count ?? 0) >= MAX_ANFRAGEN_PRO_TAG) {
    await protokolliere({ email, firma_name: firmaName, ergebnis: 'abgelehnt', hinweis: 'Rate-Limit erreicht' })
    return json(req, { ok: false, fehler: 'Zu viele Anfragen. Bitte später erneut versuchen oder direkt Kontakt aufnehmen.' }, 429)
  }

  try {
    // ── Firma anlegen/aktualisieren (Dublettenschutz: E-Mail, Name, Domain) ──
    // Die Suite enthält bereits ~5.000 Weingüter aus ÖWM-Daten – eine Trialanfrage
    // soll dort andocken statt eine Dublette anzulegen. Details: src/lib/public/firmaMatch.ts
    const notizZeile = `Trialanfrage über hohenstein-partner.at am ${new Date().toLocaleDateString('de-AT')}${nachricht ? `: ${nachricht}` : ''}`
    const treffer = await findeBestehendeFirma(admin, TENANT_ID, email, firmaName)
    let firmaId: string
    let bestandshinweis: string
    if (treffer) {
      firmaId = treffer.id
      const update: R = { notizen: [treffer.notizen, notizZeile].filter(Boolean).join('\n') }
      if (!treffer.telefon && telefon) update.telefon = telefon
      if (!treffer.quelle) update.quelle = 'Website-Trialanfrage'  // ursprüngliche Quelle (z.B. ÖWM) nicht überschreiben
      const { data: firmaAktualisiert, error: firmaUpdateFehler } = await (admin.from('firmen') as any).update(update).eq('id', firmaId).select('id')
      if (firmaUpdateFehler) throw new Error('Firma-Update fehlgeschlagen: ' + firmaUpdateFehler.message)
      if (!firmaAktualisiert || (firmaAktualisiert as R[]).length === 0) throw new Error('Firma-Update: keine Zeile aktualisiert (RLS?)')
      const amName = await accountManagerName(admin, treffer.account_manager)
      bestandshinweis = `Bereits im CRM als „${treffer.name}"${treffer.ist_kunde ? ' (Kunde)' : ''}${amName ? `, Account Manager: ${amName}` : treffer.account_manager ? '' : ', kein Account Manager zugeordnet'}.`
    } else {
      const { data: neu, error } = await (admin.from('firmen') as any).insert({
        tenant_id: TENANT_ID, name: firmaName, segment: 'weinbau', email, telefon,
        is_lead: true, ist_kunde: false, quelle: 'Website-Trialanfrage', notizen: notizZeile,
      }).select('id').single()
      if (error) throw new Error('Firma anlegen fehlgeschlagen: ' + error.message)
      firmaId = (neu as R).id
      bestandshinweis = 'Neu im CRM angelegt.'
    }

    // Ansprechpartner (Kontakt) verknüpfen, falls noch nicht vorhanden
    const [vorname, ...rest] = name.split(' ')
    const nachname = rest.join(' ') || vorname
    const { data: bestKontakt, error: kontaktSucheFehler } = await (admin.from('kontakte') as any)
      .select('id').eq('tenant_id', TENANT_ID).eq('email', email).limit(1).maybeSingle()
    if (kontaktSucheFehler) throw new Error('Kontaktsuche fehlgeschlagen: ' + kontaktSucheFehler.message)
    if (!(bestKontakt as R | null)?.id) {
      const { data: neuerKontakt, error: kontaktFehler } = await (admin.from('kontakte') as any).insert({
        tenant_id: TENANT_ID, vorname: rest.length ? vorname : null, nachname, segment: 'weinbau',
        firma_id: firmaId, email, telefon, is_lead: true, notizen: 'Ansprechpartner der Trialanfrage über hohenstein-partner.at',
      }).select('id')
      if (kontaktFehler) throw new Error('Kontakt anlegen fehlgeschlagen: ' + kontaktFehler.message)
      if (!neuerKontakt || (neuerKontakt as R[]).length === 0) throw new Error('Kontakt anlegen: keine Zeile eingefügt (RLS?)')
    }

    // ── software:112-Benutzer im Demo-Mandanten anlegen (bestehende Funktion) ─
    const passwort = demoPasswort()
    const { userId: s112UserId } = await s112DemoUserAnlegen({ email, name, passwort, rolle: TRIAL_ROLLE })

    const gueltigBis = new Date(Date.now() + TRIAL_DAUER_TAGE * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: bestZugang } = await (admin.from('demo_zugaenge') as any)
      .select('id').eq('tenant_id', TENANT_ID).eq('email', email).limit(1).maybeSingle()
    const zugangWerte = {
      tenant_id: TENANT_ID, name, email, firma_id: firmaId, s112_user_id: s112UserId, s112_rolle: TRIAL_ROLLE,
      gueltig_bis: gueltigBis, status: 'aktiv', notizen: 'Selbstregistrierung über hohenstein-partner.at (Trialzugang)',
    }
    let zugangId: string
    if ((bestZugang as R | null)?.id) {
      zugangId = (bestZugang as R).id
      const { data: zugangAktualisiert, error: zugangFehler } = await (admin.from('demo_zugaenge') as any).update(zugangWerte).eq('id', zugangId).select('id')
      if (zugangFehler) throw new Error('Trialzugang aktualisieren fehlgeschlagen: ' + zugangFehler.message)
      if (!zugangAktualisiert || (zugangAktualisiert as R[]).length === 0) throw new Error('Trialzugang-Update: keine Zeile aktualisiert (RLS?)')
    } else {
      const { data: neuZ, error } = await (admin.from('demo_zugaenge') as any).insert(zugangWerte).select('id').single()
      if (error) throw new Error('Trialzugang anlegen fehlgeschlagen: ' + error.message)
      zugangId = (neuZ as R).id
    }

    await protokolliere({ email, firma_name: firmaName, firma_id: firmaId, demo_zugang_id: zugangId, ergebnis: 'erfolgreich' })

    // E-Mails: an den Interessenten (Zugangsdaten) + intern (Benachrichtigung). Ein Fehlschlag hier
    // darf die erfolgreiche Anlage des Zugangs nicht als Fehler an den Nutzer zurückmelden.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? ''
    try {
      await sendeTrialZugangMail({ an: email, name, firma: firmaName, email, passwort, appUrl: S112_APP_URL, gueltigBis, rolle: TRIAL_ROLLE })
      await sendeInterneTrialBenachrichtigung({ firma: firmaName, name, email, telefon, nachricht, firmaUrl: `${appUrl}/crm/firmen/${firmaId}`, bestandshinweis })
    } catch (mailFehler) {
      await protokolliere({ email, firma_name: firmaName, firma_id: firmaId, demo_zugang_id: zugangId, ergebnis: 'fehler', hinweis: 'Mailversand: ' + (mailFehler instanceof Error ? mailFehler.message : String(mailFehler)) })
    }

    return json(req, { ok: true })
  } catch (e) {
    const fehler = e instanceof Error ? e.message : String(e)
    await protokolliere({ email, firma_name: firmaName, ergebnis: 'fehler', hinweis: fehler })
    return json(req, { ok: false, fehler: 'Der Trialzugang konnte nicht angelegt werden. Bitte über das Kontaktformular melden.' }, 500)
  }
}
