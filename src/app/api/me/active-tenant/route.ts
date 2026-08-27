import { NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

// GET /api/me/active-tenant – aktive Tenant-ID + Rolle für Client-Komponenten
export async function GET() {
  const membership = await getCurrentMembership()
  return NextResponse.json({ tenantId: membership?.tenantId ?? null, role: membership?.role ?? null })
}
