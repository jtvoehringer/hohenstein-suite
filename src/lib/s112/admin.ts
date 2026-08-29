// ── Anbindung an das software:112-Supabase-Projekt (Demo-Mandant) ─────────────
// Server-only. Nutzt den Service-Role-Key von software:112, um Demo-Benutzer
// anzulegen/zu sperren und die Demo-Daten zurückzusetzen. Alle Schreibzugriffe
// sind strikt auf den Demo-Mandanten (S112_DEMO_TENANT_ID) begrenzt.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export const S112_APP_URL = process.env.S112_APP_URL ?? 'https://software112.icp-consultants.at'
export const S112_DEMO_TENANT_ID = process.env.S112_DEMO_TENANT_ID ?? '33333333-3333-4333-8333-333333333333'

export function s112Konfiguriert(): boolean {
  return !!(process.env.S112_SUPABASE_URL && process.env.S112_SERVICE_ROLE_KEY)
}

/** Diagnose des hinterlegten Schlüssels (ohne ihn preiszugeben): Projekt-Ref + Rolle aus dem JWT bzw. Key-Format */
export function s112KeyDiagnose(): string | null {
  const key = (process.env.S112_SERVICE_ROLE_KEY ?? '').trim()
  const url = (process.env.S112_SUPABASE_URL ?? '').trim()
  if (!key) return null
  const sollRef = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? null
  if (key.startsWith('sb_secret_')) return 'Es ist ein neuer „Secret key" (sb_secret_…) hinterlegt – bitte den Legacy-Key „service_role" (beginnt mit eyJ…) aus Project Settings → API → Legacy API keys verwenden.'
  if (key.startsWith('sb_publishable_')) return 'Es ist ein „Publishable key" hinterlegt – benötigt wird der Legacy-Key „service_role" (beginnt mit eyJ…).'
  const teile = key.split('.')
  if (teile.length !== 3) return `Der Schlüssel hat kein JWT-Format (${key.length} Zeichen, ${teile.length - 1} Punkte) – vermutlich unvollständig kopiert.`
  try {
    const payload = JSON.parse(Buffer.from(teile[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as { ref?: string; role?: string }
    const hinweise: string[] = []
    if (payload.role !== 'service_role') hinweise.push(`Rolle „${payload.role ?? '?'}" statt „service_role" (falscher Key-Typ – der anon-Key reicht nicht)`)
    if (sollRef && payload.ref !== sollRef) hinweise.push(`Key gehört zum Projekt „${payload.ref ?? '?'}", erwartet wird „${sollRef}" (software112) – Key aus dem falschen Supabase-Projekt kopiert`)
    if (hinweise.length === 0) return 'Format und Projekt des Schlüssels passen – wurde nach dem Eintragen in Vercel ein Redeploy gemacht? Sonst: Key im Supabase-Dashboard prüfen (evtl. rotiert).'
    return hinweise.join('; ') + '.'
  } catch {
    return 'Der Schlüssel lässt sich nicht als JWT lesen – vermutlich unvollständig oder mit Leerzeichen kopiert.'
  }
}

export function s112Admin(): SupabaseClient {
  const url = process.env.S112_SUPABASE_URL
  const key = process.env.S112_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('software:112-Anbindung nicht konfiguriert (S112_SUPABASE_URL / S112_SERVICE_ROLE_KEY fehlen).')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export type DemoInfo = {
  lagen: number; weingarten: number; grundstuecke: number; flaeche_ha: number
  behaelter: number; chargen: number; chargen_aktiv: number; liter_im_keller: number
  fuellungen: number; flaschen_bestand: number; behandlungen: number
  kontakte: number; firmen: number; verkaufsposten: number; offene_posten: number
  ea_transaktionen: number; kosteneintraege: number; fristen: number
  letzter_reset: string | null
}

/** Kennzahlen des Demo-Mandanten (RPC demo_musterhof_info im software:112-Projekt) */
export async function s112DemoInfo(): Promise<DemoInfo | null> {
  if (!s112Konfiguriert()) return null
  const { data, error } = await (s112Admin().rpc as any)('demo_musterhof_info')
  if (error) throw new Error(error.message)
  const d = (data ?? {}) as R
  const n = (k: string) => Number(d[k] ?? 0)
  return {
    lagen: n('lagen'), weingarten: n('weingarten'), grundstuecke: n('grundstuecke'), flaeche_ha: n('flaeche_ha'),
    behaelter: n('behaelter'), chargen: n('chargen'), chargen_aktiv: n('chargen_aktiv'), liter_im_keller: n('liter_im_keller'),
    fuellungen: n('fuellungen'), flaschen_bestand: n('flaschen_bestand'), behandlungen: n('behandlungen'),
    kontakte: n('kontakte'), firmen: n('firmen'), verkaufsposten: n('verkaufsposten'), offene_posten: n('offene_posten'),
    ea_transaktionen: n('ea_transaktionen'), kosteneintraege: n('kosteneintraege'), fristen: n('fristen'),
    letzter_reset: (d.letzter_reset as string | null) ?? null,
  }
}

/** Demo-Daten neu erzeugen (RPC demo_musterhof_zuruecksetzen) */
export async function s112DemoReset(): Promise<void> {
  const admin = s112Admin()
  const { error } = await (admin.rpc as any)('demo_musterhof_zuruecksetzen')
  if (error) throw new Error(error.message)
  // Rückverfolgungs-Kette der Vorjahres-Füllungen nachziehen (eigene Funktion,
  // damit die große Reset-Funktion nicht angefasst werden muss)
  const { error: ketteErr } = await (admin.rpc as any)('demo_musterhof_y2_kette')
  if (ketteErr) throw new Error('Demo zurückgesetzt, aber y2-Kette fehlgeschlagen: ' + ketteErr.message)
}

/** Zufälliges, gut lesbares Passwort (ohne verwechselbare Zeichen) */
export function demoPasswort(): string {
  const zeichen = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const buf = new Uint8Array(12)
  crypto.getRandomValues(buf)
  const teil = Array.from(buf, b => zeichen[b % zeichen.length]).join('')
  return `${teil.slice(0, 4)}-${teil.slice(4, 8)}-${teil.slice(8, 12)}`
}

/** Demo-Benutzer im software:112-Projekt anlegen und dem Demo-Mandanten zuordnen */
export async function s112DemoUserAnlegen(input: { email: string; name: string; passwort: string; rolle: 'winzer' | 'leser' }): Promise<{ userId: string }> {
  const admin = s112Admin()
  const email = input.email.trim().toLowerCase()

  // Existiert der Benutzer bereits (z.B. aus einer früheren Demo)? Dann wiederverwenden.
  let userId: string | null = null
  const { data: liste } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const vorhanden = liste?.users.find(u => (u.email ?? '').toLowerCase() === email)
  if (vorhanden) {
    userId = vorhanden.id
    // Schutz: Passwort nur überschreiben, wenn der Benutzer AUSSCHLIESSLICH im
    // Demo-Mandanten Mitglied ist – sonst würde ein echtes software:112-Konto
    // (z.B. Sandbox) sein Passwort verlieren.
    const { data: mitgliedschaften } = await (admin.from('tenant_memberships') as any)
      .select('tenant_id').eq('user_id', userId).neq('tenant_id', S112_DEMO_TENANT_ID)
    if ((mitgliedschaften ?? []).length > 0) {
      throw new Error(`${email} hat in software:112 bereits Zugriff auf andere Betriebe – dieses Konto kann nicht als Vorführ-Zugang verwendet werden (das Passwort würde überschrieben). Bitte eine eigene Demo-Adresse verwenden, z.B. demo-${email.split('@')[0]}@hohenstein-partner.at.`)
    }
    const { error } = await admin.auth.admin.updateUserById(userId, { password: input.passwort, user_metadata: { full_name: input.name, display_name: input.name } })
    if (error) throw new Error(error.message)
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email, password: input.passwort, email_confirm: true,
      user_metadata: { full_name: input.name, display_name: input.name, demo: true },
    })
    if (error || !data.user) throw new Error(error?.message ?? 'Benutzer konnte nicht angelegt werden')
    userId = data.user.id
  }

  // Profil (Trigger legt es meist an – Name sicherstellen)
  await (admin.from('profiles') as any).upsert({ id: userId, display_name: input.name, full_name: input.name }, { onConflict: 'id' })

  // Mitgliedschaft NUR im Demo-Mandanten
  const { error: mErr } = await (admin.from('tenant_memberships') as any)
    .upsert({ tenant_id: S112_DEMO_TENANT_ID, user_id: userId, role: input.rolle, aktiv: true }, { onConflict: 'tenant_id,user_id' })
  if (mErr) throw new Error(mErr.message)
  return { userId: userId! }
}

/** Mitgliedschaft im Demo-Mandanten aktivieren/sperren */
export async function s112DemoUserAktiv(userId: string, aktiv: boolean): Promise<void> {
  const { error } = await (s112Admin().from('tenant_memberships') as any)
    .update({ aktiv }).eq('tenant_id', S112_DEMO_TENANT_ID).eq('user_id', userId)
  if (error) throw new Error(error.message)
}

export async function s112DemoUserRolle(userId: string, rolle: 'winzer' | 'leser'): Promise<void> {
  const { error } = await (s112Admin().from('tenant_memberships') as any)
    .update({ role: rolle }).eq('tenant_id', S112_DEMO_TENANT_ID).eq('user_id', userId)
  if (error) throw new Error(error.message)
}

export async function s112DemoUserPasswort(userId: string, passwort: string): Promise<void> {
  const { error } = await s112Admin().auth.admin.updateUserById(userId, { password: passwort })
  if (error) throw new Error(error.message)
}

/** Demo-Benutzer endgültig löschen – nur wenn er ausschließlich Mitglied des Demo-Mandanten ist */
export async function s112DemoUserLoeschen(userId: string): Promise<void> {
  const admin = s112Admin()
  const { data: andere } = await (admin.from('tenant_memberships') as any)
    .select('tenant_id').eq('user_id', userId).neq('tenant_id', S112_DEMO_TENANT_ID)
  if ((andere ?? []).length > 0) {
    // Benutzer hat weitere Mandanten → nur Demo-Mitgliedschaft entfernen
    await (admin.from('tenant_memberships') as any).delete().eq('tenant_id', S112_DEMO_TENANT_ID).eq('user_id', userId)
    return
  }
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) throw new Error(error.message)
}

/** Letzte Anmeldungen der Demo-Benutzer (user_id → Zeitpunkt) */
export async function s112LetzteAnmeldungen(userIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  if (userIds.length === 0 || !s112Konfiguriert()) return map
  try {
    const { data } = await s112Admin().auth.admin.listUsers({ perPage: 1000 })
    for (const u of data?.users ?? []) if (userIds.includes(u.id)) map.set(u.id, u.last_sign_in_at ?? null)
  } catch { /* Anzeige bleibt leer */ }
  return map
}
