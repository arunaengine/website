<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'

const props = defineProps<{ text: string }>()

// html:false escapes any raw HTML in the source, so the rendered output is the
// sanitized markdown structure only; markdown-it also blocks unsafe link
// protocols (javascript:, vbscript:, …) by default.
const md = new MarkdownIt({ html: false, linkify: true, typographer: true })

const renderLink = md.renderer.rules.link_open
  ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx]?.attrSet('target', '_blank')
  tokens[idx]?.attrSet('rel', 'noopener noreferrer')
  return renderLink(tokens, idx, options, env, self)
}

const html = computed(() => md.render(props.text))
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- markdown-it output, raw HTML disabled -->
  <div class="markdown-body max-h-[72vh] overflow-auto rounded-md border border-border bg-background p-5" v-html="html" />
</template>

<style scoped>
.markdown-body {
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--foreground, inherit);
}
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  font-weight: 600;
  line-height: 1.3;
  margin: 1.2em 0 0.5em;
}
.markdown-body :deep(h1) { font-size: 1.35rem; }
.markdown-body :deep(h2) { font-size: 1.15rem; }
.markdown-body :deep(h3) { font-size: 1rem; }
.markdown-body :deep(p),
.markdown-body :deep(ul),
.markdown-body :deep(ol),
.markdown-body :deep(blockquote),
.markdown-body :deep(table) {
  margin: 0.6em 0;
}
.markdown-body :deep(ul),
.markdown-body :deep(ol) { padding-left: 1.4em; }
.markdown-body :deep(ul) { list-style: disc; }
.markdown-body :deep(ol) { list-style: decimal; }
.markdown-body :deep(a) { color: var(--primary, #2563eb); text-decoration: underline; }
.markdown-body :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85em;
  background: color-mix(in srgb, currentColor 8%, transparent);
  padding: 0.1em 0.35em;
  border-radius: 0.25rem;
}
.markdown-body :deep(pre) {
  background: color-mix(in srgb, currentColor 6%, transparent);
  padding: 0.9em;
  border-radius: 0.5rem;
  overflow-x: auto;
}
.markdown-body :deep(pre code) { background: none; padding: 0; }
.markdown-body :deep(blockquote) {
  border-left: 3px solid color-mix(in srgb, currentColor 20%, transparent);
  padding-left: 0.9em;
  color: color-mix(in srgb, currentColor 65%, transparent);
}
.markdown-body :deep(table) { border-collapse: collapse; width: 100%; }
.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  padding: 0.35em 0.6em;
  text-align: left;
}
.markdown-body :deep(img) { max-width: 100%; height: auto; }
.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  margin: 1.2em 0;
}
</style>
