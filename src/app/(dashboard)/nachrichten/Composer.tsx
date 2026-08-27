'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, X, Paperclip, Loader2, User, Building2 } from 'lucide-react'
import type { NachrichtDetail, SendeAnfrage, SendeAnhang, KontaktInfo, CrmSuchTreffer } from '@/lib/email/types'
import CrmAuswahl from './CrmAuswahl'
import { betreffMitPrefix, zitat, weiterleitungsBlock, nurAdresse, adressListe, dateiZuBase64, fmtBytes } from './utils'

export type ComposerModus = 'neu' | 'antwort' | 'alle' | 'weiterleiten'

export type ComposerProps = {
  modus: ComposerModus
  original: NachrichtDetail | null
  eigeneAdresse: string
  signatur: string
  darfSchreiben: boolean
  /** Bereits bekannter CRM-Datensatz des Originals */
  kontaktInfo?: KontaktInfo | null
  onGesendet: (info: { crmHinweis?: string }) => void
  onAbbrechen: () => void
}

type Anhang = SendeAnhang & { groesse: number }
const MAX_ANHANG = 15 * 1024 * 1024

function initialWerte(p: ComposerProps) {
  const sig = p.signatur ? `\n\n-- \n${p.signatur}` : ''
  const o = p.original
  if (!o || p.modus === 'neu') return { to: '', cc: '', subject: '', text: sig }
  if (p.modus === 'weiterleiten') {
    return { to: '', cc: '', subject: betreffMitPrefix(o.betreff, 'Fwd'), text: `${sig}\n\n${weiterleitungsBlock(o)}` }
  }
  const to = o.replyTo ? nurAdresse(o.replyTo) : o.von
  let cc = ''
  if (p.modus === 'alle') {
    const eigene = p.eigeneAdresse.toLowerCase()
    const alle = [...adressListe(o.an), ...adressListe(o.cc)].map(nurAdresse)
      .filter(a => a.toLowerCase() !== eigene && a.toLowerCase() !== to.toLowerCase())
    cc = Array.from(new Set(alle.map(a => a.toLowerCase()))).join(', ')
  }
  return { to, cc, subject: betreffMitPrefix(o.betreff, 'Re'), text: `${sig}\n\n${zitat(o)}` }
}

export default function Composer(props: ComposerProps) {
  const { modus, original, darfSchreiben, onGesendet, onAbbrechen } = props
  const init = initialWerte(props)
  const [to, setTo]           = useState(init.to)
  const [cc, setCc]           = useState(init.cc)
  const [bcc, setBcc]         = useState('')
  const [zeigeCcBcc, setZeigeCcBcc] = useState(!!init.cc)
  const [subject, setSubject] = useState(init.subject)
  const [text, setText]       = useState(init.text)
  const [anhaenge, setAnhaenge] = useState<Anhang[]>([])
  const [sending, setSending] = useState(false)
  const [fehler, setFehler]   = useState('')
  // CRM
  const [crmAblegen, setCrmAblegen] = useState(false)
  const [crmZiel, setCrmZiel]       = useState<KontaktInfo | null>(props.kontaktInfo ?? null)
  const [crmAuswahl, setCrmAuswahl] = useState(false)
  const [crmSuche, setCrmSuche]     = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Cursor an den Anfang (über Signatur/Zitat) setzen
  useEffect(() => {
    const el = textRef.current
    if (el) { el.focus(); el.setSelectionRange(0, 0); el.scrollTop = 0 }
  }, [])

  // Automatische CRM-Zuordnung per Empfängeradresse (wenn nichts vorgegeben)
  useEffect(() => {
    if (!crmAblegen || crmZiel || crmAuswahl) return
    const erste = adressListe(to)[0]
    if (!erste) return
    let aktiv = true
    setCrmSuche(true)
    fetch(`/api/nachrichten/crm-suche?email=${encodeURIComponent(nurAdresse(erste))}`)
      .then(r => r.json())
      .then(d => { if (aktiv && d.treffer) setCrmZiel(d.treffer) })
      .catch(() => {})
      .finally(() => { if (aktiv) setCrmSuche(false) })
    return () => { aktiv = false }
  }, [crmAblegen, to, crmZiel, crmAuswahl])

  async function dateienWaehlen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const neu: Anhang[] = []
    let gesamt = anhaenge.reduce((s, a) => s + a.groesse, 0)
    for (const f of files) {
      gesamt += f.size
      if (gesamt > MAX_ANHANG) { setFehler('Anhänge zu groß (max. 15 MB gesamt).'); break }
      neu.push({ dateiname: f.name, contentType: f.type || undefined, base64: await dateiZuBase64(f), groesse: f.size })
    }
    setAnhaenge(prev => [...prev, ...neu])
  }

  async function senden(e: React.FormEvent) {
    e.preventDefault()
    setFehler('')
    if (!to.trim()) { setFehler('Bitte einen Empfänger angeben.'); return }
    if (!subject.trim()) { setFehler('Bitte einen Betreff angeben.'); return }
    if (crmAblegen && !crmZiel) { setCrmAuswahl(true); setFehler('Bitte einen Kontakt oder eine Firma für das CRM-Protokoll auswählen.'); return }
    setSending(true)
    const istAntwort = (modus === 'antwort' || modus === 'alle') && original
    const anfrage: SendeAnfrage = {
      to, cc, bcc, subject, text,
      inReplyTo: istAntwort ? original!.messageId : null,
      references: istAntwort ? [...original!.references, ...(original!.messageId ? [original!.messageId] : [])] : [],
      anhaenge: anhaenge.map(({ dateiname, contentType, base64 }) => ({ dateiname, contentType, base64 })),
      anhaengeVon: modus === 'weiterleiten' && original ? { folder: original.folder, uid: original.uid } : null,
      beantwortet: istAntwort ? { folder: original!.folder, uid: original!.uid } : null,
      crm: crmAblegen ? {
        ablegen: true,
        kontakt_id: crmZiel?.typ === 'kontakt' ? crmZiel.id : null,
        firma_id:   crmZiel?.typ === 'firma' ? crmZiel.id : null,
      } : null,
    }
    try {
      const res = await fetch('/api/nachrichten/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(anfrage) })
      const d = await res.json()
      if (!res.ok || d.fehler) { setFehler(d.fehler ?? `Senden fehlgeschlagen (${res.status})`); setSending(false); return }
      onGesendet({ crmHinweis: d.crm && !d.crm.ok ? d.crm.fehler : undefined })
    } catch (err) {
      setFehler(String(err)); setSending(false)
    }
  }

  const titel = modus === 'neu' ? 'Neue Nachricht' : modus === 'antwort' ? 'Antworten' : modus === 'alle' ? 'Allen antworten' : 'Weiterleiten'

  return (
    <form onSubmit={senden} className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-5 py-3 border-b border-hs-line">
        <h2 className="text-[15px]">{titel}</h2>
        <button type="button" onClick={onAbbrechen} className="text-hs-tertiary hover:text-hs-text" title="Verwerfen"><X size={18} strokeWidth={1.75} /></button>
      </div>

      <div className="px-5 pt-3 space-y-2">
        <div className="flex items-center gap-2">
          <label className="w-12 text-[12px] font-semibold text-hs-text-2 shrink-0">An</label>
          <input value={to} onChange={e => setTo(e.target.value)} className="input py-1.5 text-[13px]" placeholder="empfaenger@beispiel.at, zweiter@beispiel.at" required />
          {!zeigeCcBcc && <button type="button" onClick={() => setZeigeCcBcc(true)} className="text-[12px] text-hs-blue-700 hover:underline shrink-0">Cc/Bcc</button>}
        </div>
        {zeigeCcBcc && (
          <>
            <div className="flex items-center gap-2">
              <label className="w-12 text-[12px] font-semibold text-hs-text-2 shrink-0">Cc</label>
              <input value={cc} onChange={e => setCc(e.target.value)} className="input py-1.5 text-[13px]" />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-12 text-[12px] font-semibold text-hs-text-2 shrink-0">Bcc</label>
              <input value={bcc} onChange={e => setBcc(e.target.value)} className="input py-1.5 text-[13px]" />
            </div>
          </>
        )}
        <div className="flex items-center gap-2">
          <label className="w-12 text-[12px] font-semibold text-hs-text-2 shrink-0">Betreff</label>
          <input value={subject} onChange={e => setSubject(e.target.value)} className="input py-1.5 text-[13px]" required />
        </div>
      </div>

      <div className="flex-1 min-h-0 px-5 py-3">
        <textarea ref={textRef} value={text} onChange={e => setText(e.target.value)}
          className="input h-full min-h-[220px] resize-none font-mono text-[12.5px] leading-relaxed" />
      </div>

      {(anhaenge.length > 0 || (modus === 'weiterleiten' && original && original.anhaenge.length > 0)) && (
        <div className="px-5 pb-2 flex flex-wrap gap-1.5">
          {modus === 'weiterleiten' && original?.anhaenge.map(a => (
            <span key={`orig-${a.index}`} className="pill bg-hs-bg text-hs-text-2" title="Anhang der Originalnachricht wird mitgeschickt">
              <Paperclip size={12} className="mr-1" />{a.dateiname} · {fmtBytes(a.groesse)}
            </span>
          ))}
          {anhaenge.map((a, i) => (
            <span key={i} className="pill bg-hs-blue-50 text-hs-blue-700">
              <Paperclip size={12} className="mr-1" />{a.dateiname} · {fmtBytes(a.groesse)}
              <button type="button" onClick={() => setAnhaenge(prev => prev.filter((_, j) => j !== i))} className="ml-1.5 hover:text-hs-err-fg"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      {/* CRM */}
      {darfSchreiben && (
        <div className="px-5 pb-2 space-y-2">
          <label className="inline-flex items-center gap-2 text-[12.5px] text-hs-text-1 cursor-pointer">
            <input type="checkbox" checked={crmAblegen} onChange={e => setCrmAblegen(e.target.checked)} className="rounded border-hs-line-str" />
            Im CRM protokollieren
          </label>
          {crmAblegen && !crmAuswahl && (
            <div className="flex items-center gap-2 text-[12.5px]">
              {crmSuche && <Loader2 size={14} className="animate-spin text-hs-tertiary" />}
              {crmZiel ? (
                <span className="pill bg-hs-ok-bg text-hs-ok-fg">
                  {crmZiel.typ === 'kontakt' ? <User size={12} className="mr-1" /> : <Building2 size={12} className="mr-1" />}{crmZiel.name}
                </span>
              ) : !crmSuche && <span className="text-hs-warn-fg">Kein Kontakt mit dieser Adresse gefunden.</span>}
              <button type="button" onClick={() => setCrmAuswahl(true)} className="text-hs-blue-700 hover:underline">{crmZiel ? 'ändern' : 'auswählen'}</button>
            </div>
          )}
          {crmAblegen && crmAuswahl && (
            <CrmAuswahl vorschlag={nurAdresse(adressListe(to)[0] ?? '')}
              onWahl={(t: CrmSuchTreffer) => { setCrmZiel({ typ: t.typ, id: t.id, name: t.name }); setCrmAuswahl(false); setFehler('') }}
              onAbbrechen={() => setCrmAuswahl(false)} />
          )}
        </div>
      )}

      {fehler && <p className="px-5 pb-2 text-[12.5px] text-hs-err-fg">{fehler}</p>}

      <div className="flex items-center gap-2 px-5 py-3 border-t border-hs-line">
        <button type="submit" disabled={sending} className="btn-primary">
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} strokeWidth={1.75} />}
          {sending ? 'Senden …' : 'Senden'}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary" disabled={sending}>
          <Paperclip size={16} strokeWidth={1.75} /> Anhang
        </button>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={dateienWaehlen} />
        <button type="button" onClick={onAbbrechen} className="btn-secondary ml-auto" disabled={sending}>Verwerfen</button>
      </div>
    </form>
  )
}
