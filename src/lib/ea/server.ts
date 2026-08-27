// ── Serverseitige Helfer der E&A-Rechnung (nur Server Components/Actions) ────
// Nie in Client-Komponenten importieren (nimmt den Server-Supabase-Client entgegen).
import type { KategorieOption, KontoOption, FirmaOption } from '@/lib/ea/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export type EaEinstellungen = {
  ust_satz_standard: number
  ea_buchung_modus: 'brutto' | 'netto'
  ea_kleinunternehmer: boolean
  ea_uva_zeitraum: 'monatlich' | 'quartalsweise'
  ea_betriebsbeginn: string | null
}

/** E&A-relevante Mandanteneinstellungen (mit Defaults, falls noch keine Zeile existiert) */
export async function ladeEaEinstellungen(supabase: SB, tenantId: string): Promise<EaEinstellungen> {
  const { data } = await (supabase.from('tenant_einstellungen') as SB)
    .select('ust_satz_standard, ea_buchung_modus, ea_kleinunternehmer, ea_uva_zeitraum, ea_betriebsbeginn')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  const e = (data ?? {}) as R
  return {
    ust_satz_standard:   Number(e.ust_satz_standard ?? 20),
    ea_buchung_modus:    e.ea_buchung_modus === 'netto' ? 'netto' : 'brutto',
    ea_kleinunternehmer: !!e.ea_kleinunternehmer,
    ea_uva_zeitraum:     e.ea_uva_zeitraum === 'monatlich' ? 'monatlich' : 'quartalsweise',
    ea_betriebsbeginn:   e.ea_betriebsbeginn ?? null,
  }
}

/**
 * Standardvorlage (tenant_id IS NULL) in den Mandanten kopieren – nur die
 * Kategorien, die (nach Name) noch nicht vorhanden sind. Gibt die Anzahl der
 * neu angelegten Kategorien zurück. Fehler (z.B. fehlende Schreibrechte einer
 * Leser-Rolle) werden verschluckt – die Seite muss trotzdem funktionieren.
 */
export async function uebernehmeStandardkategorien(supabase: SB, tenantId: string): Promise<{ neu: number; fehler?: string }> {
  const [{ data: vorlage }, { data: eigene }] = await Promise.all([
    (supabase.from('ea_kategorien') as SB)
      .select('typ, name, konto_nr, ust_satz_std, abzugsfaehig_pct, sortierung')
      .is('tenant_id', null)
      .order('sortierung'),
    (supabase.from('ea_kategorien') as SB)
      .select('name')
      .eq('tenant_id', tenantId),
  ])
  const vorhanden = new Set(((eigene ?? []) as R[]).map(k => String(k.name).trim().toLowerCase()))
  const neue = ((vorlage ?? []) as R[])
    .filter(k => !vorhanden.has(String(k.name).trim().toLowerCase()))
    .map(k => ({
      tenant_id:        tenantId,
      typ:              k.typ,
      name:             k.name,
      konto_nr:         k.konto_nr,
      ust_satz_std:     k.ust_satz_std,
      abzugsfaehig_pct: k.abzugsfaehig_pct,
      sortierung:       k.sortierung,
      aktiv:            true,
    }))
  if (neue.length === 0) return { neu: 0 }
  const { error } = await (supabase.from('ea_kategorien') as SB).insert(neue)
  if (error) return { neu: 0, fehler: (error as R).message }
  return { neu: neue.length }
}

/**
 * Kategorien des Mandanten laden; hat der Mandant noch keine, wird beim ersten
 * Zugriff die Standardvorlage kopiert (still – scheitert das, bleibt die Liste leer).
 */
export async function ladeKategorien(supabase: SB, tenantId: string, nurAktive = true): Promise<KategorieOption[]> {
  const lade = async () => {
    let q = (supabase.from('ea_kategorien') as SB)
      .select('id, name, typ, konto_nr, ust_satz_std, abzugsfaehig_pct, aktiv, sortierung')
      .eq('tenant_id', tenantId)
    if (nurAktive) q = q.eq('aktiv', true)
    const { data } = await q.order('sortierung').order('name')
    return (data ?? []) as R[]
  }
  let rows = await lade()
  if (rows.length === 0) {
    const { count } = await (supabase.from('ea_kategorien') as SB)
      .select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
    if (!count) {
      await uebernehmeStandardkategorien(supabase, tenantId)
      rows = await lade()
    }
  }
  return rows.map(k => ({
    id:               k.id as string,
    name:             k.name as string,
    typ:              k.typ,
    konto_nr:         k.konto_nr == null ? null : Number(k.konto_nr),
    ust_satz_std:     Number(k.ust_satz_std ?? 20),
    abzugsfaehig_pct: Number(k.abzugsfaehig_pct ?? 100),
    aktiv:            k.aktiv !== false,
    sortierung:       Number(k.sortierung ?? 0),
  }))
}

/** Aktive Konten (für Auswahlfelder) */
export async function ladeKonten(supabase: SB, tenantId: string): Promise<KontoOption[]> {
  const { data } = await (supabase.from('konten') as SB)
    .select('id, name')
    .eq('tenant_id', tenantId).eq('aktiv', true)
    .order('sortierung').order('name')
  return ((data ?? []) as R[]).map(k => ({ id: k.id as string, name: k.name as string }))
}

/** Aktive Firmen (Geschäftspartner) für Auswahlfelder */
export async function ladeFirmen(supabase: SB, tenantId: string): Promise<FirmaOption[]> {
  const { data } = await (supabase.from('firmen') as SB)
    .select('id, name')
    .eq('tenant_id', tenantId).eq('aktiv', true)
    .order('name')
  return ((data ?? []) as R[]).map(f => ({ id: f.id as string, name: f.name as string }))
}

/** RPC pruefe_ea_zeitraum_offen – { offen, grund } */
export async function pruefeZeitraumOffen(supabase: SB, tenantId: string, datum: string): Promise<{ offen: boolean; grund: string | null }> {
  const { data, error } = await (supabase.rpc as SB)('pruefe_ea_zeitraum_offen', { p_tenant_id: tenantId, p_datum: datum })
  if (error) return { offen: false, grund: (error as R).message }
  const row = (Array.isArray(data) ? data[0] : data) as R | null
  if (!row) return { offen: true, grund: null }
  return { offen: row.offen !== false, grund: row.grund ?? null }
}
