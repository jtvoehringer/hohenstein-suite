import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { TrendingUp, TrendingDown, Scale, Target, ListChecks, Plus, CalendarDays, AlertTriangle, FlaskConical } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { fmtDatum, fmtEuroMitZeichen } from '@/lib/format'
import { aktivitaetLabel } from '@/lib/crm/types'
import { ladeMandantMitglieder } from '@/lib/aufgaben/mitglieder'
import { Card, Tile, Empty, MehrLink, BarRow, Hinweis } from '@/components/dashboard/ui'
import AufgabenKachel from '@/components/dashboard/AufgabenKachel'
import { ladeDashboard, type R } from './_data'

export const metadata: Metadata = { title: 'Übersicht – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

// ── Übersicht: Begrüßung, KPIs, Aufgaben, Termine, Pipeline, E&A-Verlauf ─────

const STUFEN_FARBE: Record<string, string> = {
  interessent: 'bg-hs-blue-100', kontaktiert: 'bg-hs-blue-100', demo: 'bg-hs-blue-300',
  angebot: 'bg-hs-blue-300', verhandlung: 'bg-hs-teal', abschluss: 'bg-hs-teal', bestandskunde: 'bg-hs-teal',
}

function wochentagKurz(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('de-AT', { weekday: 'short' }).replace('.', '')
}

export default async function DashboardPage() {
  const membership = await getCurrentMembership()
  if (!membership) redirect('/mandant-waehlen')
  const tenantId = membership.tenantId
  const darfSchreiben = canWrite(membership.role)

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [daten, mitglieder, { data: profil }, { data: tenant }] = await Promise.all([
    ladeDashboard(tenantId),
    ladeMandantMitglieder(tenantId),
    user ? (supabase.from('profiles') as any).select('full_name, display_name').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null }),
    (supabase.from('tenants') as any).select('name, ist_demo').eq('id', tenantId).maybeSingle(),
  ])

  const p = (profil ?? {}) as R
  const vorname = String(p.full_name || p.display_name || user?.user_metadata?.full_name || '').trim().split(/\s+/)[0] || null
  const jetzt = new Date()
  const stunde = jetzt.getHours()
  const gruss = stunde < 11 ? 'Guten Morgen' : stunde < 17 ? 'Guten Tag' : 'Guten Abend'
  const datumLang = jetzt.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const istDemo = !!(tenant as R | null)?.ist_demo
  const { kpi } = daten

  const maxMonat = Math.max(1, ...daten.monate.flatMap(m => [m.einnahmen, m.ausgaben]))
  const maxStufe = Math.max(1, ...daten.pipeline.map(s => s.summe))
  const monatName = jetzt.toLocaleDateString('de-AT', { month: 'long' })

  return (
    <div className="space-y-6">
      {/* ── Kopf ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl">{gruss}{vorname ? `, ${vorname}` : ''}</h1>
          <p className="text-[13.5px] text-hs-text-2 mt-1">
            {datumLang}
            {istDemo && (
              <span className="inline-flex items-center gap-1 ml-3 text-hs-warn-fg">
                <FlaskConical size={13} strokeWidth={1.75} /> Demo-Umgebung – alle Zahlen sind Beispieldaten.
              </span>
            )}
          </p>
        </div>
        {darfSchreiben && (
          <div className="flex items-center gap-2">
            <Link href="/crm?neu=1" className="btn-secondary"><CalendarDays size={15} strokeWidth={1.75} /> Termin</Link>
            <Link href="/buchhaltung/neu" className="btn-secondary"><Plus size={15} strokeWidth={2} /> Buchung</Link>
            <Link href="/aufgaben?neu=1" className="btn-primary"><Plus size={15} strokeWidth={2} /> Aufgabe</Link>
          </div>
        )}
      </div>

      {/* ── Hinweise ─────────────────────────────────────────────────────── */}
      {daten.hinweise.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {daten.hinweise.map(h => (
            <Link key={h.key} href={h.href} className="block">
              <Hinweis tone={h.tone} className="flex items-center gap-2.5 hover:brightness-[.98]">
                <AlertTriangle size={15} strokeWidth={1.75} className="shrink-0" />
                <span className="flex-1">{h.text}</span>
                <span className="font-mono text-[11px] opacity-70">→</span>
              </Hinweis>
            </Link>
          ))}
        </div>
      )}

      {/* ── Kennzahlen ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
        <Tile label={`Einnahmen ${monatName}`} icon={TrendingUp} href="/buchhaltung"
          value={fmtEuroMitZeichen(kpi.einnahmenMonat)}
          sub={<>Ausgaben {fmtEuroMitZeichen(kpi.ausgabenMonat)} · netto</>} />
        <Tile label={`Ergebnis ${jetzt.getFullYear()}`} icon={kpi.ergebnisJahr >= 0 ? Scale : TrendingDown} href="/buchhaltung"
          value={fmtEuroMitZeichen(kpi.ergebnisJahr)}
          sub={`Einnahmen ${fmtEuroMitZeichen(kpi.einnahmenJahr)} · Ausgaben ${fmtEuroMitZeichen(kpi.ausgabenJahr)}`}
          tone={kpi.ergebnisJahr < 0 ? 'err' : undefined} />
        <Tile label="Offene Pipeline" icon={Target} href="/crm/pipeline"
          value={fmtEuroMitZeichen(kpi.pipelineSumme)}
          sub={kpi.pipelineAnzahl === 0 ? 'Keine offenen Chancen' : `${kpi.pipelineAnzahl} offene Chance${kpi.pipelineAnzahl === 1 ? '' : 'n'}`} />
        <Tile label="Offene Aufgaben" icon={ListChecks} href="/aufgaben"
          value={String(kpi.aufgabenOffen)}
          sub={kpi.aufgabenUeberfaellig > 0 ? `${kpi.aufgabenUeberfaellig} überfällig` : kpi.aufgabenOffen === 0 ? 'Alles erledigt' : 'Nichts überfällig'}
          tone={kpi.aufgabenUeberfaellig > 0 ? 'err' : kpi.aufgabenOffen > 0 ? undefined : 'ok'} />
      </div>

      {/* ── Aufgaben ─────────────────────────────────────────────────────── */}
      <AufgabenKachel aufgaben={daten.aufgaben} mitglieder={mitglieder} heute={daten.heute} darfSchreiben={darfSchreiben} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Nächste Termine ─────────────────────────────────────────────── */}
        <Card title="Nächste Termine" right={<MehrLink href="/crm">Kalender</MehrLink>}>
          {daten.termine.length === 0 ? (
            <Empty action={darfSchreiben ? { href: '/crm?neu=1', label: 'Termin anlegen' } : undefined}>Keine Termine in den nächsten 7 Tagen.</Empty>
          ) : (
            <ul className="divide-y divide-hs-line">
              {daten.termine.map(t => (
                <li key={t.id}>
                  <Link href={`/crm?datum=${t.datum}`} className="flex items-start gap-3 py-2.5 hover:bg-hs-bg -mx-2 px-2 rounded-lg">
                    <div className="w-[76px] shrink-0 font-mono text-[11.5px] tabular-nums text-hs-text-2 leading-tight pt-0.5">
                      <span className={`block ${t.datum === daten.heute ? 'text-hs-blue-700 font-semibold' : ''}`}>
                        {t.datum === daten.heute ? 'Heute' : `${wochentagKurz(t.datum)} ${fmtDatum(t.datum).slice(0, 5)}`}
                      </span>
                      <span className="block text-hs-tertiary">{t.ganztags || !t.uhrzeit_von ? 'ganztags' : `${t.uhrzeit_von}${t.uhrzeit_bis ? `–${t.uhrzeit_bis}` : ''}`}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-hs-text truncate">{t.betreff || aktivitaetLabel(t.art)}</p>
                      <p className="text-[11.5px] text-hs-text-2 truncate">{aktivitaetLabel(t.art)}{t.wer ? ` · ${t.wer}` : ''}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── Pipeline nach Stufe ─────────────────────────────────────────── */}
        <Card title="Pipeline nach Stufe" right={<MehrLink href="/crm/pipeline">Pipeline</MehrLink>}>
          {kpi.pipelineAnzahl === 0 ? (
            <Empty action={darfSchreiben ? { href: '/crm/pipeline', label: 'Verkaufschance anlegen' } : undefined}>Keine offenen Verkaufschancen.</Empty>
          ) : (
            <div>
              {daten.pipeline.map(s => (
                <BarRow key={s.stufe} label={s.label} sub={s.anzahl > 0 ? String(s.anzahl) : undefined} value={s.summe} max={maxStufe}
                  text={fmtEuroMitZeichen(s.summe)} color={STUFEN_FARBE[s.stufe] ?? 'bg-hs-blue-100'} />
              ))}
              <p className="text-[11px] text-hs-tertiary mt-2">Summe der Werte offener Chancen je Stufe · Anzahl hinter der Stufe</p>
            </div>
          )}
        </Card>

        {/* ── Einnahmen / Ausgaben 6 Monate ───────────────────────────────── */}
        <Card title="Einnahmen und Ausgaben" right={<span className="text-[11.5px] text-hs-tertiary">letzte 6 Monate · netto</span>}>
          <div className="flex items-end gap-2 sm:gap-3 h-40 pt-2">
            {daten.monate.map(m => (
              <div key={m.key} className="flex-1 min-w-0 flex flex-col items-center gap-1.5 h-full">
                <div className="flex-1 w-full flex items-end justify-center gap-1">
                  <div className="w-[42%] bg-hs-teal rounded-t" style={{ height: `${Math.max(2, Math.round(m.einnahmen / maxMonat * 100))}%` }}
                    title={`Einnahmen ${m.label}: ${fmtEuroMitZeichen(m.einnahmen)}`} />
                  <div className="w-[42%] bg-hs-blue-100 rounded-t" style={{ height: `${Math.max(2, Math.round(m.ausgaben / maxMonat * 100))}%` }}
                    title={`Ausgaben ${m.label}: ${fmtEuroMitZeichen(m.ausgaben)}`} />
                </div>
                <span className="font-mono text-[11px] text-hs-tertiary">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-6 gap-2 sm:gap-3">
            {daten.monate.map(m => (
              <div key={m.key} className="min-w-0 text-center font-mono text-[10.5px] tabular-nums leading-tight">
                <span className="block text-hs-ok-fg truncate" title={fmtEuroMitZeichen(m.einnahmen)}>{Math.round(m.einnahmen).toLocaleString('de-AT')}</span>
                <span className="block text-hs-text-2 truncate" title={fmtEuroMitZeichen(m.ausgaben)}>{Math.round(m.ausgaben).toLocaleString('de-AT')}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[11px] text-hs-text-2">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-hs-teal" /> Einnahmen</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-hs-blue-100" /> Ausgaben</span>
          </div>
        </Card>

        {/* ── Letzte Buchungen ────────────────────────────────────────────── */}
        <Card title="Letzte Buchungen" right={<MehrLink href="/buchhaltung">Buchungen</MehrLink>}>
          {daten.buchungen.length === 0 ? (
            <Empty action={darfSchreiben ? { href: '/buchhaltung/neu', label: 'Buchung erfassen' } : undefined}>Noch keine Buchungen erfasst.</Empty>
          ) : (
            <table className="w-full">
              <tbody>
                {daten.buchungen.map(b => (
                  <tr key={b.id} className="border-b border-hs-line last:border-0">
                    <td className="py-2 pr-2 font-mono text-[11.5px] text-hs-text-2 whitespace-nowrap tabular-nums">{fmtDatum(b.datum)}</td>
                    <td className="py-2 px-2 min-w-0">
                      <span className="block text-[13px] text-hs-text truncate max-w-[260px]">{b.beschreibung}</span>
                      <span className="block text-[11.5px] text-hs-text-2 truncate">{[b.firma, b.belegnummer].filter(Boolean).join(' · ') || (b.typ === 'einnahme' ? 'Einnahme' : 'Ausgabe')}</span>
                    </td>
                    <td className={`py-2 pl-2 betrag text-[12.5px] ${b.typ === 'einnahme' ? 'text-hs-ok-fg' : 'text-hs-text'}`}>
                      {b.typ === 'einnahme' ? '+' : '−'} {fmtEuroMitZeichen(b.betrag_brutto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <p className="text-[11px] text-hs-tertiary">Tipp: Strg K öffnet Seiten, Aktionen und die Suche von überall.</p>
    </div>
  )
}
