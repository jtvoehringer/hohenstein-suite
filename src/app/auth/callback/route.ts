import { createSupabaseServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/mandant-waehlen'

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      if (type === 'recovery') return NextResponse.redirect(`${origin}/auth/update-password`)
      const { data: { user } } = await supabase.auth.getUser()
      const confirmedMs = user?.email_confirmed_at ? new Date(user.email_confirmed_at).getTime() : 0
      const isJustConfirmed = confirmedMs > 0 && (Date.now() - confirmedMs) < 30000
      if (type === 'invite' || isJustConfirmed) return NextResponse.redirect(`${origin}/auth/update-password`)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
