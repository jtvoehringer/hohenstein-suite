// ── Dublettenschutz für öffentliche Website-Anfragen (Trial/Kontakt) ──────────
// Die Suite enthält bereits ~5.000 österreichische Weingüter aus ÖWM-Daten
// (siehe CLAUDE.md). Eine Trial-/Kontaktanfrage soll an eine bestehende Firma
// andocken statt eine Dublette anzulegen. Bewusst konservativ: nur bei starken
// Signalen (exakte E-Mail, exakter Name, E-Mail-Domain = Firmen-Website/-Mail)
// wird gemergt – eine lockere Namenssuche würde sonst riskieren, Daten an die
// FALSCHE Firma zu hängen (z.B. zwei ähnlich benannte Betriebe), was schlimmer
// wäre als eine gelegentliche Dublette.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export type FirmaTreffer = {
  id: string; name: string; notizen: string | null; telefon: string | null
  quelle: string | null; ist_kunde: boolean; account_manager: string | null
}

const FELDER = 'id, name, notizen, telefon, quelle, ist_kunde, account_manager'

function escapeIlike(s: string): string {
  return s.replace(/[%_]/g, '\\$&')
}

/** Bestehende Firma anhand E-Mail, exaktem Namen (case-insensitive) oder E-Mail-Domain finden. */
export async function findeBestehendeFirma(supabase: SB, tenantId: string, email: string, firmaName: string | null): Promise<FirmaTreffer | null> {
  const { data: perEmail } = await (supabase.from('firmen') as any)
    .select(FELDER).eq('tenant_id', tenantId).eq('email', email).limit(1).maybeSingle()
  if ((perEmail as R | null)?.id) return normalisiere(perEmail as R)

  if (firmaName?.trim()) {
    const { data: perName } = await (supabase.from('firmen') as any)
      .select(FELDER).eq('tenant_id', tenantId).ilike('name', escapeIlike(firmaName.trim())).limit(1).maybeSingle()
    if ((perName as R | null)?.id) return normalisiere(perName as R)
  }

  const domain = email.split('@')[1]?.toLowerCase()
  if (domain) {
    const { data: perDomain } = await (supabase.from('firmen') as any)
      .select(FELDER).eq('tenant_id', tenantId)
      .or(`website.ilike.%${escapeIlike(domain)}%,email.ilike.%@${escapeIlike(domain)}`)
      .limit(1).maybeSingle()
    if ((perDomain as R | null)?.id) return normalisiere(perDomain as R)
  }
  return null
}

function normalisiere(r: R): FirmaTreffer {
  return {
    id: r.id, name: r.name, notizen: r.notizen ?? null, telefon: r.telefon ?? null,
    quelle: r.quelle ?? null, ist_kunde: !!r.ist_kunde, account_manager: r.account_manager ?? null,
  }
}

/** Anzeigename des Account Managers (profiles.display_name), falls gesetzt. */
export async function accountManagerName(supabase: SB, userId: string | null): Promise<string | null> {
  if (!userId) return null
  const { data } = await (supabase.from('profiles') as any).select('display_name, full_name').eq('id', userId).maybeSingle()
  const p = data as R | null
  return p?.display_name ?? p?.full_name ?? null
}
