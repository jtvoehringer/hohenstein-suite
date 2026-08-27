// IMAP-Hilfsfunktionen (imapflow + mailparser). Server-only – wird nur aus
// Route-Handlern aufgerufen. Pro Request wird eine Verbindung geöffnet und
// am Ende wieder geschlossen (mitImap).
import { ImapFlow, type ListResponse, type FetchMessageObject, type MessageAddressObject } from 'imapflow'
import { simpleParser, type ParsedMail, type AddressObject } from 'mailparser'
import type { OrdnerInfo, NachrichtKurz, NachrichtDetail, AnhangInfo } from './types'
import { sanitizeHtml, htmlZuText } from './html'

export type ImapZugang = {
  host: string
  port: number
  user: string
  pass: string
}

/** Standardordner-Namen (Fallback, wenn der Server keine SPECIAL-USE-Flags liefert) */
const ORDNER_NAMEN: Record<string, string[]> = {
  '\\Sent':    ['Sent', 'Sent Items', 'Sent Messages', 'Gesendet', 'Gesendete Elemente', 'Gesendete Objekte'],
  '\\Drafts':  ['Drafts', 'Entwürfe'],
  '\\Trash':   ['Trash', 'Deleted Items', 'Deleted Messages', 'Gelöschte Elemente', 'Gelöschte Objekte', 'Papierkorb'],
  '\\Junk':    ['Junk', 'Junk E-mail', 'Junk Email', 'Junk-E-Mail', 'Spam', 'Spamverdacht'],
  '\\Archive': ['Archive', 'Archiv'],
}

const ANZEIGE_NAMEN: Record<string, string> = {
  '\\Inbox':   'Posteingang',
  '\\Sent':    'Gesendet',
  '\\Drafts':  'Entwürfe',
  '\\Trash':   'Papierkorb',
  '\\Junk':    'Spam',
  '\\Archive': 'Archiv',
}

const SPECIAL_REIHENFOLGE = ['\\Inbox', '\\Sent', '\\Drafts', '\\Archive', '\\Junk', '\\Trash']

/** Neuen, noch nicht verbundenen Client erzeugen (mit Timeouts, ohne Logging) */
export function imapClient(z: ImapZugang): ImapFlow {
  const port = Number(z.port) || 993
  return new ImapFlow({
    host: z.host,
    port,
    secure: port === 993,           // 143 → STARTTLS, falls vom Server angeboten
    auth: { user: z.user, pass: z.pass },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 90_000,
    clientInfo: { name: 'Hohenstein Suite', vendor: 'Hohenstein Consulting OG' },
  })
}

/** Verbindung öffnen, Callback ausführen, Verbindung garantiert schließen */
export async function mitImap<T>(z: ImapZugang, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = imapClient(z)
  // Fehler-Events abfangen, sonst wirft Node bei einem unbehandelten 'error' den Prozess
  client.on('error', () => { /* wird über die Promise-Ablehnung des jeweiligen Befehls gemeldet */ })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    try { await client.logout() } catch { client.close() }
  }
}

/** Nur Login prüfen (für „Verbindung testen") */
export async function imapPruefen(z: ImapZugang): Promise<void> {
  await mitImap(z, async () => { /* Login genügt */ })
}

// ── Ordner ───────────────────────────────────────────────────────────────────

function specialUseAusName(l: ListResponse): string | null {
  if (l.specialUse) return l.specialUse
  if (l.path.toUpperCase() === 'INBOX') return '\\Inbox'
  const name = l.name.toLowerCase()
  for (const [flag, namen] of Object.entries(ORDNER_NAMEN)) {
    if (namen.some(n => n.toLowerCase() === name)) return flag
  }
  return null
}

/** Alle Mailboxen inkl. Zähler, Standardordner zuerst */
export async function listeOrdner(client: ImapFlow): Promise<OrdnerInfo[]> {
  const liste = await client.list({ statusQuery: { messages: true, unseen: true } })
  const ordner: OrdnerInfo[] = liste
    .filter(l => !l.flags.has('\\Noselect') && !l.flags.has('\\NonExistent'))
    .map(l => {
      const su = specialUseAusName(l)
      return {
        path: l.path,
        name: su && ANZEIGE_NAMEN[su] && (su === '\\Inbox' || l.parent.length <= 1) ? ANZEIGE_NAMEN[su] : l.name,
        specialUse: su,
        unread: l.status?.unseen ?? 0,
        total: l.status?.messages ?? 0,
        ebene: su === '\\Inbox' ? 0 : Math.max(0, l.parent.filter(p => p.toUpperCase() !== 'INBOX').length),
      }
    })
  // Nur der erste Ordner je Spezialfunktion bekommt den lokalisierten Namen
  const gesehen = new Set<string>()
  for (const o of ordner) {
    if (!o.specialUse) continue
    if (gesehen.has(o.specialUse)) { o.specialUse = null; o.name = o.path.split('/').pop()?.split('.').pop() ?? o.path }
    else gesehen.add(o.specialUse)
  }
  return ordner.sort((a, b) => {
    const ai = a.specialUse ? SPECIAL_REIHENFOLGE.indexOf(a.specialUse) : -1
    const bi = b.specialUse ? SPECIAL_REIHENFOLGE.indexOf(b.specialUse) : -1
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.path.localeCompare(b.path, 'de')
  })
}

/** Pfad eines Spezialordners (z.B. '\\Trash') ermitteln – null wenn nicht vorhanden */
export async function findeSpezialOrdner(client: ImapFlow, specialUse: string): Promise<string | null> {
  const liste = await client.list()
  const treffer = liste.find(l => specialUseAusName(l) === specialUse && !l.flags.has('\\Noselect'))
  return treffer?.path ?? null
}

// ── Nachrichtenliste ─────────────────────────────────────────────────────────

function isoDatum(d: Date | string | undefined): string {
  const dt = d ? new Date(d) : new Date(0)
  return Number.isNaN(dt.getTime()) ? new Date(0).toISOString() : dt.toISOString()
}

function adresse(a: MessageAddressObject[] | undefined): string {
  return (a ?? []).map(x => x.address ?? '').filter(Boolean).join(', ')
}

function hatAnhang(msg: FetchMessageObject): boolean {
  const bs = msg.bodyStructure
  if (!bs) return false
  const stack = [bs]
  while (stack.length) {
    const n = stack.pop()!
    if (n.disposition && n.disposition.toLowerCase() === 'attachment') return true
    if (n.childNodes) stack.push(...n.childNodes)
  }
  return false
}

/** Seite einer Mailbox laden – neueste zuerst */
export async function ladeNachrichtenListe(
  client: ImapFlow, folder: string, page: number, pageSize: number,
): Promise<{ total: number; messages: NachrichtKurz[] }> {
  const lock = await client.getMailboxLock(folder)
  try {
    const mailbox = client.mailbox
    const total = mailbox ? mailbox.exists : 0
    if (total === 0) return { total: 0, messages: [] }
    const ende  = total - page * pageSize
    if (ende < 1) return { total, messages: [] }
    const start = Math.max(1, ende - pageSize + 1)
    const rows = await client.fetchAll(`${start}:${ende}`, { uid: true, envelope: true, flags: true, size: true, bodyStructure: true })
    const messages: NachrichtKurz[] = rows.map(m => ({
      uid: m.uid,
      betreff: m.envelope?.subject?.trim() || '(kein Betreff)',
      von: m.envelope?.from?.[0]?.address ?? '',
      vonName: m.envelope?.from?.[0]?.name ?? '',
      an: adresse(m.envelope?.to),
      datum: isoDatum(m.envelope?.date ?? m.internalDate),
      gelesen: m.flags?.has('\\Seen') ?? false,
      beantwortet: m.flags?.has('\\Answered') ?? false,
      hatAnhang: hatAnhang(m),
      groesse: m.size ?? null,
    }))
    messages.sort((a, b) => b.uid - a.uid)
    return { total, messages }
  } finally {
    lock.release()
  }
}

// ── Einzelne Nachricht ───────────────────────────────────────────────────────

function addrText(a: AddressObject | AddressObject[] | undefined): string {
  if (!a) return ''
  const list = Array.isArray(a) ? a : [a]
  return list.map(x => x.text).filter(Boolean).join(', ')
}

function ersteAdresse(a: AddressObject | AddressObject[] | undefined): { address: string; name: string } {
  if (!a) return { address: '', name: '' }
  const list = Array.isArray(a) ? a : [a]
  const v = list[0]?.value?.[0]
  return { address: v?.address ?? '', name: v?.name ?? '' }
}

/** Nur Adressen (ohne Namen) einer Adress-Liste */
export function nurAdressen(a: AddressObject | AddressObject[] | undefined): string[] {
  if (!a) return []
  const list = Array.isArray(a) ? a : [a]
  return list.flatMap(x => x.value.map(v => v.address ?? '').filter(Boolean))
}

/** Rohquelle laden und mit mailparser parsen. Gibt null zurück, wenn UID nicht existiert. */
export async function ladeQuelle(
  client: ImapFlow, folder: string, uid: number,
): Promise<{ parsed: ParsedMail; flags: Set<string> } | null> {
  const lock = await client.getMailboxLock(folder)
  try {
    const msg = await client.fetchOne(String(uid), { uid: true, source: true, flags: true }, { uid: true })
    if (!msg || !msg.source) return null
    const parsed = await simpleParser(msg.source)
    return { parsed, flags: msg.flags ?? new Set<string>() }
  } finally {
    lock.release()
  }
}

/** Vollständige Nachricht laden (parsen, HTML sanitisieren) */
export async function ladeNachricht(
  client: ImapFlow, folder: string, uid: number,
): Promise<Omit<NachrichtDetail, 'kontaktInfo' | 'crmAktivitaetId'> | null> {
  const q = await ladeQuelle(client, folder, uid)
  if (!q) return null
  return parsedZuDetail(q.parsed, q.flags, folder, uid)
}

export function parsedZuDetail(
  parsed: ParsedMail, flags: Set<string>, folder: string, uid: number,
): Omit<NachrichtDetail, 'kontaktInfo' | 'crmAktivitaetId'> {
  const von = ersteAdresse(parsed.from)
  const html = parsed.html ? sanitizeHtml(parsed.html) : null
  const text = (parsed.text && parsed.text.trim()) ? parsed.text : (parsed.html ? htmlZuText(parsed.html) : '')
  const refs = parsed.references ? (Array.isArray(parsed.references) ? parsed.references : [parsed.references]) : []
  const anhaenge: AnhangInfo[] = parsed.attachments
    .map((a, index) => ({ a, index }))
    .filter(({ a }) => !a.related || a.contentDisposition === 'attachment')
    .map(({ a, index }) => ({
      index,
      dateiname: a.filename ?? `anhang-${index + 1}`,
      contentType: a.contentType ?? 'application/octet-stream',
      groesse: a.size ?? a.content?.length ?? 0,
    }))
  return {
    uid,
    folder,
    betreff: parsed.subject?.trim() || '(kein Betreff)',
    von: von.address,
    vonName: von.name,
    an: addrText(parsed.to),
    cc: addrText(parsed.cc),
    replyTo: addrText(parsed.replyTo),
    datum: isoDatum(parsed.date),
    gelesen: flags.has('\\Seen'),
    messageId: parsed.messageId ?? null,
    inReplyTo: parsed.inReplyTo ?? null,
    references: refs,
    text,
    html,
    anhaenge,
  }
}

// ── Aktionen ─────────────────────────────────────────────────────────────────

export async function setzeGelesen(client: ImapFlow, folder: string, uid: number, gelesen: boolean): Promise<void> {
  const lock = await client.getMailboxLock(folder)
  try {
    if (gelesen) await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
    else await client.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true })
  } finally { lock.release() }
}

export async function setzeBeantwortet(client: ImapFlow, folder: string, uid: number): Promise<void> {
  const lock = await client.getMailboxLock(folder)
  try { await client.messageFlagsAdd(String(uid), ['\\Answered'], { uid: true }) }
  finally { lock.release() }
}

export async function verschiebeNachricht(client: ImapFlow, folder: string, uid: number, ziel: string): Promise<void> {
  const lock = await client.getMailboxLock(folder)
  try {
    const r = await client.messageMove(String(uid), ziel, { uid: true })
    if (!r) throw new Error('Der Server hat das Verschieben abgelehnt.')
  } finally { lock.release() }
}

/** In den Papierkorb verschieben; im Papierkorb selbst endgültig löschen */
export async function loescheNachricht(client: ImapFlow, folder: string, uid: number): Promise<'papierkorb' | 'endgueltig'> {
  const trash = await findeSpezialOrdner(client, '\\Trash')
  if (trash && trash !== folder) {
    await verschiebeNachricht(client, folder, uid, trash)
    return 'papierkorb'
  }
  const lock = await client.getMailboxLock(folder)
  try {
    const r = await client.messageDelete(String(uid), { uid: true })
    if (!r) throw new Error('Der Server hat das Löschen abgelehnt.')
    return 'endgueltig'
  } finally { lock.release() }
}

/** Gesendete Nachricht im „Gesendet"-Ordner ablegen (best effort) */
export async function inGesendetAblegen(client: ImapFlow, raw: Buffer): Promise<boolean> {
  const sent = await findeSpezialOrdner(client, '\\Sent')
  if (!sent) return false
  const r = await client.append(sent, raw, ['\\Seen'], new Date())
  return !!r
}
