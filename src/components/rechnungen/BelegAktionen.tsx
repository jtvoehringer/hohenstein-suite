'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Pencil, FileCheck2, Download, Mail, Banknote, Ban, Copy, ArrowRightLeft, Trash2, ExternalLink,
  CheckCircle2, XCircle, Send, FileMinus2, AlertTriangle,
} from 'lucide-react'
import Modal from '@/components/crm/Modal'
import { fmtDatum, fmtDatumZeit, fmtEuroMitZeichen, heuteIso } from '@/lib/format'
import { ZAHLUNG_ARTEN, belegartLabel, zahlungArtLabel, type BelegRow, type ZahlungArt, type ZahlungRow } from '@/lib/rechnungen/types'
import { rund2 } from '@/lib/rechnungen/summen'
import {
  stelleBeleg, sendeBelegEmail, erfasseZahlung, loescheZahlung, storniereBeleg, wandleAngebotInRechnung,
  erstelleGutschriftZuRechnung, dupliziereBeleg, loescheBeleg, setzeAngebotStatus, setzeGutschriftVerrechnet,
} from '@/app/(dashboard)/rechnungen/actions'

type KontoOpt = { id: string; name: string }

export default function BelegAktionen({ beleg, zahlungen, konten, writeOk, emailKonto, absenderName }: {
  beleg: BelegRow
  zahlungen: ZahlungRow[]
  konten: KontoOpt[]
  writeOk: boolean
  /** E-Mail-Konto des angemeldeten Benutzers vorhanden (SMTP)? */
  emailKonto: boolean
  absenderName: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'email' | 'zahlung' | 'storno' | null>(null)

  const istEntwurf = beleg.status === 'entwurf'
  const istRechnung = beleg.belegart === 'rechnung'
  const istAngebot = beleg.belegart === 'angebot'
  const istGutschrift = beleg.belegart === 'gutschrift'
  const offen = rund2(beleg.summe_brutto - beleg.bezahlt_betrag)
  const zahlungMoeglich = istRechnung && (beleg.status === 'gestellt' || beleg.status === 'teilbezahlt')
  const stornoMoeglich = istRechnung && beleg.status === 'gestellt' && zahlungen.length === 0
  const artLabel = belegartLabel(beleg.belegart)

  function run(fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, erfolg?: string, nachId?: (d: unknown) => string | null) {
    setFehler(null); setMeldung(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) { setFehler(res.error ?? 'Fehler'); return }
      setDialog(null)
      if (erfolg) setMeldung(erfolg)
      const ziel = nachId ? nachId(res.data) : null
      if (ziel) router.push(ziel)
      router.refresh()
    })
  }

  // ── E-Mail-Dialog ────────────────────────────────────────────────────────────
  const [mailAn, setMailAn] = useState(beleg.empf_email ?? '')
  const [mailBetreff, setMailBetreff] = useState(`${artLabel} ${beleg.nummer ?? ''} – ${absenderName}`.trim())
  const [mailText, setMailText] = useState(
    `Guten Tag,\n\nanbei erhalten Sie ${istAngebot ? 'unser Angebot' : istGutschrift ? 'unsere Gutschrift' : 'unsere Rechnung'} ${beleg.nummer ?? ''} als PDF.` +
    (istRechnung && beleg.faellig_am ? `\nWir bitten um Überweisung des Betrags von ${fmtEuroMitZeichen(beleg.summe_brutto)} bis ${fmtDatum(beleg.faellig_am)} unter Angabe der Rechnungsnummer.` : '') +
    (istAngebot && beleg.faellig_am ? `\nDas Angebot ist bis ${fmtDatum(beleg.faellig_am)} gültig.` : '') +
    `\n\nMit freundlichen Grüßen\n${absenderName}`,
  )

  // ── Zahlungs-Dialog ──────────────────────────────────────────────────────────
  const [zDatum, setZDatum] = useState(heuteIso())
  const [zBetrag, setZBetrag] = useState(String(offen))
  const [zArt, setZArt] = useState<ZahlungArt>('bank')
  const [zKonto, setZKonto] = useState(konten[0]?.id ?? '')
  const [zNotiz, setZNotiz] = useState('')
  const [stornoGrund, setStornoGrund] = useState('')

  return (
    <div className="space-y-4">
      {fehler && <div className="rounded-lg border border-hs-err/40 bg-hs-err-bg text-hs-err-fg text-sm px-4 py-3">{fehler}</div>}
      {meldung && <div className="rounded-lg border border-hs-ok/40 bg-hs-ok-bg text-hs-ok-fg text-sm px-4 py-3">{meldung}</div>}

      {/* Aktionen */}
      <div className="card !p-4 space-y-2">
        <p className="overline">Aktionen</p>
        <div className="grid grid-cols-1 gap-2">
          {writeOk && istEntwurf && (
            <>
              <Link href={`/rechnungen/${beleg.id}/bearbeiten`} className="btn-secondary justify-start"><Pencil size={16} strokeWidth={1.75} /> Bearbeiten</Link>
              <button type="button" disabled={pending} className="btn-primary justify-start"
                onClick={() => { if (confirm(`${artLabel} jetzt ${istAngebot ? 'finalisieren' : 'stellen'}? Es wird eine Nummer vergeben; danach ist der Beleg nicht mehr änderbar.`)) run(() => stelleBeleg(beleg.id), `${artLabel} wurde ${istAngebot ? 'finalisiert' : 'gestellt'}.`) }}>
                <FileCheck2 size={16} strokeWidth={1.75} /> {istAngebot ? 'Finalisieren (Nummer vergeben)' : `${artLabel} stellen`}
              </button>
            </>
          )}
          <a href={`/api/rechnungen/${beleg.id}/pdf`} className="btn-secondary justify-start"><Download size={16} strokeWidth={1.75} /> PDF herunterladen</a>
          <a href={`/api/rechnungen/${beleg.id}/pdf?inline=1`} target="_blank" rel="noopener" className="btn-secondary justify-start"><ExternalLink size={16} strokeWidth={1.75} /> PDF im Browser öffnen</a>
          {writeOk && !istEntwurf && beleg.status !== 'storniert' && (
            <button type="button" className="btn-secondary justify-start" onClick={() => { setFehler(null); setDialog('email') }}><Mail size={16} strokeWidth={1.75} /> Per E-Mail senden</button>
          )}
          {writeOk && zahlungMoeglich && (
            <button type="button" className="btn-primary justify-start" onClick={() => { setFehler(null); setZBetrag(String(offen)); setDialog('zahlung') }}><Banknote size={16} strokeWidth={1.75} /> Zahlung erfassen</button>
          )}
          {writeOk && istAngebot && !istEntwurf && (
            <>
              {beleg.status !== 'angenommen' && (
                <button type="button" disabled={pending} className="btn-secondary justify-start" onClick={() => run(() => setzeAngebotStatus(beleg.id, 'angenommen'), 'Angebot als angenommen markiert.')}><CheckCircle2 size={16} strokeWidth={1.75} /> Als angenommen markieren</button>
              )}
              {beleg.status !== 'abgelehnt' && (
                <button type="button" disabled={pending} className="btn-secondary justify-start" onClick={() => run(() => setzeAngebotStatus(beleg.id, 'abgelehnt'), 'Angebot als abgelehnt markiert.')}><XCircle size={16} strokeWidth={1.75} /> Als abgelehnt markieren</button>
              )}
              {beleg.status !== 'gesendet' && (
                <button type="button" disabled={pending} className="btn-secondary justify-start" onClick={() => run(() => setzeAngebotStatus(beleg.id, 'gesendet'), 'Angebot als gesendet markiert.')}><Send size={16} strokeWidth={1.75} /> Als gesendet markieren</button>
              )}
            </>
          )}
          {writeOk && istAngebot && beleg.status !== 'abgelehnt' && (
            <button type="button" disabled={pending} className="btn-primary justify-start"
              onClick={() => run(() => wandleAngebotInRechnung(beleg.id), undefined, d => `/rechnungen/${(d as { id: string }).id}/bearbeiten`)}>
              <ArrowRightLeft size={16} strokeWidth={1.75} /> In Rechnung umwandeln
            </button>
          )}
          {writeOk && istRechnung && !istEntwurf && beleg.status !== 'storniert' && (
            <button type="button" disabled={pending} className="btn-secondary justify-start"
              onClick={() => run(() => erstelleGutschriftZuRechnung(beleg.id), undefined, d => `/rechnungen/${(d as { id: string }).id}/bearbeiten`)}>
              <FileMinus2 size={16} strokeWidth={1.75} /> Gutschrift erstellen
            </button>
          )}
          {writeOk && istGutschrift && beleg.status === 'gestellt' && (
            <button type="button" disabled={pending} className="btn-secondary justify-start" onClick={() => run(() => setzeGutschriftVerrechnet(beleg.id), 'Gutschrift als verrechnet markiert.')}><CheckCircle2 size={16} strokeWidth={1.75} /> Als verrechnet markieren</button>
          )}
          {writeOk && (
            <button type="button" disabled={pending} className="btn-secondary justify-start"
              onClick={() => run(() => dupliziereBeleg(beleg.id), undefined, d => `/rechnungen/${(d as { id: string }).id}/bearbeiten`)}>
              <Copy size={16} strokeWidth={1.75} /> Duplizieren
            </button>
          )}
          {writeOk && stornoMoeglich && (
            <button type="button" className="btn-danger justify-start" onClick={() => { setFehler(null); setDialog('storno') }}><Ban size={16} strokeWidth={1.75} /> Stornieren</button>
          )}
          {writeOk && istEntwurf && (
            <button type="button" disabled={pending} className="btn-danger justify-start"
              onClick={() => { if (confirm('Entwurf endgültig löschen?')) run(() => loescheBeleg(beleg.id), undefined, () => (istAngebot ? '/rechnungen/angebote' : '/rechnungen')) }}>
              <Trash2 size={16} strokeWidth={1.75} /> Entwurf löschen
            </button>
          )}
        </div>
      </div>

      {/* Zahlungen */}
      {istRechnung && !istEntwurf && (
        <div className="card !p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="overline">Zahlungen</p>
            <span className="text-xs text-hs-text-2 font-mono">offen {fmtEuroMitZeichen(offen)}</span>
          </div>
          {zahlungen.length === 0
            ? <p className="text-sm text-hs-text-2">Noch keine Zahlung erfasst.</p>
            : (
              <ul className="divide-y divide-hs-line text-sm">
                {zahlungen.map(z => (
                  <li key={z.id} className="py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{fmtEuroMitZeichen(z.betrag)} <span className="text-hs-text-2 font-normal">· {zahlungArtLabel(z.art)}</span></p>
                      <p className="text-xs text-hs-text-2">{fmtDatum(z.datum)}{z.konto_name ? ` · ${z.konto_name}` : ''}{z.notizen ? ` · ${z.notizen}` : ''}</p>
                    </div>
                    {writeOk && (
                      <button type="button" disabled={pending} title="Zahlung löschen" className="p-1.5 rounded text-hs-text-2 hover:text-hs-err-fg hover:bg-hs-err-bg"
                        onClick={() => { if (confirm('Zahlung inkl. E&A-Buchung löschen?')) run(() => loescheZahlung(z.id), 'Zahlung gelöscht.') }}>
                        <Trash2 size={14} strokeWidth={1.75} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}

      {/* Verlauf */}
      <div className="card !p-4 space-y-1.5 text-xs text-hs-text-2">
        <p className="overline mb-1">Verlauf</p>
        <p>Erstellt: {fmtDatumZeit(beleg.erstellt_am)}</p>
        {beleg.gesendet_am && <p>Gesendet: {fmtDatumZeit(beleg.gesendet_am)}{beleg.gesendet_an ? ` an ${beleg.gesendet_an}` : ''}</p>}
        {beleg.bezahlt_am && <p>Bezahlt: {fmtDatum(beleg.bezahlt_am)}</p>}
        {beleg.storniert_am && <p className="text-hs-err-fg">Storniert: {fmtDatumZeit(beleg.storniert_am)}{beleg.storno_grund ? ` – ${beleg.storno_grund}` : ''}</p>}
        {beleg.interne_notiz && <p className="pt-1 border-t border-hs-line whitespace-pre-line text-hs-text-1">Interne Notiz: {beleg.interne_notiz}</p>}
      </div>

      {/* E-Mail-Dialog */}
      <Modal open={dialog === 'email'} onClose={() => setDialog(null)} title={`${artLabel} per E-Mail senden`} subtitle="PDF wird als Anhang mitgeschickt – über dein persönliches E-Mail-Konto.">
        {!emailKonto ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-hs-warn-fg bg-hs-warn-bg rounded-lg px-3 py-2">
              <AlertTriangle size={16} strokeWidth={1.75} className="mt-0.5 flex-shrink-0" />
              <span>Für den Versand ist ein persönliches E-Mail-Konto (SMTP) nötig. Bitte zuerst unter Nachrichten → E-Mail-Konto einrichten.</span>
            </div>
            <Link href="/nachrichten/einstellungen" className="btn-primary">E-Mail-Konto einrichten</Link>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); run(() => sendeBelegEmail(beleg.id, { an: mailAn, betreff: mailBetreff, text: mailText }), 'E-Mail wurde gesendet.') }}>
            <div>
              <label className="form-label">An *</label>
              <input className="input" value={mailAn} onChange={e => setMailAn(e.target.value)} placeholder="name@firma.at" required />
            </div>
            <div>
              <label className="form-label">Betreff *</label>
              <input className="input" value={mailBetreff} onChange={e => setMailBetreff(e.target.value)} required />
            </div>
            <div>
              <label className="form-label">Text</label>
              <textarea className="input" rows={8} value={mailText} onChange={e => setMailText(e.target.value)} />
              <p className="text-xs text-hs-text-2 mt-1">Deine Signatur aus dem E-Mail-Konto wird automatisch angehängt.</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn-secondary" onClick={() => setDialog(null)}>Abbrechen</button>
              <button type="submit" disabled={pending} className="btn-primary"><Send size={16} strokeWidth={1.75} /> {pending ? 'Senden …' : 'Senden'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Zahlungs-Dialog */}
      <Modal open={dialog === 'zahlung'} onClose={() => setDialog(null)} title="Zahlung erfassen" subtitle={`Offen: ${fmtEuroMitZeichen(offen)} – es wird automatisch eine E&A-Einnahme gebucht.`}>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); run(() => erfasseZahlung(beleg.id, { datum: zDatum, betrag: Number(zBetrag.replace(',', '.')), art: zArt, konto_id: zKonto || null, notizen: zNotiz || null }), 'Zahlung erfasst und in der E&A gebucht.') }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Datum *</label>
              <input type="date" className="input" value={zDatum} onChange={e => setZDatum(e.target.value)} required />
            </div>
            <div>
              <label className="form-label">Betrag (brutto) *</label>
              <input type="number" step="0.01" min="0.01" className="input text-right" value={zBetrag} onChange={e => setZBetrag(e.target.value)} required />
            </div>
            <div>
              <label className="form-label">Zahlungsart</label>
              <select className="input" value={zArt} onChange={e => setZArt(e.target.value as ZahlungArt)}>
                {ZAHLUNG_ARTEN.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Konto</label>
              <select className="input" value={zKonto} onChange={e => setZKonto(e.target.value)}>
                <option value="">– kein Konto –</option>
                {konten.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="form-label">Notiz</label>
              <input className="input" value={zNotiz} onChange={e => setZNotiz(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setDialog(null)}>Abbrechen</button>
            <button type="submit" disabled={pending} className="btn-primary"><Banknote size={16} strokeWidth={1.75} /> {pending ? 'Speichern …' : 'Zahlung buchen'}</button>
          </div>
        </form>
      </Modal>

      {/* Storno-Dialog */}
      <Modal open={dialog === 'storno'} onClose={() => setDialog(null)} title="Rechnung stornieren" subtitle="Die Rechnungsnummer bleibt vergeben; es wird keine E&A-Buchung erzeugt.">
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); run(() => storniereBeleg(beleg.id, stornoGrund), 'Rechnung storniert.') }}>
          <div>
            <label className="form-label">Grund</label>
            <textarea className="input" rows={3} value={stornoGrund} onChange={e => setStornoGrund(e.target.value)} placeholder="z.B. Falscher Empfänger, Neuausstellung als RE-…" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setDialog(null)}>Abbrechen</button>
            <button type="submit" disabled={pending} className="btn-danger"><Ban size={16} strokeWidth={1.75} /> Stornieren</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
