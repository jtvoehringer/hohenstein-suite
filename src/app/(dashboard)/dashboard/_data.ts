// ── Datenladen für die Übersicht (server-only) ───────────────────────────────
// Alle Abfragen mandantengescopt über tenantId aus getCurrentMembership().
// Spalten geprüft gegen 002_crm.sql, 003_ea.sql, 004_aufgaben_email.sql.

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { heuteIso, MONATE_KURZ } from '@/lib/format'
import { monatVorBeginn } from '@/lib/ea/betriebsbeginn'
import { PIPELINE_STUFEN } from '@/lib/crm/types'
import type { AufgabeRow } from '@/lib/aufgaben/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type R = Record<string, any>

export type MonatsWert = { key: string; label: string; einnahmen: number; ausgaben: number }
export type PipelineStufeWert = { stufe: string; label: string; summe: number; anzahl: number }
export type Termin = { id: string; datum: string; uhrzeit_von: string | null; uhrzeit_bis: string | null; ganztags: boolean; art: string; betreff: string | null; wer: string | null }
export type Buchung = { id: string; datum: string; typ: 'einnahme' | 'ausgabe'; beschreibung: string; betrag_brutto: number; firma: string | null; belegnummer: string | null }
export type HinweisEintrag = { key: string; text: string; href: string; tone: 'warn' | 'err' }

export type DashboardDaten = {
  heute: string
  kpi: {
    einnahmenMonat: number
    ausgabenMonat: number
    ergebnisJahr: number
    einnahmenJahr: number
    ausgabenJahr: number
    pipelineSumme: number
    pipelineAnzahl: number
    aufgabenOffen: number
    aufgabenUeberfaellig: number
  }
  monate: MonatsWert[]
  pipeline: PipelineStufeWert[]
  termine: Termin[]
  buchungen: Buchung[]
  aufgaben: AufgabeRow[]
  hinweise: HinweisEintrag[]
}

function isoTag(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function ladeDashboard(tenantId: string): Promise<DashboardDaten> {
  const supabase = await createSupabaseServerClient()
  const q = (t: string) => (supabase.from(t) as any)

  const jetzt = new Date()
  const heute = heuteIso()
  const jahr = jetzt.getFullYear()
  const monat = jetzt.getMonth() // 0-basiert
  const jahresStart = `${jahr}-01-01`
  const sechsMonateStart = new Date(jahr, monat - 5, 1)
  const ladenAb = isoTag(sechsMonateStart) < jahresStart ? isoTag(sechsMonateStart) : jahresStart
  const in7 = new Date(jetzt); in7.setDate(in7.getDate() + 7)
  const vor7Tagen = new Date(Date.now() - 7 * 86400000).toISOString()

  // Vormonat (für offenen Monatsabschluss)
  const vormonat = new Date(jahr, monat - 1, 1)
  const vmJahr = vormonat.getFullYear()
  const vmMonat = vormonat.getMonth() + 1

  const [
    { data: transaktionen },
    { data: pipeline },
    { data: aufgaben },
    { data: termine },
    { data: letzte },
    { data: abschluss },
    { count: daFehler },
    { data: einstellungen },
  ] = await Promise.all([
    q('ea_transaktionen').select('typ, datum, betrag_netto').eq('tenant_id', tenantId).gte('datum', ladenAb).lte('datum', heute),
    q('pipeline_eintraege').select('stufe, wert_euro').eq('tenant_id', tenantId).eq('erledigt', false).neq('stufe', 'verloren'),
    q('aufgaben')
      .select('id, titel, beschreibung, status, prioritaet, verantwortlich_id, faellig_am, kontakt_id, firma_id, bereich, erledigt_am, erstellt_von, erstellt_am, aktualisiert_am')
      .eq('tenant_id', tenantId)
      .or(`status.neq.erledigt,erledigt_am.gte.${vor7Tagen}`)
      .order('faellig_am', { ascending: true, nullsFirst: false })
      .order('erstellt_am', { ascending: false })
      .limit(60),
    q('aktivitaeten')
      .select('id, datum, uhrzeit_von, uhrzeit_bis, ganztags, art, betreff, kontakte(vorname, nachname), firmen(name)')
      .eq('tenant_id', tenantId).eq('erledigt', false)
      .gte('datum', heute).lte('datum', isoTag(in7))
      .order('datum').order('uhrzeit_von', { nullsFirst: true }).limit(8),
    q('ea_transaktionen')
      .select('id, datum, typ, beschreibung, betrag_brutto, belegnummer, firmen(name)')
      .eq('tenant_id', tenantId)
      .order('datum', { ascending: false }).order('erstellt_am', { ascending: false }).limit(5),
    q('ea_monatsabschluss').select('id').eq('tenant_id', tenantId).eq('jahr', vmJahr).eq('monat', vmMonat).limit(1).maybeSingle(),
    q('ea_dauerauftrag_log').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'fehler').gte('erstellt_am', vor7Tagen),
    q('tenant_einstellungen').select('ea_betriebsbeginn').eq('tenant_id', tenantId).maybeSingle(),
  ])

  // ── E&A: Monat, Jahr, letzte 6 Monate ──────────────────────────────────────
  const monatsKeys: MonatsWert[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(jahr, monat - i, 1)
    monatsKeys.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONATE_KURZ[d.getMonth()], einnahmen: 0, ausgaben: 0 })
  }
  const monatsMap = new Map(monatsKeys.map(m => [m.key, m]))
  const aktKey = `${jahr}-${String(monat + 1).padStart(2, '0')}`
  let einnahmenMonat = 0, ausgabenMonat = 0, einnahmenJahr = 0, ausgabenJahr = 0
  for (const t of (transaktionen ?? []) as R[]) {
    const betrag = Number(t.betrag_netto) || 0
    const key = String(t.datum).slice(0, 7)
    const ist = t.typ === 'einnahme'
    const m = monatsMap.get(key)
    if (m) { if (ist) m.einnahmen += betrag; else m.ausgaben += betrag }
    if (key === aktKey) { if (ist) einnahmenMonat += betrag; else ausgabenMonat += betrag }
    if (String(t.datum) >= jahresStart) { if (ist) einnahmenJahr += betrag; else ausgabenJahr += betrag }
  }

  // ── Pipeline nach Stufe ────────────────────────────────────────────────────
  const stufenMap = new Map<string, PipelineStufeWert>()
  for (const s of PIPELINE_STUFEN) {
    if (s.value === 'verloren') continue
    stufenMap.set(s.value, { stufe: s.value, label: s.label, summe: 0, anzahl: 0 })
  }
  let pipelineSumme = 0, pipelineAnzahl = 0
  for (const p of (pipeline ?? []) as R[]) {
    const w = Number(p.wert_euro) || 0
    pipelineSumme += w; pipelineAnzahl += 1
    const s = stufenMap.get(p.stufe)
    if (s) { s.summe += w; s.anzahl += 1 }
  }

  // ── Aufgaben ───────────────────────────────────────────────────────────────
  const aufgabenRows = (aufgaben ?? []) as AufgabeRow[]
  const aufgabenOffen = aufgabenRows.filter(a => a.status !== 'erledigt').length
  const aufgabenUeberfaellig = aufgabenRows.filter(a => a.status !== 'erledigt' && a.faellig_am && a.faellig_am < heute).length

  // ── Termine ────────────────────────────────────────────────────────────────
  const termineRows: Termin[] = ((termine ?? []) as R[]).map(t => {
    const k = t.kontakte as R | null
    const f = t.firmen as R | null
    const wer = [k ? [k.vorname, k.nachname].filter(Boolean).join(' ') : null, f?.name].filter(Boolean).join(' · ') || null
    return {
      id: t.id, datum: t.datum, uhrzeit_von: t.uhrzeit_von ? String(t.uhrzeit_von).slice(0, 5) : null,
      uhrzeit_bis: t.uhrzeit_bis ? String(t.uhrzeit_bis).slice(0, 5) : null,
      ganztags: !!t.ganztags, art: t.art, betreff: t.betreff, wer,
    }
  })

  // ── Letzte Buchungen ───────────────────────────────────────────────────────
  const buchungen: Buchung[] = ((letzte ?? []) as R[]).map(b => ({
    id: b.id, datum: b.datum, typ: b.typ, beschreibung: b.beschreibung,
    betrag_brutto: Number(b.betrag_brutto) || 0, belegnummer: b.belegnummer ?? null,
    firma: (b.firmen as R | null)?.name ?? null,
  }))

  // ── Hinweise ───────────────────────────────────────────────────────────────
  const hinweise: HinweisEintrag[] = []
  const betriebsbeginn = (einstellungen as R | null)?.ea_betriebsbeginn ?? null
  if (!abschluss && !monatVorBeginn(vmJahr, vmMonat, betriebsbeginn)) {
    hinweise.push({
      key: 'monatsabschluss',
      text: `Monatsabschluss ${MONATE_KURZ[vmMonat - 1]} ${vmJahr} ist noch offen.`,
      href: '/buchhaltung/monatsabschluss', tone: 'warn',
    })
  }
  if ((daFehler ?? 0) > 0) {
    hinweise.push({
      key: 'dauerauftraege',
      text: `${daFehler} Dauerauftrag${daFehler === 1 ? '' : 'släufe'} mit Fehler in den letzten 7 Tagen.`,
      href: '/buchhaltung/dauerauftraege', tone: 'err',
    })
  }
  if (aufgabenUeberfaellig > 0) {
    hinweise.push({
      key: 'ueberfaellig',
      text: `${aufgabenUeberfaellig} Aufgabe${aufgabenUeberfaellig === 1 ? '' : 'n'} überfällig.`,
      href: '/aufgaben?ueberfaellig=1', tone: 'err',
    })
  }

  return {
    heute,
    kpi: {
      einnahmenMonat, ausgabenMonat, ergebnisJahr: einnahmenJahr - ausgabenJahr, einnahmenJahr, ausgabenJahr,
      pipelineSumme, pipelineAnzahl, aufgabenOffen, aufgabenUeberfaellig,
    },
    monate: monatsKeys,
    pipeline: [...stufenMap.values()],
    termine: termineRows,
    buchungen,
    aufgaben: aufgabenRows,
    hinweise,
  }
}
