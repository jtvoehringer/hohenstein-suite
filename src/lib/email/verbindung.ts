// Server-only: persönliche E-Mail-Verbindung des eingeloggten Users laden,
// Passwörter entschlüsseln und Fehler in deutsche Meldungen übersetzen.
// Zugangsdaten verlassen diese Schicht nie Richtung Client.
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, type UserRole } from '@/lib/auth/roles'
import { decryptPass } from '@/lib/email/crypto'
import type { ImapZugang } from './imap'
import type { SmtpZugang } from './smtp'
import type { KontoAnzeige } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export const VERBINDUNG_SELECT =
  'id, tenant_id, user_id, email_address, anzeigename, imap_aktiv, imap_host, imap_port, imap_user, imap_pass_enc, ' +
  'smtp_host, smtp_port, smtp_user, smtp_pass_enc, smtp_from_name, signatur, letzter_abruf, letzter_fehler'

export type Verbindung = {
  id: string
  tenantId: string
  userId: string
  role: UserRole
  emailAddress: string
  anzeigename: string
  smtpFromName: string
  signatur: string
  imap: ImapZugang | null
  smtp: SmtpZugang | null
}

export type VerbindungErgebnis =
  | { ok: true; v: Verbindung; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> }
  | { ok: false; status: number; fehler: string }

/** Rohzeile der Verbindung des eingeloggten Users (RLS: nur eigene Zeile) */
export async function ladeVerbindungRoh(): Promise<{ row: R | null; tenantId: string; userId: string; role: UserRole; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> } | null> {
  const membership = await getCurrentMembership()
  if (!membership) return null
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await (supabase.from('user_email_connections') as any)
    .select(VERBINDUNG_SELECT)
    .eq('tenant_id', membership.tenantId)
    .eq('user_id', user.id)
    .maybeSingle()
  return { row: (data as R | null) ?? null, tenantId: membership.tenantId, userId: user.id, role: membership.role, supabase }
}

/** Verbindung inkl. entschlüsselter Passwörter – für Route-Handler */
export async function ladeVerbindung(): Promise<VerbindungErgebnis> {
  const ctx = await ladeVerbindungRoh()
  if (!ctx) return { ok: false, status: 401, fehler: 'Nicht angemeldet oder kein aktiver Mandant.' }
  const r = ctx.row
  if (!r) return { ok: false, status: 404, fehler: 'Kein E-Mail-Konto eingerichtet. Bitte unter Nachrichten → E-Mail-Konto konfigurieren.' }
  let imap: ImapZugang | null = null
  let smtp: SmtpZugang | null = null
  try {
    if (r.imap_host && r.imap_user && r.imap_pass_enc) {
      imap = { host: r.imap_host, port: Number(r.imap_port) || 993, user: r.imap_user, pass: decryptPass(r.imap_pass_enc) }
    }
    if (r.smtp_host && r.smtp_user && r.smtp_pass_enc) {
      smtp = { host: r.smtp_host, port: Number(r.smtp_port) || 587, user: r.smtp_user, pass: decryptPass(r.smtp_pass_enc) }
    }
  } catch (e) {
    return { ok: false, status: 500, fehler: 'Zugangsdaten konnten nicht entschlüsselt werden: ' + fehlerText(e) }
  }
  return {
    ok: true,
    supabase: ctx.supabase,
    v: {
      id: r.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      role: ctx.role,
      emailAddress: r.email_address,
      anzeigename: r.anzeigename ?? '',
      smtpFromName: r.smtp_from_name ?? r.anzeigename ?? '',
      signatur: r.signatur ?? '',
      imap,
      smtp,
    },
  }
}

/** Konto-Daten ohne Geheimnisse (für Einstellungen/Anzeige) */
export function kontoAnzeige(row: R | null): KontoAnzeige {
  return {
    vorhanden: !!row,
    email_address: row?.email_address ?? '',
    anzeigename: row?.anzeigename ?? '',
    imap_host: row?.imap_host ?? '',
    imap_port: Number(row?.imap_port) || 993,
    imap_user: row?.imap_user ?? '',
    imap_pass_gesetzt: !!row?.imap_pass_enc,
    smtp_host: row?.smtp_host ?? '',
    smtp_port: Number(row?.smtp_port) || 587,
    smtp_user: row?.smtp_user ?? '',
    smtp_pass_gesetzt: !!row?.smtp_pass_enc,
    smtp_from_name: row?.smtp_from_name ?? '',
    signatur: row?.signatur ?? '',
    letzter_abruf: row?.letzter_abruf ?? null,
    letzter_fehler: row?.letzter_fehler ?? null,
  }
}

/** letzter_fehler / letzter_abruf auf der eigenen Verbindungszeile pflegen (best effort) */
export async function merkeStatus(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, id: string, fehler: string | null, abrufOk = false,
): Promise<void> {
  const patch: R = { letzter_fehler: fehler }
  if (abrufOk) patch.letzter_abruf = new Date().toISOString()
  try { await (supabase.from('user_email_connections') as any).update(patch).eq('id', id) } catch { /* ignorieren */ }
}

// ── Fehlerübersetzung ────────────────────────────────────────────────────────

export function fehlerText(e: unknown): string {
  if (!e) return 'Unbekannter Fehler'
  const err = e as R
  const code: string = String(err.code ?? err.responseCode ?? '')
  const msg: string = String(err.responseText ?? err.response ?? err.message ?? e)
  const low = (code + ' ' + msg).toLowerCase()
  if (low.includes('authenticationfailed') || low.includes('auth') && (low.includes('fail') || low.includes('invalid') || low.includes('535'))) {
    return 'Anmeldung fehlgeschlagen – Benutzername oder Passwort falsch (bei Gmail/GMX/Outlook ist oft ein App-Passwort nötig).'
  }
  if (code === 'ENOTFOUND' || low.includes('getaddrinfo')) return 'Server nicht gefunden – bitte Hostnamen prüfen.'
  if (code === 'ECONNREFUSED') return 'Verbindung abgelehnt – Port oder Verschlüsselung prüfen.'
  if (code === 'CONNECT_TIMEOUT' || code === 'ETIMEDOUT' || low.includes('timeout')) return 'Zeitüberschreitung – Server nicht erreichbar oder Port falsch.'
  if (low.includes('certificate') || low.includes('self signed') || low.includes('ssl') && low.includes('wrong version')) return 'TLS-Fehler – Verschlüsselung/Port passt nicht zum Server (IMAP 993 SSL, SMTP 587 STARTTLS oder 465 SSL).'
  if (low.includes('greeting')) return 'Der Server hat sich nicht gemeldet – Port oder Verschlüsselung prüfen.'
  if (low.includes('nonexistent') || low.includes('mailbox doesn') || low.includes('no such mailbox') || code === 'NoConnection') return 'Ordner nicht gefunden.'
  if (low.includes('email_crypt_secret')) return String(err.message)
  return msg.length > 300 ? msg.slice(0, 300) + '…' : msg
}

/** Einheitliche JSON-Fehlerantwort */
export function fehlerAntwort(e: unknown, status = 500): NextResponse {
  return NextResponse.json({ fehler: fehlerText(e) }, { status })
}

export function nichtVerbunden(r: Extract<VerbindungErgebnis, { ok: false }>): NextResponse {
  return NextResponse.json({ fehler: r.fehler, keinKonto: r.status === 404 }, { status: r.status })
}
