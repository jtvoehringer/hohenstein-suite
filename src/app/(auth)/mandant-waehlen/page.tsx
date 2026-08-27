import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { wechsleMandantAction } from '@/lib/auth/mandantActions'
import { roleLabel } from '@/lib/auth/roles'
import MandantCard from './MandantCard'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

// Nach dem Login: Echtbetrieb sofort öffnen (Cookie setzen). Die Demo-Umgebung
// wird nicht automatisch gewählt – sie ist jederzeit über die Kopfleiste
// bzw. den Bereich „Demo-Umgebung" erreichbar.
export default async function MandantWaehlenPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await (supabase.from('tenant_memberships') as any)
    .select('tenant_id, role, tenants(name, ist_demo)')
    .eq('user_id', user.id)
    .eq('aktiv', true)
    .order('created_at', { ascending: true })

  const rows = (memberships ?? []) as R[]
  if (rows.length === 0) {
    return (
      <div className="card text-center space-y-3">
        <h2 className="text-lg">Kein Zugang zugeordnet</h2>
        <p className="text-sm text-hs-text-2">
          Dein Konto <strong>{user.email}</strong> ist keinem Mandanten zugeordnet. Bitte einen Admin um Freischaltung.
        </p>
      </div>
    )
  }

  // Cookie darf nicht beim Rendern gesetzt werden → über den Route Handler /auth/mandant
  const echt = rows.filter(r => !(r.tenants as R | null)?.ist_demo)
  if (echt.length === 1) redirect(`/auth/mandant?tenant=${echt[0].tenant_id}`)
  if (echt.length === 0 && rows.length === 1) redirect(`/auth/mandant?tenant=${rows[0].tenant_id}`)

  return (
    <div className="space-y-3">
      <p className="text-center text-sm text-hs-text-2 mb-2">Welchen Mandanten möchtest du öffnen?</p>
      {rows.map(m => {
        const tenant = m.tenants as R
        return (
          <form key={m.tenant_id} action={wechsleMandantAction}>
            <input type="hidden" name="tenant_id" value={m.tenant_id} />
            <MandantCard displayName={tenant?.name ?? m.tenant_id} roleLabel={roleLabel(m.role)} istDemo={!!tenant?.ist_demo} />
          </form>
        )
      })}
      <p className="text-center text-xs text-hs-tertiary pt-2">Angemeldet als {user.email}</p>
    </div>
  )
}
