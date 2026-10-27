// Identifier links of a database: rules that turn file paths or source links into links to public
// records. The server checks the rules; these hints only catch the common mistakes while typing.
import type { IdentifierParser, IdentifierRule } from '@/lib/api'

export const PRESETS: readonly IdentifierRule[] = [
  { name: 'BioSample', target: 'key', pattern: '(?P<id>SAM(?:N|EA|D)\\d+)', url_template: 'https://www.ebi.ac.uk/biosamples/samples/{id}' },
  { name: 'NCBI assembly', target: 'key', pattern: '(?P<id>GC[AF]_\\d{9}\\.\\d+)', url_template: 'https://www.ncbi.nlm.nih.gov/datasets/genome/{id}/' },
  { name: 'RefSeq sequence', target: 'key', pattern: '(?P<id>N[CZ]_[A-Z]*\\d+\\.\\d+)[^/]*$', url_template: 'https://www.ncbi.nlm.nih.gov/nuccore/{id}' },
  { name: 'ENA run', target: 'key', pattern: '(?P<id>[EDS]RR\\d+)[^/]*$', url_template: 'https://www.ebi.ac.uk/ena/browser/view/{id}' },
  { name: 'Zenodo record', target: 'source_url', pattern: 'zenodo\\.org/(?:api/)?records?/(?P<id>\\d+)', url_template: 'https://doi.org/10.5281/zenodo.{id}' },
]

export const emptyRule = (): IdentifierRule => ({ name: '', target: 'key', pattern: '', url_template: '' })

/** Adds a preset once; a rule of the same name stays as it is. */
export function withPreset(rules: readonly IdentifierRule[], name: string): IdentifierRule[] {
  const preset = PRESETS.find((item) => item.name === name)
  if (!preset || rules.some((rule) => rule.name === name)) return [...rules]
  return [...rules, { ...preset }]
}

/** The first thing to fix in a rule, in words, or null. */
export function ruleProblem(rule: IdentifierRule): string | null {
  if (!rule.name.trim()) return 'needs a name.'
  if (!/\(\?P?<id>/.test(rule.pattern)) return 'the pattern needs a part named id, like (?P<id>…).'
  if (!rule.url_template.includes('{id}')) return 'the link needs {id}.'
  if (!/^https?:\/\//.test(rule.url_template)) return 'the link must start with https:// or http://.'
  return null
}

/** The rules as the server takes them; no rules clears the parser. */
export function parserOf(rules: readonly IdentifierRule[]): IdentifierParser | null {
  return rules.length ? { rules: rules.map((rule) => ({ ...rule, name: rule.name.trim() })) } : null
}
