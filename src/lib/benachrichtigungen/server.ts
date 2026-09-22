// ── Team-Benachrichtigungen (server-only) ────────────────────────────────────
// Ein Ereignis (Aufgabe zugewiesen, @Erwähnung, Aufgabe für alle) wird über
// mehrere Kanäle zugestellt:
//   app    – Zeile in `benachrichtigungen` (Glocke in der Kopfleiste, Migration 022)
//   email  – transaktionale Mail über Brevo (src/lib/email/transaktional.ts),
//            je Benutzer im Profil abschaltbar (profiles.benachrichtigung_email)
//   (whatsapp – vorgesehen, siehe KANAELE: bräuchte Meta WhatsApp Business Cloud API)
// Zustellung ist „best effort": Fehler werden protokolliert, die auslösende
// Aktion (Aufgabe speichern …) schlägt dadurch nie fehl.

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { sendeSystemMail, transaktionalKonfiguriert, esc } from '@/lib/email/transaktional'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export type BenachrichtigungArt = 'aufgabe_zugewiesen' | 'aufgabe_alle' | 'erwaehnung' | 'system'
export type Kanal = 'app' | 'email'

export type Ereignis = {
  tenantId: string
  /** Empfänger (auth.users-IDs); der Auslöser selbst wird automatisch ausgelassen */
  empfaengerIds: string[]
  ausgeloestVon: string | null
  art: BenachrichtigungArt
  titel: string
  text?: string | null
  /** Ziel in der Suite, z. B. /aufgaben?id=… (relativ) */
  href?: string | null
  quelleTyp?: string | null
  quelleId?: string | null
  /** Kanäle – Standard: App + E-Mail */
  kanaele?: Kanal[]
}

type Mitglied = { user_id: string; name: string; email: string; benachrichtigung_email: boolean }

async function ladeMitgliederMitEmail(tenantId: string): Promise<Mitglied[]> {
  try {
    const admin = createSupabaseAdminClient()
    const { data } = await (admin.rpc('mandant_mitglieder_mit_email', { p_tenant_id: tenantId }) as any)
    return ((data ?? []) as R[]).map(m => ({ user_id: m.user_id, name: m.name, email: m.email, benachrichtigung_email: m.benachrichtigung_email !== false }))
  } catch { return [] }
}

/** Ereignis zustellen (App + E-Mail). Nie werfen. */
export async function sendeBenachrichtigung(e: Ereignis): Promise<void> {
  const empfaenger = [...new Set(e.empfaengerIds)].filter(id => id && id !== e.ausgeloestVon)
  if (empfaenger.length === 0) return
  const kanaele = e.kanaele ?? ['app', 'email']
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  const hrefAbsolut = e.href ? (e.href.startsWith('http') ? e.href : `${appUrl}${e.href}`) : null

  // Name des Auslösers für den Mailtext
  const mitglieder = await ladeMitgliederMitEmail(e.tenantId)
  const vonName = mitglieder.find(m => m.user_id === e.ausgeloestVon)?.name ?? null

  // ── Kanal App ──
  let zeilenIds = new Map<string, string>()
  if (kanaele.includes('app')) {
    try {
      const supabase = await createSupabaseServerClient()
      const { data } = await (supabase.from('benachrichtigungen') as any).insert(empfaenger.map(id => ({
        tenant_id: e.tenantId, empfaenger_id: id, ausgeloest_von: e.ausgeloestVon, art: e.art,
        titel: e.titel, text: e.text ?? null, href: e.href ?? null, quelle_typ: e.quelleTyp ?? null, quelle_id: e.quelleId ?? null,
      }))).select('id, empfaenger_id')
      zeilenIds = new Map(((data ?? []) as R[]).map(z => [z.empfaenger_id as string, z.id as string]))
    } catch (err) { console.error('benachrichtigungen (app):', err) }
  }

  // ── Kanal E-Mail ──
  if (kanaele.includes('email') && transaktionalKonfiguriert()) {
    const betreff = `[Suite] ${e.titel}`
    const admin = createSupabaseAdminClient()
    await Promise.all(empfaenger.map(async id => {
      const m = mitglieder.find(x => x.user_id === id)
      if (!m?.email || !m.benachrichtigung_email) return
      const anrede = m.name.split(' ')[0]
      const text = `Hallo ${anrede},\n\n${e.titel}${vonName ? ` (von ${vonName})` : ''}\n${e.text ? `\n${e.text}\n` : ''}${hrefAbsolut ? `\nIn der Suite öffnen: ${hrefAbsolut}\n` : ''}\n– Hohenstein Suite`
      const html = `<p>Hallo ${esc(anrede)},</p><p><strong>${esc(e.titel)}</strong>${vonName ? ` <span style="color:#6E717A">(von ${esc(vonName)})</span>` : ''}</p>`
        + (e.text ? `<p style="white-space:pre-wrap;border-left:3px solid #E4E6EB;padding-left:10px;color:#22252B">${esc(e.text)}</p>` : '')
        + (hrefAbsolut ? `<p><a href="${esc(hrefAbsolut)}" style="display:inline-block;background:#4F86D6;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none">In der Suite öffnen</a></p>` : '')
        + `<p style="color:#6E717A;font-size:12px">Hohenstein Suite · E-Mail-Benachrichtigungen lassen sich im Profil abschalten.</p>`
      try {
        await sendeSystemMail(m.email, betreff, text, html)
        const zid = zeilenIds.get(id)
        if (zid) await (admin.from('benachrichtigungen') as any).update({ email_gesendet_am: new Date().toISOString() }).eq('id', zid)
      } catch (err) { console.error('benachrichtigungen (email):', err) }
    }))
  }
}

// ── @Erwähnungen ─────────────────────────────────────────────────────────────
// „@Hannes", „@Jörgen Vöhringer", „@Paul" – Vorname oder voller Anzeigename der
// Team-Mitglieder (Groß-/Kleinschreibung egal). Längere Namen werden zuerst geprüft.

export type MitgliedName = { id: string; name: string }

export function findeErwaehnungen(text: string | null | undefined, mitglieder: MitgliedName[]): string[] {
  if (!text || !text.includes('@')) return []
  const t = text.toLowerCase()
  const treffer = new Set<string>()
  const kandidaten = mitglieder.flatMap(m => {
    const voll = m.name.trim().toLowerCase()
    const vorname = voll.split(/\s+/)[0]
    return [...new Set([voll, vorname])].filter(Boolean).map(n => ({ id: m.id, n }))
  }).sort((a, b) => b.n.length - a.n.length)
  for (const k of kandidaten) {
    // @name am Wortanfang (nicht Teil einer E-Mail-Adresse wie info@paul.at), danach Wortende
    const re = new RegExp(`(?<![\\p{L}\\p{N}._-])@${k.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu')
    if (re.test(t)) treffer.add(k.id)
  }
  return [...treffer]
}

/** Neue Erwähnungen gegenüber dem alten Text (damit beim Bearbeiten nicht erneut benachrichtigt wird) */
export function neueErwaehnungen(neuText: string | null | undefined, altText: string | null | undefined, mitglieder: MitgliedName[]): string[] {
  const alt = new Set(findeErwaehnungen(altText, mitglieder))
  return findeErwaehnungen(neuText, mitglieder).filter(id => !alt.has(id))
}
