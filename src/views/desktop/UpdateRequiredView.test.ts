import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Utils from '@/lib/utils'
import * as UpdateRequired from '@/lib/updateRequired'
import { button, click, compileClientComponent, content, moduleDefault, mountApp } from '@/test/clientRender'

const openExternal = vi.fn(async () => undefined)
const wipeDevice = vi.fn(async () => undefined)
const appQuit = vi.fn(async () => undefined)
const refresh = vi.fn(async () => undefined)
const startNode = vi.fn(async () => undefined)
const status = ref<{ updateRequired: { local: string; realm: string } | null }>({ updateRequired: null })
const download = vi.hoisted(() => ({ url: null as string | null }))

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const Plain = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
// Shows its content only while open, which is what gates the wipe.
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', slots.default?.()) : null),
})
const Empty = defineComponent(() => () => null)

const UpdateRequiredView = compileClientComponent(new URL('./UpdateRequiredView.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogContent.vue': moduleDefault(Plain),
  '@/components/ui/DialogDescription.vue': moduleDefault(Plain),
  '@/components/ui/DialogFooter.vue': moduleDefault(Plain),
  '@/components/ui/DialogHeader.vue': moduleDefault(Plain),
  '@/components/ui/DialogTitle.vue': moduleDefault(Plain),
  '@/components/ui/Notice.vue': moduleDefault(Plain),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
  '@/components/layout/AppLogo.vue': moduleDefault(Empty),
  '@/composables/useDeviceStatus': { useDeviceStatus: () => ({ refresh, status }) },
  '@/composables/useNodeControl': { useNodeControl: () => ({ busy: ref(false), error: ref(null), start: startNode }) },
  '@/composables/useRealm': { useRealm: () => ({ realm: ref({ name: 'Aruna v3 Demo' }) }) },
  '@/lib/desktopBridge': { appQuit, openExternal, wipeDevice, WIPE_PHRASE: 'wipe' },
  '@/lib/updateRequired': {
    ...UpdateRequired,
    get DESKTOP_DOWNLOAD_URL() {
      return download.url
    },
  },
  '@/lib/utils': Utils,
})

async function mount(local: string, realm: string) {
  return mountApp(UpdateRequiredView, { props: { local, realm } })
}

beforeEach(() => {
  openExternal.mockClear()
  wipeDevice.mockClear()
  appQuit.mockClear()
  refresh.mockClear()
  startNode.mockClear()
  download.url = null
  status.value = { updateRequired: null }
})

describe('update required', () => {
  it('names both versions and says where to get the update', async () => {
    const mounted = await mount('3.0.0-alpha.131', '3.0.0-alpha.133')
    const html = content(mounted.root)

    expect(html).toContain('Aruna Desktop needs an update')
    expect(html).toContain('Aruna v3 Demo has a newer version than this app.')
    expect(html).toContain('Your files and your linked folders are safe.')
    expect(html).toContain('3.0.0-alpha.131')
    expect(html).toContain('3.0.0-alpha.133')
    expect(html).toContain('Get the latest Aruna Desktop from your Aruna administrator.')
    expect(() => button(mounted.root, 'Update now')).toThrow()
    mounted.app.unmount()
  })

  it('links to the download once a public one is set', async () => {
    download.url = 'https://download.example/aruna'
    const mounted = await mount('3.0.0-alpha.131', '3.0.0-alpha.133')

    expect(content(mounted.root)).toContain('What is new in alpha.133')
    await click(button(mounted.root, 'Update now'))

    expect(openExternal).toHaveBeenCalledWith('https://download.example/aruna')
    mounted.app.unmount()
  })

  it('checks again through the start path and says when the versions still differ', async () => {
    status.value = { updateRequired: { local: '3.0.0-alpha.131', realm: '3.0.0-alpha.133' } }
    const mounted = await mount('3.0.0-alpha.131', '3.0.0-alpha.133')

    await click(button(mounted.root, 'Check again'))

    expect(startNode).toHaveBeenCalledTimes(1)
    expect(content(mounted.root)).toContain('The versions still differ.')
    mounted.app.unmount()
  })

  it('stays quiet after a check when the shell no longer asks for an update', async () => {
    const mounted = await mount('3.0.0-alpha.131', '3.0.0-alpha.133')

    await click(button(mounted.root, 'Check again'))

    expect(content(mounted.root)).not.toContain('still differ')
    mounted.app.unmount()
  })

  it('does not offer an update when the realm is behind the app', async () => {
    const mounted = await mount('3.0.0-alpha.140', '3.0.0-alpha.133')
    const html = content(mounted.root)

    expect(html).toContain('runs an older version than this app')
    expect(html).toContain('Ask the person who runs')
    expect(() => button(mounted.root, 'Update now')).toThrow()
    expect(content(mounted.root)).not.toContain('Get the latest')
    mounted.app.unmount()
  })

  it('asks before it removes local data and then uses the wipe command', async () => {
    const mounted = await mount('3.0.0-alpha.131', '3.0.0-alpha.133')

    expect(() => button(mounted.root, 'Remove and set up again')).toThrow()
    await click(button(mounted.root, 'Remove local data and set up again'))
    expect(wipeDevice).not.toHaveBeenCalled()
    expect(content(mounted.root)).toContain('Data that exists only on this computer is lost')
    expect(content(mounted.root)).toContain('folder links disappear')

    await click(button(mounted.root, 'Remove and set up again'))
    expect(wipeDevice).toHaveBeenCalledWith('wipe')
    expect(refresh).toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('shows a failed wipe and leaves the data alone', async () => {
    wipeDevice.mockRejectedValueOnce(new Error('The shell refused.'))
    const mounted = await mount('3.0.0-alpha.131', '3.0.0-alpha.133')

    await click(button(mounted.root, 'Remove local data and set up again'))
    await click(button(mounted.root, 'Remove and set up again'))

    expect(content(mounted.root)).toContain('The shell refused.')
    expect(refresh).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('lets the owner quit', async () => {
    const mounted = await mount('3.0.0-alpha.131', '3.0.0-alpha.133')

    await click(button(mounted.root, 'Quit Aruna Desktop'))

    expect(appQuit).toHaveBeenCalled()
    mounted.app.unmount()
  })
})
