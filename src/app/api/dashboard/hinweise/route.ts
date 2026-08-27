import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership } from '@/lib/auth/roles'
import { fmtDatum, fmtEuroMitZeichen as fmtEuro, heuteIso } from '@/lib/format'
import type { Hinweis } from '@/components/layout/Topbar'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

// GET /api/dashboard/hinweise – Glocke in der Kopfleiste:
// überfällige/heute fällige Aufgaben, offene Termine von heute, Daueraufträge mit Fehlern
export async function GET() {
  const membership = await getCurrentMembership()
  if (!membership) return NextResponse.json({ hinweise: [] }, { status: 401 })
  const tenantId = membership.tenantId
  const supabase = await createSupabaseServerClient()
  const heute = heuteIso()
  const in7 = new Date(); in7.setDate(in7.getDate() + 7)
  const in7Iso = in7.toISOString().slice(0, 10)

  const [{ data: aufgaben }, { data: termine }, { data: fehler }, { data: eingang }, { data: ausgang }] = await Promise.all([
    (supabase.from('aufgaben') as any)
      .select('id, titel, faellig_am, status').eq('tenant_id', tenantId).neq('status', 'erledigt')
      .not('faellig_am', 'is', null).lte('faellig_am', in7Iso).order('faellig_am').limit(20),
    (supabase.from('aktivitaeten') as any)
      .select('id, betreff, art, datum, uhrzeit_von').eq('tenant_id', tenantId).eq('erledigt', false)
      .eq('datum', heute).order('uhrzeit_von').limit(10),
    (supabase.from('ea_dauerauftrag_log') as any)
      .select('id, fehler_details, erstellt_am').eq('tenant_id', tenantId).eq('status', 'fehler')
      .gte('erstellt_am', new Date(Date.now() - 7 * 86400000).toISOString()).limit(5),
    // Verbindlichkeiten: fällig innerhalb von 7 Tagen oder überfällig
    (supabase.from('eingangsrechnungen') as any)
      .select('id, lieferant, beschreibung, faellig_am, betrag_brutto').eq('tenant_id', tenantId).eq('status', 'offen')
      .lte('faellig_am', in7Iso).order('faellig_am').limit(20),
    // Eigene Rechnungen: überfällig
    (supabase.from('belege') as any)
      .select('id, nummer, empf_name, faellig_am, summe_brutto, bezahlt_betrag').eq('tenant_id', tenantId).eq('belegart', 'rechnung')
      .in('status', ['gestellt', 'teilbezahlt']).lt('faellig_am', heute).order('faellig_am').limit(20),
  ])

  const hinweise: Hinweis[] = []
  for (const a of (aufgaben ?? []) as R[]) {
    const ueberfaellig = a.faellig_am < heute
    hinweise.push({
      key: `aufgabe:${a.id}`,
      titel: a.titel,
      detail: ueberfaellig ? `Überfällig seit ${fmtDatum(a.faellig_am)}` : a.faellig_am === heute ? 'Heute fällig' : `Fällig am ${fmtDatum(a.faellig_am)}`,
      href: `/aufgaben?id=${a.id}`,
      tone: ueberfaellig ? 'err' : 'warn',
    })
  }
  for (const t of (termine ?? []) as R[]) {
    hinweise.push({
      key: `termin:${t.id}`,
      titel: t.betreff ?? t.art,
      detail: t.uhrzeit_von ? `Heute ${String(t.uhrzeit_von).slice(0, 5)} Uhr` : 'Heute',
      href: `/crm?datum=${t.datum}`,
      tone: 'warn',
    })
  }
  for (const e of (eingang ?? []) as R[]) {
    const ueberfaellig = e.faellig_am < heute
    hinweise.push({
      key: `eingang:${e.id}`,
      titel: `Zahlung fällig: ${e.lieferant} – ${fmtEuro(e.betrag_brutto)}`,
      detail: `${e.beschreibung} · ${ueberfaellig ? `überfällig seit ${fmtDatum(e.faellig_am)}` : e.faellig_am === heute ? 'heute fällig' : `fällig am ${fmtDatum(e.faellig_am)}`}`,
      href: '/rechnungen/verbindlichkeiten',
      tone: ueberfaellig ? 'err' : 'warn',
    })
  }
  for (const b of (ausgang ?? []) as R[]) {
    const offen = Number(b.summe_brutto ?? 0) - Number(b.bezahlt_betrag ?? 0)
    hinweise.push({
      key: `rechnung:${b.id}`,
      titel: `Rechnung ${b.nummer} überfällig – ${fmtEuro(offen)} offen`,
      detail: `${b.empf_name} · fällig seit ${fmtDatum(b.faellig_am)}`,
      href: `/rechnungen/${b.id}`,
      tone: 'warn',
    })
  }
  for (const f of (fehler ?? []) as R[]) {
    hinweise.push({ key: `da:${f.id}`, titel: 'Dauerauftrag fehlgeschlagen', detail: f.fehler_details ?? '', href: '/buchhaltung/dauerauftraege', tone: 'err' })
  }
  return NextResponse.json({ hinweise })
}
