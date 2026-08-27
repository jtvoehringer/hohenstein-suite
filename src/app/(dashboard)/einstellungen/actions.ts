'use server'

// ── Server Actions: Mandanteneinstellungen (nur admin) ───────────────────────
// Ziel-Mandant ausschließlich aus getCurrentMembership(); Spalten lt.
// Migration 001_grundgeruest.sql (tenant_einstellungen). Schreiben über den
// normalen Server-Client – die RLS-Policies erlauben insert/update für admin.

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canAdmin } from '@/lib/auth/roles'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export type ActionResult = { fehler?: string; ok?: boolean; logo_url?: string | null }

async function adminKontext(): Promise<{ tenantId: string } | { fehler: string }> {
  const membership = await getCurrentMembership()
  if (!membership) return { fehler: 'Kein aktiver Mandant' }
  if (!canAdmin(membership.role)) return { fehler: 'Keine Berechtigung' }
  return { tenantId: membership.tenantId }
}

function revalidate() {
  revalidatePath('/einstellungen')
  revalidatePath('/', 'layout') // Anzeigename/Logo in der Kopfleiste
}

const text = (fd: FormData, key: string) => (String(fd.get(key) ?? '').trim() || null)
const ganzzahl = (fd: FormData, key: string, min: number, max: number, fallback: number | null) => {
  const v = String(fd.get(key) ?? '').trim()
  if (!v) return fallback
  const n = parseInt(v, 10)
  if (Number.isNaN(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Präfix für Belegnummern: Buchstaben/Ziffern, max. 6 Zeichen, Großschreibung */
const praefix = (fd: FormData, key: string, fallback: string) => {
  const v = String(fd.get(key) ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  return v || fallback
}

export async function einstellungenSpeichernAction(formData: FormData): Promise<ActionResult> {
  const ctx = await adminKontext()
  if ('fehler' in ctx) return { fehler: ctx.fehler }

  const ust = Number(String(formData.get('ust_satz_standard') ?? '20').replace(',', '.'))
  const modus = String(formData.get('ea_buchung_modus') ?? 'brutto')
  const uva = String(formData.get('ea_uva_zeitraum') ?? 'quartalsweise')
  const beginn = String(formData.get('ea_betriebsbeginn') ?? '')

  const werte: R = {
    tenant_id:               ctx.tenantId,
    anzeigename:             text(formData, 'anzeigename'),
    betrieb_name:            text(formData, 'betrieb_name'),
    betrieb_strasse:         text(formData, 'betrieb_strasse'),
    betrieb_plz:             text(formData, 'betrieb_plz'),
    betrieb_ort:             text(formData, 'betrieb_ort'),
    betrieb_telefon:         text(formData, 'betrieb_telefon'),
    betrieb_email:           text(formData, 'betrieb_email'),
    betrieb_website:         text(formData, 'betrieb_website'),
    betrieb_uid:             text(formData, 'betrieb_uid'),
    betrieb_steuernummer:    text(formData, 'betrieb_steuernummer'),
    betrieb_iban:            text(formData, 'betrieb_iban')?.replace(/\s+/g, ' ') ?? null,
    betrieb_bic:             text(formData, 'betrieb_bic'),
    kunden_prefix:           text(formData, 'kunden_prefix') ?? 'K',
    kunden_stellen:          ganzzahl(formData, 'kunden_stellen', 1, 10, 4),
    ust_satz_standard:       [0, 10, 13, 20].includes(ust) ? ust : 20,
    ea_buchung_modus:        modus === 'netto' ? 'netto' : 'brutto',
    ea_kleinunternehmer:     formData.get('ea_kleinunternehmer') === 'on',
    ea_uva_zeitraum:         uva === 'monatlich' ? 'monatlich' : 'quartalsweise',
    ea_betriebsbeginn:       /^\d{4}-\d{2}-\d{2}$/.test(beginn) ? beginn : null,
    session_timeout_minuten: ganzzahl(formData, 'session_timeout_minuten', 5, 1440, null),
    fristen_vorwarnung_tage: ganzzahl(formData, 'fristen_vorwarnung_tage', 1, 365, 30),
    // Fakturierung: Nummernkreise, Zahlungsziel, Standardtexte
    rechnung_prefix:         praefix(formData, 'rechnung_prefix', 'RE'),
    angebot_prefix:          praefix(formData, 'angebot_prefix', 'AN'),
    gutschrift_prefix:       praefix(formData, 'gutschrift_prefix', 'GS'),
    rechnung_stellen:        ganzzahl(formData, 'rechnung_stellen', 1, 8, 4),
    rechnung_zaehler:        ganzzahl(formData, 'rechnung_zaehler', 1, 999999, 1),
    angebot_zaehler:         ganzzahl(formData, 'angebot_zaehler', 1, 999999, 1),
    gutschrift_zaehler:      ganzzahl(formData, 'gutschrift_zaehler', 1, 999999, 1),
    rechnung_nummer_mit_jahr: formData.get('rechnung_nummer_mit_jahr') === 'on',
    rechnung_zahlungsziel:   ganzzahl(formData, 'rechnung_zahlungsziel', 0, 365, 14),
    rechnung_einleitung_std: text(formData, 'rechnung_einleitung_std'),
    rechnung_schluss_std:    text(formData, 'rechnung_schluss_std'),
    rechnung_fusstext:       text(formData, 'rechnung_fusstext'),
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await (supabase.from('tenant_einstellungen') as any).upsert(werte, { onConflict: 'tenant_id' })
  if (error) return { fehler: error.message }
  revalidate()
  revalidatePath('/rechnungen')
  return { ok: true }
}

const LOGO_MAX_BYTES = 2 * 1024 * 1024
const LOGO_TYPEN: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' }

/** Alte Logo-Dateien im Mandantenordner entfernen (logo.<ext>) */
async function alteLogosEntfernen(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, tenantId: string) {
  const { data: dateien } = await supabase.storage.from('mandant-logos').list(tenantId)
  const alte = (dateien ?? []).filter(d => /^logo\.[a-z0-9]+$/i.test(d.name)).map(d => `${tenantId}/${d.name}`)
  if (alte.length > 0) await supabase.storage.from('mandant-logos').remove(alte)
}

export async function logoHochladenAction(formData: FormData): Promise<ActionResult> {
  const ctx = await adminKontext()
  if ('fehler' in ctx) return { fehler: ctx.fehler }

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { fehler: 'Keine Datei ausgewählt.' }
  if (file.size > LOGO_MAX_BYTES) return { fehler: 'Datei zu groß (max. 2 MB).' }
  const ext = LOGO_TYPEN[file.type]
  if (!ext) return { fehler: 'Nur PNG, JPG, WebP oder SVG erlaubt.' }

  const supabase = await createSupabaseServerClient()
  await alteLogosEntfernen(supabase, ctx.tenantId)

  const pfad = `${ctx.tenantId}/logo.${ext}`
  const { error: upErr } = await supabase.storage.from('mandant-logos')
    .upload(pfad, file, { contentType: file.type, upsert: true, cacheControl: '60' })
  if (upErr) return { fehler: upErr.message }

  const { data: pub } = supabase.storage.from('mandant-logos').getPublicUrl(pfad)
  const url = `${pub.publicUrl}?v=${Date.now()}`
  const { error } = await (supabase.from('tenant_einstellungen') as any)
    .upsert({ tenant_id: ctx.tenantId, logo_url: url }, { onConflict: 'tenant_id' })
  if (error) return { fehler: error.message }
  revalidate()
  return { ok: true, logo_url: url }
}

export async function logoEntfernenAction(): Promise<ActionResult> {
  const ctx = await adminKontext()
  if ('fehler' in ctx) return { fehler: ctx.fehler }
  const supabase = await createSupabaseServerClient()
  await alteLogosEntfernen(supabase, ctx.tenantId)
  const { error } = await (supabase.from('tenant_einstellungen') as any)
    .upsert({ tenant_id: ctx.tenantId, logo_url: null }, { onConflict: 'tenant_id' })
  if (error) return { fehler: error.message }
  revalidate()
  return { ok: true, logo_url: null }
}
