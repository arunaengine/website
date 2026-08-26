// Navigation shape shared by the portal sidebar and the desktop layout that
// feeds it its own destinations.
export interface NavItem {
  to: string
  icon: unknown
  label: string
  exact?: boolean
  match?: string[]
}
