// The realm administration tabs. A tab a feature gate turns off is neither
// offered nor reachable by URL. Record placement and Data placement are two
// different machines, so neither is called just "Placement".
export interface AdminTab {
  id: string
  label: string
}

export function adminTabs(features: { placement: boolean; policies: boolean; jobs?: boolean }): AdminTab[] {
  return [
    { id: 'realm', label: 'Quota & usage' },
    { id: 'compute', label: 'Compute' },
    { id: 'assistant', label: 'Assistant' },
    ...(features.jobs ? [{ id: 'jobs', label: 'Jobs' }] : []),
    ...(features.placement
      ? [
          { id: 'placement', label: 'Record placement' },
          { id: 'data-placement', label: 'Data placement' },
        ]
      : []),
    ...(features.policies ? [{ id: 'policies', label: 'Policies' }] : []),
    { id: 'federation', label: 'Federation' },
    { id: 'portal-features', label: 'Portal features' },
  ]
}
