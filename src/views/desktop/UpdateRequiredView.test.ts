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
  '@/composables/useDeviceStatus': { useDeviceStatus: () => ({ refresh }) },
  '@/composables/useRealm': { useRealm: () => ({ realm: ref({ name: 'Aruna v3 Demo' }) }) },
  '@/lib/desktopBridge': { appQuit, openExternal, wipeDevice, WIPE_PHRASE: 'wipe' },
  '@/lib/updateRequired': UpdateRequired,
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
})

describe('update required', () => {
  it('names both versions and asks for an update when the realm is ahead', async () => {
    const mounted = await mount('3.0.0-alpha.131', '3.0.0-alpha.133')
    const html = content(mounted.root)

    expect(html).toContain('Aruna Desktop needs an update')
    expect(html).toContain('Aruna v3 Demo has a newer version than this app.')
    expect(html).toContain('Your files and your synced folders are safe.')
    expect(html).toContain('3.0.0-alpha.131')
    expect(html).toContain('3.0.0-alpha.133')
    expect(html).toContain('What is new in alpha.133')

    await click(button(mounted.root, 'Update now'))
    expect(openExternal).toHaveBeenCalledWith(UpdateRequired.DESKTOP_RELEASES_URL)
    mounted.app.unmount()
  })

  it('does not offer an update when the realm is behind the app', async () => {
    const mounted = await mount('3.0.0-alpha.140', '3.0.0-alpha.133')
    const html = content(mounted.root)

    expect(html).toContain('runs an older version than this app')
    expect(html).toContain('Ask the person who runs')
    expect(() => button(mounted.root, 'Update now')).toThrow()
    mounted.app.unmount()
  })

  it('asks before it removes local data and then uses the wipe command', async () => {
    const mounted = await mount('3.0.0-alpha.131', '3.0.0-alpha.133')

    expect(() => button(mounted.root, 'Remove and set up again')).toThrow()
    await click(button(mounted.root, 'Remove local data and set up again'))
    expect(wipeDevice).not.toHaveBeenCalled()

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
