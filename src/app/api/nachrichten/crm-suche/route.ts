import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership } from '@/lib/auth/roles'
import { kontaktName } from '@/lib/crm/types'
import { findeKontaktPerEmail } from '@/lib/email/crm'
import type { CrmSuchTreffer } from '@/lib/email/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

// GET /api/nachrichten/crm-suche?q=… – Kontakte + Firmen des Mandanten suchen
// GET /api/nachrichten/crm-suche?email=… – exakte Zuordnung per E-Mail-Adresse
export async function GET(req: NextRequest) {
  const membership = await getCurrentMembership()
  if (!membership) return NextResponse.json({ fehler: 'Nicht angemeldet.' }, { status: 401 })
  const supabase = await createSupabaseServerClient()
  const tenantId = membership.tenantId

  const email = (req.nextUrl.searchParams.get('email') ?? '').trim()
  if (email) {
    const treffer = await findeKontaktPerEmail(supabase, tenantId, email.split(',').map(s => s.match(/<([^>]+)>/)?.[1] ?? s))
    return NextResponse.json({ treffer })
  }

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ ergebnisse: [] })
  const like = `%${q.replace(/[%_,().]/g, ' ').trim()}%`

  const [{ data: kontakte }, { data: firmen }] = await Promise.all([
    (supabase.from('kontakte') as any)
      .select('id, vorname, nachname, email, ort, firmen(name)')
      .eq('tenant_id', tenantId).eq('aktiv', true)
      .or(`nachname.ilike.${like},vorname.ilike.${like},email.ilike.${like}`)
      .order('nachname').limit(10),
    (supabase.from('firmen') as any)
      .select('id, name, email, ort')
      .eq('tenant_id', tenantId).eq('aktiv', true)
      .or(`name.ilike.${like},email.ilike.${like}`)
      .order('name').limit(10),
  ])

  const ergebnisse: CrmSuchTreffer[] = [
    ...((kontakte ?? []) as R[]).map(k => ({
      typ: 'kontakt' as const, id: k.id,
      name: kontaktName({ vorname: k.vorname, nachname: k.nachname }),
      email: k.email ?? null,
      zusatz: (k.firmen as R | null)?.name ?? k.ort ?? null,
    })),
    ...((firmen ?? []) as R[]).map(f => ({
      typ: 'firma' as const, id: f.id, name: f.name, email: f.email ?? null, zusatz: f.ort ?? null,
    })),
  ]
  return NextResponse.json({ ergebnisse })
}
