'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentMembership } from '@/lib/auth/roles'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { encryptPass } from '@/lib/email/crypto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export type KontoEingabe = {
  email_address: string
  anzeigename: string
  imap_host: string
  imap_port: number | string
  imap_user: string
  imap_pass: string      // leer = unverändert lassen
  smtp_host: string
  smtp_port: number | string
  smtp_user: string
  smtp_pass: string      // leer = unverändert lassen
  smtp_from_name: string
  signatur: string
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

/**
 * E-Mail-Konto speichern – persönliches Postfach oder (gemeinsam=true) die
 * team-weite Mailbox des Mandanten, z. B. office@hohenstein-partner.at.
 */
export async function kontoSpeichernAction(input: KontoEingabe, gemeinsam = false): Promise<{ fehler?: string }> {
  const membership = await getCurrentMembership()
  if (!membership) return { fehler: 'Nicht angemeldet oder kein aktiver Mandant.' }
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { fehler: 'Nicht angemeldet.' }

  const email = input.email_address.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return { fehler: 'Bitte eine gültige E-Mail-Adresse angeben.' }
  const imapPort = Number(input.imap_port) || 993
  const smtpPort = Number(input.smtp_port) || 587
  if (imapPort < 1 || imapPort > 65535 || smtpPort < 1 || smtpPort > 65535) return { fehler: 'Ungültiger Port.' }

  const patch: R = {
    tenant_id:      membership.tenantId,
    user_id:        user.id,
    email_address:  email,
    anzeigename:    input.anzeigename.trim() || null,
    imap_host:      input.imap_host.trim() || null,
    imap_port:      imapPort,
    imap_user:      input.imap_user.trim() || email,
    smtp_host:      input.smtp_host.trim() || null,
    smtp_port:      smtpPort,
    smtp_user:      input.smtp_user.trim() || input.imap_user.trim() || email,
    smtp_from_name: input.smtp_from_name.trim() || input.anzeigename.trim() || null,
    signatur:       input.signatur.trim() || null,
  }
  patch.gemeinsam = gemeinsam

  // Zielzeile ermitteln (partial unique: 1 privates Konto je User, 1 gemeinsame Mailbox je Mandant)
  let zielQuery = (supabase.from('user_email_connections') as any)
    .select('id, smtp_pass_enc').eq('tenant_id', membership.tenantId)
  zielQuery = gemeinsam ? zielQuery.eq('gemeinsam', true) : zielQuery.eq('user_id', user.id).eq('gemeinsam', false)
  const { data: bestehend } = await zielQuery.maybeSingle()

  try {
    if (input.imap_pass) patch.imap_pass_enc = encryptPass(input.imap_pass)
    if (input.smtp_pass) patch.smtp_pass_enc = encryptPass(input.smtp_pass)
    else if (input.imap_pass && !(bestehend as R | null)?.smtp_pass_enc) {
      // Kein eigenes SMTP-Passwort eingegeben: IMAP-Passwort übernehmen, sofern noch keines gespeichert ist
      patch.smtp_pass_enc = encryptPass(input.imap_pass)
    }
  } catch (e) {
    return { fehler: e instanceof Error ? e.message : String(e) }
  }
  patch.imap_aktiv = !!patch.imap_host
  // letzter_fehler zurücksetzen – wird beim nächsten Test/Abruf neu gesetzt
  patch.letzter_fehler = null

  const { error } = bestehend
    ? await (supabase.from('user_email_connections') as any).update(patch).eq('id', (bestehend as R).id)
    : await (supabase.from('user_email_connections') as any).insert(patch)
  if (error) return { fehler: error.message }
  revalidatePath('/nachrichten')
  revalidatePath('/nachrichten/einstellungen')
  return {}
}

/** Verbindung samt Zugangsdaten entfernen (persönlich oder gemeinsame Mailbox) */
export async function kontoEntfernenAction(gemeinsam = false): Promise<{ fehler?: string }> {
  const membership = await getCurrentMembership()
  if (!membership) return { fehler: 'Nicht angemeldet oder kein aktiver Mandant.' }
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { fehler: 'Nicht angemeldet.' }
  let q = (supabase.from('user_email_connections') as any)
    .delete().eq('tenant_id', membership.tenantId)
  q = gemeinsam ? q.eq('gemeinsam', true) : q.eq('user_id', user.id).eq('gemeinsam', false)
  const { error } = await q
  if (error) return { fehler: error.message }
  revalidatePath('/nachrichten')
  revalidatePath('/nachrichten/einstellungen')
  return {}
}
