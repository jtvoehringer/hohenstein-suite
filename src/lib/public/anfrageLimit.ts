// ── Rate-Limit für die öffentlichen Website-Formulare (trial_anfragen) ────────
// Gezählt werden nur Anfragen desselben Formulars (herkunft), die tatsächlich
// verarbeitet wurden ('erfolgreich' oder 'fehler'). Abgelehnte Versuche – auch
// die durch das Limit selbst – zählen nicht, sonst verlängert jeder neue Versuch
// die Sperre. E-Mail und IP haben getrennte Grenzen: Über eine IP können viele
// verschiedene Interessenten kommen (Handynetz, Firmennetz, VPN).

import type { SupabaseClient } from '@supabase/supabase-js'

export async function zuVieleAnfragen(
  admin: SupabaseClient,
  opts: { herkunft: string; email: string; ip: string | null; maxProEmail: number; maxProIp: number },
): Promise<boolean> {
  const seit24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const zaehle = async (spalte: 'email' | 'ip', wert: string) => {
    const { count } = await (admin.from('trial_anfragen') as any)
      .select('id', { count: 'exact', head: true })
      .gte('erstellt_am', seit24h).eq('herkunft', opts.herkunft)
      .neq('ergebnis', 'abgelehnt').eq(spalte, wert)
    return count ?? 0
  }
  if ((await zaehle('email', opts.email)) >= opts.maxProEmail) return true
  if (opts.ip && (await zaehle('ip', opts.ip)) >= opts.maxProIp) return true
  return false
}
