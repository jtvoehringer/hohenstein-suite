// GET /api/cron/ea-dauerauftraege – fällige Daueraufträge aller Mandanten verbuchen
//
// Wird von Vercel Cron (vercel.json) mit `Authorization: Bearer ${CRON_SECRET}`
// aufgerufen. process_ea_dauerauftraege() ist nur für service_role freigegeben
// und filtert intern je Mandant – daher Admin-Client. Der manuelle Lauf aus der
// Oberfläche geht über die Server Action fuehreDauerauftraegeAusAction (nur Admins).

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ fehler: 'Unauthorized' }, { status: 401 })
  }

  const admin = createSupabaseAdminClient()
  const { data, error } = await (admin.rpc as any)('process_ea_dauerauftraege')
  if (error) return NextResponse.json({ fehler: error.message }, { status: 500 })

  const row = (Array.isArray(data) ? data[0] : data) as R | null
  return NextResponse.json({
    verarbeitet:   Number(row?.verarbeitet   ?? 0),
    erstellt:      Number(row?.erstellt      ?? 0),
    uebersprungen: Number(row?.uebersprungen ?? 0),
    fehler:        Number(row?.fehler        ?? 0),
    zeitpunkt:     new Date().toISOString(),
  })
}
