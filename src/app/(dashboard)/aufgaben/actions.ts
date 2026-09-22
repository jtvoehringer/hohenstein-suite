'use server'

// ── Server Actions: Aufgaben (Team-To-dos) ───────────────────────────────────
// Alle Aktionen: tenant_id ausschließlich aus getCurrentMembership(), Schreib-
// recht über canWrite(). Spalten lt. Migration 004_aufgaben_email.sql.

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { ladeMandantMitglieder } from '@/lib/aufgaben/mitglieder'
import { AUFGABE_BEREICHE, AUFGABE_PRIORITAET, AUFGABE_STATUS, type MitgliedOption } from '@/lib/aufgaben/types'
import { sendeBenachrichtigung, neueErwaehnungen } from '@/lib/benachrichtigungen/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export type AufgabeInput = {
  id?: string | null
  titel: string
  beschreibung?: string | null
  status: string
  prioritaet: string
  verantwortlich_id?: string | null
  /** Aufgabe für das ganze Team (Verantwortlich „Alle"); verantwortlich_id wird dann ignoriert */
  fuer_alle?: boolean
  faellig_am?: string | null
  bereich?: string | null
  kontakt_id?: string | null
  firma_id?: string | null
}

export type ActionResult = { fehler?: string; id?: string }

function revalidate() {
  revalidatePath('/aufgaben')
  revalidatePath('/dashboard')
}

async function schreibKontext(): Promise<{ tenantId: string; userId: string } | { fehler: string }> {
  const membership = await getCurrentMembership()
  if (!membership) return { fehler: 'Kein aktiver Mandant' }
  if (!canWrite(membership.role)) return { fehler: 'Keine Berechtigung' }
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { fehler: 'Nicht angemeldet' }
  return { tenantId: membership.tenantId, userId: user.id }
}

const uuidOderNull = (v: string | null | undefined) =>
  v && /^[0-9a-f-]{36}$/i.test(v) ? v : null
const datumOderNull = (v: string | null | undefined) =>
  v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null

/** Aufgabe anlegen (ohne id) oder bearbeiten (mit id) */
export async function speichereAufgabeAction(input: AufgabeInput): Promise<ActionResult> {
  const ctx = await schreibKontext()
  if ('fehler' in ctx) return { fehler: ctx.fehler }

  const titel = (input.titel ?? '').trim()
  if (!titel) return { fehler: 'Titel ist ein Pflichtfeld.' }
  if (!AUFGABE_STATUS.some(s => s.value === input.status)) return { fehler: 'Ungültiger Status.' }
  if (!AUFGABE_PRIORITAET.some(p => p.value === input.prioritaet)) return { fehler: 'Ungültige Priorität.' }
  const bereich = input.bereich && AUFGABE_BEREICHE.some(b => b.value === input.bereich) ? input.bereich : null

  const supabase = await createSupabaseServerClient()
  const fuerAlle = !!input.fuer_alle
  const werte: R = {
    titel,
    beschreibung:      (input.beschreibung ?? '').trim() || null,
    status:            input.status,
    prioritaet:        input.prioritaet,
    verantwortlich_id: fuerAlle ? null : uuidOderNull(input.verantwortlich_id),
    fuer_alle:         fuerAlle,
    faellig_am:        datumOderNull(input.faellig_am),
    bereich,
    kontakt_id:        uuidOderNull(input.kontakt_id),
    firma_id:          uuidOderNull(input.firma_id),
  }

  // Vorheriger Stand (für Benachrichtigungen: neue Zuweisung / neue @Erwähnungen)
  let vorher: R | null = null
  if (input.id) {
    const { data } = await (supabase.from('aufgaben') as any)
      .select('verantwortlich_id, fuer_alle, beschreibung').eq('id', input.id).eq('tenant_id', ctx.tenantId).maybeSingle()
    vorher = (data as R | null) ?? null
  }

  let id: string
  if (input.id) {
    const { error } = await (supabase.from('aufgaben') as any)
      .update(werte)
      .eq('id', input.id)
      .eq('tenant_id', ctx.tenantId)
    if (error) return { fehler: error.message }
    id = input.id
  } else {
    const { data, error } = await (supabase.from('aufgaben') as any)
      .insert({ ...werte, tenant_id: ctx.tenantId, erstellt_von: ctx.userId })
      .select('id')
      .single()
    if (error) return { fehler: error.message }
    id = (data as R).id
  }

  await benachrichtigeAufgabe({ tenantId: ctx.tenantId, userId: ctx.userId, id, titel, werte, vorher })
  revalidate()
  return { id }
}

/** Benachrichtigungen nach dem Speichern: Zuweisung, Team-Aufgabe, @Erwähnungen in der Beschreibung */
async function benachrichtigeAufgabe(a: { tenantId: string; userId: string; id: string; titel: string; werte: R; vorher: R | null }) {
  try {
    const mitglieder = await ladeMandantMitglieder(a.tenantId)
    const href = `/aufgaben?id=${a.id}`
    const faellig = a.werte.faellig_am ? ` · fällig am ${new Date(a.werte.faellig_am + 'T00:00:00').toLocaleDateString('de-AT')}` : ''
    const beschreibung = (a.werte.beschreibung as string | null) ?? null

    // 1) Verantwortlich neu zugewiesen (nicht an sich selbst)
    const neuVerantwortlich = a.werte.verantwortlich_id as string | null
    if (neuVerantwortlich && neuVerantwortlich !== (a.vorher?.verantwortlich_id ?? null)) {
      await sendeBenachrichtigung({
        tenantId: a.tenantId, empfaengerIds: [neuVerantwortlich], ausgeloestVon: a.userId, art: 'aufgabe_zugewiesen',
        titel: `Aufgabe zugewiesen: ${a.titel}`, text: beschreibung ? beschreibung.slice(0, 500) + faellig : faellig.replace(/^ · /, '') || null,
        href, quelleTyp: 'aufgabe', quelleId: a.id,
      })
    }
    // 2) Aufgabe für alle (neu gesetzt)
    if (a.werte.fuer_alle && !(a.vorher?.fuer_alle)) {
      await sendeBenachrichtigung({
        tenantId: a.tenantId, empfaengerIds: mitglieder.map(m => m.id), ausgeloestVon: a.userId, art: 'aufgabe_alle',
        titel: `Aufgabe für alle: ${a.titel}`, text: beschreibung ? beschreibung.slice(0, 500) + faellig : faellig.replace(/^ · /, '') || null,
        href, quelleTyp: 'aufgabe', quelleId: a.id,
      })
    }
    // 3) @Erwähnungen in der Beschreibung (nur neue)
    const erwaehnt = neueErwaehnungen(beschreibung, a.vorher?.beschreibung ?? null, mitglieder)
      .filter(uid => uid !== neuVerantwortlich || neuVerantwortlich === (a.vorher?.verantwortlich_id ?? null))
    if (erwaehnt.length > 0) {
      await sendeBenachrichtigung({
        tenantId: a.tenantId, empfaengerIds: erwaehnt, ausgeloestVon: a.userId, art: 'erwaehnung',
        titel: `Erwähnung in Aufgabe: ${a.titel}`, text: beschreibung?.slice(0, 500) ?? null,
        href, quelleTyp: 'aufgabe', quelleId: a.id,
      })
    }
  } catch (err) { console.error('benachrichtigeAufgabe:', err) }
}

/** Schnell-Statuswechsel (Dashboard-Kachel, Board-Buttons) */
export async function setzeAufgabeStatusAction(id: string, status: string): Promise<ActionResult> {
  const ctx = await schreibKontext()
  if ('fehler' in ctx) return { fehler: ctx.fehler }
  if (!AUFGABE_STATUS.some(s => s.value === status)) return { fehler: 'Ungültiger Status.' }
  const supabase = await createSupabaseServerClient()
  const { error } = await (supabase.from('aufgaben') as any)
    .update({ status })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
  if (error) return { fehler: error.message }
  revalidate()
  return { id }
}

/** Variante für <form action> in Server Components (Dashboard-Kachel) */
export async function statusFormAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '')
  if (!id || !status) return
  await setzeAufgabeStatusAction(id, status)
}

export async function loescheAufgabeAction(id: string): Promise<ActionResult> {
  const ctx = await schreibKontext()
  if ('fehler' in ctx) return { fehler: ctx.fehler }
  const supabase = await createSupabaseServerClient()
  const { error } = await (supabase.from('aufgaben') as any)
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
  if (error) return { fehler: error.message }
  revalidate()
  return {}
}

/** Mitglieder des aktiven Mandanten (nur id + Name) – für die Verantwortlich-Auswahl */
export async function ladeMitgliederAction(): Promise<MitgliedOption[]> {
  const membership = await getCurrentMembership()
  if (!membership) return []
  return ladeMandantMitglieder(membership.tenantId)
}
