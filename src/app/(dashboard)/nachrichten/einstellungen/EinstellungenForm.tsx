'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Loader2, PlugZap, Trash2, Info } from 'lucide-react'
import type { KontoAnzeige } from '@/lib/email/types'
import { fmtDatumZeit } from '@/lib/format'
import { kontoSpeichernAction, kontoEntfernenAction } from './actions'

type TestErgebnis = { imap: { ok: boolean; fehler: string }; smtp: { ok: boolean; fehler: string } }

const ANBIETER = [
  { name: 'Microsoft 365 / Outlook', imap: 'outlook.office365.com', smtp: 'smtp.office365.com', hinweis: 'App-Passwort bzw. „Authentifizierte SMTP-Übermittlung" im Admin-Center aktivieren' },
  { name: 'Google Workspace / Gmail', imap: 'imap.gmail.com', smtp: 'smtp.gmail.com', hinweis: 'App-Passwort (2-Faktor-Authentifizierung nötig)' },
  { name: 'GMX', imap: 'imap.gmx.net', smtp: 'mail.gmx.net', hinweis: 'IMAP in den GMX-Einstellungen freischalten' },
  { name: 'A1 / aon', imap: 'imap.a1.net', smtp: 'smtp.a1.net', hinweis: '' },
  { name: 'World4You', imap: 'mail.world4you.com', smtp: 'mail.world4you.com', hinweis: '' },
  { name: 'easyname', imap: 'imap.easyname.com', smtp: 'smtp.easyname.com', hinweis: '' },
]

export default function EinstellungenForm({ konto }: { konto: KontoAnzeige }) {
  const router = useRouter()
  const [f, setF] = useState({
    email_address: konto.email_address,
    anzeigename: konto.anzeigename,
    imap_host: konto.imap_host,
    imap_port: String(konto.imap_port),
    imap_user: konto.imap_user,
    imap_pass: '',
    smtp_host: konto.smtp_host,
    smtp_port: String(konto.smtp_port),
    smtp_user: konto.smtp_user,
    smtp_pass: '',
    smtp_from_name: konto.smtp_from_name,
    signatur: konto.signatur,
  })
  const [saving, setSaving]   = useState(false)
  const [testing, setTesting] = useState(false)
  const [erfolg, setErfolg]   = useState('')
  const [fehler, setFehler]   = useState('')
  const [test, setTest]       = useState<TestErgebnis | null>(null)
  const [entfernen, setEntfernen] = useState(false)

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }))

  function anbieterUebernehmen(a: typeof ANBIETER[number]) {
    setF(prev => ({ ...prev, imap_host: a.imap, imap_port: '993', smtp_host: a.smtp, smtp_port: '587',
      imap_user: prev.imap_user || prev.email_address, smtp_user: prev.smtp_user || prev.email_address }))
  }

  async function speichern(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setFehler(''); setErfolg(''); setTest(null)
    const res = await kontoSpeichernAction(f)
    if (res?.fehler) setFehler(res.fehler)
    else {
      setErfolg('E-Mail-Konto gespeichert')
      setF(prev => ({ ...prev, imap_pass: '', smtp_pass: '' }))
      router.refresh()
    }
    setSaving(false)
  }

  async function testen() {
    setTesting(true); setFehler(''); setErfolg(''); setTest(null)
    try {
      // Formularwerte mitschicken – nicht eingegebene Passwörter fallen serverseitig auf die gespeicherten zurück
      const res = await fetch('/api/nachrichten/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imap_host: f.imap_host, imap_port: f.imap_port, imap_user: f.imap_user || f.email_address, imap_pass: f.imap_pass || undefined,
          smtp_host: f.smtp_host, smtp_port: f.smtp_port, smtp_user: f.smtp_user || f.imap_user || f.email_address, smtp_pass: f.smtp_pass || (konto.smtp_pass_gesetzt ? undefined : f.imap_pass) || undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok || d.fehler) setFehler(d.fehler ?? 'Test fehlgeschlagen')
      else { setTest(d as TestErgebnis); router.refresh() }
    } catch (e) { setFehler(String(e)) }
    setTesting(false)
  }

  async function verbindungEntfernen() {
    setSaving(true); setFehler(''); setErfolg('')
    const res = await kontoEntfernenAction()
    if (res?.fehler) setFehler(res.fehler)
    else {
      setErfolg('Verbindung entfernt')
      setF({ email_address: '', anzeigename: '', imap_host: '', imap_port: '993', imap_user: '', imap_pass: '', smtp_host: '', smtp_port: '587', smtp_user: '', smtp_pass: '', smtp_from_name: '', signatur: '' })
      setEntfernen(false)
      router.refresh()
    }
    setSaving(false)
  }

  return (
    <form onSubmit={speichern} className="space-y-5">
      {/* Status */}
      {konto.vorhanden && (
        <div className="card py-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-[12.5px]">
          <span className="text-hs-text-2">Letzter Abruf: <span className="font-mono text-[11px] text-hs-text">{konto.letzter_abruf ? fmtDatumZeit(konto.letzter_abruf) : '–'}</span></span>
          {konto.letzter_fehler
            ? <span className="text-hs-err-fg inline-flex items-center gap-1"><X size={14} strokeWidth={2.25} />{konto.letzter_fehler}</span>
            : <span className="text-hs-ok-fg inline-flex items-center gap-1"><Check size={14} strokeWidth={2.25} />Keine Fehler</span>}
        </div>
      )}

      {/* Konto */}
      <div className="card space-y-4">
        <h2 className="text-base">Konto</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">E-Mail-Adresse *</label>
            <input type="email" required value={f.email_address} onChange={set('email_address')} className="input" placeholder="vorname@hohenstein-partner.at" autoComplete="off" />
          </div>
          <div>
            <label className="form-label">Anzeigename</label>
            <input value={f.anzeigename} onChange={set('anzeigename')} className="input" placeholder="Vorname Nachname" />
          </div>
        </div>
      </div>

      {/* Anbieter-Voreinstellungen */}
      <div className="card space-y-3">
        <div className="flex items-start gap-2">
          <Info size={16} strokeWidth={1.75} className="text-hs-blue-700 mt-0.5 shrink-0" />
          <div className="text-[12.5px] text-hs-text-2">
            <p className="font-semibold text-hs-text">Voreinstellungen gängiger Anbieter</p>
            <p>Standard: IMAP Port 993 (SSL/TLS), SMTP Port 587 (STARTTLS) oder 465 (SSL). Benutzername ist meist die vollständige E-Mail-Adresse.
              Viele Anbieter verlangen ein eigenes App-Passwort statt des normalen Login-Passworts.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ANBIETER.map(a => (
            <button key={a.name} type="button" onClick={() => anbieterUebernehmen(a)} title={`${a.imap} / ${a.smtp}${a.hinweis ? ' – ' + a.hinweis : ''}`}
              className="pill bg-hs-blue-50 text-hs-blue-700 hover:bg-hs-blue-100 transition-colors">
              {a.name}
            </button>
          ))}
        </div>
      </div>

      {/* IMAP */}
      <div className="card space-y-4">
        <h2 className="text-base">Posteingang (IMAP)</h2>
        <div className="grid sm:grid-cols-[1fr_120px] gap-4">
          <div>
            <label className="form-label">IMAP-Server *</label>
            <input value={f.imap_host} onChange={set('imap_host')} className="input" placeholder="imap.example.at" required />
          </div>
          <div>
            <label className="form-label">Port</label>
            <input type="number" min={1} max={65535} value={f.imap_port} onChange={set('imap_port')} className="input font-mono" />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Benutzername</label>
            <input value={f.imap_user} onChange={set('imap_user')} className="input" placeholder={f.email_address || 'meist die E-Mail-Adresse'} autoComplete="off" />
          </div>
          <div>
            <label className="form-label">Passwort {konto.imap_pass_gesetzt && <span className="font-normal text-hs-ok-fg">· gesetzt</span>}</label>
            <input type="password" value={f.imap_pass} onChange={set('imap_pass')} className="input" autoComplete="new-password"
              placeholder={konto.imap_pass_gesetzt ? 'unverändert lassen' : 'Passwort oder App-Passwort'} required={!konto.imap_pass_gesetzt} />
          </div>
        </div>
      </div>

      {/* SMTP */}
      <div className="card space-y-4">
        <h2 className="text-base">Postausgang (SMTP)</h2>
        <div className="grid sm:grid-cols-[1fr_120px] gap-4">
          <div>
            <label className="form-label">SMTP-Server *</label>
            <input value={f.smtp_host} onChange={set('smtp_host')} className="input" placeholder="smtp.example.at" required />
          </div>
          <div>
            <label className="form-label">Port</label>
            <input type="number" min={1} max={65535} value={f.smtp_port} onChange={set('smtp_port')} className="input font-mono" />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Benutzername</label>
            <input value={f.smtp_user} onChange={set('smtp_user')} className="input" placeholder={f.imap_user || f.email_address || 'wie IMAP'} autoComplete="off" />
          </div>
          <div>
            <label className="form-label">Passwort {konto.smtp_pass_gesetzt && <span className="font-normal text-hs-ok-fg">· gesetzt</span>}</label>
            <input type="password" value={f.smtp_pass} onChange={set('smtp_pass')} className="input" autoComplete="new-password"
              placeholder={konto.smtp_pass_gesetzt ? 'unverändert lassen' : 'leer = wie IMAP-Passwort'} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Absendername</label>
            <input value={f.smtp_from_name} onChange={set('smtp_from_name')} className="input" placeholder={f.anzeigename || 'wie Anzeigename'} />
          </div>
        </div>
        <div>
          <label className="form-label">Signatur</label>
          <textarea value={f.signatur} onChange={set('signatur')} rows={5} className="input font-mono text-[12.5px]"
            placeholder={'Mit freundlichen Grüßen\nVorname Nachname\nHohenstein Consulting OG'} />
          <p className="text-[11.5px] text-hs-tertiary mt-1">Wird beim Verfassen automatisch unter die Nachricht gesetzt.</p>
        </div>
      </div>

      {/* Testergebnis */}
      {test && (
        <div className="card py-4 space-y-1 text-[13px]">
          <p className={test.imap.ok ? 'text-hs-ok-fg' : 'text-hs-err-fg'}>
            {test.imap.ok ? <Check size={14} strokeWidth={2.25} className="inline mr-1" /> : <X size={14} strokeWidth={2.25} className="inline mr-1" />}
            IMAP: {test.imap.ok ? 'Anmeldung erfolgreich' : test.imap.fehler}
          </p>
          <p className={test.smtp.ok ? 'text-hs-ok-fg' : 'text-hs-err-fg'}>
            {test.smtp.ok ? <Check size={14} strokeWidth={2.25} className="inline mr-1" /> : <X size={14} strokeWidth={2.25} className="inline mr-1" />}
            SMTP: {test.smtp.ok ? 'Verbindung erfolgreich' : test.smtp.fehler}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving || testing} className="btn-primary">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2} />}
          {saving ? 'Speichern …' : 'Speichern'}
        </button>
        <button type="button" onClick={testen} disabled={saving || testing} className="btn-secondary">
          {testing ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} strokeWidth={1.75} />}
          {testing ? 'Prüfe …' : 'Verbindung testen'}
        </button>
        {konto.vorhanden && !entfernen && (
          <button type="button" onClick={() => setEntfernen(true)} disabled={saving} className="btn-danger ml-auto">
            <Trash2 size={16} strokeWidth={1.75} /> Verbindung entfernen
          </button>
        )}
        {entfernen && (
          <span className="ml-auto inline-flex items-center gap-2 text-[13px]">
            <span className="text-hs-err-fg">Zugangsdaten wirklich löschen?</span>
            <button type="button" onClick={verbindungEntfernen} className="btn-danger">Ja, entfernen</button>
            <button type="button" onClick={() => setEntfernen(false)} className="btn-secondary">Abbrechen</button>
          </span>
        )}
      </div>

      {erfolg && <p className="text-sm text-hs-ok-fg inline-flex items-center gap-1"><Check size={14} strokeWidth={2.25} />{erfolg}</p>}
      {fehler && <p className="text-sm text-hs-err-fg inline-flex items-center gap-1"><X size={14} strokeWidth={2.25} />{fehler}</p>}
    </form>
  )
}
