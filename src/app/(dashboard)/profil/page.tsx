import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import ProfilForm from './ProfilForm'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default async function ProfilPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profil } = await (supabase.from('profiles') as any).select('full_name, display_name, telefon').eq('id', user.id).maybeSingle()
  const p = (profil ?? {}) as R

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl mb-1">Mein Profil</h1>
      <p className="text-sm text-hs-text-2 mb-6">Name und Telefonnummer, wie sie im Team angezeigt werden.</p>
      <ProfilForm email={user.email ?? ''} fullName={p.full_name ?? p.display_name ?? ''} telefon={p.telefon ?? ''} />
    </div>
  )
}
