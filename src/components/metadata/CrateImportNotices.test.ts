import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { analyzeCrateJson } from '@/lib/crateImport'
import CrateImportExport from './CrateImportExport.vue'
import ImportCrateDialog from './ImportCrateDialog.vue'

const Stub = defineComponent({
  setup(_props, { slots }) {
    return () => h('span', slots.default?.())
  },
})

type SsrRender = (
  context: Record<string, unknown>,
  push: (chunk: string) => void,
  parent: null,
  attrs: Record<string, unknown>,
  props: Record<string, unknown>,
  setup: Record<string, unknown>,
  data: Record<string, unknown>,
  options: Record<string, unknown>,
) => void

function renderSsr(component: unknown, props: Record<string, unknown>, setup: Record<string, unknown>): string {
  let html = ''
  const ssrRender = (component as { ssrRender: SsrRender }).ssrRender
  ssrRender({}, (chunk) => (html += chunk), null, {}, props, setup, {}, {})
  return html
}

function version13Preview() {
  const fixture = {
    '@context': 'https://w3id.org/ro/crate/1.3/context',
    '@graph': [
      {
        '@id': 'ro-crate-metadata.json',
        '@type': 'CreativeWork',
        conformsTo: { '@id': 'https://w3id.org/ro/crate/1.3' },
        about: { '@id': './' },
      },
      {
        '@id': './',
        '@type': 'Dataset',
        name: 'Future crate',
      },
    ],
  }
  return analyzeCrateJson(JSON.stringify(fixture), 'future.json')
}

const components = Object.fromEntries(
  'AlertTriangle Button ChevronRight Code2 Copy CreateGroupDialog Dialog DialogClose DialogContent DialogDescription DialogFooter DialogHeader DialogTitle DiscardDraftConfirm FileJson FileJson2 FileUp GroupSelect Input Plus Select SubcratePickerDialog Switch Tabs TabsList TabsTrigger Textarea Upload'
    .split(' ').map((name) => [name, Stub]),
)

describe('RO-Crate 1.3 import notices', () => {
  it('renders as supported in the existing-document import preview', () => {
    const html = renderSsr(CrateImportExport, { canImport: true }, {
      ...components,
      showCrate: false,
      hasCrate: false,
      entityCount: 0,
      copied: false,
      importOpen: true,
      pasteText: '',
      importError: '',
      pendingImport: version13Preview(),
      unrecognizedImportProfiles: [],
      importing: false,
      saving: false,
      importedSummary: null,
    })

    expect(html).toContain('RO-Crate 1.3')
    expect(html).not.toContain('not supported yet')
    expect(html).not.toContain('Import support remains')
    expect(html).not.toContain('profile that is not yet recognized')
  })

  it('renders as supported in the new-document import preview', () => {
    const html = renderSsr(ImportCrateDialog, {}, {
      ...components,
      props: { open: true },
      importPaste: '',
      importError: '',
      importPreview: version13Preview(),
      unrecognizedImportProfiles: [],
      confirmDiscardOpen: false,
    })

    expect(html).toContain('RO-Crate 1.3')
    expect(html).not.toContain('not supported yet')
    expect(html).not.toContain('Crate creation remains')
    expect(html).not.toContain('profile that is not yet recognized')
  })
})
