import { statusLabel, statusPillKlasse } from '@/lib/rechnungen/types'

/** Statuspill eines Belegs; ueberfaellig überschreibt Farbe + Text */
export default function StatusPill({ status, ueberfaellig = false, className = '' }: { status: string; ueberfaellig?: boolean; className?: string }) {
  return (
    <span className={`${statusPillKlasse(status, ueberfaellig)} ${className}`}>
      {ueberfaellig ? 'Überfällig' : statusLabel(status)}
    </span>
  )
}
