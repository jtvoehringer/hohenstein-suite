import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership } from '@/lib/auth/roles'
import { fmtEuroMitZeichen, fmtDatum } from '@/lib/format'
import type { SearchResult } from '@/components/CommandPalette'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

// GET /api/global-search?q=… – mandantengescopte Suche für die Befehlspalette
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ results: [] })

  const membership = await getCurrentMembership()
  if (!membership) return NextResponse.json({ results: [] }, { status: 401 })
  const tenantId = membership.tenantId
  const supabase = await createSupabaseServerClient()
  const like = `%${q.replace(/[%_]/g, '')}%`

  const [kontakte, firmen, aufgaben, buchungen, pipeline] = await Promise.all([
    (supabase.from('kontakte') as any)
      .select('id, vorname, nachname, email, firmen(name)').eq('tenant_id', tenantId).eq('aktiv', true)
      .or(`nachname.ilike.${like},vorname.ilike.${like},email.ilike.${like}`).limit(6),
    (supabase.from('firmen') as any)
      .select('id, name, ort, kundennummer').eq('tenant_id', tenantId).eq('aktiv', true)
      .or(`name.ilike.${like},ort.ilike.${like},kundennummer.ilike.${like}`).limit(6),
    (supabase.from('aufgaben') as any)
      .select('id, titel, status, faellig_am').eq('tenant_id', tenantId).neq('status', 'erledigt')
      .ilike('titel', like).limit(5),
    (supabase.from('ea_transaktionen') as any)
      .select('id, beschreibung, datum, typ, betrag_brutto, belegnummer').eq('tenant_id', tenantId)
      .or(`beschreibung.ilike.${like},belegnummer.ilike.${like}`).order('datum', { ascending: false }).limit(5),
    (supabase.from('pipeline_eintraege') as any)
      .select('id, titel, stufe, wert_euro').eq('tenant_id', tenantId).ilike('titel', like).limit(5),
  ])

  const results: SearchResult[] = []
  for (const k of (kontakte.data ?? []) as R[]) {
    results.push({ kategorie: 'kontakt', id: k.id, titel: [k.vorname, k.nachname].filter(Boolean).join(' '),
      untertitel: (k.firmen as R | null)?.name ?? k.email ?? undefined, href: `/crm/kontakte/${k.id}` })
  }
  for (const f of (firmen.data ?? []) as R[]) {
    results.push({ kategorie: 'firma', id: f.id, titel: f.name, untertitel: [f.kundennummer, f.ort].filter(Boolean).join(' · ') || undefined, href: `/crm/firmen/${f.id}` })
  }
  for (const a of (aufgaben.data ?? []) as R[]) {
    results.push({ kategorie: 'aufgabe', id: a.id, titel: a.titel,
      untertitel: `${a.status === 'in_arbeit' ? 'in Arbeit' : 'offen'}${a.faellig_am ? ` · bis ${fmtDatum(a.faellig_am)}` : ''}`, href: `/aufgaben?id=${a.id}` })
  }
  for (const b of (buchungen.data ?? []) as R[]) {
    results.push({ kategorie: 'buchung', id: b.id, titel: b.beschreibung,
      untertitel: `${fmtDatum(b.datum)} · ${b.typ === 'einnahme' ? '+' : '−'} ${fmtEuroMitZeichen(b.betrag_brutto)}`, href: `/buchhaltung?id=${b.id}` })
  }
  for (const p of (pipeline.data ?? []) as R[]) {
    results.push({ kategorie: 'pipeline', id: p.id, titel: p.titel, untertitel: `${p.stufe}${p.wert_euro ? ` · ${fmtEuroMitZeichen(p.wert_euro)}` : ''}`, href: `/crm/pipeline?id=${p.id}` })
  }
  return NextResponse.json({ results })
}
