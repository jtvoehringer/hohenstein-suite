import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Root: Einladungs-/Reset-Links von Supabase landen mit ?code=… auf der Site-URL
// → an den Callback weiterreichen; sonst je nach Anmeldestatus weiterleiten.
export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const code = typeof params.code === 'string' ? params.code : null
  if (code) {
    const type = typeof params.type === 'string' ? `&type=${encodeURIComponent(params.type)}` : ''
    redirect(`/auth/callback?code=${encodeURIComponent(code)}${type}`)
  }
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  redirect(user ? '/dashboard' : '/login')
}
