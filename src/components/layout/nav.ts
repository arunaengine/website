// Navigation shapes shared by the portal sidebar and the desktop layout that
// feeds it its own sections.
export interface NavItem {
  to: string
  icon: unknown
  label: string
  exact?: boolean
  match?: string[]
}

export interface NavSection {
  label: string
  items: NavItem[]
}
