import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import type { DeviceCompute } from '@/lib/deviceApi'

const compute = ref<DeviceCompute | null>(null)
const state = ref('ready')
const load = vi.fn(async () => undefined)

const Plain = defineComponent((_, { slots }) => () => h('span', slots.default?.()))

const LocalCompute = compileClientComponent(new URL('./LocalCompute.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Plain },
  '@lucide/vue': new Proxy({}, { get: () => Plain }),
  '@/components/ui/Badge.vue': moduleDefault(Plain),
  '@/components/ui/Button.vue': moduleDefault(Plain),
  '@/components/ui/CopyButton.vue': moduleDefault(Plain),
  '@/composables/useDeviceCompute': {
    useDeviceCompute: () => ({ compute, state, load, ensureLoaded: vi.fn(async () => undefined) }),
  },
  '@/composables/useDeviceStatus': { useDeviceStatus: () => ({ status: ref(null) }) },
  '@/lib/toolSnippets': { tesAddress: () => null },
})

beforeEach(() => {
  compute.value = {
    enabled: true,
    backend: 'docker',
    healthy: true,
    limits: { max_cpu_cores: null, max_ram_bytes: null, max_disk_bytes: null, max_concurrent: 1 },
    running: 2,
    queued: 0,
    paused: false,
    message: null,
  }
  state.value = 'ready'
  load.mockClear()
})

describe('this computer on the Compute page', () => {
  it('reads the running count again on every visit', async () => {
    for (const visit of [1, 2]) {
      const mounted = await mountApp(LocalCompute)
      await flush()
      expect(load).toHaveBeenCalledTimes(visit)
      expect(content(mounted.root)).toContain('docker · 1 job at a time · 2 running now')
      mounted.app.unmount()
    }
  })
})
