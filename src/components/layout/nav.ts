// The one navigation definition. The portal sidebar, the desktop shell and the
// mobile bar all render this list, in this order.
import {
  Activity,
  BookOpen,
  Boxes,
  FileJson2,
  Laptop,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Play,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
} from '@lucide/vue'
import { featureEnabled } from '@/lib/config'

export interface NavItem {
  to: string
  icon: unknown
  label: string
  exact?: boolean
  match?: string[]
  /** Rides the mobile bottom bar; everything else lands in its More sheet. */
  primary?: boolean
}

/** A break between blocks of destinations, drawn as a rule and never labelled. */
export interface NavSeparator {
  separator: true
}

export type NavEntry = NavItem | NavSeparator

export const navSeparator: NavSeparator = { separator: true }

export interface NavOptions {
  /** The desktop shell adds the chapter for the node it embeds. */
  desktop: boolean
  isRealmAdmin: boolean
  canInspectUsers: boolean
  /** At least one AI provider is ready, the same gate as the top-bar launcher. */
  assistant?: boolean
}

/** One Compute entry as soon as either compute plane answers; the view degrades per flag. */
function computeEnabled(): boolean {
  return featureEnabled('tes') || featureEnabled('jobs')
}

// Onboarding and quarantine stay out of the sidebar; the Admin view's own side
// nav is the one place that reaches them.
function adminItems(options: NavOptions): NavItem[] {
  return [
    ...(options.isRealmAdmin ? [{ to: '/app/admin', icon: ShieldCheck, label: 'Admin', exact: true }] : []),
    ...(options.canInspectUsers ? [{ to: '/app/admin/users', icon: Users, label: 'Users' }] : []),
  ]
}

export function navEntries(options: NavOptions): NavEntry[] {
  const admin = adminItems(options)
  return [
    {
      to: '/app',
      icon: LayoutDashboard,
      label: options.desktop ? 'Home' : 'Dashboard',
      exact: true,
      primary: true,
    },
    { to: '/app/buckets', icon: Boxes, label: 'Data', primary: true },
    { to: '/app/datasets', icon: FileJson2, label: 'Datasets', match: ['/app/datasets'], primary: true },
    { to: '/app/profiles', icon: ListChecks, label: 'Profiles' },
    ...(computeEnabled() ? [{ to: '/app/compute', icon: Workflow, label: 'Compute', primary: true }] : []),
    ...(options.assistant ? [{ to: '/app/assistant', icon: MessageSquare, label: 'Assistant' }] : []),
    navSeparator,
    ...(options.desktop
      ? [
          {
            to: '/app/sync',
            icon: RefreshCw,
            label: 'Sync',
            match: ['/app/sync', '/app/folders', '/app/transfers'],
          },
          { to: '/app/runs', icon: Play, label: 'Runs' },
          { to: '/app/device', icon: Laptop, label: 'This device' },
          navSeparator,
        ]
      : []),
    { to: '/app/groups', icon: Users, label: 'Groups', primary: true },
    { to: '/app/status', icon: Activity, label: 'Status' },
    { to: '/app/settings', icon: Settings, label: 'Settings' },
    { to: '/app/docs/v1', icon: BookOpen, label: 'Docs', match: ['/app/docs'] },
    ...(admin.length ? [navSeparator, ...admin] : []),
  ]
}

/** True while the route sits on the entry's own destination or below it. */
export function navItemActive(item: NavItem, path: string): boolean {
  if (item.exact) return path === item.to
  return (item.match ?? [item.to]).some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/** The one row shape every sidebar entry wears, destinations and actions alike. */
export function navRowClass(collapsed: boolean): string {
  return [
    'flex w-full items-center gap-2.5 rounded-md py-2 text-[13px] font-medium transition-colors',
    collapsed ? 'justify-center px-0' : 'px-2.5',
  ].join(' ')
}
