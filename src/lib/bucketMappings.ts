// Two-way mappings of a linked bucket, stored as the link's discovery rules: the Aruna side is
// `folder` shown as `<folder>{name}`, the storage side is a glob (`*.faa`) or `<folder>/{name}`.
import type { FileRule, MoveRequest } from './api'

export interface Mapping {
  /** Aruna path template, such as `proteins/{name}`. */
  aruna: string
  /** Storage path: a glob such as `*.faa` or a folder template such as `lars/{name}`. */
  storage: string
}

export function toMapping(rule: FileRule): Mapping {
  return { aruna: `${rule.folder}{name}`, storage: rule.pattern }
}

export function toRule(mapping: Mapping): FileRule {
  return { pattern: mapping.storage.trim(), folder: arunaFolder(mapping.aruna) }
}

function arunaFolder(template: string): string {
  return template.trim().replace(/\{name\}$/, '')
}

function isFolderTemplate(storage: string): boolean {
  return storage.includes('/')
}

/** Why a mapping cannot be saved; the node checks overlaps between rules. */
export function mappingProblem(mapping: Mapping): string | null {
  const aruna = mapping.aruna.trim()
  const storage = mapping.storage.trim()
  if (!aruna || !storage) return 'Fill in both paths.'
  if (!aruna.endsWith('/{name}') || aruna.startsWith('/')) return 'The Aruna path is a folder followed by /{name}.'
  if (arunaFolder(aruna).includes('{')) return 'The Aruna path takes {name} only at the end.'
  if (isFolderTemplate(storage)) {
    if (!storage.endsWith('/{name}') || storage.startsWith('/') || storage.slice(0, -6).includes('{')) {
      return 'A storage folder is written as folder/{name}.'
    }
  } else if (storage.includes('{name}')) {
    return 'A storage file type is a pattern like *.faa.'
  }
  return null
}

/** The organize move that gives files already in Aruna the mapped path. */
export function movePlan(mapping: Mapping): MoveRequest {
  const rule = toRule(mapping)
  const target = `${rule.folder}{dir}{name}`
  if (isFolderTemplate(rule.pattern)) {
    return { from: rule.pattern.replace(/\{name\}$/, ''), pattern: '*', target, subfolders: true }
  }
  return { from: '', pattern: rule.pattern, target, subfolders: true }
}

export function sameMappings(left: Mapping[], right: Mapping[]): boolean {
  return JSON.stringify(left.map(toRule)) === JSON.stringify(right.map(toRule))
}
