import Link from 'next/link'
import { Mail, Settings } from 'lucide-react'
import { canWrite } from '@/lib/auth/roles'
import { ladeVerbindungRoh, kontoAnzeige, aktivesMailKonto } from '@/lib/email/verbindung'
import NachrichtenClient, { MailboxWechselButton } from './NachrichtenClient'

export const dynamic = 'force-dynamic'

export default async function NachrichtenPage() {
  const aktiv = await aktivesMailKonto()
  const [ctx, gemeinsamCtx] = await Promise.all([
    ladeVerbindungRoh('privat'),
    ladeVerbindungRoh('gemeinsam'),
  ])
  const privat    = kontoAnzeige(ctx?.row ?? null)
  const gemeinsam = kontoAnzeige(gemeinsamCtx?.row ?? null)
  const bereit = (k: typeof privat) => k.vorhanden && !!k.imap_host && k.imap_pass_gesetzt
  const smtpOk = (k: typeof privat) => k.vorhanden && !!k.smtp_host && k.smtp_pass_gesetzt

  const konto = aktiv === 'gemeinsam' ? gemeinsam : privat
  const andereAdresse = aktiv === 'gemeinsam'
    ? (bereit(privat) ? privat.email_address : null)
    : (bereit(gemeinsam) ? gemeinsam.email_address : null)

  if (!bereit(konto)) {
    return (
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl mb-4">Posteingang</h1>
        <div className="card flex flex-col items-center text-center gap-3 py-10">
          <Mail size={32} strokeWidth={1.5} className="text-hs-tertiary" />
          <h2 className="text-base">{aktiv === 'gemeinsam' ? 'Gemeinsame Mailbox noch nicht eingerichtet' : 'Noch kein E-Mail-Konto eingerichtet'}</h2>
          <p className="text-sm text-hs-text-2 max-w-md">
            {aktiv === 'gemeinsam'
              ? 'Die gemeinsame Team-Mailbox (z. B. office@hohenstein-partner.at) wird einmal unter E-Mail-Konto → Gemeinsame Mailbox eingerichtet und steht dann allen zur Verfügung.'
              : 'Verbinde dein persönliches Postfach (IMAP/SMTP), um E-Mails direkt in der Suite zu lesen, zu beantworten und im CRM abzulegen. Jede Person richtet ihr eigenes Konto ein – Passwörter werden verschlüsselt gespeichert.'}
          </p>
          {konto.letzter_fehler && <p className="text-[12.5px] text-hs-err-fg">{konto.letzter_fehler}</p>}
          <div className="flex items-center gap-2 mt-2">
            <Link href="/nachrichten/einstellungen" className="btn-primary"><Settings size={16} strokeWidth={1.75} /> E-Mail-Konto einrichten</Link>
            {andereAdresse && <MailboxWechselButton ziel={aktiv === 'gemeinsam' ? 'privat' : 'gemeinsam'} label={`Zu ${andereAdresse} wechseln`} />}
          </div>
        </div>
      </div>
    )
  }

  return (
    <NachrichtenClient
      eigeneAdresse={konto.email_address}
      signatur={konto.signatur}
      darfSchreiben={canWrite(ctx?.role ?? gemeinsamCtx?.role ?? null)}
      smtpBereit={smtpOk(konto)}
      aktivesKonto={aktiv}
      andereAdresse={andereAdresse}
    />
  )
}
