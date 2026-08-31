'use server'

// ── Server Actions: software:112-Mandanten & Zahlungs-Sync ────────────────────
// Rückmeldung 31.8.2026 ("Zahlungstracking in die Hohenstein Suite übernehmen
// und bei den Kunden im E&A-Modul anhängen, bei 200 Mandanten gehen wir sonst
// bei Abstimmungsarbeiten unter"): Admin-only wie der Demo-Bereich. Verknüpft
// software:112-Mandanten mit CRM-Firmen und bucht neue Stripe-Zahlungen
// (stripe_zahlungen_log im software:112-Projekt) automatisch als E&A-Einnahme.

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canAdmin } from '@/lib/auth/roles'
import { ladeKategorien, pruefeZeitraumOffen } from '@/lib/ea/server'
import { s112NeueZahlungen, s112MarkiereVerbucht, type S112ZahlungLogEintrag } from '@/lib/s112/admin'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
type Ergebnis<T = undefined> = { ok: true; data?: T } | { ok: false; fehler: string }

async function ctx() {
  const membership = await getCurrentMembership()
  if (!membership) throw new Error('Kein aktiver Mandant')
  if (!canAdmin(membership.role)) throw new Error('Dieser Bereich ist nur für das Management-Team (Admins).')
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, tenantId: membership.tenantId, userId: user?.id ?? null }
}

function fehler(e: unknown): { ok: false; fehler: string } {
  return { ok: false, fehler: e instanceof Error ? e.message : String(e) }
}

function neuSetzen() {
  revalidatePath('/software112')
}

/** Eine bestehende CRM-Firma mit einem software:112-Mandanten verknüpfen */
export async function verknuepfeFirmaAction(s112TenantId: string, firmaId: string): Promise<Ergebnis> {
  try {
    const { supabase, tenantId } = await ctx()
    const { data: firma } = await (supabase.from('firmen') as R)
      .select('id').eq('id', firmaId).eq('tenant_id', tenantId).maybeSingle()
    if (!firma) return { ok: false, fehler: 'Firma nicht gefunden.' }
    const { error } = await (supabase.from('firmen') as R)
      .update({ s112_tenant_id: s112TenantId }).eq('id', firmaId).eq('tenant_id', tenantId)
    if (error) {
      if ((error as R).code === '23505') return { ok: false, fehler: 'Dieser Mandant ist bereits mit einer anderen Firma verknüpft.' }
      return { ok: false, fehler: (error as R).message }
    }
    neuSetzen()
    return { ok: true }
  } catch (e) { return fehler(e) }
}

/** Verknüpfung aufheben (z.B. um mit einer anderen Firma neu zu verknüpfen) */
export async function entknuepfeFirmaAction(firmaId: string): Promise<Ergebnis> {
  try {
    const { supabase, tenantId } = await ctx()
    const { error } = await (supabase.from('firmen') as R)
      .update({ s112_tenant_id: null }).eq('id', firmaId).eq('tenant_id', tenantId)
    if (error) return { ok: false, fehler: (error as R).message }
    neuSetzen()
    return { ok: true }
  } catch (e) { return fehler(e) }
}

/** Neue CRM-Firma direkt aus einem software:112-Mandanten anlegen und verknüpfen */
export async function firmaAusMandantAnlegenAction(s112TenantId: string, name: string): Promise<Ergebnis<{ firmaId: string }>> {
  try {
    const { supabase, tenantId } = await ctx()
    const n = name.trim()
    if (!n) return { ok: false, fehler: 'Bitte einen Namen angeben.' }
    const { data, error } = await (supabase.from('firmen') as R)
      .insert({ tenant_id: tenantId, name: n, segment: 'weinbau', quelle: 'software112', ist_kunde: true, is_lead: false, s112_tenant_id: s112TenantId })
      .select('id').single()
    if (error) {
      if ((error as R).code === '23505') return { ok: false, fehler: 'Dieser Mandant ist bereits mit einer anderen Firma verknüpft.' }
      return { ok: false, fehler: (error as R).message }
    }
    neuSetzen()
    return { ok: true, data: { firmaId: (data as R).id as string } }
  } catch (e) { return fehler(e) }
}

export type SyncErgebnis = { gebucht: number; uebersprungen: number; nichtVerknuepft: number; fehlermeldungen: string[] }

/**
 * Neue Zahlungen aus stripe_zahlungen_log als E&A-Einnahme buchen (Kategorie
 * "Softwarelizenzen / SaaS", bereits als Standardkategorie vorhanden). Mandanten
 * ohne verknüpfte Firma werden übersprungen und bleiben für den nächsten Lauf
 * stehen; ebenso Zahlungen in einem bereits per Monatsabschluss/UVA gesperrten
 * Zeitraum (dort ist ohnehin nur noch eine manuelle, dokumentierte Nachbuchung
 * sinnvoll). bank_ref = "stripe:<invoice_id>" sichert zusätzlich zum
 * hs_verbucht_am-Flag in software:112 gegen Doppelbuchung ab.
 */
export async function synchronisiereZahlungenAction(): Promise<Ergebnis<SyncErgebnis>> {
  try {
    const { supabase, tenantId, userId } = await ctx()
    const neue = await s112NeueZahlungen()
    if (neue.length === 0) return { ok: true, data: { gebucht: 0, uebersprungen: 0, nichtVerknuepft: 0, fehlermeldungen: [] } }

    const [{ data: firmenRaw }, kategorien] = await Promise.all([
      (supabase.from('firmen') as R).select('id, name, s112_tenant_id').eq('tenant_id', tenantId).not('s112_tenant_id', 'is', null),
      ladeKategorien(supabase, tenantId),
    ])
    const firmaJeMandant = new Map<string, { id: string; name: string }>()
    for (const f of (firmenRaw ?? []) as R[]) firmaJeMandant.set(f.s112_tenant_id as string, { id: f.id as string, name: f.name as string })
    const kategorie = kategorien.find(k => k.name === 'Softwarelizenzen / SaaS') ?? kategorien.find(k => k.typ === 'einnahme') ?? null

    let gebucht = 0, uebersprungen = 0, nichtVerknuepft = 0
    const fehlermeldungen: string[] = []
    const verbuchtIds: string[] = []

    for (const z of neue as S112ZahlungLogEintrag[]) {
      const firma = firmaJeMandant.get(z.tenant_id)
      if (!firma) { nichtVerknuepft++; continue }

      const datum = z.bezahlt_am.slice(0, 10)
      const pruef = await pruefeZeitraumOffen(supabase, tenantId, datum)
      if (!pruef.offen) { uebersprungen++; continue }

      const ustSatz = 20
      const nettoBetrag = Math.round((z.betrag_brutto / (1 + ustSatz / 100)) * 100) / 100
      const periodeTxt = z.periode_start && z.periode_ende
        ? `${z.periode_start.slice(0, 10)}–${z.periode_ende.slice(0, 10)}`
        : datum

      const { error } = await (supabase.from('ea_transaktionen') as R).insert({
        tenant_id: tenantId, typ: 'einnahme', datum, beschreibung: `software:112-Abo ${firma.name} (${periodeTxt})`,
        kategorie_id: kategorie?.id ?? null, firma_id: firma.id,
        betrag_netto: nettoBetrag, ust_satz: ustSatz, abzugsfaehig_pct: 100,
        belegnummer: z.stripe_invoice_id, bank_ref: `stripe:${z.stripe_invoice_id}`,
        import_quelle: 'software112', erstellt_von: userId,
      })
      if (error) {
        if ((error as R).code === '23505') {
          // bereits verbucht (bank_ref-Kollision) – nur das Flag in software:112 nachziehen
          verbuchtIds.push(z.id)
        } else {
          fehlermeldungen.push(`${firma.name}: ${(error as R).message}`)
        }
        continue
      }
      gebucht++
      verbuchtIds.push(z.id)
    }

    if (verbuchtIds.length > 0) await s112MarkiereVerbucht(verbuchtIds)
    neuSetzen()
    return { ok: true, data: { gebucht, uebersprungen, nichtVerknuepft, fehlermeldungen } }
  } catch (e) { return fehler(e) }
}
