// Gemeinsame Typen für das Nachrichten-Modul (API ↔ Client). Enthält keine
// Zugangsdaten – Passwörter bleiben ausschließlich serverseitig.

export type OrdnerInfo = {
  /** IMAP-Pfad (z.B. "INBOX", "INBOX.Sent") – wird in API-Aufrufen verwendet */
  path: string
  /** Anzeigename (lokalisiert für Standardordner) */
  name: string
  /** Spezialfunktion: \Inbox, \Sent, \Drafts, \Trash, \Junk, \Archive */
  specialUse: string | null
  unread: number
  total: number
  /** Verschachtelungstiefe (für Einrückung) */
  ebene: number
}

export type NachrichtKurz = {
  uid: number
  betreff: string
  von: string
  vonName: string
  an: string
  datum: string          // ISO
  gelesen: boolean
  beantwortet: boolean
  hatAnhang: boolean
  groesse: number | null
}

export type AnhangInfo = {
  index: number
  dateiname: string
  contentType: string
  groesse: number
}

export type KontaktInfo = {
  typ: 'kontakt' | 'firma'
  id: string
  name: string
}

export type NachrichtDetail = {
  uid: number
  folder: string
  betreff: string
  von: string
  vonName: string
  an: string
  cc: string
  replyTo: string
  datum: string
  gelesen: boolean
  messageId: string | null
  inReplyTo: string | null
  references: string[]
  /** Reiner Text (aus text/plain oder aus HTML abgeleitet) */
  text: string
  /** Sanitisiertes HTML oder null */
  html: string | null
  anhaenge: AnhangInfo[]
  /** Automatisch per Absender-Adresse zugeordneter CRM-Datensatz */
  kontaktInfo: KontaktInfo | null
  /** ID der bereits angelegten CRM-Aktivität (falls E-Mail schon abgelegt) */
  crmAktivitaetId: string | null
}

export type ListeAntwort = {
  folder: string
  page: number
  pageSize: number
  total: number
  seiten: number
  messages: NachrichtKurz[]
}

export type SendeAnhang = {
  dateiname: string
  contentType?: string
  /** Inhalt als Base64 */
  base64: string
}

export type SendeAnfrage = {
  to: string
  cc?: string
  bcc?: string
  subject: string
  text: string
  html?: string
  inReplyTo?: string | null
  references?: string[]
  anhaenge?: SendeAnhang[]
  /** Anhänge einer bestehenden Nachricht mitschicken (Weiterleiten) */
  anhaengeVon?: { folder: string; uid: number } | null
  /** Beim Antworten: Original als beantwortet markieren */
  beantwortet?: { folder: string; uid: number } | null
  /** Optional im CRM protokollieren */
  crm?: { ablegen: boolean; kontakt_id?: string | null; firma_id?: string | null } | null
}

export type CrmSuchTreffer = {
  typ: 'kontakt' | 'firma'
  id: string
  name: string
  email: string | null
  zusatz: string | null
}

/** Konto-Status ohne Geheimnisse (für /nachrichten/einstellungen) */
export type KontoAnzeige = {
  vorhanden: boolean
  email_address: string
  anzeigename: string
  imap_host: string
  imap_port: number
  imap_user: string
  imap_pass_gesetzt: boolean
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_pass_gesetzt: boolean
  smtp_from_name: string
  signatur: string
  letzter_abruf: string | null
  letzter_fehler: string | null
}
