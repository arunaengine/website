// Navigation shape shared by the portal sidebar and the desktop layout that
// feeds it its own destinations.
export interface NavItem {
  to: string
  icon: unknown
  label: string
  exact?: boolean
  match?: string[]
}

/** A break between blocks of destinations, drawn as a rule and never labelled. */
export interface NavSeparator {
  separator: true
}

export type NavEntry = NavItem | NavSeparator

export const navSeparator: NavSeparator = { separator: true }

/** The one row shape every sidebar entry wears, destinations and actions alike. */
export function navRowClass(collapsed: boolean): string {
  return [
    'flex w-full items-center gap-2.5 rounded-md py-2 text-[13px] font-medium transition-colors',
    collapsed ? 'justify-center px-0' : 'px-2.5',
  ].join(' ')
}
