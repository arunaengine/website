import type { v2CustomAttribute, v2Permission, v2Token, v2User } from '~/composables/aruna_api_json'

type UserOverrides = Partial<v2User>

export function createUser(overrides: UserOverrides = {}): v2User {
  return {
    id: 'user-1',
    displayName: 'Test User',
    active: true,
    email: 'test@example.com',
    attributes: {
      globalAdmin: false,
      serviceAccount: false,
      tokens: [] as v2Token[],
      trustedEndpoints: [],
      customAttributes: [] as v2CustomAttribute[],
      personalPermissions: [] as v2Permission[],
    },
    ...overrides,
    attributes: {
      globalAdmin: false,
      serviceAccount: false,
      tokens: [],
      trustedEndpoints: [],
      customAttributes: [],
      personalPermissions: [],
      ...overrides.attributes,
    },
  }
}
