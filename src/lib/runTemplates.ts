// The built-in run templates the New menus and the Run templates tab offer.
import type { Component } from 'vue'
import { Braces, FileCode2, FileTerminal, ListPlus } from '@lucide/vue'

export interface RunTemplate {
  /** The `template` query of the run page; empty for a blank run. */
  template: string
  icon: Component
  label: string
  hint: string
  /** What the run uses, as the Run templates table shows it. */
  runsWith: string
}

export const RUN_TEMPLATES: readonly RunTemplate[] = [
  { template: 'python', icon: FileCode2, label: 'Python script', hint: 'uv runs it; packages come from PyPI.', runsWith: 'uv, packages from PyPI' },
  { template: 'javascript', icon: Braces, label: 'JavaScript script', hint: 'Deno runs it; packages come from npm.', runsWith: 'Deno, packages from npm' },
  { template: 'bash', icon: FileTerminal, label: 'Bash script', hint: 'Plain shell, no extra tooling.', runsWith: 'Plain shell' },
  { template: '', icon: ListPlus, label: 'Blank run', hint: 'Bring your own container image and command.', runsWith: 'Your own image and command' },
]
