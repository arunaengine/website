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
