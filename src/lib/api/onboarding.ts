// --- Node onboarding (POST+GET /admin/onboarding/secrets, DELETE /admin/onboarding/secrets/{id},
// GET /onboarding/secrets/{id}/status) ---
// Verified against aruna api/src/routes/onboarding.rs. Management nodes only.
// The admin routes need WRITE on /{realm_id}/admin/onboarding; a 'User' mint is
// self-service for any realm member holding an unrestricted token, and the
// status route additionally answers the owner of the secret it names.

// Serialized aruna_core::onboarding::RequestedOnboardingMode: plain unit
// variants, so capitalized strings on the wire.
export type OnboardingMode = 'Management' | 'Server' | 'User'

export interface CreateOnboardingSecretRequest {
  // Origin-style base URL of a management node reachable by the joiner; the
  // node calls {seed_url}/api/v1/onboarding/bootstrap; never include /api/v1.
  // Empty means "the node serving this request", which is what a device sends.
  seed_url: string
  mode: OnboardingMode
  // Clamped server-side to 60..86400 seconds; default 3600.
  expires_in_seconds?: number | null
}

export interface CreateOnboardingSecretResponse {
  // Carried exactly once; the server keeps only a hash.
  onboarding_secret: string
  // Handle of the minted enrollment, taken by the status and revoke routes.
  // Absent on nodes that predate it, where the device list names it instead.
  enrollment_id?: string
  mode: OnboardingMode
  // Unix seconds.
  expires_at: number
  // aruna://enroll deep link for a 'User' mint, carrying secret/seed/realm;
  // null for infrastructure modes. Opaque; never re-encode it.
  enroll_url?: string | null
}

export interface OnboardingSecretSummary {
  enrollment_id: string // ULID
  // Debug-formatted mode; equals OnboardingMode values today, kept open for new kinds.
  mode: string
  // Owner a 'User' secret is bound to; null for infrastructure modes. Absent on
  // backends that predate device enrollment.
  owner?: string | null
  // Unix seconds. u64::MAX (~1.84e19) marks the never-expiring initial
  // admin-claim secret minted at realm initialization.
  expires_at: number
  // Node id for node claims; a user id when the initial admin-claim secret was
  // redeemed at registration. Serialized as null when unclaimed.
  claimed_node_id: string | null
}

export interface ListOnboardingSecretsResponse {
  secrets: OnboardingSecretSummary[]
}

export type OnboardingClaimStatus = 'pending' | 'claimed' | 'expired'

// A claim outlives the secret's expiry, so 'claimed' never decays to 'expired'.
// An unknown, revoked, pruned or foreign enrollment id answers 404 alike.
export interface OnboardingSecretStatus {
  enrollment_id: string
  mode: string
  owner: string | null
  status: OnboardingClaimStatus
  claimed_node_id: string | null
  expires_at: number
}
