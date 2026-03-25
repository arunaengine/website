import { vi } from 'vitest'

const defaultRuntimeConfig = {
  app: {
    baseURL: '/',
    buildAssetsDir: '_nuxt',
    cdnURL: '',
  },
}

const defaultRoute = {
  path: '/',
  fullPath: '/',
  name: 'index',
  params: {},
  query: {},
}

export const mockRuntimeConfig = structuredClone(defaultRuntimeConfig)
export const mockRoute = structuredClone(defaultRoute)
export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}
export const mockFetch = vi.fn()

export function setMockRuntimeConfig(overrides: Partial<typeof defaultRuntimeConfig>): void {
  Object.assign(mockRuntimeConfig, structuredClone(defaultRuntimeConfig), overrides)
  if (overrides.app) {
    mockRuntimeConfig.app = {
      ...defaultRuntimeConfig.app,
      ...overrides.app,
    }
  }
}

export function setMockRoute(overrides: Partial<typeof defaultRoute>): void {
  Object.assign(mockRoute, structuredClone(defaultRoute), overrides)
}

export function resetNuxtMocks(): void {
  setMockRuntimeConfig({})
  setMockRoute({})
  mockRouter.push.mockReset()
  mockRouter.replace.mockReset()
  mockRouter.back.mockReset()
  mockFetch.mockReset()
}
