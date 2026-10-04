import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { compileClientComponent, element, mountApp } from '@/test/clientRender'

const media = compileClientComponent(new URL('./MediaPreview.vue', import.meta.url), { vue: VueRuntime })

describe('media preview', () => {
  it('reports a failed read of the player', async () => {
    for (const mediaKind of ['video', 'audio']) {
      const onFailed = vi.fn()
      const { root } = await mountApp(media, { props: { url: 'https://b.test/presigned', mediaKind, onFailed } })

      ;(element(root, (node) => node.tag === mediaKind).props.onError as () => void)()

      expect(onFailed).toHaveBeenCalledOnce()
    }
  })
})
