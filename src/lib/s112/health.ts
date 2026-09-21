// ── Healthstatus software:112 (server-only) ───────────────────────────────────
// Für den Morgenbericht auf der Übersicht. Liest ausschließlich über den
// Service-Role-Zugang (s112Admin) und pingt die App-URL; es wird nichts geschrieben.
// Quellen im software:112-Projekt: tenants, system_ereignisse (Fehler-/Ereignis-
// protokoll inkl. täglichem Smoke-Test), morgenberichte (Cron 05:00 UTC je Betrieb),
// stripe_zahlungen_log (offene Verbuchung in der Suite).

import { s112Admin, s112Konfiguriert, S112_APP_URL, S112_DEMO_TENANT_ID } from './admin'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export type Ampel = 'ok' | 'warn' | 'err'
export type HealthPunkt = { key: string; label: string; ampel: Ampel; wert: string; detail?: string | null; href?: string | null }
export type S112Health = {
  konfiguriert: boolean
  gesamt: Ampel
  geprueftAm: string
  punkte: HealthPunkt[]
  /** letzte auffällige Ereignisse (kein Cron/Info), max. 5 */
  ereignisse: { zeit: string; art: string; quelle: string | null; meldung: string }[]
}

const FEHLER_ARTEN = ['fehler', 'error', 'kritisch', 'critical', 'warnung', 'warn', 'warning']
const rund = (n: number) => Math.round(n)

async function pingApp(): Promise<HealthPunkt> {
  const url = S112_APP_URL.replace(/\/$/, '') + '/'
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  const start = Date.now()
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', cache: 'no-store', signal: ctrl.signal, headers: { 'user-agent': 'HohensteinSuite-Health/1.0' } })
    const ms = Date.now() - start
    const ok = res.status >= 200 && res.status < 400
    return {
      key: 'app', label: 'App erreichbar', ampel: ok ? (ms > 3000 ? 'warn' : 'ok') : 'err',
      wert: ok ? `HTTP ${res.status} · ${ms} ms` : `HTTP ${res.status}`,
      detail: ok ? (ms > 3000 ? 'langsame Antwort' : null) : 'Die App antwortet mit einem Fehlerstatus.', href: S112_APP_URL,
    }
  } catch (e) {
    const ms = Date.now() - start
    const abgebrochen = e instanceof Error && e.name === 'AbortError'
    return { key: 'app', label: 'App erreichbar', ampel: 'err', wert: abgebrochen ? `Timeout nach ${rund(ms / 1000)} s` : 'nicht erreichbar', detail: e instanceof Error && !abgebrochen ? e.message : null, href: S112_APP_URL }
  } finally { clearTimeout(timer) }
}

export async function s112Health(): Promise<S112Health> {
  const geprueftAm = new Date().toISOString()
  if (!s112Konfiguriert()) {
    return { konfiguriert: false, gesamt: 'warn', geprueftAm, punkte: [], ereignisse: [] }
  }
  const admin = s112Admin()
  const q = (t: string) => (admin.from(t) as any)
  const seit24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const heute = new Date().toISOString().slice(0, 10)
  const gestern = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10)

  const dbStart = Date.now()
  const [app, tenantsRes, ereignisseRes, smokeRes, mbRes, zahlungenRes] = await Promise.all([
    pingApp(),
    q('tenants').select('id, name, active, stripe_status'),
    q('system_ereignisse').select('erstellt_am, art, quelle, meldung').gte('erstellt_am', seit24h).order('erstellt_am', { ascending: false }).limit(200),
    q('system_ereignisse').select('erstellt_am, meldung').ilike('quelle', '%smoke-test%').order('erstellt_am', { ascending: false }).limit(1).maybeSingle(),
    q('morgenberichte').select('tenant_id, datum, erstellt_am').in('datum', [heute, gestern]),
    q('stripe_zahlungen_log').select('id', { count: 'exact', head: true }).is('hs_verbucht_am', null),
  ])
  const dbMs = Date.now() - dbStart

  const punkte: HealthPunkt[] = [app]

  // Datenbank
  if (tenantsRes.error) {
    punkte.push({ key: 'db', label: 'Datenbank', ampel: 'err', wert: 'Abfrage fehlgeschlagen', detail: (tenantsRes.error as R).message })
  } else {
    punkte.push({ key: 'db', label: 'Datenbank', ampel: dbMs > 4000 ? 'warn' : 'ok', wert: `antwortet · ${dbMs} ms` })
  }

  // Mandanten (ohne Demo)
  const tenants = ((tenantsRes.data ?? []) as R[]).filter(t => t.id !== S112_DEMO_TENANT_ID)
  const aktiv = tenants.filter(t => t.active)
  const status = (s: string) => aktiv.filter(t => (t.stripe_status ?? '') === s).length
  const pastDue = status('past_due') + status('unpaid')
  const teile = [`${status('active')} zahlend`, `${status('trialing')} im Trial`]
  if (pastDue > 0) teile.push(`${pastDue} mit Zahlungsrückstand`)
  const ohneStripe = aktiv.filter(t => !t.stripe_status).length
  if (ohneStripe > 0) teile.push(`${ohneStripe} ohne Abo`)
  punkte.push({ key: 'mandanten', label: 'Mandanten aktiv', ampel: pastDue > 0 ? 'warn' : 'ok', wert: String(aktiv.length), detail: teile.join(' · '), href: '/software112' })

  // Fehlerprotokoll 24 h
  const ereignisse = ((ereignisseRes.data ?? []) as R[])
  const auffaellig = ereignisse.filter(e => FEHLER_ARTEN.includes(String(e.art ?? '').toLowerCase()))
  const fehler = auffaellig.filter(e => !['warnung', 'warn', 'warning'].includes(String(e.art).toLowerCase()))
  punkte.push({
    key: 'fehler', label: 'Fehler (24 h)', ampel: fehler.length > 0 ? 'err' : auffaellig.length > 0 ? 'warn' : 'ok',
    wert: auffaellig.length === 0 ? 'keine' : `${fehler.length} Fehler${auffaellig.length - fehler.length > 0 ? `, ${auffaellig.length - fehler.length} Warnungen` : ''}`,
    detail: ereignisse.length > 0 ? `${ereignisse.length} Ereignisse gesamt` : null,
  })

  // Smoke-Test (Cron in software:112)
  const smoke = smokeRes.data as R | null
  if (smoke) {
    const m = /(\d+) von (\d+)/.exec(String(smoke.meldung ?? ''))
    const bestanden = m ? Number(m[1]) : null, gesamtP = m ? Number(m[2]) : null
    const alter = (Date.now() - Date.parse(smoke.erstellt_am)) / 3600000
    const ok = bestanden != null && gesamtP != null && bestanden === gesamtP
    punkte.push({
      key: 'smoke', label: 'Smoke-Test', ampel: !ok ? 'err' : alter > 36 ? 'warn' : 'ok',
      wert: bestanden != null ? `${bestanden}/${gesamtP} bestanden` : String(smoke.meldung ?? '').slice(0, 60),
      detail: `zuletzt ${fmtZeit(smoke.erstellt_am)}${alter > 36 ? ' – älter als 36 h' : ''}`,
    })
  } else {
    punkte.push({ key: 'smoke', label: 'Smoke-Test', ampel: 'warn', wert: 'kein Ergebnis', detail: 'Noch kein Smoke-Test protokolliert.' })
  }

  // Morgenbericht-Cron (05:00 UTC je Betrieb)
  // Vergleich mit gestern: läuft der Cron für weniger Betriebe als am Vortag, stimmt etwas nicht.
  const mbAlle = ((mbRes.data ?? []) as R[])
  const mbHeute = new Set(mbAlle.filter(x => x.datum === heute).map(x => x.tenant_id as string))
  const mbGestern = new Set(mbAlle.filter(x => x.datum === gestern).map(x => x.tenant_id as string))
  const jetztUtc = new Date().getUTCHours() + new Date().getUTCMinutes() / 60
  const faellig = jetztUtc >= 5.75  // Cron 05:00 UTC, bis 05:45 Toleranz
  const letzter = mbAlle.filter(x => x.datum === heute).map(x => x.erstellt_am as string).sort().pop() ?? null
  punkte.push({
    key: 'morgenbericht', label: 'Morgenbericht-Cron',
    ampel: !faellig ? 'ok' : mbHeute.size === 0 ? 'err' : mbHeute.size < mbGestern.size ? 'warn' : 'ok',
    wert: !faellig && mbHeute.size === 0 ? 'noch nicht fällig (05:00 UTC)' : `${mbHeute.size} ${mbHeute.size === 1 ? 'Betrieb' : 'Betriebe'}${mbGestern.size !== mbHeute.size ? ` (gestern ${mbGestern.size})` : ''}`,
    detail: letzter ? `heute ${fmtZeit(letzter)}` : faellig ? 'heute noch nicht gelaufen' : null,
  })

  // Offene Stripe-Zahlungen (Verbuchung in der Suite)
  const offeneZahlungen = zahlungenRes.count ?? 0
  punkte.push({ key: 'zahlungen', label: 'Zahlungen zu verbuchen', ampel: offeneZahlungen > 0 ? 'warn' : 'ok', wert: offeneZahlungen === 0 ? 'keine' : String(offeneZahlungen), href: '/software112' })

  const gesamt: Ampel = punkte.some(p => p.ampel === 'err') ? 'err' : punkte.some(p => p.ampel === 'warn') ? 'warn' : 'ok'
  return {
    konfiguriert: true, gesamt, geprueftAm, punkte,
    ereignisse: auffaellig.slice(0, 5).map(e => ({ zeit: e.erstellt_am, art: String(e.art), quelle: e.quelle ?? null, meldung: String(e.meldung ?? '').slice(0, 160) })),
  }
}

/**
 * Letzte Anmeldung je software:112-Benutzer – wie s112LetzteAnmeldungen, aber mit
 * Erfolgsstatus: nur bei ok=true bedeutet ein fehlender Eintrag, dass das Konto
 * in software:112 nicht (mehr) existiert (z. B. nach einem kurzen Test gelöscht).
 */
export async function s112BenutzerAnmeldungen(userIds: string[]): Promise<{ ok: boolean; map: Map<string, string | null> }> {
  const map = new Map<string, string | null>()
  if (userIds.length === 0) return { ok: true, map }
  if (!s112Konfiguriert()) return { ok: false, map }
  try {
    const { data, error } = await s112Admin().auth.admin.listUsers({ perPage: 1000 })
    if (error) return { ok: false, map }
    for (const u of data?.users ?? []) if (userIds.includes(u.id)) map.set(u.id, u.last_sign_in_at ?? null)
    return { ok: true, map }
  } catch { return { ok: false, map } }
}

function fmtZeit(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' })
}
