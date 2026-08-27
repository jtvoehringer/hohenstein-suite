import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import KontoForm from '@/components/ea/KontoForm'

export const dynamic = 'force-dynamic'

export default async function KontoNeuPage() {
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  if (!canWrite(membership.role)) redirect('/konten')

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="text-sm text-hs-text-2 flex items-center gap-2">
        <Link href="/konten" className="hover:text-hs-blue-700">Konten</Link>
        <span>/</span>
        <span className="text-hs-text font-medium">Neues Konto</span>
      </div>
      <h1 className="text-2xl">Neues Konto</h1>
      <KontoForm />
    </div>
  )
}
