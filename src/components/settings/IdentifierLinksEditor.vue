<script setup lang="ts">
// The identifier rules of one bucket. Try uses the server's regex engine, so what the editor shows
// is what file details will show. The rules go into the bucket metadata form and are stored with its Save.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import { Check } from '@lucide/vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import { useAruna } from '@/composables/useAruna'
import { apiErrorMessage, type FoundIdentifier, type IdentifierParser, type IdentifierRule } from '@/lib/api'
import { emptyRule, parserOf, PRESETS, ruleProblem, withPreset } from '@/lib/identifierLinks'

const props = defineProps<{ parser: IdentifierParser | null; busy?: boolean }>()
const emit = defineEmits<{ save: [parser: IdentifierParser | null]; close: [] }>()

const { testIdentifierRules } = useAruna()
const rules = ref<IdentifierRule[]>((props.parser?.rules ?? []).map((rule) => ({ ...rule })))
const sample = ref('')
const found = ref<FoundIdentifier[] | null>(null)
const failure = ref<string | null>(null)

const problems = computed(() =>
  rules.value.flatMap((rule, index) => {
    const problem = ruleProblem(rule)
    return problem ? [`Rule ${index + 1}: ${problem}`] : []
  }),
)
const misses = computed(() => {
  const names = new Set(found.value?.map((item) => item.name))
  return found.value ? rules.value.filter((rule) => !names.has(rule.name)).map((rule) => rule.name) : []
})

const remove = (index: number) => rules.value.splice(index, 1)
const usePreset = (name: string) => (rules.value = withPreset(rules.value, name))

async function tryIt() {
  const parser = parserOf(rules.value)
  if (!parser || problems.value.length) return
  failure.value = null
  const url = /^https?:\/\//.test(sample.value)
  try {
    found.value = await testIdentifierRules({ parser, key: url ? '' : sample.value, source_url: url ? sample.value : null })
  } catch (cause) {
    found.value = null
    failure.value = apiErrorMessage(cause)
  }
}

function save(clear = false) {
  if (!clear && problems.value.length) return
  emit('save', clear ? null : parserOf(rules.value))
}
</script>

<template>
  <div class="space-y-4 rounded-md border border-border bg-muted/40 p-4">
    <div>
      <h3 class="text-sm font-medium text-foreground">Identifier links</h3>
      <p class="text-xs text-muted-foreground">
        Turn file names into links to public records, for example BioSample pages. Files of this bucket show the link,
        and datasets get it as an identifier.
      </p>
    </div>

    <div class="space-y-2">
      <div v-if="rules.length" class="hidden gap-2 text-[11px] font-medium text-muted-foreground sm:grid sm:grid-cols-[1.1fr_1fr_1.6fr_2fr_auto]">
        <span>Name</span><span>Look in</span><span>Pattern</span><span>Link</span><span></span>
      </div>
      <div v-for="(rule, index) in rules" :key="index" class="grid gap-2 sm:grid-cols-[1.1fr_1fr_1.6fr_2fr_auto] sm:items-center">
        <Input v-model="rule.name" aria-label="Name" />
        <select
          v-model="rule.target"
          aria-label="Look in"
          class="flex h-9 w-full rounded-md border border-input bg-field px-2 py-1 text-sm shadow-sm"
        >
          <option value="key">File path</option>
          <option value="source_url">Source link</option>
        </select>
        <Input v-model="rule.pattern" aria-label="Pattern" class="font-mono text-xs" :invalid="ruleProblem(rule) ? 'error' : undefined" />
        <Input v-model="rule.url_template" aria-label="Link" class="font-mono text-xs" />
        <Button size="icon-sm" variant="ghost" :aria-label="`Remove rule ${index + 1}`" @click="remove(index)">✕</Button>
      </div>
      <p v-for="problem in problems" :key="problem" class="text-xs text-destructive">{{ problem }}</p>
      <p class="text-xs text-muted-foreground">
        The pattern is a regular expression. Its part named <span class="font-mono">id</span> replaces
        <span class="font-mono">{id}</span> in the link.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" @click="rules.push(emptyRule())">+ Add a rule</Button>
      <span class="text-xs text-muted-foreground">or start from</span>
      <button
        v-for="preset in PRESETS"
        :key="preset.name"
        type="button"
        class="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground/70 hover:bg-accent"
        @click="usePreset(preset.name)"
      >
        {{ preset.name }}
      </button>
    </div>

    <div class="space-y-2 rounded-md border border-border bg-background p-3">
      <p class="text-sm font-medium text-foreground">Try it</p>
      <div class="flex gap-2">
        <Input v-model="sample" aria-label="File path or source link" class="font-mono text-xs" @keydown.enter="tryIt" />
        <Button variant="outline" :disabled="!rules.length || problems.length > 0" @click="tryIt">Try</Button>
      </div>
      <p class="text-xs text-muted-foreground">A file path or a source link.</p>
      <ul v-if="found" class="space-y-1 text-xs">
        <li v-for="item in found" :key="`${item.name}:${item.value}`">
          <Check class="inline h-3 w-3 text-primary" aria-hidden="true" /> {{ item.name }}
          <ExternalLink :href="item.url" :label="item.value" class="font-mono" />
        </li>
        <li v-for="name in misses" :key="`miss:${name}`" class="text-muted-foreground">{{ name }}: no match</li>
      </ul>
    </div>

    <Notice v-if="failure" tone="error">{{ failure }}</Notice>
    <div class="flex items-center gap-2">
      <Button :disabled="busy || problems.length > 0" @click="save()">Use these rules</Button>
      <Button variant="ghost" @click="emit('close')">Cancel</Button>
      <Button v-if="parser" variant="ghost" class="ml-auto text-destructive hover:text-destructive" :disabled="busy" @click="save(true)">
        Remove all links
      </Button>
    </div>
  </div>
</template>
