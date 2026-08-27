import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { setActiveTenantCookie } from '@/lib/auth/activeTenant'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

// GET /auth/mandant?tenant=<id>&next=/dashboard – setzt den aktiven Mandanten
// (Cookies dürfen nur in Route Handlern/Server Actions gesetzt werden, nicht
// beim Rendern einer Seite) und leitet weiter.
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenant') ?? ''
  const next = req.nextUrl.searchParams.get('next') ?? '/dashboard'
  const ziel = new URL(next.startsWith('/') ? next : '/dashboard', req.nextUrl.origin)

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.nextUrl.origin))

  if (tenantId) {
    const { data } = await (supabase.from('tenant_memberships') as any)
      .select('tenant_id').eq('tenant_id', tenantId).eq('user_id', user.id).eq('aktiv', true).limit(1).maybeSingle()
    if ((data as R | null)?.tenant_id) await setActiveTenantCookie(tenantId)
  }
  return NextResponse.redirect(ziel)
}
