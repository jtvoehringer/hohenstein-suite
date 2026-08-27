import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership } from '@/lib/auth/roles'
import { fmtDatum, heuteIso } from '@/lib/format'
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

  const [{ data: aufgaben }, { data: termine }, { data: fehler }] = await Promise.all([
    (supabase.from('aufgaben') as any)
      .select('id, titel, faellig_am, status').eq('tenant_id', tenantId).neq('status', 'erledigt')
      .not('faellig_am', 'is', null).lte('faellig_am', in7Iso).order('faellig_am').limit(20),
    (supabase.from('aktivitaeten') as any)
      .select('id, betreff, art, datum, uhrzeit_von').eq('tenant_id', tenantId).eq('erledigt', false)
      .eq('datum', heute).order('uhrzeit_von').limit(10),
    (supabase.from('ea_dauerauftrag_log') as any)
      .select('id, fehler_details, erstellt_am').eq('tenant_id', tenantId).eq('status', 'fehler')
      .gte('erstellt_am', new Date(Date.now() - 7 * 86400000).toISOString()).limit(5),
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
  for (const f of (fehler ?? []) as R[]) {
    hinweise.push({ key: `da:${f.id}`, titel: 'Dauerauftrag fehlgeschlagen', detail: f.fehler_details ?? '', href: '/buchhaltung/dauerauftraege', tone: 'err' })
  }
  return NextResponse.json({ hinweise })
}
