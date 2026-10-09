import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, input, moduleDefault, mountApp } from '@/test/clientRender'
import * as Utils from '@/lib/utils'
import * as DataEntities from '@/lib/dataEntities'
import * as DataIdentity from '@/lib/crate/dataIdentity'

const HELD = `https://w3id.org/aruna/data/${'a'.repeat(64)}`
const LINK = 'https://example.org/remote.csv'
const LOCAL_ARN = 'arn:aruna:R:N:s3/reads/one.csv@01V'
const FOREIGN_ARN = 'https://w3id.org/aruna/data/arn:aruna:F:N:s3/reads/two.csv@01V'
const fetchRoCrateRaw = vi.fn()
const Empty = defineComponent(() => () => null)
const Plain = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const Button = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const ExportChoice = compileClientComponent(new URL('./ExportChoice.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Button.vue': moduleDefault(Button),
  '@/components/ui/Input.vue': moduleDefault(Empty),
  '@/components/ui/Notice.vue': moduleDefault(Plain),
  '@/components/ui/Spinner.vue': moduleDefault(Plain),
  '@/composables/useAruna': { useAruna: () => ({ metadata: ref([{ ulid: 'D1', title: 'Reads' }]), realm: ref({ id: 'R' }) }) },
  '@/composables/aruna/crates': { fetchRoCrateRaw },
  '@/lib/crate/dataIdentity': DataIdentity,
  '@/lib/dataEntities': DataEntities,
  '@/lib/utils': Utils,
})

function crate(...ids: string[]) {
  return {
    '@graph': [
      { '@id': 'ro-crate-metadata.json', about: { '@id': './' } },
      { '@id': './', '@type': 'Dataset', hasPart: ids.map((id) => ({ '@id': id })) },
      ...ids.map((id) => ({ '@id': id, '@type': 'File', name: id })),
    ],
  }
}

async function choose(ids: string[], onSend = vi.fn()) {
  fetchRoCrateRaw.mockResolvedValue(crate(...ids))
  const mounted = await mountApp(ExportChoice, { props: { serving: { name: 'B' }, homeName: 'A', busy: false, onSend } })
  await click(button(mounted.root, 'Reads'))
  await flush()
  const withFiles = element(mounted.root, (node) => node.tag === 'input' && node.props.type === 'radio' && node.props.value === true)
  await (withFiles.props['onUpdate:modelValue'] as (value: unknown) => unknown)?.(true)
  await flush()
  return mounted
}

describe('ExportChoice', () => {
  it('pre-checks stored files and leaves a linked file out of the choice', async () => {
    const onSend = vi.fn()
    const mounted = await choose([HELD, LINK], onSend)
    await click(button(mounted.root, 'Send to B'))
    expect(onSend).toHaveBeenCalledWith({ documentId: 'D1', title: 'Reads', files: [HELD] })
    expect(() => input(mounted.root, 'value', LINK)).toThrow()
    expect(content(mounted.root)).toContain('1 linked file stays a link.')
    mounted.app.unmount()
  })

  it('pre-checks a bare ARN of this realm and leaves a foreign ARN out', async () => {
    const onSend = vi.fn()
    const mounted = await choose([LOCAL_ARN, FOREIGN_ARN], onSend)
    await click(button(mounted.root, 'Send to B'))
    expect(onSend).toHaveBeenCalledWith({ documentId: 'D1', title: 'Reads', files: [LOCAL_ARN] })
    expect(() => input(mounted.root, 'value', FOREIGN_ARN)).toThrow()
    expect(content(mounted.root)).toContain('1 linked file stays a link.')
    mounted.app.unmount()
  })

  it('still lets the user send when every file is a link', async () => {
    const mounted = await choose([LINK])
    expect(content(mounted.root)).toContain('This dataset has no files to copy.')
    expect(button(mounted.root, 'Send to B').props.disabled).toBe(false)
    mounted.app.unmount()
  })
})
