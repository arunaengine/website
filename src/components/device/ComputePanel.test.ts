import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import * as Utils from '@/lib/utils'
import { compileClientComponent, content, moduleDefault, mountApp } from '@/test/clientRender'

interface Probe {
  docker: { available: boolean; version: string | null; socket: string | null }
  apptainer: { available: boolean; version: string | null; cgroupOk: boolean }
}

const backend = ref('auto')
const probe = ref<Probe>()

const plain = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('div', attrs, slots.default?.()),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const Notice = compileClientComponent(new URL('../ui/Notice.vue', import.meta.url), {
  vue: VueRuntime,
  '@/lib/utils': Utils,
})

const ComputePanel = compileClientComponent(new URL('./ComputePanel.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Badge.vue': moduleDefault(plain),
  '@/components/ui/Button.vue': moduleDefault(plain),
  '@/components/ui/Notice.vue': moduleDefault(Notice),
  '@/components/ui/RefreshButton.vue': moduleDefault(plain),
  '@/components/ui/Input.vue': moduleDefault(plain),
  '@/components/ui/Select.vue': moduleDefault(plain),
  '@/components/ui/Switch.vue': moduleDefault(plain),
  '@/composables/useDeviceCompute': {
    useDeviceCompute: () => ({ compute: ref(null), state: ref('offline'), load: async () => {} }),
  },
  '@/composables/useRefresh': { useRefresh: (run: () => unknown) => ({ busy: ref(false), refresh: run }) },
  '@/lib/desktopBridge': {
    computeProbe: async () => probe.value,
    nodeSettings: async () => ({ compute: { backend: backend.value } }),
    setNodeSettings: async () => ({}),
  },
  '@/lib/utils': Utils,
})

function seen(docker: boolean, apptainer: boolean, cgroupOk: boolean): Probe {
  return {
    docker: { available: docker, version: null, socket: null },
    apptainer: { available: apptainer, version: null, cgroupOk },
  }
}

async function render(): Promise<string> {
  const mounted = await mountApp(ComputePanel)
  const html = content(mounted.root)
  mounted.app.unmount()
  return html
}

beforeEach(() => {
  backend.value = 'auto'
})

describe('the container runtime the shell would pick', () => {
  it('skips Apptainer without a delegated cgroup', async () => {
    probe.value = seen(false, true, false)
    const html = await render()

    expect(html).not.toContain('Automatic picks')
    expect(html).toContain('No usable Docker or Apptainer')
  })

  it('picks Apptainer with a delegated cgroup', async () => {
    probe.value = seen(false, true, true)
    const html = await render()

    expect(html).toContain('Automatic picks Apptainer')
    expect(html).not.toContain('No usable')
  })

  it('warns when a chosen Apptainer has no cgroup', async () => {
    backend.value = 'apptainer'
    probe.value = seen(true, true, false)

    expect(await render()).toContain('Apptainer has no delegated cgroup')
  })
})
