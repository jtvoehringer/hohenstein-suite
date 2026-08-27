// ── Kontosalden (server-seitig) ───────────────────────────────────────────────
// Saldo = Eröffnungssaldo + Einnahmen (brutto) − Ausgaben (brutto)
//         − Umbuchungen weg + Umbuchungen her, jeweils nur Bewegungen NACH dem
//         Eröffnungsdatum (frühere stecken bereits im Eröffnungssaldo).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export type KontoMitSaldo = {
  id: string
  name: string
  typ: string
  iban: string | null
  eroeffnungsdatum: string
  eroeffnungssaldo: number
  aktiv: boolean
  sortierung: number
  saldo: number
  saldoAbgeglichen: number
  anzahlBewegungen: number
  anzahlOffen: number
}

export async function ladeKontenMitSaldo(supabase: SB, tenantId: string, nurAktive = true): Promise<KontoMitSaldo[]> {
  let kq = (supabase.from('konten') as SB)
    .select('id, name, typ, iban, eroeffnungsdatum, eroeffnungssaldo, aktiv, sortierung')
    .eq('tenant_id', tenantId)
  if (nurAktive) kq = kq.eq('aktiv', true)
  const [{ data: kontenRaw }, { data: txRaw }, { data: umbRaw }] = await Promise.all([
    kq.order('sortierung').order('name'),
    (supabase.from('ea_transaktionen') as SB)
      .select('konto_id, typ, betrag_brutto, datum, abgeglichen')
      .eq('tenant_id', tenantId).not('konto_id', 'is', null),
    (supabase.from('konto_umbuchungen') as SB)
      .select('von_konto_id, nach_konto_id, betrag, datum, von_abgeglichen, nach_abgeglichen')
      .eq('tenant_id', tenantId),
  ])

  const konten = ((kontenRaw ?? []) as R[]).map<KontoMitSaldo>(k => ({
    id: k.id, name: k.name, typ: k.typ, iban: k.iban ?? null,
    eroeffnungsdatum: k.eroeffnungsdatum, eroeffnungssaldo: Number(k.eroeffnungssaldo ?? 0),
    aktiv: k.aktiv !== false, sortierung: Number(k.sortierung ?? 0),
    saldo: Number(k.eroeffnungssaldo ?? 0), saldoAbgeglichen: Number(k.eroeffnungssaldo ?? 0),
    anzahlBewegungen: 0, anzahlOffen: 0,
  }))
  const byId = new Map(konten.map(k => [k.id, k]))

  const buche = (k: KontoMitSaldo | undefined, datum: string, betrag: number, abgeglichen: boolean) => {
    if (!k || !(datum > k.eroeffnungsdatum)) return
    k.saldo += betrag
    k.anzahlBewegungen++
    if (abgeglichen) k.saldoAbgeglichen += betrag
    else k.anzahlOffen++
  }

  for (const t of (txRaw ?? []) as R[]) {
    buche(byId.get(t.konto_id), t.datum, (t.typ === 'einnahme' ? 1 : -1) * Number(t.betrag_brutto ?? 0), !!t.abgeglichen)
  }
  for (const u of (umbRaw ?? []) as R[]) {
    buche(byId.get(u.von_konto_id),  u.datum, -Number(u.betrag ?? 0), !!u.von_abgeglichen)
    buche(byId.get(u.nach_konto_id), u.datum,  Number(u.betrag ?? 0), !!u.nach_abgeglichen)
  }
  for (const k of konten) {
    k.saldo = Math.round(k.saldo * 100) / 100
    k.saldoAbgeglichen = Math.round(k.saldoAbgeglichen * 100) / 100
  }
  return konten
}
