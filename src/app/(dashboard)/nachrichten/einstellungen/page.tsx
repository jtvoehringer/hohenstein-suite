import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ladeVerbindungRoh, kontoAnzeige } from '@/lib/email/verbindung'
import EinstellungenForm from './EinstellungenForm'

export const dynamic = 'force-dynamic'

export default async function EmailEinstellungenPage() {
  const ctx = await ladeVerbindungRoh()
  const konto = kontoAnzeige(ctx?.row ?? null)

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl">E-Mail-Konto</h1>
        <Link href="/nachrichten" className="btn-secondary"><ArrowLeft size={16} strokeWidth={1.75} /> Zum Posteingang</Link>
      </div>
      <p className="text-sm text-hs-text-2 mb-6">
        Dein persönliches Postfach für diesen Mandanten (IMAP/SMTP). Passwörter werden verschlüsselt gespeichert und nie
        an den Browser zurückgegeben.
      </p>
      <EinstellungenForm konto={konto} />
    </div>
  )
}
