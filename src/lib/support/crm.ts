// Server-only: Support-Tickets (Jira) den CRM-Kontakten und -Firmen zuordnen – über die E-Mail-Adresse des Melders.
import type { SupabaseClient } from '@supabase/supabase-js'
import { kontaktName } from '@/lib/crm/types'

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
