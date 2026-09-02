// The deletion impact panel under the in-memory client renderer, with its real
// reference panel and compact lists, shared by the panel test and the delete
// dialog test so both drive the same collapsed lists.
import { defineComponent, h, type Component } from 'vue'
import * as VueRuntime from 'vue'
import * as Utils from '@/lib/utils'
import { compileClientComponent, moduleDefault } from '@/test/clientRender'
import type { BacklinkPreflightResponse } from '@/lib/backlinks'

export const CONTENT_W3ID = 'w3id://content/reef'

export function referenceTitle(index: number): string {
  return `Reef survey ${String(index).padStart(2, '0')}`
}

/** One content carrying `count` visible dataset references. */
export function referencedContent(count: number): BacklinkPreflightResponse {
  return {
    targets: [
      {
        content_w3id: CONTENT_W3ID,
        targeted_versions: [],
        visible_references: Array.from({ length: count }, (_, index) => ({
          document_id: `d-${index + 1}`,
          title: referenceTitle(index + 1),
        })),
        hidden_references_exist: false,
        would_remove_last_resolvable_aruna_location: false,
        location_impact_complete: true,
      },
    ],
    next_cursor: null,
    truncated: false,
    nodes_queried: 1,
    nodes_failed: 0,
    complete: true,
    failed_partitions: [],
    coverage: {
      queried_scope: 'bucket_prefix',
      queried_forms: ['content_w3id'],
      excluded_forms: [],
      node_freshness: [],
      target_resolution_complete: true,
      path_style_endpoint_coverage_complete: true,
      realm_coverage_complete: true,
    },
  }
}

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))

const Slotted = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()),
  })

const SpinnerStub = defineComponent({
  props: { label: String, showLabel: Boolean },
  setup: (props) => () => h('i', props.label ?? ''),
})

const InputStub = defineComponent({
  props: { modelValue: String, placeholder: String, class: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('input', {
      value: props.modelValue,
      placeholder: props.placeholder,
      onInput: (event: { target: { value: string } }) =>
        emit('update:modelValue', event.target.value),
    }),
})

const RouterLinkStub = defineComponent({
  props: { to: [String, Object] },
  setup: (props, { slots }) => () => h('a', { to: props.to }, slots.default?.()),
})

let compiled: Component | null = null

export function deletionImpact(): Component {
  if (compiled) return compiled
  const compactList = compileClientComponent(
    new URL('../components/ui/CompactList.vue', import.meta.url),
    {
      vue: VueRuntime,
      'vue-router': { RouterLink: RouterLinkStub },
      '@lucide/vue': new Proxy({}, { get: () => IconStub }),
      '@/components/ui/Input.vue': moduleDefault(InputStub),
    },
  )
  const referencesPanel = compileClientComponent(
    new URL('../components/data/DatasetReferencesPreflightPanel.vue', import.meta.url),
    {
      vue: VueRuntime,
      '@/lib/utils': Utils,
      '@/components/ui/CompactList.vue': moduleDefault(compactList),
      '@/components/ui/NodeLabel.vue': moduleDefault(Slotted('span')),
      '@/components/ui/Notice.vue': moduleDefault(Slotted('div')),
      '@/components/ui/Spinner.vue': moduleDefault(SpinnerStub),
    },
  )
  compiled = compileClientComponent(
    new URL('../components/data/deletion/DeletionImpact.vue', import.meta.url),
    {
      vue: VueRuntime,
      '@/components/ui/CompactList.vue': moduleDefault(compactList),
      '@/components/ui/Notice.vue': moduleDefault(Slotted('div')),
      '@/components/ui/Spinner.vue': moduleDefault(SpinnerStub),
      '@/components/data/DatasetReferencesPreflightPanel.vue': moduleDefault(referencesPanel),
    },
  )
  return compiled
}
