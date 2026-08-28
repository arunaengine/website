import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./ImportCrateDialog.vue', import.meta.url), 'utf8')

describe('ImportCrateDialog', () => {
  it('contains only the JSON-LD draft import surface', () => {
    expect(source).toContain('analyzeCrateJson')
    expect(source).toContain('parseDatasetDraft')
    expect(source).toContain("(e: 'imported', draft: DatasetDraft): void")
    expect(source).toContain('> Import RO-Crate')
    expect(source).not.toContain('startTab')
    expect(source).not.toContain('TabsTrigger')
    expect(source).not.toContain('createMetadata')
  })
})
