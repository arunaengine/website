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
  'vue-router': { RouterLink: plain },
  '@lucide/vue': icons,
  '@/components/ui/Badge.vue': moduleDefault(plain),
  '@/components/ui/Button.vue': moduleDefault(plain),
  '@/components/ui/Notice.vue': moduleDefault(Notice),
  '@/components/ui/Input.vue': moduleDefault(plain),
  '@/components/ui/Switch.vue': moduleDefault(plain),
  '@/composables/useDeviceCompute': {
    useDeviceCompute: () => ({ compute: ref(null), state: ref('offline'), load: async () => {} }),
  },
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
  it('warns when no usable runtime was found', async () => {
    probe.value = seen(false, true, false)

    expect(await render()).toContain('No usable Docker or Apptainer')
  })

  it('stays quiet when Apptainer has a delegated cgroup', async () => {
    probe.value = seen(false, true, true)
    const html = await render()

    expect(html).not.toContain('No usable')
    expect(html).not.toContain('Automatic picks')
  })

  it('warns when a chosen Apptainer has no cgroup', async () => {
    backend.value = 'apptainer'
    probe.value = seen(true, true, false)

    expect(await render()).toContain('Apptainer has no delegated cgroup')
  })

  it('says nothing about a runtime while local runs are off', async () => {
    backend.value = 'off'
    probe.value = seen(false, false, false)

    expect(await render()).not.toContain('No usable')
  })
})

describe('the local runs card', () => {
  it('words the switch and the limits in plain terms', async () => {
    probe.value = seen(true, false, false)
    const html = await render()

    for (const text of ['Local runs', 'Run jobs on this computer', 'Jobs at a time', 'Keep failed jobs', 'Save']) {
      expect(html).toContain(text)
    }
    expect(html).toContain('Saving restarts Aruna on this computer for a few seconds.')
  })
})
