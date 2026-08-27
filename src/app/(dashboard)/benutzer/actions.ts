'use server'

// ── Server Actions: Benutzerverwaltung (nur admin) ───────────────────────────
// Ziel-Mandant ausschließlich aus getCurrentMembership(). E-Mails/Bestätigungs-
// status kommen aus der Supabase-Admin-API; Mitgliedschaften werden über den
// Admin-Client geschrieben (mit Tenant-Filter), damit RLS-Randfälle (z.B. nicht
// lesbare Demo-Mitgliedschaften) das Einladen nicht blockieren.

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getCurrentMembership, canManageUsers } from '@/lib/auth/roles'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export type Mitglied = {
  id: string
  user_id: string
  email: string
  name: string
  role: string
  aktiv: boolean
  bestaetigt: boolean
  letzte_anmeldung: string | null
  created_at: string
  ist_ich: boolean
}

export type ActionResult = { fehler?: string; ok?: boolean; hinweis?: string }

const ROLLEN = ['admin', 'mitarbeiter', 'leser']

async function adminKontext(): Promise<{ tenantId: string; userId: string } | { fehler: string }> {
  const membership = await getCurrentMembership()
  if (!membership) return { fehler: 'Kein aktiver Mandant' }
  if (!canManageUsers(membership.role)) return { fehler: 'Keine Berechtigung' }
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { fehler: 'Nicht angemeldet' }
  return { tenantId: membership.tenantId, userId: user.id }
}

function revalidate() {
  revalidatePath('/benutzer')
  revalidatePath('/aufgaben')
  revalidatePath('/dashboard')
}

/** Mitglieder des aktiven Mandanten inkl. E-Mail (Admin-API) und Name (profiles) */
export async function ladeMitglieder(): Promise<Mitglied[]> {
  const ctx = await adminKontext()
  if ('fehler' in ctx) return []

  // Mitgliedschaften + Namen über den normalen Client (Admin sieht per RLS alle Zeilen
  // seines Mandanten, Profile der Kollegen sind lesbar). E-Mail/Anmeldestatus kommen
  // aus der Auth-Admin-API – fehlt der Service-Role-Key, bleibt die Liste trotzdem nutzbar.
  const supabase = await createSupabaseServerClient()
  const { data: memberships } = await (supabase.from('tenant_memberships') as any)
    .select('id, user_id, role, aktiv, created_at')
    .eq('tenant_id', ctx.tenantId)
    .order('created_at')
  const rows = (memberships ?? []) as R[]
  if (rows.length === 0) return []

  const ids = rows.map(m => m.user_id as string)
  const { data: profile } = await (supabase.from('profiles') as any).select('id, full_name, display_name').in('id', ids)
  const namen = new Map<string, string>()
  for (const p of (profile ?? []) as R[]) namen.set(p.id, (p.full_name || p.display_name || '').trim())

  const userMap = new Map<string, R>()
  try {
    const admin = createSupabaseAdminClient()
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
    for (const u of data?.users ?? []) userMap.set(u.id, u as R)
  } catch { /* Service-Role-Key fehlt oder ungültig – E-Mails bleiben leer */ }

  return rows.map(m => {
    const u = userMap.get(m.user_id)
    return {
      id: m.id,
      user_id: m.user_id,
      email: u?.email ?? '–',
      name: namen.get(m.user_id) || (u?.user_metadata as R | undefined)?.full_name || '',
      role: m.role,
      aktiv: m.aktiv ?? true,
      bestaetigt: !!u?.email_confirmed_at,
      letzte_anmeldung: u?.last_sign_in_at ?? null,
      created_at: m.created_at,
      ist_ich: m.user_id === ctx.userId,
    }
  })
}

/**
 * Benutzer einladen: neue E-Mail → Supabase-Einladung; bekannte E-Mail → nur
 * Mitgliedschaft. Mitgliedschaft im aktiven Mandanten UND im Demo-Mandanten.
 * Domains lt. zugelassene_domains erhalten sie bereits per Trigger (upsert/ignore).
 */
export async function einladenAction(input: { email: string; name: string; role: string }): Promise<ActionResult> {
  const ctx = await adminKontext()
  if ('fehler' in ctx) return { fehler: ctx.fehler }
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  const role = input.role
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { fehler: 'Bitte eine gültige E-Mail-Adresse angeben.' }
  if (!name) return { fehler: 'Name ist ein Pflichtfeld.' }
  if (!ROLLEN.includes(role)) return { fehler: 'Ungültige Rolle.' }

  const admin = createSupabaseAdminClient()
  const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 })
  let userId = users.find(u => (u.email ?? '').toLowerCase() === email)?.id
  let neuEingeladen = false

  if (!userId) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: name, display_name: name },
      redirectTo: `${appUrl}/auth/callback?type=invite`,
    })
    if (error || !data.user) return { fehler: error?.message ?? 'Einladung fehlgeschlagen.' }
    userId = data.user.id
    neuEingeladen = true
    // Profil (Trigger legt es an – Name sicherheitshalber setzen)
    await (admin.from('profiles') as any).upsert({ id: userId, full_name: name, display_name: name }, { onConflict: 'id' })
  }

  // Mitgliedschaften: aktiver Mandant + Demo-Mandant
  const { data: demo } = await (admin.from('tenants') as any).select('id').eq('ist_demo', true).eq('active', true).limit(1).maybeSingle()
  const tenantIds = [ctx.tenantId]
  const demoId = (demo as R | null)?.id as string | undefined
  if (demoId && demoId !== ctx.tenantId) tenantIds.push(demoId)

  const { data: vorhanden } = await (admin.from('tenant_memberships') as any)
    .select('tenant_id').eq('user_id', userId).in('tenant_id', tenantIds)
  const bereits = new Set(((vorhanden ?? []) as R[]).map(v => v.tenant_id as string))
  if (!neuEingeladen && bereits.has(ctx.tenantId)) return { fehler: 'Diese Person ist bereits Mitglied des aktiven Mandanten.' }

  const neue = tenantIds.filter(t => !bereits.has(t)).map(t => ({ tenant_id: t, user_id: userId, role, aktiv: true }))
  if (neue.length > 0) {
    const { error } = await (admin.from('tenant_memberships') as any)
      .upsert(neue, { onConflict: 'tenant_id,user_id', ignoreDuplicates: true })
    if (error) return { fehler: error.message }
  }

  revalidate()
  return {
    ok: true,
    hinweis: neuEingeladen
      ? `Einladung an ${email} versandt.`
      : `${email} war bereits registriert und wurde als Mitglied hinzugefügt.`,
  }
}

/** Einladung erneut senden – nur für Konten, die noch nicht bestätigt sind */
export async function einladungErneutSendenAction(userId: string): Promise<ActionResult> {
  const ctx = await adminKontext()
  if ('fehler' in ctx) return { fehler: ctx.fehler }
  const admin = createSupabaseAdminClient()

  const { data: ziel } = await (admin.from('tenant_memberships') as any)
    .select('id').eq('tenant_id', ctx.tenantId).eq('user_id', userId).maybeSingle()
  if (!ziel) return { fehler: 'Diese Person ist kein Mitglied des aktiven Mandanten.' }

  const { data: res, error: getErr } = await admin.auth.admin.getUserById(userId)
  const user = res?.user
  if (getErr || !user?.email) return { fehler: 'Benutzer nicht gefunden.' }
  if (user.email_confirmed_at) return { fehler: 'Das Konto ist bereits aktiviert – bei Anmeldeproblemen „Passwort vergessen" auf der Login-Seite verwenden.' }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  const { error } = await admin.auth.admin.inviteUserByEmail(user.email, {
    data: user.user_metadata,
    redirectTo: `${appUrl}/auth/callback?type=invite`,
  })
  if (error) return { fehler: error.message }
  revalidate()
  return { ok: true, hinweis: `Neue Einladung an ${user.email} versandt.` }
}

export async function rolleAendernAction(membershipId: string, role: string): Promise<ActionResult> {
  const ctx = await adminKontext()
  if ('fehler' in ctx) return { fehler: ctx.fehler }
  if (!ROLLEN.includes(role)) return { fehler: 'Ungültige Rolle.' }
  const admin = createSupabaseAdminClient()

  const { data: ziel } = await (admin.from('tenant_memberships') as any)
    .select('user_id').eq('id', membershipId).eq('tenant_id', ctx.tenantId).maybeSingle()
  if (!ziel) return { fehler: 'Eintrag nicht gefunden.' }
  if ((ziel as R).user_id === ctx.userId) return { fehler: 'Die eigene Rolle kann nicht geändert werden.' }

  const { error } = await (admin.from('tenant_memberships') as any)
    .update({ role }).eq('id', membershipId).eq('tenant_id', ctx.tenantId)
  if (error) return { fehler: error.message }
  revalidate()
  return { ok: true }
}

export async function aktivSetzenAction(membershipId: string, aktiv: boolean): Promise<ActionResult> {
  const ctx = await adminKontext()
  if ('fehler' in ctx) return { fehler: ctx.fehler }
  const admin = createSupabaseAdminClient()

  const { data: ziel } = await (admin.from('tenant_memberships') as any)
    .select('user_id').eq('id', membershipId).eq('tenant_id', ctx.tenantId).maybeSingle()
  if (!ziel) return { fehler: 'Eintrag nicht gefunden.' }
  if ((ziel as R).user_id === ctx.userId) return { fehler: 'Die eigene Mitgliedschaft kann nicht deaktiviert werden.' }

  const { error } = await (admin.from('tenant_memberships') as any)
    .update({ aktiv }).eq('id', membershipId).eq('tenant_id', ctx.tenantId)
  if (error) return { fehler: error.message }
  revalidate()
  return { ok: true }
}

/** Mitgliedschaft im aktiven Mandanten entfernen (das Benutzerkonto bleibt bestehen) */
export async function entfernenAction(membershipId: string): Promise<ActionResult> {
  const ctx = await adminKontext()
  if ('fehler' in ctx) return { fehler: ctx.fehler }
  const admin = createSupabaseAdminClient()

  const { data: ziel } = await (admin.from('tenant_memberships') as any)
    .select('user_id').eq('id', membershipId).eq('tenant_id', ctx.tenantId).maybeSingle()
  if (!ziel) return { fehler: 'Eintrag nicht gefunden.' }
  if ((ziel as R).user_id === ctx.userId) return { fehler: 'Die eigene Mitgliedschaft kann nicht entfernt werden.' }

  const { error } = await (admin.from('tenant_memberships') as any)
    .delete().eq('id', membershipId).eq('tenant_id', ctx.tenantId)
  if (error) return { fehler: error.message }
  revalidate()
  return { ok: true }
}
