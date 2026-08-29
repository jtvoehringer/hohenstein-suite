'use server'

// ── Server Actions: CSV-Import für Firmen und Kontakte ────────────────────────
// Der Client schickt bereits zugeordnete Zeilen ({ feldKey: wert }) in Paketen.
// Hier passiert die verbindliche Prüfung, Duplikat-Erkennung und das Schreiben.
// Duplikate: Firmen über UID-Nummer, sonst Name (Groß-/Kleinschreibung egal);
// Kontakte über E-Mail, sonst Vorname + Nachname.

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { normBool, normDatum, normLand, normSegment, type ImportTyp } from '@/lib/crm/importCsv'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export type ImportOptionen = {
  /** Was mit erkannten Duplikaten passiert */
  duplikate: 'ueberspringen' | 'aktualisieren'
  /** Nur Kontakte: unbekannte Firmennamen automatisch als Firma anlegen */
  firmenAnlegen: boolean
}

export type ZeilenErgebnis = {
  zeile: number
  status: 'angelegt' | 'aktualisiert' | 'uebersprungen' | 'fehler'
  hinweis: string | null
}

export type ImportErgebnis = { ok: true; ergebnisse: ZeilenErgebnis[] } | { ok: false; error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const norm = (s: unknown) => String(s ?? '').trim()
const ci = (s: unknown) => norm(s).toLowerCase()

async function getCtx() {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) throw new Error('Kein aktiver Mandant')
  if (!canWrite(membership.role)) throw new Error('Keine Berechtigung – nur Admins und Mitarbeiter dürfen importieren.')
  return { supabase, tenantId: membership.tenantId }
}

async function naechsteKundennummer(supabase: R, tenantId: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('get_next_kundennummer', { p_tenant_id: tenantId })
  if (error) return null
  return (data as string | null) ?? null
}

/** Ein Paket Zeilen importieren (der Client ruft das gestückelt mit je ≤ 100 Zeilen auf) */
export async function importiereZeilen(typ: ImportTyp, zeilen: { zeile: number; werte: Record<string, string> }[], optionen: ImportOptionen): Promise<ImportErgebnis> {
  try {
    const { supabase, tenantId } = await getCtx()
    if (!Array.isArray(zeilen) || zeilen.length === 0) return { ok: true, ergebnisse: [] }
    if (zeilen.length > 200) return { ok: false, error: 'Zu viele Zeilen in einem Paket (max. 200).' }

    const ergebnisse: ZeilenErgebnis[] = typ === 'firmen'
      ? await importiereFirmen(supabase, tenantId, zeilen, optionen)
      : await importiereKontakte(supabase, tenantId, zeilen, optionen)

    revalidatePath('/crm')
    revalidatePath('/crm/firmen')
    revalidatePath('/crm/kontakte')
    revalidatePath('/dashboard')
    return { ok: true, ergebnisse }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Firmen ────────────────────────────────────────────────────────────────────

function firmaWerte(w: Record<string, string>): R {
  const seg = normSegment(w.segment ?? '')
  const ziel = parseInt(w.zahlungsziel_tage ?? '', 10)
  return {
    name:              norm(w.name),
    segment:           seg.wert,
    strasse:           norm(w.strasse) || null,
    plz:               norm(w.plz) || null,
    ort:               norm(w.ort) || null,
    land:              normLand(w.land ?? ''),
    telefon:           norm(w.telefon) || null,
    email:             EMAIL_RE.test(ci(w.email)) ? ci(w.email) : null,
    website:           norm(w.website) || null,
    uid_nummer:        norm(w.uid_nummer).replace(/\s+/g, '').toUpperCase() || null,
    zahlungsziel_tage: Number.isFinite(ziel) && ziel >= 0 && ziel <= 365 ? ziel : 14,
    ist_kunde:         normBool(w.ist_kunde ?? '', true),
    ist_lieferant:     normBool(w.ist_lieferant ?? '', false),
    is_lead:           normBool(w.is_lead ?? '', false),
    notizen:           norm(w.notizen) || null,
  }
}

async function importiereFirmen(supabase: R, tenantId: string, zeilen: { zeile: number; werte: Record<string, string> }[], opt: ImportOptionen): Promise<ZeilenErgebnis[]> {
  const { data: vorhandenRaw } = await (supabase.from('firmen') as R)
    .select('id, name, uid_nummer').eq('tenant_id', tenantId)
  const nachName = new Map<string, string>()
  const nachUid  = new Map<string, string>()
  for (const f of (vorhandenRaw ?? []) as R[]) {
    if (f.name) nachName.set(ci(f.name), f.id)
    if (f.uid_nummer) nachUid.set(ci(String(f.uid_nummer).replace(/\s+/g, '')), f.id)
  }

  const ergebnisse: ZeilenErgebnis[] = []
  for (const z of zeilen) {
    const werte = firmaWerte(z.werte)
    if (!werte.name) { ergebnisse.push({ zeile: z.zeile, status: 'fehler', hinweis: 'Firmenname fehlt' }); continue }

    const duplikatId = (werte.uid_nummer && nachUid.get(ci(werte.uid_nummer))) || nachName.get(ci(werte.name)) || null
    if (duplikatId) {
      if (opt.duplikate === 'ueberspringen') {
        ergebnisse.push({ zeile: z.zeile, status: 'uebersprungen', hinweis: `„${werte.name}" existiert bereits` })
        continue
      }
      // Aktualisieren: nur Felder überschreiben, für die die CSV einen Wert liefert
      const patch: R = {}
      for (const [k, v] of Object.entries(werte)) {
        if (k === 'name') { patch.name = v; continue }
        const roh = z.werte[k === 'uid_nummer' ? 'uid_nummer' : k]
        if (typeof roh === 'string' && roh.trim() !== '') patch[k] = v
      }
      const { error } = await (supabase.from('firmen') as R).update(patch).eq('id', duplikatId).eq('tenant_id', tenantId)
      ergebnisse.push(error
        ? { zeile: z.zeile, status: 'fehler', hinweis: (error as R).message }
        : { zeile: z.zeile, status: 'aktualisiert', hinweis: werte.name })
      continue
    }

    const kundennummer = norm(z.werte.kundennummer) || await naechsteKundennummer(supabase, tenantId)
    const { data, error } = await (supabase.from('firmen') as R)
      .insert({ ...werte, tenant_id: tenantId, kundennummer, aktiv: true }).select('id').single()
    if (error) {
      ergebnisse.push({ zeile: z.zeile, status: 'fehler', hinweis: (error as R).message })
    } else {
      nachName.set(ci(werte.name), (data as R).id)
      if (werte.uid_nummer) nachUid.set(ci(werte.uid_nummer), (data as R).id)
      ergebnisse.push({ zeile: z.zeile, status: 'angelegt', hinweis: werte.name })
    }
  }
  return ergebnisse
}

// ── Kontakte ──────────────────────────────────────────────────────────────────

function kontaktWerte(w: Record<string, string>): R {
  const seg = normSegment(w.segment ?? '')
  return {
    vorname:      norm(w.vorname) || null,
    nachname:     norm(w.nachname),
    segment:      seg.wert,
    position:     norm(w.position) || null,
    email:        EMAIL_RE.test(ci(w.email)) ? ci(w.email) : null,
    telefon:      norm(w.telefon) || null,
    mobil:        norm(w.mobil) || null,
    strasse:      norm(w.strasse) || null,
    plz:          norm(w.plz) || null,
    ort:          norm(w.ort) || null,
    land:         normLand(w.land ?? ''),
    geburtsdatum: normDatum(w.geburtsdatum ?? ''),
    notizen:      norm(w.notizen) || null,
    is_lead:      false,
  }
}

async function importiereKontakte(supabase: R, tenantId: string, zeilen: { zeile: number; werte: Record<string, string> }[], opt: ImportOptionen): Promise<ZeilenErgebnis[]> {
  const [{ data: kontakteRaw }, { data: firmenRaw }] = await Promise.all([
    (supabase.from('kontakte') as R).select('id, vorname, nachname, email').eq('tenant_id', tenantId),
    (supabase.from('firmen') as R).select('id, name').eq('tenant_id', tenantId),
  ])
  const nachEmail = new Map<string, string>()
  const nachNamen = new Map<string, string>()
  for (const k of (kontakteRaw ?? []) as R[]) {
    if (k.email) nachEmail.set(ci(k.email), k.id)
    nachNamen.set(ci(`${k.vorname ?? ''}|${k.nachname ?? ''}`), k.id)
  }
  const firmaNachName = new Map<string, string>()
  for (const f of (firmenRaw ?? []) as R[]) if (f.name) firmaNachName.set(ci(f.name), f.id)

  const ergebnisse: ZeilenErgebnis[] = []
  for (const z of zeilen) {
    const werte = kontaktWerte(z.werte)
    if (!werte.nachname) { ergebnisse.push({ zeile: z.zeile, status: 'fehler', hinweis: 'Nachname fehlt' }); continue }

    // Firma über den Namen auflösen (bei Bedarf anlegen)
    let firmaHinweis = ''
    const firmaName = norm(z.werte.firma)
    let firmaId: string | null = null
    if (firmaName) {
      firmaId = firmaNachName.get(ci(firmaName)) ?? null
      if (!firmaId && opt.firmenAnlegen) {
        const kundennummer = await naechsteKundennummer(supabase, tenantId)
        const { data: nf, error: fErr } = await (supabase.from('firmen') as R)
          .insert({ tenant_id: tenantId, name: firmaName, segment: werte.segment, kundennummer, is_lead: false, aktiv: true })
          .select('id').single()
        if (!fErr && nf) {
          firmaId = (nf as R).id
          firmaNachName.set(ci(firmaName), firmaId!)
          firmaHinweis = ` (Firma „${firmaName}" neu angelegt)`
        }
      } else if (!firmaId) {
        firmaHinweis = ` (Firma „${firmaName}" nicht gefunden – ohne Verknüpfung)`
      }
    }

    const anzeigeName = [werte.vorname, werte.nachname].filter(Boolean).join(' ')
    const duplikatId = (werte.email && nachEmail.get(ci(werte.email))) || nachNamen.get(ci(`${werte.vorname ?? ''}|${werte.nachname}`)) || null
    if (duplikatId) {
      if (opt.duplikate === 'ueberspringen') {
        ergebnisse.push({ zeile: z.zeile, status: 'uebersprungen', hinweis: `„${anzeigeName}" existiert bereits` })
        continue
      }
      const patch: R = {}
      for (const [k, v] of Object.entries(werte)) {
        if (k === 'nachname') { patch.nachname = v; continue }
        if (k === 'is_lead') continue
        const roh = z.werte[k]
        if (typeof roh === 'string' && roh.trim() !== '') patch[k] = v
      }
      if (firmaId) patch.firma_id = firmaId
      const { error } = await (supabase.from('kontakte') as R).update(patch).eq('id', duplikatId).eq('tenant_id', tenantId)
      ergebnisse.push(error
        ? { zeile: z.zeile, status: 'fehler', hinweis: (error as R).message }
        : { zeile: z.zeile, status: 'aktualisiert', hinweis: anzeigeName + firmaHinweis })
      continue
    }

    const kundennummer = norm(z.werte.kundennummer) || await naechsteKundennummer(supabase, tenantId)
    const { data, error } = await (supabase.from('kontakte') as R)
      .insert({ ...werte, tenant_id: tenantId, firma_id: firmaId, kundennummer, aktiv: true }).select('id').single()
    if (error) {
      ergebnisse.push({ zeile: z.zeile, status: 'fehler', hinweis: (error as R).message })
    } else {
      if (werte.email) nachEmail.set(ci(werte.email), (data as R).id)
      nachNamen.set(ci(`${werte.vorname ?? ''}|${werte.nachname}`), (data as R).id)
      ergebnisse.push({ zeile: z.zeile, status: 'angelegt', hinweis: anzeigeName + firmaHinweis })
    }
  }
  return ergebnisse
}
