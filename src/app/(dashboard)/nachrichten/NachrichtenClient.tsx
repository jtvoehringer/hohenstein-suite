'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { PenSquare, RefreshCw, Settings, ChevronLeft, ChevronRight, Paperclip, Inbox, Send, FileText, Trash2, AlertOctagon, Archive, Folder, Loader2, Mail, X, CornerUpLeft } from 'lucide-react'
import type { OrdnerInfo, NachrichtKurz, NachrichtDetail, ListeAntwort } from '@/lib/email/types'
import NachrichtAnsicht from './NachrichtAnsicht'
import Composer, { type ComposerModus } from './Composer'
import { fmtListenDatum } from './utils'

const PAGE_SIZE = 50

function OrdnerIcon({ su }: { su: string | null }) {
  const p = { size: 15, strokeWidth: 1.75 }
  switch (su) {
    case '\\Inbox':   return <Inbox {...p} />
    case '\\Sent':    return <Send {...p} />
    case '\\Drafts':  return <FileText {...p} />
    case '\\Trash':   return <Trash2 {...p} />
    case '\\Junk':    return <AlertOctagon {...p} />
    case '\\Archive': return <Archive {...p} />
    default:          return <Folder {...p} />
  }
}

export default function NachrichtenClient({
  eigeneAdresse, signatur, darfSchreiben, smtpBereit,
}: {
  eigeneAdresse: string
  signatur: string
  darfSchreiben: boolean
  smtpBereit: boolean
}) {
  const [folders, setFolders]   = useState<OrdnerInfo[]>([])
  const [folder, setFolder]     = useState('INBOX')
  const [page, setPage]         = useState(0)
  const [liste, setListe]       = useState<ListeAntwort | null>(null)
  const [laden, setLaden]       = useState(false)
  const [fehler, setFehler]     = useState<string | null>(null)
  const [hinweis, setHinweis]   = useState<string | null>(null)
  const [keinKonto, setKeinKonto] = useState(false)
  const [selected, setSelected] = useState<NachrichtDetail | null>(null)
  const [detailLaden, setDetailLaden] = useState<number | null>(null)
  const [compose, setCompose]   = useState<{ modus: ComposerModus; original: NachrichtDetail | null } | null>(null)
  const [ordnerOffen, setOrdnerOffen] = useState(false)
  const gen = useRef(0)

  const ladeFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/nachrichten/folders')
      const d = await res.json()
      if (!res.ok || d.fehler) { setFehler(d.fehler ?? 'Ordner konnten nicht geladen werden.'); if (d.keinKonto) setKeinKonto(true); return }
      setFolders(d.folders ?? [])
    } catch (e) { setFehler(String(e)) }
  }, [])

  const ladeListe = useCallback(async (f: string, p: number) => {
    const g = ++gen.current
    setLaden(true); setFehler(null)
    try {
      const res = await fetch(`/api/nachrichten/list?folder=${encodeURIComponent(f)}&page=${p}&pageSize=${PAGE_SIZE}`)
      const d = await res.json()
      if (g !== gen.current) return
      if (!res.ok || d.fehler) { setFehler(d.fehler ?? 'Nachrichten konnten nicht geladen werden.'); if (d.keinKonto) setKeinKonto(true); return }
      setListe(d as ListeAntwort)
    } catch (e) { if (g === gen.current) setFehler(String(e)) }
    finally { if (g === gen.current) setLaden(false) }
  }, [])

  useEffect(() => { ladeFolders() }, [ladeFolders])
  useEffect(() => { ladeListe(folder, page) }, [folder, page, ladeListe])

  function aktualisieren() { ladeFolders(); ladeListe(folder, page) }

  function ordnerWaehlen(path: string) {
    setFolder(path); setPage(0); setSelected(null); setCompose(null); setOrdnerOffen(false)
  }

  async function oeffnen(m: NachrichtKurz) {
    setCompose(null); setHinweis(null)
    setDetailLaden(m.uid); setSelected(null)
    try {
      const res = await fetch(`/api/nachrichten/message?folder=${encodeURIComponent(folder)}&uid=${m.uid}`)
      const d = await res.json()
      if (!res.ok || d.fehler) { setFehler(d.fehler ?? 'Nachricht konnte nicht geladen werden.'); return }
      setSelected(d as NachrichtDetail)
      if (!m.gelesen) gelesenSetzen(m.uid, true)
    } catch (e) { setFehler(String(e)) }
    finally { setDetailLaden(null) }
  }

  function gelesenSetzen(uid: number, gelesen: boolean) {
    setListe(prev => prev ? { ...prev, messages: prev.messages.map(x => x.uid === uid ? { ...x, gelesen } : x) } : prev)
    setFolders(prev => prev.map(f => f.path === folder ? { ...f, unread: Math.max(0, f.unread + (gelesen ? -1 : 1)) } : f))
    setSelected(prev => prev && prev.uid === uid ? { ...prev, gelesen } : prev)
  }

  function entfernen(uid: number) {
    setListe(prev => prev ? { ...prev, total: Math.max(0, prev.total - 1), messages: prev.messages.filter(x => x.uid !== uid) } : prev)
    setSelected(null)
    ladeFolders()
  }

  const aktuellerOrdner = folders.find(f => f.path === folder)
  const ungelesenGesamt = folders.find(f => f.specialUse === '\\Inbox')?.unread ?? 0

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[560px]">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div>
          <h1 className="text-2xl inline-flex items-center gap-2">Posteingang {ungelesenGesamt > 0 && <span className="pill bg-hs-blue-50 text-hs-blue-700">{ungelesenGesamt} neu</span>}</h1>
          <p className="text-sm text-hs-text-2">{eigeneAdresse}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={aktualisieren} disabled={laden} className="btn-secondary" title="Aktualisieren">
            <RefreshCw size={16} strokeWidth={1.75} className={laden ? 'animate-spin' : ''} /> Aktualisieren
          </button>
          <Link href="/nachrichten/einstellungen" className="btn-secondary" title="E-Mail-Konto"><Settings size={16} strokeWidth={1.75} /></Link>
          <button onClick={() => { setCompose({ modus: 'neu', original: null }); setSelected(null) }} disabled={!smtpBereit}
            className="btn-primary" title={smtpBereit ? 'Neue Nachricht' : 'SMTP-Zugang fehlt – bitte im E-Mail-Konto ergänzen'}>
            <PenSquare size={16} strokeWidth={1.75} /> Neue Nachricht
          </button>
        </div>
      </div>

      {keinKonto && (
        <div className="card mb-3 py-3 text-[13px] text-hs-warn-fg flex items-center justify-between gap-3">
          <span>{fehler}</span>
          <Link href="/nachrichten/einstellungen" className="btn-secondary py-1.5">E-Mail-Konto einrichten</Link>
        </div>
      )}

      <div className="card p-0 sm:p-0 flex-1 min-h-0 flex overflow-hidden">
        {/* ── Linke Spalte: Ordner + Liste ── */}
        <div className="w-[380px] shrink-0 border-r border-hs-line flex flex-col min-h-0 bg-white">
          {/* Ordnerwahl */}
          <div className="border-b border-hs-line">
            <button onClick={() => setOrdnerOffen(v => !v)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-hs-bg">
              <span className="text-hs-blue-700"><OrdnerIcon su={aktuellerOrdner?.specialUse ?? null} /></span>
              <span className="text-[13.5px] font-semibold text-hs-text flex-1 truncate">{aktuellerOrdner?.name ?? folder}</span>
              {aktuellerOrdner && aktuellerOrdner.unread > 0 && <span className="pill bg-hs-blue-50 text-hs-blue-700">{aktuellerOrdner.unread}</span>}
              <ChevronRight size={15} strokeWidth={1.75} className={`text-hs-tertiary transition-transform ${ordnerOffen ? 'rotate-90' : ''}`} />
            </button>
            {ordnerOffen && (
              <div className="max-h-64 overflow-y-auto border-t border-hs-line bg-hs-bg py-1">
                {folders.length === 0 && <p className="px-4 py-2 text-[12.5px] text-hs-text-2">Ordner werden geladen …</p>}
                {folders.map(f => (
                  <button key={f.path} onClick={() => ordnerWaehlen(f.path)}
                    className={`w-full flex items-center gap-2 py-1.5 pr-4 text-left text-[13px] hover:bg-white ${f.path === folder ? 'text-hs-blue-700 font-semibold' : 'text-hs-text-1'}`}
                    style={{ paddingLeft: `${16 + f.ebene * 14}px` }}>
                    <OrdnerIcon su={f.specialUse} />
                    <span className="flex-1 truncate">{f.name}</span>
                    {f.unread > 0 && <span className="font-mono text-[11px] text-hs-blue-700">{f.unread}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {fehler && !keinKonto && (
            <div className="px-4 py-2 text-[12px] text-hs-err-fg bg-hs-err-bg flex items-start gap-2">
              <span className="flex-1">{fehler}</span>
              <button onClick={() => setFehler(null)}><X size={14} /></button>
            </div>
          )}

          {/* Liste */}
          <div className="flex-1 overflow-y-auto divide-y divide-hs-line">
            {laden && !liste && <p className="px-4 py-8 text-center text-[13px] text-hs-text-2 inline-flex w-full justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Nachrichten werden geladen …</p>}
            {liste?.messages.map(m => {
              const aktiv = selected?.uid === m.uid || detailLaden === m.uid
              const istGesendet = aktuellerOrdner?.specialUse === '\\Sent'
              return (
                <button key={m.uid} onClick={() => oeffnen(m)}
                  className={`w-full text-left px-4 py-2.5 transition-colors hover:bg-hs-bg ${aktiv ? 'bg-hs-blue-50 border-l-2 border-hs-teal' : 'border-l-2 border-transparent'}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`text-[13px] truncate ${m.gelesen ? 'text-hs-text-1' : 'font-bold text-hs-text'}`}>
                      {istGesendet ? (m.an || '–') : (m.vonName || m.von || '–')}
                    </p>
                    <span className="font-mono text-[11px] text-hs-tertiary shrink-0">{fmtListenDatum(m.datum)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {m.beantwortet && <CornerUpLeft size={12} strokeWidth={2} className="text-hs-tertiary shrink-0" />}
                    <p className={`text-[12.5px] truncate flex-1 ${m.gelesen ? 'text-hs-text-2' : 'font-semibold text-hs-text'}`}>{m.betreff}</p>
                    {m.hatAnhang && <Paperclip size={12} strokeWidth={2} className="text-hs-tertiary shrink-0" />}
                  </div>
                </button>
              )
            })}
            {!laden && liste && liste.messages.length === 0 && !fehler && (
              <p className="px-4 py-8 text-center text-[13px] text-hs-text-2">Keine Nachrichten in diesem Ordner.</p>
            )}
          </div>

          {/* Paging */}
          <div className="border-t border-hs-line px-3 py-2 flex items-center justify-between text-[12px] text-hs-text-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || laden} className="btn-secondary py-1 px-2 disabled:opacity-40" title="Neuere"><ChevronLeft size={14} /></button>
            <span className="font-mono text-[11px]">
              {liste ? `${liste.total === 0 ? 0 : page * PAGE_SIZE + 1}–${Math.min(liste.total, (page + 1) * PAGE_SIZE)} von ${liste.total}` : '–'}
            </span>
            <button onClick={() => setPage(p => p + 1)} disabled={!liste || page + 1 >= liste.seiten || laden} className="btn-secondary py-1 px-2 disabled:opacity-40" title="Ältere"><ChevronRight size={14} /></button>
          </div>
        </div>

        {/* ── Rechte Spalte: Inhalt ── */}
        <div className="flex-1 min-w-0 flex flex-col bg-white">
          {hinweis && (
            <div className="px-5 py-2 text-[12.5px] bg-hs-ok-bg text-hs-ok-fg flex items-center justify-between">
              <span>{hinweis}</span><button onClick={() => setHinweis(null)}><X size={14} /></button>
            </div>
          )}
          {compose ? (
            <Composer key={`${compose.modus}-${compose.original?.uid ?? 'neu'}`}
              modus={compose.modus} original={compose.original} eigeneAdresse={eigeneAdresse} signatur={signatur}
              darfSchreiben={darfSchreiben} kontaktInfo={compose.original?.kontaktInfo ?? null}
              onAbbrechen={() => setCompose(null)}
              onGesendet={({ crmHinweis }) => {
                setCompose(null)
                setHinweis(crmHinweis ? `Nachricht gesendet. ${crmHinweis}` : 'Nachricht gesendet.')
                ladeFolders()
                if (aktuellerOrdner?.specialUse === '\\Sent') ladeListe(folder, page)
              }} />
          ) : detailLaden !== null ? (
            <div className="flex-1 flex items-center justify-center text-[13px] text-hs-text-2 gap-2"><Loader2 size={16} className="animate-spin" /> Nachricht wird geladen …</div>
          ) : selected ? (
            <NachrichtAnsicht d={selected} folders={folders} darfSchreiben={darfSchreiben}
              onAntworten={modus => { if (!smtpBereit) { setFehler('SMTP-Zugang fehlt – bitte im E-Mail-Konto ergänzen.'); return } setCompose({ modus, original: selected }) }}
              onGeloescht={uid => { entfernen(uid); setHinweis('Nachricht gelöscht.') }}
              onVerschoben={(uid, ziel) => { entfernen(uid); setHinweis(`Nachricht nach „${folders.find(f => f.path === ziel)?.name ?? ziel}" verschoben.`) }}
              onGelesenGeaendert={gelesenSetzen}
              onCrmAbgelegt={(uid, id) => setSelected(prev => prev && prev.uid === uid ? { ...prev, crmAktivitaetId: id } : prev)}
              onFehler={setFehler} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-hs-text-2 gap-2">
              <Mail size={28} strokeWidth={1.5} className="text-hs-tertiary" />
              <p className="text-[13px]">Nachricht auswählen oder eine neue verfassen.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
