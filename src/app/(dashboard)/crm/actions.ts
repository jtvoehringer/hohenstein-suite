'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export type ActionResult = { error?: string; id?: string }

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

/** Aktiver Mandant + Schreibrecht – wirft bei fehlender Berechtigung */
async function requireWrite(): Promise<{ tenantId: string; userId: string | null }> {
  const membership = await getCurrentMembership()
  if (!membership) throw new Error('Kein aktiver Mandant')
  if (!canWrite(membership.role)) throw new Error('Keine Berechtigung (nur Lesen)')
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { tenantId: membership.tenantId, userId: user?.id ?? null }
}

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key)
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function num(fd: FormData, key: string): number | null {
  const s = str(fd, key)
  if (s == null) return null
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function int(fd: FormData, key: string): number | null {
  const s = str(fd, key)
  if (s == null) return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key)
  return v === 'true' || v === 'on' || v === '1'
}

function fehler(err: unknown): ActionResult {
  return { error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
}

async function naechsteKundennummer(tenantId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await (supabase.rpc as any)('get_next_kundennummer', { p_tenant_id: tenantId })
  if (error) { console.error('get_next_kundennummer:', error.message); return null }
  return (data as string | null) ?? null
}

function revalidateCrm() {
  revalidatePath('/crm')
  revalidatePath('/crm/kontakte')
  revalidatePath('/crm/firmen')
  revalidatePath('/crm/pipeline')
  revalidatePath('/crm/kontakte/[id]', 'page')
  revalidatePath('/crm/firmen/[id]', 'page')
  revalidatePath('/dashboard')
}

// ── Kontakte ──────────────────────────────────────────────────────────────────

function kontaktPayload(fd: FormData): R {
  return {
    vorname:                str(fd, 'vorname'),
    nachname:               str(fd, 'nachname') ?? '',
    segment:                str(fd, 'segment') ?? 'weinbau',
    firma_id:               str(fd, 'firma_id'),
    position:               str(fd, 'position'),
    email:                  str(fd, 'email'),
    telefon_vorwahl:        str(fd, 'telefon_vorwahl') ?? '+43',
    telefon:                str(fd, 'telefon'),
    mobil_vorwahl:          str(fd, 'mobil_vorwahl') ?? '+43',
    mobil:                  str(fd, 'mobil'),
    strasse:                str(fd, 'strasse'),
    plz:                    str(fd, 'plz'),
    ort:                    str(fd, 'ort'),
    land:                   str(fd, 'land') ?? 'AT',
    geburtsdatum:           str(fd, 'geburtsdatum'),
    sprache:                str(fd, 'sprache') ?? 'de',
    ansprechpartner_intern: str(fd, 'ansprechpartner_intern'),
    is_lead:                bool(fd, 'is_lead'),
    notizen:                str(fd, 'notizen'),
  }
}

export async function createKontakt(fd: FormData): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const payload = kontaktPayload(fd)
    if (!payload.nachname) return { error: 'Nachname ist ein Pflichtfeld.' }
    payload.tenant_id = tenantId
    payload.kundennummer = await naechsteKundennummer(tenantId)
    const { data, error } = await (supabase.from('kontakte') as any)
      .insert(payload).select('id').single()
    if (error) return { error: (error as R).message }
    revalidateCrm()
    return { id: (data as R | null)?.id }
  } catch (err) { return fehler(err) }
}

export async function updateKontakt(id: string, fd: FormData): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const payload = kontaktPayload(fd)
    if (!payload.nachname) return { error: 'Nachname ist ein Pflichtfeld.' }
    const { error } = await (supabase.from('kontakte') as any)
      .update(payload).eq('id', id).eq('tenant_id', tenantId)
    if (error) return { error: (error as R).message }
    revalidateCrm()
    return { id }
  } catch (err) { return fehler(err) }
}

export async function deleteKontakt(id: string): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const { error } = await (supabase.from('kontakte') as any)
      .delete().eq('id', id).eq('tenant_id', tenantId)
    if (error) return { error: (error as R).message }
    revalidateCrm()
    return {}
  } catch (err) { return fehler(err) }
}

// ── Firmen ────────────────────────────────────────────────────────────────────

function firmaPayload(fd: FormData): R {
  return {
    name:              str(fd, 'name') ?? '',
    segment:           str(fd, 'segment') ?? 'weinbau',
    strasse:           str(fd, 'strasse'),
    plz:               str(fd, 'plz'),
    ort:               str(fd, 'ort'),
    land:              str(fd, 'land') ?? 'AT',
    betriebsstandort:  str(fd, 'betriebsstandort'),
    region:            str(fd, 'region'),
    telefon_vorwahl:   str(fd, 'telefon_vorwahl') ?? '+43',
    telefon:           str(fd, 'telefon'),
    email:             str(fd, 'email'),
    website:           str(fd, 'website'),
    uid_nummer:        str(fd, 'uid_nummer'),
    zahlungsziel_tage: int(fd, 'zahlungsziel_tage') ?? 14,
    is_lead:           bool(fd, 'is_lead'),
    ist_kunde:         fd.has('ist_kunde') ? bool(fd, 'ist_kunde') : true,
    ist_lieferant:     bool(fd, 'ist_lieferant'),
    quelle:            str(fd, 'quelle'),
    notizen:           str(fd, 'notizen'),
  }
}

export async function createFirma(fd: FormData): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const payload = firmaPayload(fd)
    if (!payload.name) return { error: 'Firmenname ist ein Pflichtfeld.' }
    payload.tenant_id = tenantId
    payload.kundennummer = await naechsteKundennummer(tenantId)
    payload.quelle = payload.quelle || 'Manuell'
    const { data, error } = await (supabase.from('firmen') as any)
      .insert(payload).select('id').single()
    if (error) return { error: (error as R).message }
    revalidateCrm()
    return { id: (data as R | null)?.id }
  } catch (err) { return fehler(err) }
}

export async function updateFirma(id: string, fd: FormData): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const payload = firmaPayload(fd)
    if (!payload.name) return { error: 'Firmenname ist ein Pflichtfeld.' }
    const { error } = await (supabase.from('firmen') as any)
      .update(payload).eq('id', id).eq('tenant_id', tenantId)
    if (error) return { error: (error as R).message }
    revalidateCrm()
    return { id }
  } catch (err) { return fehler(err) }
}

export async function deleteFirma(id: string): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const { error } = await (supabase.from('firmen') as any)
      .delete().eq('id', id).eq('tenant_id', tenantId)
    if (error) return { error: (error as R).message }
    revalidateCrm()
    return {}
  } catch (err) { return fehler(err) }
}

/** Account Manager (Team-Mitglied) einer Firma zuordnen bzw. entfernen (null). */
export async function setzeAccountManager(firmaId: string, userId: string | null): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const { error } = await (supabase.from('firmen') as any)
      .update({ account_manager: userId })
      .eq('id', firmaId).eq('tenant_id', tenantId)
    if (error) return { error: (error as R).message }
    revalidateCrm()
    return {}
  } catch (err) { return fehler(err) }
}

// ── Ansprechpartner (kontakt_firmen) ──────────────────────────────────────────

export async function addKontaktZuFirma(firmaId: string, kontaktId: string, position: string | null, hauptkontakt: boolean): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    // beide Datensätze müssen zum aktiven Mandanten gehören
    const [{ data: f }, { data: k }] = await Promise.all([
      (supabase.from('firmen') as any).select('id').eq('id', firmaId).eq('tenant_id', tenantId).maybeSingle(),
      (supabase.from('kontakte') as any).select('id').eq('id', kontaktId).eq('tenant_id', tenantId).maybeSingle(),
    ])
    if (!f || !k) return { error: 'Firma oder Kontakt nicht gefunden.' }
    const { error } = await (supabase.from('kontakt_firmen') as any)
      .upsert({ kontakt_id: kontaktId, firma_id: firmaId, position: position || null, hauptkontakt }, { onConflict: 'kontakt_id,firma_id' })
    if (error) return { error: (error as R).message }
    revalidateCrm()
    return {}
  } catch (err) { return fehler(err) }
}

export async function removeKontaktVonFirma(firmaId: string, kontaktId: string): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const { data: f } = await (supabase.from('firmen') as any).select('id').eq('id', firmaId).eq('tenant_id', tenantId).maybeSingle()
    if (!f) return { error: 'Firma nicht gefunden.' }
    const { error } = await (supabase.from('kontakt_firmen') as any)
      .delete().eq('firma_id', firmaId).eq('kontakt_id', kontaktId)
    if (error) return { error: (error as R).message }
    revalidateCrm()
    return {}
  } catch (err) { return fehler(err) }
}

// ── Aktivitäten ───────────────────────────────────────────────────────────────

function aktivitaetPayload(fd: FormData): R {
  const ganztags = fd.has('ganztags') ? bool(fd, 'ganztags') : true
  const p: R = {
    art:          str(fd, 'art') ?? 'notiz',
    betreff:      str(fd, 'betreff'),
    beschreibung: str(fd, 'beschreibung'),
    datum:        str(fd, 'datum'),
    bis_datum:    str(fd, 'bis_datum'),
    ganztags,
    uhrzeit_von:  ganztags ? null : str(fd, 'uhrzeit_von'),
    uhrzeit_bis:  ganztags ? null : str(fd, 'uhrzeit_bis'),
  }
  if (fd.has('erledigt'))   p.erledigt   = bool(fd, 'erledigt')
  if (fd.has('ist_privat')) p.ist_privat = bool(fd, 'ist_privat')
  if (fd.has('faellig_am')) p.faellig_am = str(fd, 'faellig_am')
  if (fd.has('kontakt_id')) p.kontakt_id = str(fd, 'kontakt_id')
  if (fd.has('firma_id'))   p.firma_id   = str(fd, 'firma_id')
  return p
}

// ── Serientermine: Datumsfolge für eine Wiederholungsregel erzeugen ───────────

const SERIE_REGELN: Record<string, string> = {
  taeglich: 'Täglich', woechentlich: 'Wöchentlich', zweiwoechentlich: 'Alle 2 Wochen', monatlich: 'Monatlich',
}

function datumPlus(iso: string, tage: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + tage)
  return d.toISOString().slice(0, 10)
}

/** Alle Termine der Serie ab Startdatum bis einschließlich bisDatum (max. 200 Instanzen). */
function serieDaten(start: string, regel: string, bisDatum: string): string[] {
  const out: string[] = []
  if (regel === 'monatlich') {
    // gleicher Monatstag; existiert er in einem Monat nicht (z.B. 31.), wird dieser Monat übersprungen
    const tag = Number(start.split('-')[2])
    let d = new Date(start + 'T12:00:00')
    while (out.length < 200) {
      const iso = d.toISOString().slice(0, 10)
      if (iso > bisDatum) break
      out.push(iso)
      let y = d.getFullYear(), m = d.getMonth() + 1
      for (;;) {
        if (m > 11) { m -= 12; y++ }
        const t = new Date(y, m, tag, 12)
        if (t.getMonth() === m) { d = t; break }
        m++
      }
    }
    return out
  }
  const schritt = regel === 'taeglich' ? 1 : regel === 'zweiwoechentlich' ? 14 : 7
  let iso = start
  while (iso <= bisDatum && out.length < 200) { out.push(iso); iso = datumPlus(iso, schritt) }
  return out
}

export async function createAktivitaet(fd: FormData): Promise<ActionResult> {
  try {
    const { tenantId, userId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const payload = aktivitaetPayload(fd)
    if (!payload.datum) return { error: 'Datum ist ein Pflichtfeld.' }
    if (payload.erledigt === undefined) payload.erledigt = false
    if (payload.ist_privat === undefined) payload.ist_privat = false
    payload.tenant_id    = tenantId
    payload.erstellt_von = userId

    // Serientermin: alle Instanzen bis zum Enddatum als Einzeltermine anlegen
    const regel = str(fd, 'wiederholung')
    if (regel && regel !== 'keine') {
      if (!SERIE_REGELN[regel]) return { error: 'Unbekannte Wiederholungsregel.' }
      const bis = str(fd, 'wiederholung_bis')
      if (!bis) return { error: 'Bitte ein Enddatum für die Wiederholung angeben.' }
      if (bis <= payload.datum) return { error: 'Das Enddatum der Wiederholung muss nach dem ersten Termin liegen.' }
      if (bis > datumPlus(payload.datum, 731)) return { error: 'Wiederholungen sind auf maximal 2 Jahre begrenzt.' }
      const daten = serieDaten(payload.datum, regel, bis)
      if (daten.length < 2) return { error: 'Im gewählten Zeitraum ergibt sich nur ein Termin – bitte Enddatum prüfen.' }
      const serieId = crypto.randomUUID()
      // mehrtägige Termine: Enddatum je Instanz mitverschieben
      const dauerTage = payload.bis_datum && payload.bis_datum > payload.datum
        ? Math.round((Date.parse(payload.bis_datum) - Date.parse(payload.datum)) / 86400000) : 0
      const zeilen = daten.map(d => ({
        ...payload, datum: d,
        bis_datum: dauerTage > 0 ? datumPlus(d, dauerTage) : payload.bis_datum,
        serie_id: serieId, serie_regel: SERIE_REGELN[regel],
      }))
      const { data, error } = await (supabase.from('aktivitaeten') as any)
        .insert(zeilen).select('id').limit(1)
      if (error) return { error: (error as R).message }
      revalidateCrm()
      return { id: ((data as R[] | null) ?? [])[0]?.id }
    }

    const { data, error } = await (supabase.from('aktivitaeten') as any)
      .insert(payload).select('id').single()
    if (error) return { error: (error as R).message }
    revalidateCrm()
    return { id: (data as R | null)?.id }
  } catch (err) { return fehler(err) }
}

export async function updateAktivitaet(id: string, fd: FormData): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const payload = aktivitaetPayload(fd)
    // Nur mitgesendete Felder ändern (Mini-Formulare schicken z.B. nur betreff)
    if (!fd.has('art'))          delete payload.art
    if (!fd.has('datum'))        delete payload.datum
    if (!fd.has('betreff'))      delete payload.betreff
    if (!fd.has('beschreibung')) delete payload.beschreibung
    if (!fd.has('bis_datum'))    delete payload.bis_datum
    if (!fd.has('ganztags') && !fd.has('uhrzeit_von')) {
      delete payload.ganztags; delete payload.uhrzeit_von; delete payload.uhrzeit_bis
    }
    const { error } = await (supabase.from('aktivitaeten') as any)
      .update(payload).eq('id', id).eq('tenant_id', tenantId)
    if (error) return { error: (error as R).message }
    revalidateCrm()
    return { id }
  } catch (err) { return fehler(err) }
}

/** Kalender-Drag&Drop: Datum/Uhrzeit verschieben */
export async function moveAktivitaet(id: string, datum: string, uhrzeitVon: string, uhrzeitBis: string): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const ganztags = !uhrzeitVon && !uhrzeitBis
    const { error } = await (supabase.from('aktivitaeten') as any)
      .update({ datum, ganztags, uhrzeit_von: uhrzeitVon || null, uhrzeit_bis: uhrzeitBis || null })
      .eq('id', id).eq('tenant_id', tenantId)
    if (error) return { error: (error as R).message }
    revalidateCrm()
    return { id }
  } catch (err) { return fehler(err) }
}

export async function toggleAktivitaetErledigt(id: string, erledigt: boolean): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const { error } = await (supabase.from('aktivitaeten') as any)
      .update({ erledigt }).eq('id', id).eq('tenant_id', tenantId)
    if (error) return { error: (error as R).message }
    revalidateCrm()
    return { id }
  } catch (err) { return fehler(err) }
}

export async function deleteAktivitaet(id: string): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    // zugehörige Dateien im Storage entfernen (DB-Zeilen fallen per ON DELETE CASCADE)
    const { data: doks } = await (supabase.from('aktivitaet_dokumente') as any)
      .select('storage_pfad').eq('aktivitaet_id', id).eq('tenant_id', tenantId)
    const pfade = ((doks ?? []) as R[]).map(d => d.storage_pfad as string).filter(Boolean)
    if (pfade.length > 0) await supabase.storage.from('aktivitaet-dokumente').remove(pfade)
    const { error } = await (supabase.from('aktivitaeten') as any)
      .delete().eq('id', id).eq('tenant_id', tenantId)
    if (error) return { error: (error as R).message }
    revalidateCrm()
    return {}
  } catch (err) { return fehler(err) }
}

/**
 * Serientermin löschen: alle Termine der Serie (abDiesem=false)
 * oder nur diesen und alle folgenden (abDiesem=true).
 */
export async function deleteAktivitaetSerie(id: string, abDiesem: boolean): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const { data: akt } = await (supabase.from('aktivitaeten') as any)
      .select('serie_id, datum').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
    const serieId = (akt as R | null)?.serie_id as string | null
    if (!serieId) return deleteAktivitaet(id)

    let q = (supabase.from('aktivitaeten') as any).select('id').eq('tenant_id', tenantId).eq('serie_id', serieId)
    if (abDiesem) q = q.gte('datum', (akt as R).datum)
    const { data: zeilen } = await q
    const ids = ((zeilen ?? []) as R[]).map(z => z.id as string)
    if (ids.length === 0) return {}

    // Storage-Dateien aller betroffenen Termine entfernen (DB-Zeilen fallen per ON DELETE CASCADE)
    const { data: doks } = await (supabase.from('aktivitaet_dokumente') as any)
      .select('storage_pfad').in('aktivitaet_id', ids).eq('tenant_id', tenantId)
    const pfade = ((doks ?? []) as R[]).map(d => d.storage_pfad as string).filter(Boolean)
    if (pfade.length > 0) await supabase.storage.from('aktivitaet-dokumente').remove(pfade)

    const { error } = await (supabase.from('aktivitaeten') as any)
      .delete().eq('tenant_id', tenantId).in('id', ids)
    if (error) return { error: (error as R).message }
    revalidateCrm()
    return {}
  } catch (err) { return fehler(err) }
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

function pipelinePayload(fd: FormData): R {
  const ganztags = fd.has('ganztags') ? bool(fd, 'ganztags') : true
  const wahrscheinlichkeit = int(fd, 'wahrscheinlichkeit')
  return {
    titel:              str(fd, 'titel') ?? '',
    stufe:              str(fd, 'stufe') ?? 'interessent',
    kontakt_id:         str(fd, 'kontakt_id'),
    firma_id:           str(fd, 'firma_id'),
    kategorie:          str(fd, 'kategorie'),
    wert_euro:          num(fd, 'wert_euro'),
    wahrscheinlichkeit: wahrscheinlichkeit == null ? null : Math.min(100, Math.max(0, wahrscheinlichkeit)),
    erwartetes_datum:   str(fd, 'erwartetes_datum'),
    notizen:            str(fd, 'notizen'),
    ganztags,
    uhrzeit_von:        ganztags ? null : str(fd, 'uhrzeit_von'),
    uhrzeit_bis:        ganztags ? null : str(fd, 'uhrzeit_bis'),
  }
}

async function protokolliereStufe(pipelineId: string, von: string | null, nach: string, userId: string | null, notizen?: string | null) {
  const supabase = await createSupabaseServerClient()
  const { error } = await (supabase.from('pipeline_verlauf') as any).insert({
    pipeline_id: pipelineId, stufe_von: von, stufe_nach: nach, geaendert_von: userId, notizen: notizen ?? null,
  })
  if (error) console.error('pipeline_verlauf:', (error as R).message)
}

export async function createPipelineEintrag(fd: FormData): Promise<ActionResult> {
  try {
    const { tenantId, userId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const payload = pipelinePayload(fd)
    if (!payload.titel) return { error: 'Titel ist ein Pflichtfeld.' }
    payload.tenant_id = tenantId
    const { data, error } = await (supabase.from('pipeline_eintraege') as any)
      .insert(payload).select('id').single()
    if (error) return { error: (error as R).message }
    const id = (data as R | null)?.id as string | undefined
    if (id) await protokolliereStufe(id, null, payload.stufe, userId, 'Angelegt')
    revalidateCrm()
    return { id }
  } catch (err) { return fehler(err) }
}

export async function updatePipelineEintrag(id: string, fd: FormData): Promise<ActionResult> {
  try {
    const { tenantId, userId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const payload = pipelinePayload(fd)
    if (!payload.titel) return { error: 'Titel ist ein Pflichtfeld.' }
    if (!fd.has('stufe')) delete payload.stufe
    if (!fd.has('kontakt_id')) delete payload.kontakt_id
    if (!fd.has('firma_id')) delete payload.firma_id

    let stufeVorher: string | null = null
    if (payload.stufe) {
      const { data: alt } = await (supabase.from('pipeline_eintraege') as any)
        .select('stufe').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
      stufeVorher = (alt as R | null)?.stufe ?? null
    }
    const { error } = await (supabase.from('pipeline_eintraege') as any)
      .update(payload).eq('id', id).eq('tenant_id', tenantId)
    if (error) return { error: (error as R).message }
    if (payload.stufe && stufeVorher && stufeVorher !== payload.stufe) {
      await protokolliereStufe(id, stufeVorher, payload.stufe, userId)
    }
    revalidateCrm()
    return { id }
  } catch (err) { return fehler(err) }
}

export async function updatePipelineStufe(id: string, stufe: string, notizen?: string | null): Promise<ActionResult> {
  try {
    const { tenantId, userId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const { data: alt } = await (supabase.from('pipeline_eintraege') as any)
      .select('stufe').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
    if (!alt) return { error: 'Eintrag nicht gefunden.' }
    const stufeVorher = (alt as R).stufe as string
    if (stufeVorher === stufe) return { id }
    const { error } = await (supabase.from('pipeline_eintraege') as any)
      .update({ stufe }).eq('id', id).eq('tenant_id', tenantId)
    if (error) return { error: (error as R).message }
    await protokolliereStufe(id, stufeVorher, stufe, userId, notizen)
    revalidateCrm()
    return { id }
  } catch (err) { return fehler(err) }
}

export async function togglePipelineErledigt(id: string, erledigt: boolean): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const { error } = await (supabase.from('pipeline_eintraege') as any)
      .update({ erledigt, erledigt_am: erledigt ? new Date().toISOString() : null })
      .eq('id', id).eq('tenant_id', tenantId)
    if (error) return { error: (error as R).message }
    revalidateCrm()
    return { id }
  } catch (err) { return fehler(err) }
}

export async function deletePipelineEintrag(id: string): Promise<ActionResult> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const { error } = await (supabase.from('pipeline_eintraege') as any)
      .delete().eq('id', id).eq('tenant_id', tenantId)
    if (error) return { error: (error as R).message }
    revalidateCrm()
    return {}
  } catch (err) { return fehler(err) }
}

// ── Visitenkarten-Scan: erkannten Kontakt als Lead anlegen ────────────────────
// (portiert aus software:112) Firma wird über den Namen wiederverwendet statt
// doppelt angelegt; Kundennummern kommen aus dem Nummernkreis.

export type VisitenkartenKontakt = {
  vorname: string | null
  nachname: string | null
  firma: string | null
  position: string | null
  email: string | null
  telefon: string | null
  mobil: string | null
  strasse: string | null
  plz: string | null
  ort: string | null
  land: string | null
  website: string | null
}

export async function createLeadAusVisitenkarte(kontakt: VisitenkartenKontakt): Promise<{ kontaktId?: string; error?: string }> {
  try {
    const { tenantId } = await requireWrite()
    const supabase = await createSupabaseServerClient()
    const land = /^[A-Za-z]{2}$/.test(kontakt.land ?? '') ? kontakt.land!.toUpperCase() : 'AT'

    // Firma: vorhandene über den Namen wiederverwenden, sonst als Lead anlegen
    let firmaId: string | null = null
    const firmaName = (kontakt.firma ?? '').trim()
    if (firmaName) {
      const { data: vorhanden } = await (supabase.from('firmen') as any)
        .select('id').eq('tenant_id', tenantId).ilike('name', firmaName).limit(1).maybeSingle()
      firmaId = (vorhanden as R | null)?.id ?? null
      if (!firmaId) {
        const { data: f, error: firmaError } = await (supabase.from('firmen') as any).insert({
          tenant_id: tenantId, kundennummer: await naechsteKundennummer(tenantId),
          name: firmaName, segment: 'weinbau', aktiv: true, is_lead: true, ist_kunde: false,
          strasse: kontakt.strasse || null, plz: kontakt.plz || null, ort: kontakt.ort || null, land,
          website: kontakt.website || null,
          quelle: 'Visitenkarten-Scan',
          notizen: 'Angelegt über Visitenkarten-Scan',
        }).select('id').single()
        if (firmaError) return { error: (firmaError as R).message }
        firmaId = (f as R | null)?.id ?? null
      }
    }

    const { data: k, error: kontaktError } = await (supabase.from('kontakte') as any).insert({
      tenant_id: tenantId, kundennummer: await naechsteKundennummer(tenantId),
      vorname: kontakt.vorname || null,
      nachname: (kontakt.nachname || '').trim() || '(unbekannt)',
      segment: 'weinbau',
      position: kontakt.position || null,
      email: kontakt.email || null,
      telefon: kontakt.telefon || null,
      mobil: kontakt.mobil || null,
      strasse: kontakt.strasse || null,
      plz: kontakt.plz || null,
      ort: kontakt.ort || null,
      land,
      firma_id: firmaId,
      is_lead: true, aktiv: true,
      notizen: 'Angelegt über Visitenkarten-Scan',
    }).select('id').single()
    if (kontaktError) return { error: (kontaktError as R).message }
    revalidateCrm()
    return { kontaktId: (k as R | null)?.id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}
