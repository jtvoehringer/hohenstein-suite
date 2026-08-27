import Link from 'next/link'
import { Mail, Settings } from 'lucide-react'
import { canWrite } from '@/lib/auth/roles'
import { ladeVerbindungRoh, kontoAnzeige } from '@/lib/email/verbindung'
import NachrichtenClient from './NachrichtenClient'

export const dynamic = 'force-dynamic'

export default async function NachrichtenPage() {
  const ctx = await ladeVerbindungRoh()
  const konto = kontoAnzeige(ctx?.row ?? null)
  const imapBereit = konto.vorhanden && !!konto.imap_host && konto.imap_pass_gesetzt
  const smtpBereit = konto.vorhanden && !!konto.smtp_host && konto.smtp_pass_gesetzt

  if (!imapBereit) {
    return (
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl mb-4">Posteingang</h1>
        <div className="card flex flex-col items-center text-center gap-3 py-10">
          <Mail size={32} strokeWidth={1.5} className="text-hs-tertiary" />
          <h2 className="text-base">Noch kein E-Mail-Konto eingerichtet</h2>
          <p className="text-sm text-hs-text-2 max-w-md">
            Verbinde dein persönliches Postfach (IMAP/SMTP), um E-Mails direkt in der Suite zu lesen, zu beantworten und
            im CRM abzulegen. Jede Person richtet ihr eigenes Konto ein – Passwörter werden verschlüsselt gespeichert.
          </p>
          {konto.letzter_fehler && <p className="text-[12.5px] text-hs-err-fg">{konto.letzter_fehler}</p>}
          <Link href="/nachrichten/einstellungen" className="btn-primary mt-2"><Settings size={16} strokeWidth={1.75} /> E-Mail-Konto einrichten</Link>
        </div>
      </div>
    )
  }

  return (
    <NachrichtenClient
      eigeneAdresse={konto.email_address}
      signatur={konto.signatur}
      darfSchreiben={canWrite(ctx?.role ?? null)}
      smtpBereit={smtpBereit}
    />
  )
}
