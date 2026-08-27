// Server-only: Verknüpfung von E-Mails mit dem CRM (aktivitaeten, art='email').
import type { SupabaseClient } from '@supabase/supabase-js'
import { kontaktName } from '@/lib/crm/types'
import type { KontaktInfo } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = SupabaseClient<any, any, any>

/** Kontakt oder Firma des Mandanten per E-Mail-Adresse finden (Kontakt hat Vorrang) */
export async function findeKontaktPerEmail(supabase: SB, tenantId: string, adressen: string[]): Promise<KontaktInfo | null> {
  const liste = adressen.map(a => a.trim().toLowerCase()).filter(a => a && !/[,()%\s]/.test(a))
  if (liste.length === 0) return null
  // Groß-/Kleinschreibung ignorieren (ilike; „_" wäre ein Platzhalter – daher unten nochmals exakt vergleichen)
  const filter = liste.map(a => `email.ilike.${a}`).join(',')
  const { data: kontakte } = await (supabase.from('kontakte') as any)
    .select('id, vorname, nachname, email').eq('tenant_id', tenantId).eq('aktiv', true)
    .or(filter).limit(5)
  for (const adr of liste) {
    const k = ((kontakte ?? []) as R[]).find(x => (x.email ?? '').toLowerCase() === adr)
    if (k) return { typ: 'kontakt', id: k.id, name: kontaktName({ vorname: k.vorname, nachname: k.nachname }) }
  }
  const { data: firmen } = await (supabase.from('firmen') as any)
    .select('id, name, email').eq('tenant_id', tenantId).eq('aktiv', true)
    .or(filter).limit(5)
  for (const adr of liste) {
    const f = ((firmen ?? []) as R[]).find(x => (x.email ?? '').toLowerCase() === adr)
    if (f) return { typ: 'firma', id: f.id, name: f.name }
  }
  return null
}

/** Liegt die Message-ID bereits als Aktivität vor? → ID oder null */
export async function findeAktivitaetPerMessageId(supabase: SB, tenantId: string, messageId: string | null): Promise<string | null> {
  if (!messageId) return null
  const { data } = await (supabase.from('aktivitaeten') as any)
    .select('id').eq('tenant_id', tenantId).eq('email_id', messageId).maybeSingle()
  return (data as R | null)?.id ?? null
}

export type AktivitaetEmailInput = {
  tenantId: string
  userId: string
  kontaktId: string | null
  firmaId: string | null
  betreff: string
  datum: string           // ISO-Zeitpunkt
  messageId: string | null
  conversationId: string | null
  von: string
  vonName: string
  an: string
  text: string
  html: string | null
}

export type AblegenErgebnis =
  | { ok: true; id: string }
  | { ok: false; duplikat: true; id: string | null; fehler: string }
  | { ok: false; duplikat?: false; fehler: string }

/** E-Mail als erledigte Aktivität (art='email') im CRM ablegen */
export async function legeEmailAktivitaetAn(supabase: SB, input: AktivitaetEmailInput): Promise<AblegenErgebnis> {
  if (input.messageId) {
    const vorhanden = await findeAktivitaetPerMessageId(supabase, input.tenantId, input.messageId)
    if (vorhanden) return { ok: false, duplikat: true, id: vorhanden, fehler: 'Diese E-Mail ist bereits im CRM abgelegt.' }
  }
  const datum = input.datum && !Number.isNaN(new Date(input.datum).getTime())
    ? new Date(input.datum).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10)
  const auszug = input.text.replace(/\s+/g, ' ').trim().slice(0, 500)
  const { data, error } = await (supabase.from('aktivitaeten') as any).insert({
    tenant_id:             input.tenantId,
    kontakt_id:            input.kontaktId,
    firma_id:              input.firmaId,
    art:                   'email',
    betreff:               input.betreff.slice(0, 500),
    beschreibung:          auszug || null,
    datum,
    ganztags:              true,
    erledigt:              true,
    email_id:              input.messageId,
    email_conversation_id: input.conversationId,
    email_von:             input.von || null,
    email_von_name:        input.vonName || null,
    email_an:              input.an || null,
    email_body:            input.text || null,
    email_body_html:       input.html,
    erstellt_von:          input.userId,
  }).select('id').single()
  if (error) {
    if (error.code === '23505') {
      const id = await findeAktivitaetPerMessageId(supabase, input.tenantId, input.messageId)
      return { ok: false, duplikat: true, id, fehler: 'Diese E-Mail ist bereits im CRM abgelegt.' }
    }
    return { ok: false, fehler: 'Aktivität konnte nicht angelegt werden: ' + error.message }
  }
  return { ok: true, id: (data as R).id }
}

/** Konversations-ID aus Threading-Headern ableiten (erste Referenz = Thread-Wurzel) */
export function conversationIdAus(messageId: string | null, inReplyTo: string | null, references: string[]): string | null {
  if (references.length > 0) return references[0]
  if (inReplyTo) return inReplyTo
  return messageId
}
