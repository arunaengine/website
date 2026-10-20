// Portal feature switches. A user's own `ui.feature.<key>` choice wins; without one,
// realm admins see everything and members follow the realm default (missing means on).
import { featureEnabled } from '@/lib/config'

export type PortalFeature =
  | 'placement'
  | 'connectors'
  | 's3-keys'
  | 'profiles'
  | 'repositories'
  | 'compute'
  | 'notebooks'
  | 'watches'

export interface FeatureInfo {
  key: PortalFeature
  label: string
  description: string
  /** Deployment flags of which at least one must be on. */
  flags?: string[]
}

export const FEATURE_GROUPS: { label: string; features: FeatureInfo[] }[] = [
  {
    label: 'Data',
    features: [
      { key: 'placement', label: 'Placement strategies', description: 'Choose where data is stored' },
      { key: 'connectors', label: 'Connectors', description: 'Link external storage to groups' },
      { key: 's3-keys', label: 'S3 access keys', description: 'Keys for S3 tools' },
    ],
  },
  {
    label: 'Metadata',
    features: [
      { key: 'profiles', label: 'Profiles', description: 'Create and edit metadata profiles' },
      { key: 'repositories', label: 'Repositories', description: 'Import from and publish to repositories' },
    ],
  },
  {
    label: 'Compute',
    features: [
      { key: 'compute', label: 'Compute', description: 'Run jobs and workflows', flags: ['tes', 'jobs'] },
      { key: 'notebooks', label: 'Notebooks', description: 'Interactive notebooks', flags: ['tes'] },
    ],
  },
  {
    label: 'Other',
    features: [{ key: 'watches', label: 'Watches', description: 'Get notified about changes' }],
  },
]

export interface FeatureContext {
  attributes: Record<string, string>
  isRealmAdmin: boolean
  defaults: Record<string, boolean>
}

export function featureInfo(key: PortalFeature): FeatureInfo | undefined {
  return FEATURE_GROUPS.flatMap((group) => group.features).find((info) => info.key === key)
}

export function featureAttribute(key: PortalFeature): string {
  return `ui.feature.${key}`
}

/** Whether this deployment serves the feature at all. */
export function featureAvailable(key: PortalFeature): boolean {
  const flags = featureInfo(key)?.flags
  return !flags || flags.some(featureEnabled)
}

/** The user's own choice, or null when the realm default applies. */
export function ownChoice(key: PortalFeature, attributes: Record<string, string>): boolean | null {
  const value = attributes[featureAttribute(key)]
  return value === 'on' ? true : value === 'off' ? false : null
}

export function featureShown(key: PortalFeature, context: FeatureContext): boolean {
  if (!featureAvailable(key)) return false
  const own = ownChoice(key, context.attributes)
  if (own !== null) return own
  return context.isRealmAdmin || context.defaults[key] !== false
}
