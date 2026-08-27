import { notFound, redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import AbstimmungClient, { type Bewegung, type KontoDaten } from './AbstimmungClient'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default async function AbstimmungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: kontoId } = await params
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId

  const { data: kontoRaw } = await (supabase.from('konten') as any)
    .select('id, name, typ, iban, eroeffnungsdatum, eroeffnungssaldo, aktiv, sortierung')
    .eq('id', kontoId).eq('tenant_id', tenantId).maybeSingle()
  if (!kontoRaw) notFound()
  const k = kontoRaw as R
  const konto: KontoDaten = {
    id: k.id, name: k.name, typ: k.typ, iban: k.iban ?? null, eroeffnungsdatum: k.eroeffnungsdatum,
    eroeffnungssaldo: Number(k.eroeffnungssaldo ?? 0), aktiv: k.aktiv !== false, sortierung: Number(k.sortierung ?? 0),
  }

  const [{ data: alleKontenRaw }, { data: txRaw }, { data: umbVonRaw }, { data: umbNachRaw }] = await Promise.all([
    (supabase.from('konten') as any)
      .select('id, name').eq('tenant_id', tenantId).eq('aktiv', true).neq('id', kontoId).order('sortierung').order('name'),
    (supabase.from('ea_transaktionen') as any)
      .select('id, typ, betrag_brutto, datum, beschreibung, belegnummer, abgeglichen, is_locked, firmen(name)')
      .eq('tenant_id', tenantId).eq('konto_id', kontoId),
    (supabase.from('konto_umbuchungen') as any)
      .select('id, betrag, datum, beschreibung, von_abgeglichen, nach_konto_id')
      .eq('tenant_id', tenantId).eq('von_konto_id', kontoId),
    (supabase.from('konto_umbuchungen') as any)
      .select('id, betrag, datum, beschreibung, nach_abgeglichen, von_konto_id')
      .eq('tenant_id', tenantId).eq('nach_konto_id', kontoId),
  ])

  const andereKonten = ((alleKontenRaw ?? []) as R[]).map(x => ({ id: x.id as string, name: x.name as string }))
  // Namen auch inaktiver Gegenkonten auflösen
  const { data: alleNamenRaw } = await (supabase.from('konten') as any).select('id, name').eq('tenant_id', tenantId)
  const kontoNamen = new Map<string, string>(((alleNamenRaw ?? []) as R[]).map(x => [x.id as string, x.name as string]))

  const bewegungen: Bewegung[] = [
    ...((txRaw ?? []) as R[]).map<Bewegung>(t => ({
      id: t.id, quelle: 'ea_transaktion', datum: t.datum,
      beschreibung: t.beschreibung,
      detail: [t.belegnummer, (t.firmen as R | null)?.name].filter(Boolean).join(' · ') || null,
      betrag: (t.typ === 'einnahme' ? 1 : -1) * Number(t.betrag_brutto ?? 0),
      abgeglichen: !!t.abgeglichen, gesperrt: !!t.is_locked, transaktionId: t.id,
    })),
    ...((umbVonRaw ?? []) as R[]).map<Bewegung>(u => ({
      id: u.id, quelle: 'umbuchung_von', datum: u.datum,
      beschreibung: `Umbuchung an ${kontoNamen.get(u.nach_konto_id) ?? 'anderes Konto'}`,
      detail: u.beschreibung ?? null,
      betrag: -Number(u.betrag ?? 0), abgeglichen: !!u.von_abgeglichen, gesperrt: false,
    })),
    ...((umbNachRaw ?? []) as R[]).map<Bewegung>(u => ({
      id: u.id, quelle: 'umbuchung_nach', datum: u.datum,
      beschreibung: `Umbuchung von ${kontoNamen.get(u.von_konto_id) ?? 'anderem Konto'}`,
      detail: u.beschreibung ?? null,
      betrag: Number(u.betrag ?? 0), abgeglichen: !!u.nach_abgeglichen, gesperrt: false,
    })),
  ]

  bewegungen.sort((a, b) => a.datum.localeCompare(b.datum) || a.beschreibung.localeCompare(b.beschreibung))
  const vorEroeffnung  = bewegungen.filter(b => b.datum <= konto.eroeffnungsdatum)
  const nachEroeffnung = bewegungen.filter(b => b.datum > konto.eroeffnungsdatum)

  let saldo = konto.eroeffnungssaldo
  let saldoAbgeglichen = konto.eroeffnungssaldo
  for (const b of nachEroeffnung) {
    saldo += b.betrag
    if (b.abgeglichen) saldoAbgeglichen += b.betrag
    b.saldoNachher = Math.round(saldo * 100) / 100
  }

  return (
    <div className="max-w-5xl mx-auto">
      <AbstimmungClient
        konto={konto}
        andereKonten={andereKonten}
        bewegungen={[...nachEroeffnung].reverse()}
        anzahlVorEroeffnung={vorEroeffnung.length}
        saldo={Math.round(saldo * 100) / 100}
        saldoAbgeglichen={Math.round(saldoAbgeglichen * 100) / 100}
        writeOk={canWrite(membership.role)}
      />
    </div>
  )
}
