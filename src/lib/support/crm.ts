// Server-only: Support-Tickets (Jira) den CRM-Firmen und -Kontakten zuordnen – über software:112-Mandant, JSM-Organisation oder E-Mail des Melders.
import type { SupabaseClient } from '@supabase/supabase-js'
import { kontaktName } from '@/lib/crm/types'
import { s112AlleMandanten, s112Konfiguriert } from '@/lib/s112/admin'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = SupabaseClient<any, any, any>

export type CrmTreffer = {
  kontakt: { id: string; name: string } | null
  firma: { id: string; name: string } | null
}

/** E-Mail (klein) → Kontakt (mit Hauptfirma) bzw. Firma des Mandanten. Kontakte haben Vorrang. */
export async function crmZuordnungPerEmail(supabase: SB, tenantId: string, emails: string[]): Promise<Map<string, CrmTreffer>> {
  const ergebnis = new Map<string, CrmTreffer>()
  // Adressen mit Zeichen, die den PostgREST-or-Filter stören, auslassen
  const liste = [...new Set(emails.map(e => e.trim().toLowerCase()))].filter(e => e.includes('@') && !/[,()%\s]/.test(e))
  if (liste.length === 0) return ergebnis

  for (let i = 0; i < liste.length; i += 40) {
    const teil = liste.slice(i, i + 40)
    const filter = teil.map(a => `email.ilike.${a}`).join(',')
    const [{ data: kontakte }, { data: firmen }] = await Promise.all([
      (supabase.from('kontakte') as any)
        .select('id, vorname, nachname, email, firmen:firma_id(id, name)')
        .eq('tenant_id', tenantId).eq('aktiv', true).or(filter),
      (supabase.from('firmen') as any)
        .select('id, name, email')
        .eq('tenant_id', tenantId).eq('aktiv', true).or(filter),
    ])
    for (const f of (firmen ?? []) as R[]) {
      const e = String(f.email ?? '').toLowerCase()
      if (teil.includes(e) && !ergebnis.has(e)) ergebnis.set(e, { kontakt: null, firma: { id: f.id, name: f.name } })
    }
    for (const k of (kontakte ?? []) as R[]) {
      const e = String(k.email ?? '').toLowerCase()
      if (!teil.includes(e)) continue
      const firma = (k.firmen as R | null) ? { id: (k.firmen as R).id, name: (k.firmen as R).name } : ergebnis.get(e)?.firma ?? null
      ergebnis.set(e, { kontakt: { id: k.id, name: kontaktName({ vorname: k.vorname, nachname: k.nachname }) }, firma })
    }
  }
  return ergebnis
}

export type TicketZuordnung = CrmTreffer & {
  /** Woran die Firma erkannt wurde – Mandanten-ID aus software:112, JSM-Organisation oder E-Mail des Melders */
  ueber: 'mandant' | 'organisation' | 'email'
}

type TicketFuerZuordnung = { key: string; melderEmail: string | null; organisationen: string[]; s112TenantId: string | null }

/** Kommt das Ticket mit einem Betrieb (Mandanten-ID oder JSM-Organisation)? */
export function hatBetrieb(t: Pick<TicketFuerZuordnung, 'organisationen' | 's112TenantId'>): boolean {
  return !!t.s112TenantId || t.organisationen.length > 0
}

/**
 * Ticket → CRM-Firma/-Kontakt. Reihenfolge:
 *  1. Mandanten-ID aus dem software:112-Kontextblock → Firma mit dieser s112_tenant_id
 *  2. JSM-Organisation (= Betrieb bzw. Hauptmandant) → software:112-Mandant gleichen Namens → verknüpfte Firma,
 *     sonst CRM-Firma gleichen Namens
 *  3. E-Mail des Melders → Kontakt (mit Hauptfirma) bzw. Firma – nur bei Tickets OHNE Betrieb
 * Ein per E-Mail gefundener Kontakt wird auch bei 1./2. mit angezeigt (als Melder).
 */
export async function crmZuordnungFuerTickets(supabase: SB, tenantId: string, tickets: TicketFuerZuordnung[]): Promise<Map<string, TicketZuordnung>> {
  const ergebnis = new Map<string, TicketZuordnung>()
  if (tickets.length === 0) return ergebnis
  const klein = (s: string) => s.trim().toLowerCase()

  // 1. Mandanten-IDs (aus dem Kontextblock) und Organisationsnamen sammeln
  const tenantIds = new Set(tickets.map(t => t.s112TenantId).filter((x): x is string => !!x))
  const orgNamen = new Set(tickets.flatMap(t => t.organisationen.map(klein)))

  // Organisationsname → software:112-Mandant(en) gleichen Namens (nur wenn die s112-Anbindung eingerichtet ist)
  const mandantenJeOrg = new Map<string, string[]>()
  if (orgNamen.size > 0 && s112Konfiguriert()) {
    try {
      for (const m of await s112AlleMandanten()) {
        const n = klein(m.name)
        if (!orgNamen.has(n)) continue
        mandantenJeOrg.set(n, [...(mandantenJeOrg.get(n) ?? []), m.id])
        tenantIds.add(m.id)
      }
    } catch { /* ohne s112 bleibt der Namensvergleich mit den CRM-Firmen */ }
  }

  // Firmen, die mit einem dieser Mandanten verknüpft sind
  const firmaJeMandant = new Map<string, { id: string; name: string }>()
  if (tenantIds.size > 0) {
    const { data } = await (supabase.from('firmen') as any)
      .select('id, name, s112_tenant_id').eq('tenant_id', tenantId).eq('aktiv', true)
      .in('s112_tenant_id', [...tenantIds])
    for (const f of (data ?? []) as R[]) firmaJeMandant.set(String(f.s112_tenant_id).toLowerCase(), { id: f.id, name: f.name })
  }

  // CRM-Firmen mit genau dem Organisationsnamen (Groß-/Kleinschreibung egal)
  const firmaJeName = new Map<string, { id: string; name: string }>()
  for (const n of orgNamen) {
    const muster = n.replace(/[\%_]/g, m => `\${m}`)
    const { data } = await (supabase.from('firmen') as any)
      .select('id, name').eq('tenant_id', tenantId).eq('aktiv', true).ilike('name', muster).limit(2)
    // nur eindeutige Treffer übernehmen
    if ((data ?? []).length === 1) firmaJeName.set(n, { id: (data as R[])[0].id, name: (data as R[])[0].name })
  }

  // 3. E-Mail des Melders
  const perEmail = await crmZuordnungPerEmail(supabase, tenantId, tickets.map(t => t.melderEmail ?? '').filter(Boolean))

  for (const t of tickets) {
    const email = t.melderEmail ? perEmail.get(t.melderEmail) : undefined
    let firma: { id: string; name: string } | null = null
    let ueber: TicketZuordnung['ueber'] = 'email'
    if (t.s112TenantId && firmaJeMandant.has(t.s112TenantId)) {
      firma = firmaJeMandant.get(t.s112TenantId)!; ueber = 'mandant'
    } else {
      for (const o of t.organisationen.map(klein)) {
        const ueberMandant = (mandantenJeOrg.get(o) ?? []).map(id => firmaJeMandant.get(id.toLowerCase())).find(Boolean)
        const f = ueberMandant ?? firmaJeName.get(o)
        if (f) { firma = f; ueber = 'organisation'; break }
      }
    }
    // Bringt das Ticket einen Betrieb mit (software:112), ist der maßgeblich: ohne CRM-Firma dazu
    // KEINE Firma über die E-Mail einsetzen – sonst landet z. B. ein Musterhof-Ticket bei der Firma des Melders.
    if (!firma && hatBetrieb(t)) {
      if (email?.kontakt) ergebnis.set(t.key, { kontakt: email.kontakt, firma: null, ueber: 'email' })
      continue
    }
    if (!firma && !email) continue
    ergebnis.set(t.key, { kontakt: email?.kontakt ?? null, firma: firma ?? email?.firma ?? null, ueber })
  }
  return ergebnis
}
