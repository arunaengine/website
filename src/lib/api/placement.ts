export type PlacementAffinityEffect =
  | { kind: 'filter' }
  | { kind: 'multiply'; permille: number }

export interface PlacementAffinityRule {
  key: string
  value: string
  effect: PlacementAffinityEffect
}

export interface RealmPlacementStrategy {
  strategy_id: string
  name: string
  replica_count: number | null
  distinct_locations: boolean
  affinity: PlacementAffinityRule[]
  shard_count: number
}

export type RealmPlacementDocumentClass =
  | 'admin'
  | 'group'
  | 'user'
  | 'metadata'
  | 'metadata_registry'
  | 'job_control'
  | 'placement_policy'

export type RealmPlacementBindingScope =
  | { kind: 'realm' }
  | { kind: 'group'; group_id: string }
  | { kind: 'class'; document_class: RealmPlacementDocumentClass }
  | { kind: 'metadata_path_prefix'; prefix: string }

export interface RealmPlacementBinding {
  scope: RealmPlacementBindingScope
  strategy_id: string
}

export interface RealmPlacementOverride {
  subject: string
  pinned: string[]
  excluded: string[]
  strategy_id: string | null
}

export interface RealmPlacementConfigResponse {
  strategies: RealmPlacementStrategy[]
  default_strategy_id: string | null
  /** The immutable strategy every job family is placed by; never removable. */
  job_family_strategy_id: string
  bindings: RealmPlacementBinding[]
  overrides: RealmPlacementOverride[]
  transitions: RealmTransitionHealth
}

// Counts only; nothing here changes where a request routes.
export interface RealmTransitionHealth {
  active: number
  incomplete_buckets: number
  stalled_buckets: number
  /** Transitions still incomplete after a day. */
  overdue: number
}

export type RealmPlacementMutationRequest =
  | { mutation: 'upsert_strategy'; strategy: RealmPlacementStrategy }
  | { mutation: 'remove_strategy'; strategy_id: string }
  | { mutation: 'set_default_strategy'; strategy_id: string }
  | { mutation: 'set_binding'; binding: RealmPlacementBinding }
  | { mutation: 'remove_binding'; scope: RealmPlacementBindingScope }
  | { mutation: 'set_override'; placement_override: RealmPlacementOverride }
  | { mutation: 'remove_override'; subject: string }
