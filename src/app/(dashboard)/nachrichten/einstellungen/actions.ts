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

/** Persönliches E-Mail-Konto speichern (Upsert auf tenant_id + user_id; RLS: nur eigene Zeile) */
export async function kontoSpeichernAction(input: KontoEingabe): Promise<{ fehler?: string }> {
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
  try {
    if (input.imap_pass) patch.imap_pass_enc = encryptPass(input.imap_pass)
    if (input.smtp_pass) patch.smtp_pass_enc = encryptPass(input.smtp_pass)
    else if (input.imap_pass) {
      // Kein eigenes SMTP-Passwort eingegeben: IMAP-Passwort übernehmen, sofern noch keines gespeichert ist
      const { data: bestehend } = await (supabase.from('user_email_connections') as any)
        .select('smtp_pass_enc').eq('tenant_id', membership.tenantId).eq('user_id', user.id).maybeSingle()
      if (!(bestehend as R | null)?.smtp_pass_enc) patch.smtp_pass_enc = encryptPass(input.imap_pass)
    }
  } catch (e) {
    return { fehler: e instanceof Error ? e.message : String(e) }
  }
  patch.imap_aktiv = !!patch.imap_host
  // letzter_fehler zurücksetzen – wird beim nächsten Test/Abruf neu gesetzt
  patch.letzter_fehler = null

  const { error } = await (supabase.from('user_email_connections') as any)
    .upsert(patch, { onConflict: 'tenant_id,user_id' })
  if (error) return { fehler: error.message }
  revalidatePath('/nachrichten')
  revalidatePath('/nachrichten/einstellungen')
  return {}
}

/** Verbindung samt Zugangsdaten entfernen */
export async function kontoEntfernenAction(): Promise<{ fehler?: string }> {
  const membership = await getCurrentMembership()
  if (!membership) return { fehler: 'Nicht angemeldet oder kein aktiver Mandant.' }
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { fehler: 'Nicht angemeldet.' }
  const { error } = await (supabase.from('user_email_connections') as any)
    .delete().eq('tenant_id', membership.tenantId).eq('user_id', user.id)
  if (error) return { fehler: error.message }
  revalidatePath('/nachrichten')
  revalidatePath('/nachrichten/einstellungen')
  return {}
}
