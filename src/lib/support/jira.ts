// Server-only (API-Token) – nie in Client-Komponenten importieren.
// ── Support: Anbindung an Jira Service Management (Projekt „software112 Support“) ──
// Jira Cloud lässt sich nicht per iframe einbetten (Atlassian verbietet das), daher liest die Suite
// die Tickets über die REST-API und zeigt sie selbst an; bearbeitet wird weiterhin in Jira.
//
// Umgebungsvariablen (Vercel):
//   JIRA_EMAIL           Atlassian-Konto, dem der API-Token gehört (muss Agent im Projekt sein)
//   JIRA_API_TOKEN       API-Token dieses Kontos (id.atlassian.com → Sicherheit → API-Token)
//   JIRA_SITE_URL        optional, Standard https://jorgena.atlassian.net (für Links und klassische Tokens)
//   JIRA_CLOUD_ID        optional – nur für Service-Konten mit „scoped“ Token: dann läuft die API über
//                        https://api.atlassian.com/ex/jira/<cloudId>
//   JIRA_SUPPORT_PROJECT optional, Standard SUP

export const JIRA_SITE_URL = (process.env.JIRA_SITE_URL || 'https://jorgena.atlassian.net').replace(/\/+$/, '')
export const JIRA_PROJEKT  = process.env.JIRA_SUPPORT_PROJECT || 'SUP'

// Feld-IDs der Service-Desk-Felder auf jorgena.atlassian.net (je Site verschieden, daher überschreibbar)
const FELD_SLA_LOESUNG = process.env.JIRA_FELD_SLA || 'customfield_10107'        // „Time to resolution“
const FELD_ANFRAGETYP  = process.env.JIRA_FELD_ANFRAGETYP || 'customfield_10010' // „Request Type“
const FELD_ORGANISATION = process.env.JIRA_FELD_ORGANISATION || 'customfield_10002' // „Organizations“

export type StatusKategorie = 'new' | 'indeterminate' | 'done'

/**
 * Wo liegt der Ball? Jira führt „Wartet auf Support“ technisch als „In Arbeit“ –
 * fachlich heißt das aber: wir sind dran. Einordnung daher über den Statusnamen.
 */
export type Phase = 'wartet_support' | 'in_arbeit' | 'wartet_kunde' | 'erledigt'

export type SlaStand = { faellig: string; verletzt: boolean; pausiert: boolean }

export type SupportTicket = {
  key: string
  url: string
  zusammenfassung: string
  /** Anfragetyp aus dem Portal (z. B. „Frage“), sonst Vorgangstyp */
  typ: string
  status: string
  statusKategorie: StatusKategorie
  phase: Phase
  prioritaet: string | null
  bearbeiter: string | null
  melderName: string | null
  melderEmail: string | null
  erstellt: string
  aktualisiert: string
  /** SLA „Time to resolution“ (laufender Zyklus) – null, wenn kein SLA läuft */
  sla: SlaStand | null
  /** manuelles Fälligkeitsdatum (selten gepflegt) */
  faellig: string | null
  erledigtAm: string | null
  /** JSM-Organisation(en) – software:112 setzt den Betrieb bzw. Hauptmandanten */
  organisationen: string[]
  /** Mandanten-ID aus dem Kontextblock „Betrieb: <Name> (<ID>)“ von software:112 */
  s112TenantId: string | null
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** Mandanten-ID aus der Ticketbeschreibung (Atlassian Document Format oder Text) */
export function s112TenantAusBeschreibung(beschreibung: unknown): string | null {
  if (!beschreibung) return null
  const text = typeof beschreibung === 'string' ? beschreibung : JSON.stringify(beschreibung)
  const m = text.match(new RegExp(`Betrieb: [^\\n"]*?\\((${UUID})\\)`, 'i'))
  return m ? m[1].toLowerCase() : null
}

export function phaseAus(statusName: string, kategorie: StatusKategorie): Phase {
  if (kategorie === 'done') return 'erledigt'
  const n = statusName.toLowerCase()
  if (/kunde|customer|pending|ausstehend|rückmeldung/.test(n)) return 'wartet_kunde'
  if (kategorie === 'new' || /wartet auf support|waiting for support|offen|^open|neu|^new|eskaliert|escalated/.test(n)) return 'wartet_support'
  return 'in_arbeit'
}

export const PHASE_LABEL: Record<Phase, string> = {
  wartet_support: 'Wartet auf uns', in_arbeit: 'In Bearbeitung', wartet_kunde: 'Wartet auf Kunde', erledigt: 'Erledigt',
}

export type SupportLadeErgebnis =
  | { ok: true; tickets: SupportTicket[] }
  | { ok: false; nichtKonfiguriert: true }
  | { ok: false; nichtKonfiguriert?: false; fehler: string }

export function jiraKonfiguriert(): boolean {
  return !!(process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN)
}

export const jiraLinks = {
  ticket: (key: string) => `${JIRA_SITE_URL}/browse/${key}`,
  warteschlangen: () => `${JIRA_SITE_URL}/jira/servicedesk/projects/${JIRA_PROJEKT}/queues`,
  portal: () => `${JIRA_SITE_URL}/servicedesk/customer/portals`,
}

function apiBasis(): string {
  const cloudId = process.env.JIRA_CLOUD_ID
  return cloudId ? `https://api.atlassian.com/ex/jira/${cloudId}` : JIRA_SITE_URL
}

const FELDER = ['summary', 'status', 'issuetype', 'priority', 'assignee', 'reporter', 'created', 'updated', 'duedate', 'resolutiondate',
  'description', FELD_SLA_LOESUNG, FELD_ANFRAGETYP, FELD_ORGANISATION]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

function slaAus(v: R | null | undefined): SlaStand | null {
  const z = v?.ongoingCycle as R | undefined
  const faellig = z?.breachTime?.iso8601 as string | undefined
  if (!z || !faellig) return null
  return { faellig, verletzt: !!z.breached, pausiert: !!z.paused }
}

function zuTicket(i: R): SupportTicket {
  const f = (i.fields ?? {}) as R
  const kat = f.status?.statusCategory?.key as string | undefined
  const statusKategorie: StatusKategorie = kat === 'done' ? 'done' : kat === 'indeterminate' ? 'indeterminate' : 'new'
  const status = f.status?.name ?? '–'
  return {
    key: i.key,
    url: jiraLinks.ticket(i.key),
    zusammenfassung: f.summary ?? '(ohne Titel)',
    // Anfragetyp („Frage“), sonst Vorgangstyp ohne „[System]“-Präfix
    typ: (f[FELD_ANFRAGETYP]?.requestType?.name as string | undefined) || String(f.issuetype?.name ?? '').replace(/^\[System\]\s*/, ''),
    status,
    statusKategorie,
    phase: phaseAus(status, statusKategorie),
    sla: statusKategorie === 'done' ? null : slaAus(f[FELD_SLA_LOESUNG]),
    prioritaet: f.priority?.name ?? null,
    bearbeiter: f.assignee?.displayName ?? null,
    melderName: f.reporter?.displayName ?? null,
    melderEmail: (f.reporter?.emailAddress as string | undefined)?.toLowerCase() ?? null,
    erstellt: f.created,
    aktualisiert: f.updated,
    faellig: f.duedate ?? null,
    erledigtAm: f.resolutiondate ?? null,
    organisationen: ((Array.isArray(f[FELD_ORGANISATION]) ? f[FELD_ORGANISATION] : []) as R[])
      .map(o => String(o?.name ?? '').trim()).filter(Boolean),
    s112TenantId: s112TenantAusBeschreibung(f.description),
  }
}

/**
 * Die letzten Tickets des Support-Projekts (max. 300, neueste zuerst). 60 s gecacht –
 * Übersicht und CRM-Detailseiten teilen sich denselben Abruf.
 */
export async function ladeSupportTickets(): Promise<SupportLadeErgebnis> {
  if (!jiraKonfiguriert()) return { ok: false, nichtKonfiguriert: true }
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64')
  const tickets: SupportTicket[] = []
  let token: string | undefined
  try {
    for (let seite = 0; seite < 3; seite++) {
      const qs = new URLSearchParams({
        jql: `project = "${JIRA_PROJEKT}" ORDER BY created DESC`,
        fields: FELDER.join(','),
        maxResults: '100',
      })
      if (token) qs.set('nextPageToken', token)
      const res = await fetch(`${apiBasis()}/rest/api/3/search/jql?${qs}`, {
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
        next: { revalidate: 60 },
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const grund = res.status === 401 ? 'Anmeldung abgelehnt – JIRA_EMAIL/JIRA_API_TOKEN prüfen (bzw. JIRA_CLOUD_ID bei Service-Konten).'
          : res.status === 403 ? 'Keine Berechtigung – das Konto muss Agent im Projekt „software112 Support“ sein.'
          : res.status === 404 || res.status === 400 ? `Projekt ${JIRA_PROJEKT} nicht gefunden oder nicht sichtbar.`
          : `Jira antwortet mit ${res.status}.`
        return { ok: false, fehler: `${grund}${text ? ` (${text.slice(0, 160)})` : ''}` }
      }
      const d = await res.json() as R
      tickets.push(...((d.issues ?? []) as R[]).map(zuTicket))
      if (d.isLast !== false || !d.nextPageToken) break
      token = d.nextPageToken
    }
    // Bei Portal-Kunden liefert die Suche die E-Mail des Melders je nach Datenschutzeinstellung nicht mit –
    // die Service-Desk-API zeigt sie Agents; damit die Lücken füllen (best effort)
    if (tickets.some(t => !t.melderEmail)) {
      try {
        const res = await fetch(`${apiBasis()}/rest/servicedeskapi/request?requestOwnership=ALL_REQUESTS&limit=100`, {
          headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
          next: { revalidate: 60 },
        })
        if (res.ok) {
          const d = await res.json() as R
          const mails = new Map<string, string>()
          for (const r of (d.values ?? []) as R[]) {
            if (r.issueKey && r.reporter?.emailAddress) mails.set(r.issueKey, String(r.reporter.emailAddress).toLowerCase())
          }
          for (const t of tickets) if (!t.melderEmail && mails.has(t.key)) t.melderEmail = mails.get(t.key)!
        }
      } catch { /* Zuordnung bleibt dann leer */ }
    }
    return { ok: true, tickets }
  } catch (e) {
    return { ok: false, fehler: e instanceof Error ? e.message : String(e) }
  }
}

export function istOffen(t: SupportTicket) { return t.statusKategorie !== 'done' }

/** SLA verletzt bzw. überschritten (oder – ohne SLA – manuelles Fälligkeitsdatum vorbei) */
export function istUeberfaellig(t: SupportTicket, jetzt = new Date()) {
  if (!istOffen(t)) return false
  if (t.sla) return t.sla.verletzt || (!t.sla.pausiert && new Date(t.sla.faellig) < jetzt)
  return !!t.faellig && t.faellig < jetzt.toISOString().slice(0, 10)
}
