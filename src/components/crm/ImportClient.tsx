'use client'

// ── CSV-Import-Assistent: Datei → Spaltenzuordnung → Vorschau → Import ────────
// Die Datei wird komplett im Browser gelesen und geprüft; importiert wird in
// Paketen zu 100 Zeilen über die Server Action (mit Fortschrittsanzeige).

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, Download, FileSpreadsheet, RotateCcw, Upload, Users, X } from 'lucide-react'
import {
  autoZuordnung, baueZeilen, dekodiere, felderFuer, findeKopfzeile, parseCsv, vorlageCsv,
  type ImportTyp, type ImportZeile,
} from '@/lib/crm/importCsv'
import { importiereZeilen, type ImportOptionen, type ZeilenErgebnis } from '@/app/(dashboard)/crm/import/actions'

const PAKET = 100

type Phase = 'datei' | 'zuordnen' | 'laeuft' | 'fertig'

export default function ImportClient() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [typ, setTyp] = useState<ImportTyp>('kontakte')
  const [phase, setPhase] = useState<Phase>('datei')
  const [dateiname, setDateiname] = useState('')
  const [rows, setRows] = useState<string[][]>([])
  const [zuordnung, setZuordnung] = useState<string[]>([])
  const [duplikate, setDuplikate] = useState<'ueberspringen' | 'aktualisieren'>('ueberspringen')
  const [firmenAnlegen, setFirmenAnlegen] = useState(true)
  const [fortschritt, setFortschritt] = useState(0)
  const [ergebnisse, setErgebnisse] = useState<ZeilenErgebnis[]>([])
  const [fehler, setFehler] = useState<string | null>(null)

  const felder = felderFuer(typ)
  const kopf = rows[0] ?? []
  const zeilen: ImportZeile[] = useMemo(
    () => (rows.length > 1 && zuordnung.length ? baueZeilen(typ, rows, zuordnung) : []),
    [typ, rows, zuordnung],
  )
  const gueltige = zeilen.filter(z => z.fehler.length === 0)
  const pflichtOk = felder.filter(f => f.pflicht).every(f => zuordnung.includes(f.key))

  function zuruecksetzen() {
    setPhase('datei'); setRows([]); setZuordnung([]); setDateiname(''); setErgebnisse([]); setFehler(null); setFortschritt(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function dateiLaden(file: File) {
    setFehler(null)
    const text = dekodiere(await file.arrayBuffer())
    let geparst = parseCsv(text)
    // Vorspann (Titel-/Beschreibungszeilen vor der Tabelle) automatisch überspringen
    const kopfIdx = findeKopfzeile(typ, geparst)
    if (kopfIdx > 0) geparst = geparst.slice(kopfIdx)
    if (geparst.length < 2) { setFehler('Die Datei enthält keine Datenzeilen (nur Kopfzeile oder leer).'); return }
    if (geparst.length > 5001) { setFehler('Maximal 5.000 Datenzeilen pro Datei – bitte aufteilen.'); return }
    setDateiname(file.name)
    setRows(geparst)
    setZuordnung(autoZuordnung(typ, geparst[0]))
    setPhase('zuordnen')
  }

  function setzeZuordnung(idx: number, key: string) {
    setZuordnung(z => z.map((v, i) => i === idx ? key : (key !== '' && v === key ? '' : v)))
  }

  async function importieren() {
    setPhase('laeuft'); setFehler(null); setErgebnisse([]); setFortschritt(0)
    const optionen: ImportOptionen = { duplikate, firmenAnlegen }
    const alle: ZeilenErgebnis[] = []
    const daten = gueltige.map(z => ({ zeile: z.zeile, werte: z.werte }))
    // Zeilen mit Fehlern gleich in den Bericht übernehmen
    for (const z of zeilen.filter(x => x.fehler.length > 0)) {
      alle.push({ zeile: z.zeile, status: 'fehler', hinweis: z.fehler.join(', ') })
    }
    for (let i = 0; i < daten.length; i += PAKET) {
      const res = await importiereZeilen(typ, daten.slice(i, i + PAKET), optionen)
      if (!res.ok) { setFehler(res.error); setPhase('zuordnen'); return }
      alle.push(...res.ergebnisse)
      setFortschritt(Math.min(daten.length, i + PAKET))
      setErgebnisse([...alle])
    }
    alle.sort((a, b) => a.zeile - b.zeile)
    setErgebnisse(alle)
    setPhase('fertig')
    router.refresh()
  }

  function vorlageHerunterladen() {
    const blob = new Blob([vorlageCsv(typ)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = typ === 'firmen' ? 'vorlage-firmen.csv' : 'vorlage-kontakte.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const statistik = {
    angelegt:      ergebnisse.filter(e => e.status === 'angelegt').length,
    aktualisiert:  ergebnisse.filter(e => e.status === 'aktualisiert').length,
    uebersprungen: ergebnisse.filter(e => e.status === 'uebersprungen').length,
    fehler:        ergebnisse.filter(e => e.status === 'fehler').length,
  }
  const vorschau = zeilen.slice(0, 8)

  return (
    <div className="space-y-5">

      {/* ── Schritt 1: Typ + Datei ──────────────────────────────────────────── */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="overline">1 · Was wird importiert?</p>
          <div className="inline-flex rounded-lg border border-hs-line bg-white p-0.5">
            {([['kontakte', 'Kontakte', Users], ['firmen', 'Firmen', Building2]] as const).map(([key, label, Icon]) => (
              <button key={key} type="button" disabled={phase === 'laeuft'}
                onClick={() => { setTyp(key); if (rows.length) setZuordnung(autoZuordnung(key, rows[0])) }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] ${typ === key ? 'bg-hs-navy text-white font-medium' : 'text-hs-text-2 hover:text-hs-text'}`}>
                <Icon size={14} strokeWidth={1.75} /> {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={vorlageHerunterladen} className="btn-secondary ml-auto">
            <Download size={15} strokeWidth={1.75} /> CSV-Vorlage herunterladen
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void dateiLaden(f) }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={phase === 'laeuft'} className="btn-primary">
            <Upload size={15} strokeWidth={1.75} /> {rows.length ? 'Andere Datei wählen' : 'CSV-Datei wählen'}
          </button>
          {dateiname && (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-hs-text-2">
              <FileSpreadsheet size={15} strokeWidth={1.75} className="text-hs-tertiary" />
              {dateiname} · {rows.length - 1} Datenzeile{rows.length - 1 === 1 ? '' : 'n'}
            </span>
          )}
          {rows.length > 0 && phase !== 'laeuft' && (
            <button type="button" onClick={zuruecksetzen} className="text-[12.5px] text-hs-text-2 hover:text-hs-text inline-flex items-center gap-1">
              <RotateCcw size={13} strokeWidth={1.75} /> Zurücksetzen
            </button>
          )}
        </div>
        {fehler && <div className="rounded-lg border border-hs-err/40 bg-hs-err-bg text-hs-err-fg text-sm px-4 py-3">{fehler}</div>}
      </div>

      {/* ── Schritt 2: Spalten zuordnen ─────────────────────────────────────── */}
      {rows.length > 0 && (phase === 'zuordnen' || phase === 'laeuft') && (
        <div className="card space-y-4">
          <div>
            <p className="overline">2 · Spalten zuordnen</p>
            <p className="text-[12.5px] text-hs-text-2 mt-1">
              Jede CSV-Spalte einem Feld zuordnen (oder „ignorieren"). Die Zuordnung wurde anhand der Kopfzeile vorbelegt.
              {!pflichtOk && <span className="text-hs-err-fg font-medium"> Pflichtfeld fehlt: {felder.filter(f => f.pflicht && !zuordnung.includes(f.key)).map(f => f.label).join(', ')}.</span>}
            </p>
          </div>
          <div className="overflow-x-auto -mx-5 sm:-mx-6 px-5 sm:px-6">
            <table className="w-full text-[13px]">
              <thead className="table-head">
                <tr>
                  <th className="text-left px-3 py-2">CSV-Spalte</th>
                  <th className="text-left px-3 py-2">Beispiel (1. Zeile)</th>
                  <th className="text-left px-3 py-2">Wird importiert als</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hs-line">
                {kopf.map((h, idx) => {
                  const feld = felder.find(f => f.key === zuordnung[idx])
                  return (
                    <tr key={idx}>
                      <td className="px-3 py-1.5 font-medium">{h || <span className="text-hs-tertiary">Spalte {idx + 1}</span>}</td>
                      <td className="px-3 py-1.5 text-hs-text-2 max-w-[220px] truncate">{rows[1]?.[idx] ?? ''}</td>
                      <td className="px-3 py-1.5">
                        <select value={zuordnung[idx] ?? ''} disabled={phase === 'laeuft'} onChange={e => setzeZuordnung(idx, e.target.value)}
                          className={`input !py-1 !px-2 text-[12.5px] w-auto min-w-[190px] ${zuordnung[idx] ? '' : 'text-hs-tertiary'}`}>
                          <option value="">– ignorieren –</option>
                          {felder.map(f => <option key={f.key} value={f.key}>{f.label}{f.pflicht ? ' *' : ''}</option>)}
                        </select>
                        {feld?.hinweis && <span className="block text-[11px] text-hs-tertiary mt-0.5">{feld.hinweis}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Optionen */}
          <div className="grid sm:grid-cols-2 gap-3 pt-1 border-t border-hs-line">
            <div className="pt-3">
              <label className="form-label" htmlFor="imp-dup">Wenn ein Datensatz schon existiert</label>
              <select id="imp-dup" className="input" value={duplikate} disabled={phase === 'laeuft'} onChange={e => setDuplikate(e.target.value as 'ueberspringen' | 'aktualisieren')}>
                <option value="ueberspringen">Überspringen (nichts ändern)</option>
                <option value="aktualisieren">Aktualisieren (Felder mit CSV-Wert überschreiben)</option>
              </select>
              <p className="text-[11.5px] text-hs-tertiary mt-1">
                {typ === 'firmen' ? 'Erkennung über UID-Nummer, sonst über den Firmennamen.' : 'Erkennung über die E-Mail-Adresse, sonst über Vor- + Nachname.'}
              </p>
            </div>
            {typ === 'kontakte' && (
              <label className="flex items-center gap-2 text-sm text-hs-text sm:pt-9 cursor-pointer">
                <input type="checkbox" checked={firmenAnlegen} disabled={phase === 'laeuft'} onChange={e => setFirmenAnlegen(e.target.checked)} className="accent-hs-teal" />
                Unbekannte Firmennamen automatisch als Firma anlegen
              </label>
            )}
          </div>

          {/* Vorschau */}
          <div>
            <p className="overline mb-2">3 · Vorschau</p>
            {zeilen.some(z => z.fehler.length || z.warnungen.length) && (
              <p className="text-[12.5px] text-hs-text-2 mb-2">
                {zeilen.filter(z => z.fehler.length).length > 0 && <span className="text-hs-err-fg font-medium">{zeilen.filter(z => z.fehler.length).length} Zeile(n) mit Fehlern werden nicht importiert. </span>}
                {zeilen.filter(z => z.warnungen.length).length > 0 && <span>{zeilen.filter(z => z.warnungen.length).length} Zeile(n) mit Hinweisen.</span>}
              </p>
            )}
            <div className="overflow-x-auto rounded-lg border border-hs-line">
              <table className="w-full text-[12.5px]">
                <thead className="table-head">
                  <tr>
                    <th className="text-left px-3 py-1.5">Zeile</th>
                    {zuordnung.map((k, i) => k ? <th key={i} className="text-left px-3 py-1.5">{felder.find(f => f.key === k)?.label}</th> : null)}
                    <th className="text-left px-3 py-1.5">Prüfung</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hs-line">
                  {vorschau.map(z => (
                    <tr key={z.zeile} className={z.fehler.length ? 'bg-hs-err-bg/40' : ''}>
                      <td className="px-3 py-1.5 font-mono text-hs-tertiary">{z.zeile}</td>
                      {zuordnung.map((k, i) => k ? <td key={i} className="px-3 py-1.5 max-w-[180px] truncate">{z.werte[k] ?? ''}</td> : null)}
                      <td className="px-3 py-1.5 text-[11.5px]">
                        {z.fehler.length ? <span className="text-hs-err-fg">{z.fehler.join(', ')}</span>
                          : z.warnungen.length ? <span className="text-hs-warn-fg">{z.warnungen.join('; ')}</span>
                          : <Check size={13} className="text-hs-ok-fg" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {zeilen.length > vorschau.length && <p className="text-[11.5px] text-hs-tertiary mt-1">… und {zeilen.length - vorschau.length} weitere Zeilen.</p>}
          </div>

          <div className="flex items-center gap-3 flex-wrap pt-1">
            <button type="button" onClick={importieren} disabled={phase === 'laeuft' || !pflichtOk || gueltige.length === 0} className="btn-primary">
              <Upload size={15} strokeWidth={1.75} />
              {phase === 'laeuft' ? `Importiert … ${fortschritt} / ${gueltige.length}` : `${gueltige.length} ${typ === 'firmen' ? 'Firmen' : 'Kontakte'} importieren`}
            </button>
            {phase === 'laeuft' && (
              <div className="flex-1 min-w-[160px] h-2 rounded-full bg-hs-bg overflow-hidden">
                <div className="h-full bg-hs-blue-500 transition-all" style={{ width: `${gueltige.length ? Math.round(fortschritt / gueltige.length * 100) : 0}%` }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bericht ─────────────────────────────────────────────────────────── */}
      {phase === 'fertig' && (
        <div className="card space-y-4">
          <p className="overline">Ergebnis</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kennzahl label="Angelegt" wert={statistik.angelegt} klasse="text-hs-ok-fg" />
            <Kennzahl label="Aktualisiert" wert={statistik.aktualisiert} klasse="text-hs-blue-700" />
            <Kennzahl label="Übersprungen" wert={statistik.uebersprungen} klasse="text-hs-text-2" />
            <Kennzahl label="Fehler" wert={statistik.fehler} klasse={statistik.fehler ? 'text-hs-err-fg' : 'text-hs-text-2'} />
          </div>
          {(statistik.fehler > 0 || statistik.uebersprungen > 0) && (
            <div className="overflow-x-auto rounded-lg border border-hs-line max-h-72 overflow-y-auto">
              <table className="w-full text-[12.5px]">
                <thead className="table-head sticky top-0"><tr><th className="text-left px-3 py-1.5">Zeile</th><th className="text-left px-3 py-1.5">Status</th><th className="text-left px-3 py-1.5">Hinweis</th></tr></thead>
                <tbody className="divide-y divide-hs-line">
                  {ergebnisse.filter(e => e.status === 'fehler' || e.status === 'uebersprungen').map(e => (
                    <tr key={e.zeile}>
                      <td className="px-3 py-1.5 font-mono text-hs-tertiary">{e.zeile}</td>
                      <td className="px-3 py-1.5">{e.status === 'fehler' ? <span className="text-hs-err-fg inline-flex items-center gap-1"><X size={12} /> Fehler</span> : 'übersprungen'}</td>
                      <td className="px-3 py-1.5 text-hs-text-2">{e.hinweis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center gap-2">
            <a href={typ === 'firmen' ? '/crm/firmen' : '/crm/kontakte'} className="btn-primary">{typ === 'firmen' ? 'Zu den Firmen' : 'Zu den Kontakten'}</a>
            <button type="button" onClick={zuruecksetzen} className="btn-secondary"><RotateCcw size={14} strokeWidth={1.75} /> Weitere Datei importieren</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Kennzahl({ label, wert, klasse }: { label: string; wert: number; klasse: string }) {
  return (
    <div className="rounded-lg border border-hs-line bg-hs-bg/60 px-3 py-2.5">
      <p className="text-[11px] font-semibold text-hs-text-2">{label}</p>
      <p className={`font-mono text-[22px] leading-tight mt-0.5 ${klasse}`}>{wert}</p>
    </div>
  )
}
