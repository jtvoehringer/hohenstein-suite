'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Reply, ReplyAll, Forward, Trash2, FolderInput, MailOpen, Mail, Paperclip, Download, BookmarkPlus, User, Building2, Loader2, Check, Image as ImageIcon } from 'lucide-react'
import type { NachrichtDetail, OrdnerInfo, CrmSuchTreffer } from '@/lib/email/types'
import CrmAuswahl from './CrmAuswahl'
import { fmtVollDatum, fmtBytes } from './utils'
import type { ComposerModus } from './Composer'

export default function NachrichtAnsicht({
  d, folders, darfSchreiben, onAntworten, onGeloescht, onVerschoben, onGelesenGeaendert, onCrmAbgelegt, onFehler,
}: {
  d: NachrichtDetail
  folders: OrdnerInfo[]
  darfSchreiben: boolean
  onAntworten: (modus: ComposerModus) => void
  onGeloescht: (uid: number) => void
  onVerschoben: (uid: number, ziel: string) => void
  onGelesenGeaendert: (uid: number, gelesen: boolean) => void
  onCrmAbgelegt: (uid: number, aktivitaetId: string) => void
  onFehler: (text: string) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [loeschen, setLoeschen] = useState(false)
  const [verschieben, setVerschieben] = useState(false)
  const [ziel, setZiel] = useState('')
  const [crmAuswahl, setCrmAuswahl] = useState<{ hinweis: string; adresse: string } | null>(null)
  const [crmMeldung, setCrmMeldung] = useState<{ ok: boolean; text: string; id?: string } | null>(null)
  const [externeBilder, setExterneBilder] = useState(false)

  // HTML im Sandbox-iframe: keine Skripte, standardmäßig keine externen Ressourcen (Tracking-Pixel)
  const srcDoc = useMemo(() => {
    if (!d.html) return ''
    const csp = externeBilder
      ? "default-src 'none'; img-src https: http: data: cid:; style-src 'unsafe-inline'; font-src https: data:"
      : "default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'"
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank">` +
      `<style>body{font-family:'IBM Plex Sans',Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.5;color:#22252B;margin:0;padding:4px 2px;word-break:break-word}` +
      `img{max-width:100%;height:auto}a{color:#2F63AC}blockquote{border-left:2px solid #D6D8DD;margin:8px 0;padding-left:10px;color:#5A5D66}pre{white-space:pre-wrap}</style></head><body>${d.html}</body></html>`
  }, [d.html, externeBilder])

  async function post(url: string, body: object) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    return { res, data }
  }

  async function gelesenUmschalten() {
    setBusy('flag')
    const { res, data } = await post('/api/nachrichten/flag', { folder: d.folder, uid: d.uid, seen: !d.gelesen })
    setBusy(null)
    if (!res.ok) { onFehler(data.fehler ?? 'Markieren fehlgeschlagen'); return }
    onGelesenGeaendert(d.uid, !d.gelesen)
  }

  async function loeschenAusfuehren() {
    setBusy('delete'); setLoeschen(false)
    const { res, data } = await post('/api/nachrichten/delete', { folder: d.folder, uid: d.uid })
    setBusy(null)
    if (!res.ok) { onFehler(data.fehler ?? 'Löschen fehlgeschlagen'); return }
    onGeloescht(d.uid)
  }

  async function verschiebenAusfuehren() {
    if (!ziel) return
    setBusy('move')
    const { res, data } = await post('/api/nachrichten/move', { folder: d.folder, uid: d.uid, ziel })
    setBusy(null)
    if (!res.ok) { onFehler(data.fehler ?? 'Verschieben fehlgeschlagen'); return }
    setVerschieben(false); setZiel('')
    onVerschoben(d.uid, ziel)
  }

  async function crmAblegen(auswahl?: CrmSuchTreffer) {
    setBusy('crm'); setCrmMeldung(null)
    const { res, data } = await post('/api/nachrichten/crm-ablegen', {
      folder: d.folder, uid: d.uid,
      kontakt_id: auswahl?.typ === 'kontakt' ? auswahl.id : null,
      firma_id:   auswahl?.typ === 'firma' ? auswahl.id : null,
    })
    setBusy(null)
    if (res.status === 422 && data.auswahlNoetig) { setCrmAuswahl({ hinweis: data.fehler, adresse: data.adresse ?? '' }); return }
    if (res.status === 409 && data.duplikat) { setCrmMeldung({ ok: false, text: data.fehler, id: data.id ?? undefined }); if (data.id) onCrmAbgelegt(d.uid, data.id); return }
    if (!res.ok) { setCrmMeldung({ ok: false, text: data.fehler ?? 'Ablegen fehlgeschlagen' }); return }
    setCrmAuswahl(null)
    setCrmMeldung({ ok: true, text: 'Im CRM abgelegt.', id: data.id })
    onCrmAbgelegt(d.uid, data.id)
  }

  const crmLink = d.kontaktInfo
    ? `/crm/${d.kontaktInfo.typ === 'firma' ? 'firmen' : 'kontakte'}/${d.kontaktInfo.id}`
    : null

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Kopf */}
      <div className="px-5 py-4 border-b border-hs-line space-y-2">
        <h2 className="text-[16px] leading-snug break-words">{d.betreff}</h2>
        <div className="text-[12.5px] text-hs-text-2 space-y-0.5">
          <p><span className="font-semibold text-hs-text-1">Von:</span> {d.vonName ? <>{d.vonName} <span className="text-hs-tertiary">&lt;{d.von}&gt;</span></> : d.von}</p>
          <p><span className="font-semibold text-hs-text-1">An:</span> {d.an || '–'}</p>
          {d.cc && <p><span className="font-semibold text-hs-text-1">Cc:</span> {d.cc}</p>}
          <p><span className="font-semibold text-hs-text-1">Datum:</span> <span className="font-mono text-[11px]">{fmtVollDatum(d.datum)}</span></p>
        </div>

        {/* Aktionen */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button onClick={() => onAntworten('antwort')} className="btn-primary py-1.5 px-3"><Reply size={15} strokeWidth={1.75} /> Antworten</button>
          <button onClick={() => onAntworten('alle')} className="btn-secondary py-1.5 px-3" title="Allen antworten"><ReplyAll size={15} strokeWidth={1.75} /></button>
          <button onClick={() => onAntworten('weiterleiten')} className="btn-secondary py-1.5 px-3"><Forward size={15} strokeWidth={1.75} /> Weiterleiten</button>
          <button onClick={gelesenUmschalten} disabled={busy === 'flag'} className="btn-secondary py-1.5 px-3" title={d.gelesen ? 'Als ungelesen markieren' : 'Als gelesen markieren'}>
            {d.gelesen ? <Mail size={15} strokeWidth={1.75} /> : <MailOpen size={15} strokeWidth={1.75} />}
          </button>
          {!verschieben ? (
            <button onClick={() => setVerschieben(true)} className="btn-secondary py-1.5 px-3" title="In Ordner verschieben"><FolderInput size={15} strokeWidth={1.75} /></button>
          ) : (
            <span className="inline-flex items-center gap-1">
              <select value={ziel} onChange={e => setZiel(e.target.value)} className="input py-1.5 text-[12.5px] w-44">
                <option value="">Zielordner …</option>
                {folders.filter(f => f.path !== d.folder).map(f => <option key={f.path} value={f.path}>{' '.repeat(f.ebene * 2)}{f.name}</option>)}
              </select>
              <button onClick={verschiebenAusfuehren} disabled={!ziel || busy === 'move'} className="btn-primary py-1.5 px-3">{busy === 'move' ? <Loader2 size={14} className="animate-spin" /> : 'OK'}</button>
              <button onClick={() => { setVerschieben(false); setZiel('') }} className="btn-secondary py-1.5 px-3">Abbrechen</button>
            </span>
          )}
          {!loeschen ? (
            <button onClick={() => setLoeschen(true)} disabled={busy === 'delete'} className="btn-danger py-1.5 px-3" title="Löschen">
              {busy === 'delete' ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} strokeWidth={1.75} />}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[12.5px]">
              <span className="text-hs-err-fg">{folders.find(f => f.path === d.folder)?.specialUse === '\\Trash' ? 'Endgültig löschen?' : 'In den Papierkorb?'}</span>
              <button onClick={loeschenAusfuehren} className="btn-danger py-1.5 px-3">Ja</button>
              <button onClick={() => setLoeschen(false)} className="btn-secondary py-1.5 px-3">Nein</button>
            </span>
          )}

          <span className="flex-1" />

          {/* CRM */}
          {crmLink && (
            <Link href={crmLink} className="pill bg-hs-blue-50 text-hs-blue-700 hover:bg-hs-blue-100" title="Im CRM öffnen">
              {d.kontaktInfo!.typ === 'kontakt' ? <User size={12} className="mr-1" /> : <Building2 size={12} className="mr-1" />}{d.kontaktInfo!.name}
            </Link>
          )}
          {d.crmAktivitaetId ? (
            <span className="pill bg-hs-ok-bg text-hs-ok-fg" title="Als Aktivität (E-Mail) abgelegt">
              <Check size={12} className="mr-1" /> Im CRM abgelegt
            </span>
          ) : darfSchreiben && (
            <button onClick={() => crmAblegen()} disabled={busy === 'crm'} className="btn-secondary py-1.5 px-3">
              {busy === 'crm' ? <Loader2 size={15} className="animate-spin" /> : <BookmarkPlus size={15} strokeWidth={1.75} />} Im CRM ablegen
            </button>
          )}
        </div>

        {crmMeldung && (
          <p className={`text-[12.5px] ${crmMeldung.ok ? 'text-hs-ok-fg' : 'text-hs-warn-fg'}`}>{crmMeldung.text}</p>
        )}
        {crmAuswahl && (
          <CrmAuswahl hinweis={crmAuswahl.hinweis} vorschlag={crmAuswahl.adresse}
            onWahl={t => crmAblegen(t)} onAbbrechen={() => setCrmAuswahl(null)} />
        )}

        {/* Anhänge */}
        {d.anhaenge.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {d.anhaenge.map(a => (
              <a key={a.index} href={`/api/nachrichten/anhang?folder=${encodeURIComponent(d.folder)}&uid=${d.uid}&index=${a.index}`}
                className="pill bg-hs-bg text-hs-text-1 hover:bg-hs-blue-50 hover:text-hs-blue-700" title={a.contentType}>
                <Paperclip size={12} className="mr-1" />{a.dateiname} <span className="text-hs-tertiary ml-1">{fmtBytes(a.groesse)}</span><Download size={12} className="ml-1.5" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Inhalt */}
      <div className="flex-1 min-h-0 flex flex-col">
        {d.html ? (
          <>
            <div className="px-5 py-1.5 border-b border-hs-line flex items-center justify-between text-[11.5px] text-hs-tertiary">
              <span>Externe Bilder {externeBilder ? 'werden geladen' : 'blockiert'}</span>
              <button onClick={() => setExterneBilder(v => !v)} className="inline-flex items-center gap-1 text-hs-blue-700 hover:underline">
                <ImageIcon size={12} /> {externeBilder ? 'Bilder blockieren' : 'Bilder laden'}
              </button>
            </div>
            <iframe title="Nachricht" sandbox="" srcDoc={srcDoc} className="flex-1 w-full border-0 bg-white min-h-[320px]" />
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <pre className="text-[13.5px] text-hs-text whitespace-pre-wrap font-sans leading-relaxed break-words">{d.text || '(kein Inhalt)'}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
