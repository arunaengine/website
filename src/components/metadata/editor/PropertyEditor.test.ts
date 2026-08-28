import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileClientComponent, content, moduleDefault, mountApp } from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import { loadVocabIndex, type VocabIndex } from '@/lib/profiles/vocabulary'

let vocab: VocabIndex
beforeAll(async () => {
  vocab = await loadVocabIndex()
})

const PropertyRowStub = defineComponent({
  props: { property: { type: String, required: true } },
  setup: (props) => () => h('p', `${props.property} `),
})

const PropertyEditor = compileClientComponent(new URL('./PropertyEditor.vue', import.meta.url), {
  vue: VueRuntime,
  './PropertyRow.vue': moduleDefault(PropertyRowStub),
  '@/lib/crate/editor': Editor,
})

describe('PropertyEditor', () => {
  it('puts the name first and sorts the rest by label', async () => {
    const draft = Editor.newDraft()
    const mounted = await mountApp(PropertyEditor, {
      props: { draft, entity: draft.entities[0], vocab },
    })

    expect(content(mounted.root).trim()).toBe('name datePublished description license')
    mounted.app.unmount()
  })

  it('leaves out the properties the card renders itself', async () => {
    const draft = Editor.addFilePart(Editor.newDraft(), { id: 's3://bucket/one.csv', name: 'one.csv' })
    const mounted = await mountApp(PropertyEditor, {
      props: { draft, entity: draft.entities[0], vocab, skip: ['hasPart'] },
    })

    expect(content(mounted.root)).not.toContain('hasPart')
    mounted.app.unmount()
  })
})
