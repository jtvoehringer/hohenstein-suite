// ── Gemeinsame Bausteine des Dashboards (server-tauglich, keine Hooks) ───────
// Optik lt. Designvorlage: flache weiße Karten mit 1-px-Rand, Kachel-Label
// als Overline, Zahlen in IBM Plex Mono, Icons nur in Kachel-Labels.

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function Card({ children, className = '', title, right, pad = true }: {
  children: ReactNode; className?: string; title?: ReactNode; right?: ReactNode; pad?: boolean
}) {
  return (
    <div className={`card ${pad ? '' : '!p-0 overflow-hidden'} ${className}`}>
      {(title || right) && (
        <div className={`flex items-center justify-between gap-3 mb-3 ${pad ? '' : 'px-5 pt-4'}`}>
          {title && <h2 className="text-base">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

export function Tile({ label, value, sub, icon: Icon, href, tone }: {
  label: string; value: ReactNode; sub?: ReactNode; icon?: LucideIcon; href?: string; tone?: 'ok' | 'warn' | 'err'
}) {
  const subCls = tone === 'err' ? 'text-hs-err-fg font-medium' : tone === 'warn' ? 'text-hs-warn-fg font-medium' : tone === 'ok' ? 'text-hs-ok-fg font-medium' : 'text-hs-text-2'
  const inner = (
    <>
      <div className="flex items-center gap-2">
        {Icon && <Icon size={18} strokeWidth={1.5} className="text-hs-tertiary" />}
        <p className="text-[12px] font-semibold text-hs-text-2">{label}</p>
      </div>
      <p className="kpi text-[26px] leading-[1.15]">{value}</p>
      {sub && <p className={`text-[11.5px] ${subCls}`}>{sub}</p>}
    </>
  )
  const cls = 'bg-white border border-hs-line rounded-xl p-4 flex flex-col gap-2'
  return href
    ? <Link href={href} className={`${cls} hover:shadow-1 hover:border-hs-blue-100 transition-all`}>{inner}</Link>
    : <div className={cls}>{inner}</div>
}

export function Empty({ children, action }: { children: ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="py-6 text-center">
      <p className="text-[13px] text-hs-text-2">{children}</p>
      {action && <Link href={action.href} className="inline-block mt-2 text-[12.5px] text-hs-blue-700 hover:underline">{action.label} →</Link>}
    </div>
  )
}

export function MehrLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="text-[11.5px] text-hs-blue-700 hover:underline whitespace-nowrap">{children} →</Link>
}

/** Balkenreihe mit direkten Werten (HTML, keine Chart-Bibliothek) */
export function BarRow({ label, value, max, text, color = 'bg-hs-blue-300', labelWidth = 104, sub }: {
  label: string; value: number; max: number; text: string; color?: string; labelWidth?: number; sub?: string
}) {
  const pct = max > 0 ? Math.max(1, Math.round(value / max * 100)) : 0
  return (
    <div className="grid items-center gap-2.5 py-[3px]" style={{ gridTemplateColumns: `${labelWidth}px 1fr 96px` }} title={`${label}: ${text}`}>
      <span className="text-[12px] text-hs-text-2 truncate">{label}{sub && <span className="text-hs-tertiary"> · {sub}</span>}</span>
      <div><div className={`h-[14px] rounded-r ${color}`} style={{ width: `${pct}%`, minWidth: 2 }} /></div>
      <span className="font-mono text-[11.5px] font-semibold text-hs-text text-right tabular-nums">{text}</span>
    </div>
  )
}

export function Hinweis({ children, tone = 'info', className = '' }: { children: ReactNode; tone?: 'info' | 'warn' | 'err'; className?: string }) {
  const cls = tone === 'err' ? 'bg-hs-err-bg border-hs-err/30 text-hs-err-fg'
    : tone === 'warn' ? 'bg-hs-warn-bg border-hs-warn/40 text-hs-warn-fg'
    : 'bg-hs-blue-50 border-hs-blue-100 text-hs-blue-700'
  return <div className={`border rounded-lg px-4 py-3 text-[12.5px] ${cls} ${className}`}>{children}</div>
}
