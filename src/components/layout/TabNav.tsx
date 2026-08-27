'use client'

// ── Horizontale Hauptnavigation ──────────────────────────────────────────────
// Zeile 1: Bereiche als Tabs mit Unterstrich in der Aktionsfarbe.
// Zeile 2: Seiten des aktiven Bereichs als Chips. Beide Zeilen scrollen
// auf schmalen Bildschirmen horizontal.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { activeGroup, isActivePath, type NavGroup } from '@/lib/navigation'

export default function TabNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname()
  const aktiv = activeGroup(groups, pathname)

  return (
    <nav className="bg-hs-surface border-b border-hs-line shrink-0 z-30" aria-label="Hauptnavigation">
      <div className="max-w-[1280px] mx-auto px-2 lg:px-3 flex gap-0.5 overflow-x-auto [scrollbar-width:none]">
        {groups.map(g => {
          const active = g.key === aktiv?.key
          return (
            <Link key={g.key} href={g.items[0].href} aria-current={active ? 'true' : undefined}
              className={`px-3.5 pt-[13px] pb-[10px] text-[14.5px] whitespace-nowrap border-b-[3px] transition-colors duration-[120ms] ${
                active ? 'text-hs-text font-semibold border-hs-teal' : 'text-hs-text-1 font-medium border-transparent hover:text-hs-text'
              }`}>
              {g.label}
            </Link>
          )
        })}
      </div>

      {aktiv && (
        <div className="border-t border-hs-line bg-hs-bg/70">
          <div className="max-w-[1280px] mx-auto px-3 lg:px-4 py-1.5 flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {aktiv.items.map(item => {
              const active = isActivePath(item.href, pathname)
                && !aktiv.items.some(o => o !== item && o.href.length > item.href.length && isActivePath(o.href, pathname))
              return (
                <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-md text-[13px] whitespace-nowrap transition-colors duration-[120ms] ${item.child ? 'text-[12.5px]' : ''} ${
                    active ? 'bg-hs-blue-50 text-hs-blue-700 font-semibold' : 'text-hs-text-1 hover:bg-hs-line/60 hover:text-hs-text'
                  }`}>
                  {item.child && <span className="w-1 h-1 rounded-full bg-hs-tertiary/70" />}
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </nav>
  )
}
