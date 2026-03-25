import { config } from '@vue/test-utils'
import { afterEach, vi } from 'vitest'
import { mockFetch, mockRoute, mockRouter, mockRuntimeConfig, resetNuxtMocks } from '../helpers/nuxt'

vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: () => mockRuntimeConfig,
}))

vi.stubGlobal('$fetch', mockFetch)

vi.stubGlobal('useRuntimeConfig', () => mockRuntimeConfig)
vi.stubGlobal('useRoute', () => mockRoute)
vi.stubGlobal('useRouter', () => mockRouter)
vi.stubGlobal('useCookie', vi.fn(() => ({ value: undefined })))
vi.stubGlobal('navigateTo', vi.fn())

declare global {
  interface Window {
    HSStaticMethods?: {
      autoInit: ReturnType<typeof vi.fn>
    }
  }
}

config.global.stubs = {
  NuxtLink: {
    props: ['to', 'href', 'target'],
    template: '<a :href="typeof to === \'string\' ? to : (typeof href === \'string\' ? href : \'#\')" :target="target"><slot /></a>',
  },
  ClientOnly: {
    template: '<slot />',
  },
}

afterEach(() => {
  vi.restoreAllMocks()
  resetNuxtMocks()
})

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

if (!window.scrollTo) {
  window.scrollTo = vi.fn()
}

if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
}

if (!window.IntersectionObserver) {
  class IntersectionObserverMock {
    readonly root = null
    readonly rootMargin = '0px'
    readonly thresholds = [0]

    disconnect = vi.fn()
    observe = vi.fn()
    takeRecords = vi.fn(() => [])
    unobserve = vi.fn()
  }

  window.IntersectionObserver = IntersectionObserverMock as typeof IntersectionObserver
}

if (!window.ResizeObserver) {
  class ResizeObserverMock {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }

  window.ResizeObserver = ResizeObserverMock as typeof ResizeObserver
}

if (!window.HSStaticMethods) {
  window.HSStaticMethods = {
    autoInit: vi.fn(),
  }
}
