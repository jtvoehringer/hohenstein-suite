// ── Morgenbericht auf der Übersicht (Server-Komponente, per Suspense gestreamt) ──
// 1) Testzugänge, die über hohenstein-partner.at angefordert wurden (trial_anfragen +
//    demo_zugaenge: wer, wann, Ergebnis, letzte Anmeldung in software:112)
// 2) Healthstatus software:112 (src/lib/s112/health.ts)
// Nur für den Hohenstein-Mandanten; die Abfragen laufen server-seitig, die Karte
// blockiert das übrige Dashboard nicht (Suspense in page.tsx).

import Link from 'next/link'
import { Sunrise, Activity, UserPlus, CheckCircle2, AlertTriangle, XCircle, ExternalLink } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { fmtDatum } from '@/lib/format'
import { s112Health, s112BenutzerAnmeldungen, type Ampel, type S112Health } from '@/lib/s112/health'
import { s112Konfiguriert } from '@/lib/s112/admin'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

const TAGE_ZURUECK = 14

type TrialZeile = {
  id: string
  zeit: string
  name: string | null
  firma: string
  email: string
  ergebnis: 'erfolgreich' | 'fehler' | 'abgelehnt' | string
  hinweis: string | null
  firmaId: string | null
  gueltigBis: string | null
  zugangStatus: string | null
  letzteAnmeldung: string | null
  /** Benutzer existiert in software:112 nicht (mehr) – z. B. dort gelöscht */
  kontoFehlt: boolean
}

async function ladeTrials(tenantId: string): Promise<{ zeilen: TrialZeile[]; aktiveZugaenge: number; neu24h: number }> {
  const supabase = await createSupabaseServerClient()
  const seit = new Date(Date.now() - TAGE_ZURUECK * 24 * 3600 * 1000).toISOString()
  const [{ data: anfragen }, { data: zugaenge }] = await Promise.all([
    (supabase.from('trial_anfragen') as any)
      .select('id, email, firma_name, firma_id, demo_zugang_id, ergebnis, hinweis, herkunft, erstellt_am')
      .gte('erstellt_am', seit).order('erstellt_am', { ascending: false }).limit(50),
    (supabase.from('demo_zugaenge') as any)
      .select('id, name, email, s112_user_id, gueltig_bis, status, letzte_anmeldung, notizen')
      .eq('tenant_id', tenantId).neq('status', 'geloescht'),
  ])
  const zugangById = new Map<string, R>()
  const zugangByEmail = new Map<string, R>()
  for (const z of (zugaenge ?? []) as R[]) { zugangById.set(z.id, z); zugangByEmail.set(String(z.email).toLowerCase(), z) }

  // Letzte Anmeldung in software:112 (auth.users) – nur für die Zugänge der angezeigten Anfragen
  const userIds = [...new Set(((anfragen ?? []) as R[]).map(a => (zugangById.get(a.demo_zugang_id) ?? zugangByEmail.get(String(a.email).toLowerCase()))?.s112_user_id).filter(Boolean) as string[])]
  const { ok: anmeldungenGeladen, map: anmeldungen } = await s112BenutzerAnmeldungen(userIds)

  const zeilen: TrialZeile[] = ((anfragen ?? []) as R[])
    // Bot-Ablehnungen sind Rauschen – nur echte Anfragen anzeigen
    .filter(a => !(a.ergebnis === 'abgelehnt' && String(a.hinweis ?? '').startsWith('Bot-Filter')))
    .map(a => {
      const z = zugangById.get(a.demo_zugang_id) ?? zugangByEmail.get(String(a.email).toLowerCase()) ?? null
      const uid = z?.s112_user_id as string | undefined
      // s112LetzteAnmeldungen liefert nur Einträge für existierende Benutzer – fehlt der Eintrag, wurde das Konto in software:112 gelöscht
      const kontoFehlt = !!uid && anmeldungenGeladen && !anmeldungen.has(uid)
      return {
        id: a.id, zeit: a.erstellt_am, name: (z?.name as string | null) ?? null, firma: a.firma_name || '–', email: a.email,
        ergebnis: a.ergebnis, hinweis: a.hinweis ?? null, firmaId: a.firma_id ?? null,
        gueltigBis: (z?.gueltig_bis as string | null) ?? null, zugangStatus: (z?.status as string | null) ?? null,
        letzteAnmeldung: (uid ? anmeldungen.get(uid) : null) ?? (z?.letzte_anmeldung as string | null) ?? null,
        kontoFehlt,
      }
    })
  const seit24h = Date.now() - 24 * 3600 * 1000
  const selbst = ((zugaenge ?? []) as R[]).filter(z => z.status === 'aktiv' && String(z.notizen ?? '').includes('Selbstregistrierung'))
  return { zeilen, aktiveZugaenge: selbst.length, neu24h: zeilen.filter(z => Date.parse(z.zeit) >= seit24h && z.ergebnis === 'erfolgreich').length }
}

// ── Darstellung ──────────────────────────────────────────────────────────────

const AMPEL: Record<Ampel, { cls: string; punkt: string; label: string }> = {
  ok:   { cls: 'bg-hs-ok-bg text-hs-ok-fg',     punkt: 'bg-hs-ok',   label: 'alles in Ordnung' },
  warn: { cls: 'bg-hs-warn-bg text-hs-warn-fg', punkt: 'bg-hs-warn', label: 'Hinweise' },
  err:  { cls: 'bg-hs-err-bg text-hs-err-fg',   punkt: 'bg-hs-err',  label: 'Störung' },
}

function AmpelIcon({ a }: { a: Ampel }) {
  const cls = a === 'ok' ? 'text-hs-ok' : a === 'warn' ? 'text-hs-warn' : 'text-hs-err'
  const Icon = a === 'ok' ? CheckCircle2 : a === 'warn' ? AlertTriangle : XCircle
  return <Icon size={14} strokeWidth={2} className={`shrink-0 ${cls}`} />
}

function fmtZeitpunkt(iso: string): string {
  const d = new Date(iso)
  const heute = new Date(); heute.setHours(0, 0, 0, 0)
  const gestern = new Date(heute.getTime() - 86400000)
  const uhr = d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
  if (d >= heute) return `heute ${uhr}`
  if (d >= gestern) return `gestern ${uhr}`
  return `${fmtDatum(iso)} ${uhr}`
}

function ErgebnisPill({ e }: { e: string }) {
  const cls = e === 'erfolgreich' ? 'bg-hs-ok-bg text-hs-ok-fg' : e === 'fehler' ? 'bg-hs-err-bg text-hs-err-fg' : 'bg-gray-100 text-gray-700'
  const text = e === 'erfolgreich' ? 'Zugang vergeben' : e === 'fehler' ? 'Fehler' : 'abgelehnt'
  return <span className={`pill ${cls}`}>{text}</span>
}

function HealthBlock({ h }: { h: S112Health }) {
  if (!h.konfiguriert) {
    return (
      <p className="text-[12.5px] text-hs-warn-fg bg-hs-warn-bg rounded-lg px-3 py-2">
        Die Anbindung an software:112 ist nicht konfiguriert (S112_SUPABASE_URL / S112_SERVICE_ROLE_KEY) – kein Healthstatus verfügbar.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-hs-line">
        {h.punkte.map(p => (
          <li key={p.key} className="flex items-start gap-2 py-1.5 text-[12.5px]">
            <span className="pt-0.5"><AmpelIcon a={p.ampel} /></span>
            <span className="w-40 shrink-0 text-hs-text-2">{p.label}</span>
            <span className="flex-1 min-w-0">
              <span className="font-medium text-hs-text">{p.wert}</span>
              {p.detail && <span className="block text-[11.5px] text-hs-text-2">{p.detail}</span>}
            </span>
            {p.href && (
              p.href.startsWith('http')
                ? <a href={p.href} target="_blank" rel="noopener" className="text-hs-tertiary hover:text-hs-blue-700" title={p.href}><ExternalLink size={12} /></a>
                : <Link href={p.href} className="text-[11.5px] text-hs-blue-700 hover:underline whitespace-nowrap">öffnen →</Link>
            )}
          </li>
        ))}
      </ul>
      {h.ereignisse.length > 0 && (
        <div className="rounded-lg bg-hs-err-bg/60 border border-hs-err/20 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-hs-err-fg mb-1">Auffällige Ereignisse (24 h)</p>
          <ul className="space-y-0.5">
            {h.ereignisse.map((e, i) => (
              <li key={i} className="text-[11.5px] text-hs-text-1">
                <span className="font-mono text-hs-text-2">{fmtZeitpunkt(e.zeit)}</span> · <span className="font-medium">{e.art}</span>{e.quelle ? ` · ${e.quelle}` : ''} – {e.meldung}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default async function MorgenberichtKarte({ tenantId }: { tenantId: string }) {
  const [trials, health] = await Promise.all([
    ladeTrials(tenantId).catch(() => ({ zeilen: [] as TrialZeile[], aktiveZugaenge: 0, neu24h: 0 })),
    s112Health().catch((e): S112Health => ({
      konfiguriert: s112Konfiguriert(), gesamt: 'err', geprueftAm: new Date().toISOString(), ereignisse: [],
      punkte: [{ key: 'fehler', label: 'Healthcheck', ampel: 'err', wert: 'fehlgeschlagen', detail: e instanceof Error ? e.message : String(e) }],
    })),
  ])
  const a = AMPEL[health.gesamt]
  const geprueft = new Date(health.geprueftAm).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="card !p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-hs-line flex-wrap">
        <h2 className="text-base inline-flex items-center gap-2"><Sunrise size={17} strokeWidth={1.75} className="text-hs-teal" /> Morgenbericht</h2>
        <div className="flex items-center gap-2 text-[11.5px] text-hs-text-2">
          {trials.neu24h > 0 && <span className="pill bg-hs-blue-50 text-hs-blue-700">{trials.neu24h} neue{trials.neu24h === 1 ? 'r' : ''} Testzugang{trials.neu24h === 1 ? '' : 'e'} (24 h)</span>}
          <span className={`pill ${a.cls} inline-flex items-center gap-1.5`}><span className={`w-1.5 h-1.5 rounded-full ${a.punkt}`} />software:112: {a.label}</span>
          <span>Stand {geprueft}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-hs-line">
        {/* ── Testzugänge ── */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-[13px] font-semibold text-hs-text inline-flex items-center gap-1.5"><UserPlus size={14} strokeWidth={1.75} className="text-hs-text-2" /> Testzugänge über hohenstein-partner.at</h3>
            <span className="text-[11.5px] text-hs-text-2">{trials.aktiveZugaenge} aktiv · letzte {TAGE_ZURUECK} Tage</span>
          </div>
          {trials.zeilen.length === 0 ? (
            <p className="text-[12.5px] text-hs-text-2 py-3">Keine Anfragen in den letzten {TAGE_ZURUECK} Tagen.</p>
          ) : (
            <ul className="divide-y divide-hs-line">
              {trials.zeilen.slice(0, 8).map(t => (
                <li key={t.id} className="py-2 flex items-start gap-3">
                  <span className="w-[108px] shrink-0 font-mono text-[11.5px] tabular-nums text-hs-text-2 pt-0.5">{fmtZeitpunkt(t.zeit)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-hs-text truncate">
                      {t.firmaId ? <Link href={`/crm/firmen/${t.firmaId}`} className="font-medium hover:text-hs-blue-700 hover:underline">{t.firma}</Link> : <span className="font-medium">{t.firma}</span>}
                      {t.name && <span className="text-hs-text-2"> · {t.name}</span>}
                    </p>
                    <p className="text-[11.5px] text-hs-text-2 truncate">
                      {t.email}
                      {t.ergebnis === 'erfolgreich' && (t.kontoFehlt
                        ? <span className="text-hs-warn-fg"> · Konto in software:112 nicht mehr vorhanden</span>
                        : t.letzteAnmeldung ? ` · zuletzt angemeldet ${fmtZeitpunkt(t.letzteAnmeldung)}` : ' · noch nicht angemeldet')}
                      {t.gueltigBis && t.zugangStatus === 'aktiv' && ` · gültig bis ${fmtDatum(t.gueltigBis)}`}
                      {t.ergebnis !== 'erfolgreich' && t.hinweis && ` · ${t.hinweis}`}
                    </p>
                  </div>
                  <ErgebnisPill e={t.ergebnis} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-center gap-3">
            <Link href="/demo" className="text-[11.5px] text-hs-blue-700 hover:underline">Alle Zugänge →</Link>
            <Link href="/crm/firmen" className="text-[11.5px] text-hs-blue-700 hover:underline">Firmen →</Link>
          </div>
        </div>

        {/* ── Health software:112 ── */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-[13px] font-semibold text-hs-text inline-flex items-center gap-1.5"><Activity size={14} strokeWidth={1.75} className="text-hs-text-2" /> Healthstatus software:112</h3>
            <a href="https://software112.icp-consultants.at" target="_blank" rel="noopener" className="text-[11.5px] text-hs-blue-700 hover:underline inline-flex items-center gap-1">App öffnen <ExternalLink size={11} /></a>
          </div>
          <HealthBlock h={health} />
        </div>
      </div>
    </div>
  )
}

/** Platzhalter während die Karte lädt (Suspense-Fallback) */
export function MorgenberichtPlatzhalter() {
  return (
    <div className="card !p-0 overflow-hidden animate-pulse">
      <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-hs-line">
        <Sunrise size={17} strokeWidth={1.75} className="text-hs-teal" />
        <h2 className="text-base">Morgenbericht</h2>
        <span className="text-[11.5px] text-hs-text-2 ml-auto">wird geladen …</span>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-hs-line">
        <div className="px-5 py-4 space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-4 bg-hs-bg rounded" />)}</div>
        <div className="px-5 py-4 space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-4 bg-hs-bg rounded" />)}</div>
      </div>
    </div>
  )
}
