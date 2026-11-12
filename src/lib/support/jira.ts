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

export type StatusKategorie = 'new' | 'indeterminate' | 'done'

export type SupportTicket = {
  key: string
  url: string
  zusammenfassung: string
  typ: string
  status: string
  statusKategorie: StatusKategorie
  prioritaet: string | null
  bearbeiter: string | null
  melderName: string | null
  melderEmail: string | null
  erstellt: string
  aktualisiert: string
  faellig: string | null
  erledigtAm: string | null
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

const FELDER = ['summary', 'status', 'issuetype', 'priority', 'assignee', 'reporter', 'created', 'updated', 'duedate', 'resolutiondate']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

function zuTicket(i: R): SupportTicket {
  const f = (i.fields ?? {}) as R
  const kat = f.status?.statusCategory?.key as string | undefined
  return {
    key: i.key,
    url: jiraLinks.ticket(i.key),
    zusammenfassung: f.summary ?? '(ohne Titel)',
    // „[System] Incident“ → „Incident“
    typ: String(f.issuetype?.name ?? '').replace(/^\[System\]\s*/, ''),
    status: f.status?.name ?? '–',
    statusKategorie: kat === 'done' ? 'done' : kat === 'indeterminate' ? 'indeterminate' : 'new',
    prioritaet: f.priority?.name ?? null,
    bearbeiter: f.assignee?.displayName ?? null,
    melderName: f.reporter?.displayName ?? null,
    melderEmail: (f.reporter?.emailAddress as string | undefined)?.toLowerCase() ?? null,
    erstellt: f.created,
    aktualisiert: f.updated,
    faellig: f.duedate ?? null,
    erledigtAm: f.resolutiondate ?? null,
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

export function istUeberfaellig(t: SupportTicket, heute = new Date().toISOString().slice(0, 10)) {
  return istOffen(t) && !!t.faellig && t.faellig < heute
}
