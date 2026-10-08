import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ladeVerbindungRoh, kontoAnzeige } from '@/lib/email/verbindung'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import EinstellungenForm from './EinstellungenForm'
import KontoTabs from './KontoTabs'

export const dynamic = 'force-dynamic'

export default async function EmailEinstellungenPage() {
  const [ctx, gemeinsamCtx] = await Promise.all([
    ladeVerbindungRoh('privat'),
    ladeVerbindungRoh('gemeinsam'),
  ])
  const konto = kontoAnzeige(ctx?.row ?? null)
  const gemeinsamKonto = kontoAnzeige(gemeinsamCtx?.row ?? null)

  // Login-Adresse + Name als Vorschlag, falls das persönliche Postfach neu eingerichtet wird
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profil } = user
    ? await (supabase.from('profiles') as any).select('full_name, display_name').eq('id', user.id).maybeSingle()
    : { data: null }
  const eigeneEmail = user?.email ?? ''
  const eigenerName = (profil?.full_name || profil?.display_name || '') as string

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl">E-Mail-Konto</h1>
        <Link href="/nachrichten" className="btn-secondary"><ArrowLeft size={16} strokeWidth={1.75} /> Zum Posteingang</Link>
      </div>
      <p className="text-sm text-hs-text-2 mb-6">
        Dein persönliches Postfach und die gemeinsame Team-Mailbox für diesen Mandanten (IMAP/SMTP).
        Passwörter werden verschlüsselt gespeichert und nie an den Browser zurückgegeben.
      </p>
      <KontoTabs
        persoenlich={<EinstellungenForm konto={konto} eigeneEmail={eigeneEmail} eigenerName={eigenerName} />}
        gemeinsamForm={<EinstellungenForm konto={gemeinsamKonto} gemeinsam />}
        gemeinsameAdresse={gemeinsamKonto.vorhanden ? gemeinsamKonto.email_address : null}
      />
    </div>
  )
}
