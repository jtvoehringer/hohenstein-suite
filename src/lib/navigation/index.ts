// ── Navigationsstruktur der Hohenstein Suite ─────────────────────────────────
// Navy-/Anthrazit-Kopfleiste + zweizeilige Tab-Navigation (Zeile 1: Bereiche,
// Zeile 2: Seiten des aktiven Bereichs). Diese Datei ist die EINZIGE Quelle für
// TabNav und die Befehlspalette (Strg K). Bewusst frei von Server-Imports.

import {
  LayoutDashboard, Users, ReceiptText, FlaskConical, Settings, Mail, FileText,
  type LucideIcon,
} from 'lucide-react'
import type { UserRole } from '@/lib/auth/roles'

export type NavItem = {
  href: string
  label: string
  /** nur admin */
  adminOnly?: boolean
  /** Eingerückter Unterpunkt */
  child?: boolean
  /** Synonyme für die Befehlspalette */
  keywords?: string
}

export type NavGroup = {
  key: string
  label: string
  icon: LucideIcon
  items: NavItem[]
  adminOnly?: boolean
}

const NAV: NavGroup[] = [
  {
    key: 'uebersicht', label: 'Übersicht', icon: LayoutDashboard,
    items: [
      { href: '/dashboard',   label: 'Dashboard', keywords: 'start heute cockpit übersicht kpi' },
      { href: '/aufgaben',    label: 'Aufgaben',  keywords: 'todo offen in arbeit erledigt verantwortlich fällig' },
    ],
  },
  {
    key: 'crm', label: 'CRM', icon: Users,
    items: [
      { href: '/crm',          label: 'Kalender', keywords: 'termine aktivitäten besprechung demo' },
      { href: '/crm/kontakte', label: 'Kontakte', keywords: 'personen ansprechpartner' },
      { href: '/crm/firmen',   label: 'Firmen',   keywords: 'weingüter betriebe unternehmen kunden' },
      { href: '/crm/pipeline', label: 'Pipeline', keywords: 'leads chancen angebot verkaufschancen' },
      { href: '/crm/import',   label: 'Datenimport', child: true, keywords: 'csv upload excel importieren kontakte firmen hochladen' },
    ],
  },
  {
    key: 'email', label: 'E-Mail', icon: Mail,
    items: [
      { href: '/nachrichten',               label: 'Posteingang',   keywords: 'mail nachrichten imap' },
      { href: '/nachrichten/einstellungen', label: 'E-Mail-Konto',  child: true, keywords: 'imap smtp zugang passwort' },
    ],
  },
  {
    key: 'ea', label: 'E&A-Rechnung', icon: ReceiptText,
    items: [
      { href: '/buchhaltung',                 label: 'Buchungen',       keywords: 'einnahmen ausgaben belege' },
      { href: '/buchhaltung/belege',          label: 'Belege',          child: true, keywords: 'scan foto upload ocr' },
      { href: '/buchhaltung/kategorien',      label: 'Kategorien',      child: true },
      { href: '/buchhaltung/dauerauftraege',  label: 'Daueraufträge',   child: true, keywords: 'wiederkehrend' },
      { href: '/buchhaltung/monatsabschluss', label: 'Monatsabschluss', child: true },
      { href: '/buchhaltung/uva',             label: 'UVA-Meldung',     keywords: 'umsatzsteuer finanzonline' },
      { href: '/konten',                      label: 'Konten',          keywords: 'bank kassa abstimmung' },
      { href: '/buchhaltung/export',          label: 'Export',          keywords: 'csv steuerberater bmd' },
    ],
  },
  {
    key: 'fakturierung', label: 'Rechnungen', icon: FileText,
    items: [
      { href: '/rechnungen',               label: 'Rechnungen',    keywords: 'faktura fakturieren beleg gutschrift' },
      { href: '/rechnungen/angebote',      label: 'Angebote',      keywords: 'offert anbot' },
      { href: '/rechnungen/offene-posten', label: 'Offene Posten', keywords: 'überfällig mahnung zahlung' },
      { href: '/rechnungen/verbindlichkeiten', label: 'Verbindlichkeiten', keywords: 'eingangsrechnung lieferantenrechnung zahlbar fällig kreditoren' },
      { href: '/rechnungen/leistungen',    label: 'Leistungen',    child: true, keywords: 'katalog stundensatz tagsatz lizenz preise' },
    ],
  },
  {
    key: 'demo', label: 'Demo software:112', icon: FlaskConical, adminOnly: true,
    items: [
      { href: '/demo', label: 'Demo-Umgebung', keywords: 'software112 musterhof beispieldaten vorführen zurücksetzen zugang team' },
    ],
  },
  {
    key: 'system', label: 'System', icon: Settings,
    items: [
      { href: '/profil',        label: 'Profil',        keywords: 'name passwort' },
      { href: '/einstellungen', label: 'Einstellungen', adminOnly: true, keywords: 'firmendaten mandant uva zeitraum logo' },
      { href: '/benutzer',      label: 'Benutzer',      adminOnly: true, keywords: 'einladen rollen team' },
    ],
  },
]

/** Pfade, die nur exakt matchen (kein Präfix-Match für Unterrouten) */
const EXACT_PATHS = new Set(['/dashboard', '/crm', '/buchhaltung', '/nachrichten', '/rechnungen'])

export function isActivePath(href: string, pathname: string): boolean {
  return pathname === href || (!EXACT_PATHS.has(href) && pathname.startsWith(href))
}

export type NavContext = {
  role: UserRole
}

/** Sichtbare Bereiche inkl. gefilterter Seiten je Rolle */
export function buildNav(ctx: NavContext): NavGroup[] {
  const isAdmin = ctx.role === 'admin'
  const result: NavGroup[] = []
  for (const g of NAV) {
    if (g.adminOnly && !isAdmin) continue
    const items = g.items.filter(it => !(it.adminOnly && !isAdmin))
    if (items.length === 0) continue
    result.push({ ...g, items })
  }
  return result
}

/** Bereich, zu dem der aktuelle Pfad gehört (Fallback: erster Bereich) */
export function activeGroup(groups: NavGroup[], pathname: string): NavGroup | undefined {
  let best: { g: NavGroup; len: number } | null = null
  for (const g of groups) {
    for (const it of g.items) {
      if (isActivePath(it.href, pathname) && (!best || it.href.length > best.len)) best = { g, len: it.href.length }
    }
  }
  if (best) return best.g
  // Unterseiten ohne eigenen Navigationseintrag (z.B. /rechnungen/neu): Bereich über das erste Pfadsegment
  const segment = '/' + (pathname.split('/')[1] ?? '')
  return groups.find(g => g.items.some(it => it.href === segment || it.href.startsWith(segment + '/'))) ?? groups[0]
}
