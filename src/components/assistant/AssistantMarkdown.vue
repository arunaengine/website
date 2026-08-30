<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'

const props = withDefaults(defineProps<{
  text: string
  size?: 'compact' | 'full'
}>(), { size: 'compact' })

// Keep provider output as a safe subset of Markdown. Raw HTML is escaped and
// markdown-it rejects unsafe link protocols by default.
const md = new MarkdownIt({ html: false, linkify: true, typographer: true })

const renderLink = md.renderer.rules.link_open
  ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx]?.attrSet('target', '_blank')
  tokens[idx]?.attrSet('rel', 'noopener noreferrer')
  return renderLink(tokens, idx, options, env, self)
}

const renderFence = md.renderer.rules.fence
  ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.fence = (tokens, idx, options, env, self) =>
  `<div class="assistant-code">${renderFence(tokens, idx, options, env, self)}`
  + '<button type="button" data-copy class="assistant-copy">Copy</button></div>'

const html = computed(() => md.render(props.text))

// The copy control lives in rendered Markdown, so the block reads its code back
// out of the DOM instead of holding a second copy of it.
function onCopy(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  const trigger = target.closest('button[data-copy]')
  if (!(trigger instanceof HTMLElement)) return
  const code = trigger.parentElement?.querySelector('pre')?.textContent ?? ''
  const clipboard = navigator.clipboard
  if (!code || !clipboard) return
  void clipboard.writeText(code).then(() => {
    trigger.textContent = 'Copied'
    setTimeout(() => (trigger.textContent = 'Copy'), 1500)
  }).catch(() => undefined)
}
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- markdown-it output, raw HTML disabled -->
  <div
    class="assistant-markdown min-w-0 max-w-full break-words px-1 leading-relaxed text-foreground"
    :class="size === 'full' ? 'text-sm' : 'text-xs'"
    @click="onCopy"
    v-html="html"
  />
</template>

<style scoped>
.assistant-markdown {
  overflow-wrap: anywhere;
}

.assistant-markdown :deep(p),
.assistant-markdown :deep(ul),
.assistant-markdown :deep(ol),
.assistant-markdown :deep(blockquote),
.assistant-markdown :deep(pre),
.assistant-markdown :deep(table),
.assistant-markdown :deep(.assistant-code) {
  margin: 0.55em 0;
}

.assistant-markdown :deep(p:first-child),
.assistant-markdown :deep(h1:first-child),
.assistant-markdown :deep(h2:first-child),
.assistant-markdown :deep(h3:first-child) {
  margin-top: 0;
}

.assistant-markdown :deep(p:last-child),
.assistant-markdown :deep(ul:last-child),
.assistant-markdown :deep(ol:last-child),
.assistant-markdown :deep(pre:last-child),
.assistant-markdown :deep(table:last-child) {
  margin-bottom: 0;
}

.assistant-markdown :deep(h1),
.assistant-markdown :deep(h2),
.assistant-markdown :deep(h3) {
  margin: 0.9em 0 0.35em;
  font-weight: 600;
  line-height: 1.3;
}

.assistant-markdown :deep(h1) { font-size: 1.35em; }
.assistant-markdown :deep(h2) { font-size: 1.2em; }
.assistant-markdown :deep(h3) { font-size: 1.1em; }

.assistant-markdown :deep(ul),
.assistant-markdown :deep(ol) {
  padding-left: 1.35em;
}

.assistant-markdown :deep(ul) { list-style: disc; }
.assistant-markdown :deep(ol) { list-style: decimal; }

.assistant-markdown :deep(li + li) {
  margin-top: 0.2em;
}

.assistant-markdown :deep(a) {
  color: hsl(var(--primary));
  text-decoration: underline;
  text-underline-offset: 2px;
}

.assistant-markdown :deep(code) {
  border-radius: 0.25rem;
  background: hsl(var(--muted));
  padding: 0.1em 0.3em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
}

.assistant-markdown :deep(.assistant-code) {
  position: relative;
}

.assistant-markdown :deep(.assistant-code pre) {
  margin: 0;
}

.assistant-markdown :deep(.assistant-copy) {
  position: absolute;
  top: 0.4em;
  right: 0.4em;
  border-radius: 0.25rem;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--background));
  padding: 0.1em 0.45em;
  font-size: 0.75em;
  color: hsl(var(--muted-foreground));
  opacity: 0;
  transition: opacity 0.12s ease-in-out;
}

.assistant-markdown :deep(.assistant-code:hover .assistant-copy),
.assistant-markdown :deep(.assistant-copy:focus-visible) {
  opacity: 1;
}

.assistant-markdown :deep(pre) {
  max-width: 100%;
  overflow-x: auto;
  border-radius: 0.375rem;
  background: hsl(var(--muted) / 0.65);
  padding: 0.7em 0.8em;
  white-space: pre;
}

.assistant-markdown :deep(pre code) {
  background: transparent;
  padding: 0;
  font-size: 0.9em;
}

.assistant-markdown :deep(blockquote) {
  border-left: 3px solid hsl(var(--border));
  padding-left: 0.8em;
  color: hsl(var(--muted-foreground));
}

.assistant-markdown :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
}

.assistant-markdown :deep(th),
.assistant-markdown :deep(td) {
  border: 1px solid hsl(var(--border));
  padding: 0.3em 0.55em;
  text-align: left;
  white-space: nowrap;
}

.assistant-markdown :deep(th) {
  font-weight: 600;
}

.assistant-markdown :deep(hr) {
  margin: 0.9em 0;
  border: 0;
  border-top: 1px solid hsl(var(--border));
}
</style>
