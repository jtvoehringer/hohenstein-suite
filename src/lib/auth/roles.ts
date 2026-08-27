import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getActiveTenantCookie } from '@/lib/auth/activeTenant'

// ── Rollenmodell der Hohenstein Suite ─────────────────────────────────────────
// admin        – Vollzugriff inkl. Benutzer, Einstellungen, Monatsabschluss/UVA
// mitarbeiter  – anlegen, bearbeiten, löschen in CRM/E&A/Aufgaben
// leser        – nur lesen
//
// Diese Datei ist server-only (liest den HttpOnly-Cookie). In Client-
// Komponenten NIE `canWrite`/`getCurrentMembership` importieren – stattdessen
// die Werte als Props aus dem Layout durchreichen oder /api/me/active-tenant nutzen.

export type UserRole = 'admin' | 'mitarbeiter' | 'leser' | null

/** Rollen mit Schreibrecht – für RPC-/Policy-Arrays in SQL: array['admin','mitarbeiter'] */
export const ROLLEN_SCHREIBEND = ['admin', 'mitarbeiter'] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export type Membership = { tenantId: string; role: UserRole }

/** Rolle des eingeloggten Users im aktiven Mandanten */
export async function getCurrentUserRole(): Promise<UserRole> {
  const m = await getCurrentMembership()
  return m?.role ?? null
}

/**
 * Aktiver Mandant + Rolle. Liest den Cookie und validiert ihn gegen die echten,
 * aktiven Mitgliedschaften; Fallback: erste Mitgliedschaft (Nicht-Demo bevorzugt).
 * WICHTIG: explizit auf user_id filtern – Admins sehen per RLS alle Zeilen ihres Mandanten.
 */
export async function getCurrentMembership(): Promise<Membership | null> {
  const supabase = await createSupabaseServerClient()
  const activeTenantId = await getActiveTenantCookie()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  if (activeTenantId) {
    const { data } = await (supabase.from('tenant_memberships') as any)
      .select('tenant_id, role')
      .eq('tenant_id', activeTenantId)
      .eq('user_id', user.id)
      .eq('aktiv', true)
      .limit(1)
      .maybeSingle()
    if (data) return { tenantId: (data as R).tenant_id, role: (data as R).role as UserRole }
  }

  const { data: alle } = await (supabase.from('tenant_memberships') as any)
    .select('tenant_id, role, tenants(ist_demo)')
    .eq('user_id', user.id)
    .eq('aktiv', true)
    .order('created_at', { ascending: true })
  const rows = (alle ?? []) as R[]
  if (rows.length === 0) return null
  const bevorzugt = rows.find(r => !(r.tenants as R | null)?.ist_demo) ?? rows[0]
  return { tenantId: bevorzugt.tenant_id, role: bevorzugt.role as UserRole }
}

/** Aktive Tenant-ID (Kurzform) – wirft, wenn keine Mitgliedschaft vorhanden ist */
export async function requireTenantId(): Promise<string> {
  const m = await getCurrentMembership()
  if (!m) throw new Error('Kein aktiver Mandant')
  return m.tenantId
}

// ── Berechtigungsprüfungen ──────────────────────────────────────────────────

/** Darf anlegen + bearbeiten + löschen (admin, mitarbeiter) */
export function canWrite(role: UserRole): boolean {
  return role === 'admin' || role === 'mitarbeiter'
}

/** Darf Benutzer, Einstellungen, Monatsabschluss/UVA verwalten */
export function canAdmin(role: UserRole): boolean {
  return role === 'admin'
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'admin'
}

/** Lesbare Rollenbezeichnung */
export function roleLabel(role: UserRole): string {
  const labels: Record<string, string> = {
    admin:       'Admin',
    mitarbeiter: 'Mitarbeiter',
    leser:       'Nur-Lesen',
  }
  return role ? (labels[role] ?? role) : '–'
}
