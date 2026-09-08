import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { TrendingUp, TrendingDown, Wallet, Landmark, FileText, Receipt, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { getCurrentMembership } from '@/lib/auth/roles'
import { fmtEuro, fmtDatum, fmtProzent } from '@/lib/format'
import { ladeReport, type KategorieSumme, type MonatsZeile } from './_data'
import ReportSteuerung from './ReportSteuerung'

export const metadata: Metadata = { title: 'Reporting – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

// ── Hilfskomponenten ─────────────────────────────────────────────────────────

function Delta({ ist, vorjahr, invers = false }: { ist: number; vorjahr: number; invers?: boolean }) {
  if (!vorjahr) return null
  const d = ist - vorjahr
  const pct = (d / Math.abs(vorjahr)) * 100
  const gut = invers ? d <= 0 : d >= 0
  return (
    <span className={`text-[11px] font-medium inline-flex items-center gap-0.5 ${gut ? 'text-hs-ok-fg' : 'text-hs-err-fg'}`} title={`Vorjahr: ${fmtEuro(vorjahr)}`}>
      {d >= 0 ? <TrendingUp size={11} strokeWidth={2} /> : <TrendingDown size={11} strokeWidth={2} />}
      {d >= 0 ? '+' : ''}{fmtProzent(pct, 0)} zum Vorjahr
    </span>
  )
}

function Kpi({ label, wert, icon, tone = 'neutral', sub, delta }: {
  label: string; wert: number; icon: React.ReactNode; tone?: 'neutral' | 'ok' | 'err' | 'blue'; sub?: React.ReactNode; delta?: React.ReactNode
}) {
  const farbe = tone === 'ok' ? 'text-hs-ok-fg' : tone === 'err' ? 'text-hs-err-fg' : tone === 'blue' ? 'text-hs-blue-700' : 'text-hs-text'
  return (
    <div className="bg-white rounded-xl border border-hs-line p-4 flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="overline">{label}</span>
        <span className="text-hs-tertiary">{icon}</span>
      </div>
      <span className={`text-xl font-semibold tabular-nums truncate ${farbe}`}>{fmtEuro(wert)}</span>
      {delta}
      {sub && <span className="text-[11.5px] text-hs-text-2">{sub}</span>}
    </div>
  )
}

function KategorieListe({ titel, zeilen, gesamt, farbe }: { titel: string; zeilen: KategorieSumme[]; gesamt: number; farbe: string }) {
  const hatVorjahr = zeilen.some(z => z.vorjahr !== 0)
  return (
    <div className="bg-white rounded-xl border border-hs-line overflow-hidden break-inside-avoid">
      <div className="flex items-center justify-between px-4 py-3 border-b border-hs-line">
        <h2 className="text-sm">{titel}</h2>
        <span className="font-semibold tabular-nums text-sm">{fmtEuro(gesamt)}</span>
      </div>
      {zeilen.length === 0 ? (
        <p className="px-4 py-5 text-sm text-hs-text-2">Keine Buchungen im Zeitraum.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="table-head"><tr>
            <th className="text-left px-4 py-1.5">Kategorie</th>
            <th className="text-right px-4 py-1.5 w-28">Netto</th>
            {hatVorjahr && <th className="text-right px-4 py-1.5 w-28 hidden sm:table-cell">Vorjahr</th>}
            <th className="text-right px-3 py-1.5 w-16">Anteil</th>
          </tr></thead>
          <tbody className="divide-y divide-hs-line">
            {zeilen.map(z => (
              <tr key={z.name}>
                <td className="px-4 py-1.5">
                  <div className="text-hs-text">{z.name}{z.konto_nr && <span className="ml-1.5 font-mono text-[10.5px] text-hs-tertiary">{z.konto_nr}</span>}</div>
                  <div className="h-1 rounded bg-hs-bg mt-1 overflow-hidden"><div className={`h-1 rounded ${farbe}`} style={{ width: `${Math.max(1, z.anteil * 100)}%` }} /></div>
                </td>
                <td className="px-4 py-1.5 text-right tabular-nums">{fmtEuro(z.netto)}</td>
                {hatVorjahr && <td className="px-4 py-1.5 text-right tabular-nums text-hs-text-2 hidden sm:table-cell">{fmtEuro(z.vorjahr)}</td>}
                <td className="px-3 py-1.5 text-right tabular-nums text-hs-text-2">{fmtProzent(z.anteil * 100, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** Monatsbalken Einnahmen/Ausgaben + Linie kumuliertes Ergebnis (inline SVG, ohne Bibliothek) */
function MonatsChart({ monate }: { monate: MonatsZeile[] }) {
  const W = 720, H = 200, padL = 56, padR = 12, padT = 12, padB = 26
  const innerW = W - padL - padR, innerH = H - padT - padB
  const maxBar = Math.max(1, ...monate.map(m => Math.max(m.einnahmen, m.ausgaben)))
  const kumMin = Math.min(0, ...monate.map(m => m.kumuliert)), kumMax = Math.max(0, ...monate.map(m => m.kumuliert))
  const maxY = Math.max(maxBar, kumMax, 1), minY = Math.min(0, kumMin)
  const y = (v: number) => padT + innerH - ((v - minY) / (maxY - minY)) * innerH
  const slot = innerW / 12, bw = slot * 0.3
  const linie = monate.map((m, i) => `${padL + slot * i + slot / 2},${y(m.kumuliert)}`).join(' ')
  const ticks = 4
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Monatsverlauf Einnahmen, Ausgaben und kumuliertes Ergebnis">
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = minY + ((maxY - minY) * i) / ticks
        return (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#E5E9F0" strokeWidth={1} />
            <text x={padL - 6} y={y(v) + 3} fontSize={9} textAnchor="end" fill="#7A8699" fontFamily="IBM Plex Mono, monospace">{Math.round(v / 1000)}k</text>
          </g>
        )
      })}
      {monate.map((m, i) => {
        const x0 = padL + slot * i
        return (
          <g key={m.monat} opacity={m.vorBeginn ? 0.35 : 1}>
            <rect x={x0 + slot / 2 - bw - 1} y={y(m.einnahmen)} width={bw} height={Math.max(0, y(0) - y(m.einnahmen))} fill="#4F86D6" rx={1.5}>
              <title>{`${m.label}: Einnahmen ${fmtEuro(m.einnahmen)}`}</title>
            </rect>
            <rect x={x0 + slot / 2 + 1} y={y(m.ausgaben)} width={bw} height={Math.max(0, y(0) - y(m.ausgaben))} fill="#C9D3E3" rx={1.5}>
              <title>{`${m.label}: Ausgaben ${fmtEuro(m.ausgaben)}`}</title>
            </rect>
            <text x={x0 + slot / 2} y={H - 8} fontSize={10} textAnchor="middle" fill="#4B5563" fontFamily="IBM Plex Sans, sans-serif">{m.label}</text>
          </g>
        )
      })}
      <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="#9AA6B8" strokeWidth={1} />
      <polyline points={linie} fill="none" stroke="#1F3A5F" strokeWidth={2} strokeLinejoin="round" />
      {monate.map((m, i) => (
        <circle key={m.monat} cx={padL + slot * i + slot / 2} cy={y(m.kumuliert)} r={2.5} fill="#1F3A5F"><title>{`${m.label}: kumuliertes Ergebnis ${fmtEuro(m.kumuliert)}`}</title></circle>
      ))}
    </svg>
  )
}

// ── Seite ────────────────────────────────────────────────────────────────────

export default async function ReportingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const jahr = typeof sp.jahr === 'string' ? Number(sp.jahr) : undefined
  const d = await ladeReport(membership.tenantId, Number.isFinite(jahr) ? jahr : undefined)
  const { kpi, vermoegen: v, ust } = d
  const einnahmenGesamt = d.einnahmenKategorien.reduce((s, z) => s + z.netto, 0)
  const ausgabenGesamt  = d.ausgabenKategorien.reduce((s, z) => s + z.netto, 0)
  const warnungen = [
    kpi.forderungenUeberfaellig > 0 ? `${fmtEuro(kpi.forderungenUeberfaellig)} an Forderungen sind überfällig.` : null,
    kpi.verbindlichkeitenUeberfaellig > 0 ? `${fmtEuro(kpi.verbindlichkeitenUeberfaellig)} an Eingangsrechnungen sind überfällig.` : null,
    kpi.liquiditaet < kpi.verbindlichkeitenOffen ? 'Die Kontensalden decken die offenen Verbindlichkeiten nicht vollständig.' : null,
    d.konten.some(k => k.anzahlOffen > 0) ? `${d.konten.reduce((s, k) => s + k.anzahlOffen, 0)} Kontobewegungen sind noch nicht abgeglichen.` : null,
  ].filter(Boolean) as string[]

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <style>{`@media print { header, nav, aside, .print-hide { display: none !important } main { padding: 0 !important } body { background: #fff } .break-inside-avoid { break-inside: avoid } }`}</style>

      {/* Kopf */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl">Unternehmens-Report</h1>
          <p className="text-sm text-hs-text-2 mt-1">
            {d.mandant} · Geschäftsjahr {d.jahr} · Stichtag {fmtDatum(d.stichtag)}
            {d.betriebsbeginn && d.betriebsbeginn.slice(0, 4) === String(d.jahr) && ` · Betriebsbeginn ${fmtDatum(d.betriebsbeginn)}`}
            {' · '}{d.anzahlBuchungen} Buchungen
          </p>
        </div>
        <ReportSteuerung jahr={d.jahr} jahre={d.verfuegbareJahre} />
      </div>

      {warnungen.length > 0 && (
        <div className="bg-hs-warn-bg border border-hs-warn/30 rounded-xl px-4 py-3 text-sm text-hs-warn-fg space-y-1">
          {warnungen.map(w => <p key={w} className="flex items-start gap-2"><AlertTriangle size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" />{w}</p>)}
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label={`Einnahmen ${d.jahr}`} wert={kpi.einnahmenNetto} icon={<TrendingUp size={16} strokeWidth={1.75} />} tone="ok" sub="netto" delta={<Delta ist={kpi.einnahmenNetto} vorjahr={kpi.einnahmenVorjahr} />} />
        <Kpi label={`Aufwendungen ${d.jahr}`} wert={kpi.ausgabenNetto} icon={<TrendingDown size={16} strokeWidth={1.75} />} sub={`davon abzugsfähig ${fmtEuro(kpi.ausgabenAbzugsfaehig)}`} delta={<Delta ist={kpi.ausgabenNetto} vorjahr={kpi.ausgabenVorjahr} invers />} />
        <Kpi label="Ergebnis (E&A)" wert={kpi.ergebnis} icon={<FileText size={16} strokeWidth={1.75} />} tone={kpi.ergebnis >= 0 ? 'blue' : 'err'} sub="Einnahmen − Ausgaben, netto" delta={<Delta ist={kpi.ergebnis} vorjahr={kpi.ergebnisVorjahr} />} />
        <Kpi label="Liquidität" wert={kpi.liquiditaet} icon={<Wallet size={16} strokeWidth={1.75} />} tone={kpi.liquiditaet >= 0 ? 'neutral' : 'err'} sub={`${d.konten.length} Konten`} />
        <Kpi label="Offene Forderungen" wert={kpi.forderungenOffen} icon={<Receipt size={16} strokeWidth={1.75} />} tone={kpi.forderungenUeberfaellig > 0 ? 'err' : 'neutral'} sub={kpi.forderungenUeberfaellig > 0 ? `davon überfällig ${fmtEuro(kpi.forderungenUeberfaellig)}` : `${d.forderungen.length} Rechnungen`} />
        <Kpi label="Offene Verbindlichkeiten" wert={kpi.verbindlichkeitenOffen} icon={<Landmark size={16} strokeWidth={1.75} />} tone={kpi.verbindlichkeitenUeberfaellig > 0 ? 'err' : 'neutral'} sub={kpi.verbindlichkeitenUeberfaellig > 0 ? `davon überfällig ${fmtEuro(kpi.verbindlichkeitenUeberfaellig)}` : `${d.verbindlichkeiten.length} Eingangsrechnungen`} />
      </div>

      {/* Vermögensübersicht */}
      <div className="bg-white rounded-xl border border-hs-line overflow-hidden break-inside-avoid">
        <div className="px-4 py-3 border-b border-hs-line flex items-center justify-between">
          <h2 className="text-sm">Vermögensübersicht zum {fmtDatum(d.stichtag)}</h2>
          <span className="text-[11.5px] text-hs-text-2">Nebenrechnung zur Einnahmen-Ausgaben-Rechnung</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-hs-line text-sm">
          <div className="p-4 space-y-1.5">
            <p className="overline mb-2">Vermögen</p>
            <div className="flex justify-between"><span className="text-hs-text-1">Anlagevermögen (Buchwerte)</span><span className="tabular-nums">{fmtEuro(v.anlagevermoegen)}</span></div>
            <div className="flex justify-between"><span className="text-hs-text-1">Bank- und Kassakonten</span><span className="tabular-nums">{fmtEuro(v.kontenSumme)}</span></div>
            <div className="flex justify-between"><span className="text-hs-text-1">Offene Forderungen</span><span className="tabular-nums">{fmtEuro(v.forderungen)}</span></div>
            <div className="flex justify-between text-hs-text-2 text-xs pl-3"><span>= Umlaufvermögen</span><span className="tabular-nums">{fmtEuro(v.umlaufvermoegen)}</span></div>
            <div className="flex justify-between font-semibold pt-1.5 border-t border-hs-line"><span>Summe Vermögen</span><span className="tabular-nums">{fmtEuro(v.anlagevermoegen + v.umlaufvermoegen)}</span></div>
          </div>
          <div className="p-4 space-y-1.5">
            <p className="overline mb-2">Verbindlichkeiten</p>
            <div className="flex justify-between"><span className="text-hs-text-1">Offene Eingangsrechnungen</span><span className="tabular-nums">{fmtEuro(v.verbindlichkeiten)}</span></div>
            <div className="flex justify-between"><span className="text-hs-text-1">USt-Zahllast offen {ust.kleinunternehmer ? '(Kleinunternehmer)' : '(Schätzung)'}</span><span className="tabular-nums">{fmtEuro(Math.max(0, v.ustSaldoOffen))}</span></div>
            {v.ustSaldoOffen < 0 && <div className="flex justify-between text-hs-ok-fg"><span>Vorsteuer-Guthaben (Schätzung)</span><span className="tabular-nums">{fmtEuro(-v.ustSaldoOffen)}</span></div>}
            <div className="flex justify-between font-semibold pt-1.5 border-t border-hs-line"><span>Summe Verbindlichkeiten</span><span className="tabular-nums">{fmtEuro(v.verbindlichkeiten + Math.max(0, v.ustSaldoOffen))}</span></div>
            <div className={`flex justify-between font-semibold text-base pt-2 ${v.nettoVermoegen >= 0 ? 'text-hs-blue-700' : 'text-hs-err-fg'}`}><span>Netto-Vermögen</span><span className="tabular-nums">{fmtEuro(v.nettoVermoegen)}</span></div>
          </div>
        </div>
      </div>

      {/* Monatsverlauf */}
      <div className="bg-white rounded-xl border border-hs-line p-4 break-inside-avoid">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <h2 className="text-sm">Monatsverlauf {d.jahr}</h2>
          <div className="flex items-center gap-3 text-[11.5px] text-hs-text-2">
            <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-[#4F86D6]" />Einnahmen</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-[#C9D3E3]" />Ausgaben</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-0.5 bg-[#1F3A5F]" />Ergebnis kumuliert</span>
          </div>
        </div>
        <MonatsChart monate={d.monate} />
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs">
            <thead className="table-head"><tr>
              <th className="text-left px-2 py-1">Monat</th>
              {d.monate.map(m => <th key={m.monat} className={`text-right px-2 py-1 ${m.vorBeginn ? 'text-hs-tertiary' : ''}`}>{m.label}{m.abgeschlossen && <CheckCircle2 size={9} strokeWidth={2} className="inline ml-0.5 -mt-px text-hs-ok-fg" />}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-hs-line tabular-nums">
              <tr><td className="px-2 py-1 text-hs-text-2">Einnahmen</td>{d.monate.map(m => <td key={m.monat} className="text-right px-2 py-1">{m.einnahmen ? fmtEuro(m.einnahmen) : '–'}</td>)}</tr>
              <tr><td className="px-2 py-1 text-hs-text-2">Ausgaben</td>{d.monate.map(m => <td key={m.monat} className="text-right px-2 py-1">{m.ausgaben ? fmtEuro(m.ausgaben) : '–'}</td>)}</tr>
              <tr className="font-semibold"><td className="px-2 py-1">Ergebnis</td>{d.monate.map(m => <td key={m.monat} className={`text-right px-2 py-1 ${m.ergebnis < 0 ? 'text-hs-err-fg' : ''}`}>{m.einnahmen || m.ausgaben ? fmtEuro(m.ergebnis) : '–'}</td>)}</tr>
            </tbody>
          </table>
          {d.monatsabschluesse.length > 0 && <p className="text-[11px] text-hs-text-2 mt-1"><CheckCircle2 size={10} strokeWidth={2} className="inline mr-0.5 -mt-px text-hs-ok-fg" /> = Monat abgeschlossen</p>}
        </div>
      </div>

      {/* Kategorien */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <KategorieListe titel={`Einnahmen ${d.jahr} nach Kategorie`} zeilen={d.einnahmenKategorien} gesamt={einnahmenGesamt} farbe="bg-hs-blue-500" />
        <KategorieListe titel={`Aufwendungen ${d.jahr} nach Kategorie`} zeilen={d.ausgabenKategorien} gesamt={ausgabenGesamt} farbe="bg-hs-text-2" />
      </div>

      {/* Forderungen + Verbindlichkeiten */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-hs-line overflow-hidden break-inside-avoid">
          <div className="flex items-center justify-between px-4 py-3 border-b border-hs-line">
            <h2 className="text-sm">Forderungen – offene Ausgangsrechnungen</h2>
            <Link href="/rechnungen/offene-posten" className="text-xs text-hs-blue-700 hover:underline print-hide">Offene Posten →</Link>
          </div>
          {d.forderungen.length === 0 ? <p className="px-4 py-5 text-sm text-hs-text-2">Keine offenen Forderungen.</p> : (
            <table className="w-full text-sm">
              <thead className="table-head"><tr><th className="text-left px-4 py-1.5">Rechnung</th><th className="text-left px-3 py-1.5 hidden sm:table-cell">Fällig</th><th className="text-right px-4 py-1.5">Offen</th></tr></thead>
              <tbody className="divide-y divide-hs-line">
                {d.forderungen.map(f => (
                  <tr key={f.id}>
                    <td className="px-4 py-1.5"><Link href={`/rechnungen/${f.id}`} className="text-hs-text hover:text-hs-blue-700">{f.nummer ?? 'Entwurf'} · {f.empfaenger}</Link><div className="text-[11px] text-hs-text-2">{fmtDatum(f.datum)}</div></td>
                    <td className="px-3 py-1.5 hidden sm:table-cell tabular-nums">{f.faellig_am ? fmtDatum(f.faellig_am) : '–'}{f.ueberfaellig && <span className="ml-1 pill bg-hs-err-bg text-hs-err-fg">{f.tageUeberfaellig} Tg.</span>}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums font-medium">{fmtEuro(f.offen)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-semibold border-t border-hs-line"><td className="px-4 py-1.5" colSpan={2}>Summe</td><td className="px-4 py-1.5 text-right tabular-nums">{fmtEuro(kpi.forderungenOffen)}</td></tr></tfoot>
            </table>
          )}
        </div>
        <div className="bg-white rounded-xl border border-hs-line overflow-hidden break-inside-avoid">
          <div className="flex items-center justify-between px-4 py-3 border-b border-hs-line">
            <h2 className="text-sm">Verbindlichkeiten – offene Eingangsrechnungen</h2>
            <Link href="/rechnungen/verbindlichkeiten" className="text-xs text-hs-blue-700 hover:underline print-hide">Verbindlichkeiten →</Link>
          </div>
          {d.verbindlichkeiten.length === 0 ? <p className="px-4 py-5 text-sm text-hs-text-2">Keine offenen Verbindlichkeiten.</p> : (
            <table className="w-full text-sm">
              <thead className="table-head"><tr><th className="text-left px-4 py-1.5">Lieferant</th><th className="text-left px-3 py-1.5 hidden sm:table-cell">Fällig</th><th className="text-right px-4 py-1.5">Brutto</th></tr></thead>
              <tbody className="divide-y divide-hs-line">
                {d.verbindlichkeiten.map(e => (
                  <tr key={e.id}>
                    <td className="px-4 py-1.5"><div className="text-hs-text">{e.lieferant}{e.rechnungsnummer && <span className="ml-1 font-mono text-[10.5px] text-hs-tertiary">{e.rechnungsnummer}</span>}</div><div className="text-[11px] text-hs-text-2 truncate max-w-[260px]">{e.beschreibung}</div></td>
                    <td className="px-3 py-1.5 hidden sm:table-cell tabular-nums">{fmtDatum(e.faellig_am)}{e.ueberfaellig && <span className="ml-1 pill bg-hs-err-bg text-hs-err-fg">{e.tageUeberfaellig} Tg.</span>}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums font-medium">{fmtEuro(e.brutto)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-semibold border-t border-hs-line"><td className="px-4 py-1.5" colSpan={2}>Summe</td><td className="px-4 py-1.5 text-right tabular-nums">{fmtEuro(kpi.verbindlichkeitenOffen)}</td></tr></tfoot>
            </table>
          )}
        </div>
      </div>

      {/* Konten + Anlagen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-hs-line overflow-hidden break-inside-avoid">
          <div className="flex items-center justify-between px-4 py-3 border-b border-hs-line">
            <h2 className="text-sm">Konten</h2>
            <Link href="/konten" className="text-xs text-hs-blue-700 hover:underline print-hide">Kontoabstimmung →</Link>
          </div>
          {d.konten.length === 0 ? <p className="px-4 py-5 text-sm text-hs-text-2">Noch keine Konten angelegt.</p> : (
            <table className="w-full text-sm">
              <thead className="table-head"><tr><th className="text-left px-4 py-1.5">Konto</th><th className="text-right px-3 py-1.5 hidden sm:table-cell">abgeglichen</th><th className="text-right px-4 py-1.5">Saldo</th></tr></thead>
              <tbody className="divide-y divide-hs-line">
                {d.konten.map(k => (
                  <tr key={k.id}>
                    <td className="px-4 py-1.5"><div className="text-hs-text">{k.name}</div><div className="text-[11px] text-hs-text-2 font-mono">{k.iban ?? k.typ}{k.anzahlOffen > 0 && <span className="ml-1.5 font-sans text-hs-warn-fg">{k.anzahlOffen} offen</span>}</div></td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-hs-text-2 hidden sm:table-cell">{fmtEuro(k.saldoAbgeglichen)}</td>
                    <td className={`px-4 py-1.5 text-right tabular-nums font-medium ${k.saldo < 0 ? 'text-hs-err-fg' : ''}`}>{fmtEuro(k.saldo)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-semibold border-t border-hs-line"><td className="px-4 py-1.5" colSpan={2}>Liquidität gesamt</td><td className="px-4 py-1.5 text-right tabular-nums">{fmtEuro(v.kontenSumme)}</td></tr></tfoot>
            </table>
          )}
        </div>
        <div className="bg-white rounded-xl border border-hs-line overflow-hidden break-inside-avoid">
          <div className="flex items-center justify-between px-4 py-3 border-b border-hs-line">
            <h2 className="text-sm">Anlagevermögen</h2>
            <Link href="/buchhaltung/anlagen" className="text-xs text-hs-blue-700 hover:underline print-hide">Anlagenverzeichnis →</Link>
          </div>
          {d.anlagen.length === 0 ? <p className="px-4 py-5 text-sm text-hs-text-2">Kein Anlagevermögen im Bestand – Anlagen im Anlagenverzeichnis erfassen.</p> : (
            <table className="w-full text-sm">
              <thead className="table-head"><tr><th className="text-left px-4 py-1.5">Anlage</th><th className="text-right px-3 py-1.5 hidden sm:table-cell">AfA {d.jahr}</th><th className="text-right px-4 py-1.5">Buchwert</th></tr></thead>
              <tbody className="divide-y divide-hs-line">
                {d.anlagen.map(a => (
                  <tr key={a.id}>
                    <td className="px-4 py-1.5"><div className="text-hs-text">{a.bezeichnung}</div><div className="text-[11px] text-hs-text-2">{a.gruppe} · {fmtDatum(a.anschaffungsdatum)} · AK {fmtEuro(a.anschaffungskosten)}</div></td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-hs-text-2 hidden sm:table-cell">{fmtEuro(a.afaJahr)}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums font-medium">{fmtEuro(a.buchwert)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-semibold border-t border-hs-line"><td className="px-4 py-1.5">Summe · AfA {d.jahr} gesamt {fmtEuro(v.afaJahr)}</td><td className="hidden sm:table-cell" /><td className="px-4 py-1.5 text-right tabular-nums">{fmtEuro(v.anlagevermoegen)}</td></tr></tfoot>
            </table>
          )}
        </div>
      </div>

      {/* Umsatzsteuer */}
      <div className="bg-white rounded-xl border border-hs-line p-4 break-inside-avoid">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm">Umsatzsteuer {d.jahr}</h2>
          <Link href="/buchhaltung/uva" className="text-xs text-hs-blue-700 hover:underline print-hide">UVA-Meldung →</Link>
        </div>
        {ust.kleinunternehmer ? (
          <p className="text-sm text-hs-text-2">Kleinunternehmerregelung – keine Umsatzsteuer.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><p className="overline">Umsatzsteuer</p><p className="tabular-nums font-semibold">{fmtEuro(ust.ustJahr)}</p></div>
            <div><p className="overline">Vorsteuer (abzugsfähig)</p><p className="tabular-nums font-semibold">{fmtEuro(ust.vstJahr)}</p></div>
            <div><p className="overline">Bereits übermittelt ({ust.zeitraum === 'monatlich' ? 'Monate' : 'Quartale'})</p><p className="tabular-nums font-semibold">{fmtEuro(ust.uebermittelt)} <span className="text-hs-text-2 font-normal text-xs">{ust.uvas.filter(u => u.gesperrt).map(u => u.zeitraum).join(', ') || '–'}</span></p></div>
            <div><p className="overline">Noch offen (Schätzung)</p><p className={`tabular-nums font-semibold ${ust.offen > 0 ? 'text-hs-err-fg' : 'text-hs-ok-fg'}`}>{fmtEuro(ust.offen)}</p></div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-hs-tertiary px-1">
        Systematik: Einnahmen-Ausgaben-Rechnung (Zufluss-/Abflussprinzip). Beträge netto, Konten- und Rechnungsbeträge brutto.
        Anlagevermögen zu Buchwerten laut Anlagenverzeichnis (lineare AfA). Die USt-Zahllast ist eine Schätzung aus den gebuchten Beträgen abzüglich übermittelter UVAs.
      </p>
    </div>
  )
}
