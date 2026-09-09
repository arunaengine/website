import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildProfileCrate,
  extractProfileSchema,
  extractShapesTexts,
  missingShapesArtifacts,
  parseProfileCrate,
  parseProfileCrateForControls,
  resolveProfileArtifacts,
} from './rocrate'
import { liftShapes } from '../shacl/lift'
import { controlsFromRules } from './controls'
import { isDatasetType } from './uri'

describe('private profile artifact context', () => {
  it('keeps a custom text rule from hiding the embedded SHACL artifact', () => {
    const propertyUri = 'https://example.org/study/text'
    const lifted = liftShapes(`
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix schema: <https://schema.org/> .
      @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
      <https://example.org/Shape> a sh:NodeShape ;
        sh:targetClass schema:Dataset ;
        sh:property [ sh:path <${propertyUri}> ; sh:datatype xsd:string ; sh:minCount 1 ; sh:maxCount 1 ] .
    `)
    const profile = buildProfileCrate({
      slug: 'text-profile', name: 'Text profile', description: 'Custom text rule', version: '1.0',
      datePublished: '2026-09-09', license: 'https://creativecommons.org/licenses/by/4.0/',
      entityRules: lifted.entities,
    })
    const parsed = parseProfileCrate(profile)

    expect(profile['@context']).toBe('https://w3id.org/ro/crate/1.2/context')
    expect(parsed.contextTerms?.text).toBe(propertyUri)
    expect(parsed.datasetPropertyRules[0]).toMatchObject({ valueName: 'text', propertyUri, obligation: 'MUST' })
    expect(parsed.shapesText).toContain(propertyUri)
    expect(missingShapesArtifacts(profile)).toEqual([])
  })

  it.each(['http://schema.org/text', 'https://schema.org/text'])('reads repaired artifacts exported with %s', async (predicate) => {
    const profile = buildProfileCrate({
      slug: 'repaired', name: 'Repaired profile', description: 'Qualified artifact text', version: '1.0',
      datePublished: '2026-09-09', license: 'https://creativecommons.org/licenses/by/4.0/',
      entityRules: liftShapes(fixture('class-chain.ttl')).entities,
    })
    const exported = structuredClone(profile)
    exported['@context'] = [profile['@context'], { text: 'https://example.org/study/text' }]
    for (const entity of exported['@graph'] as Record<string, unknown>[]) {
      if (typeof entity.text !== 'string') continue
      entity[predicate] = entity.text
      delete entity.text
    }
    const { asked, fetch } = server({})

    expect(await resolveProfileArtifacts(exported, fetch, CRATE_URL)).toBe(exported)
    expect(asked).toEqual([])
    expect(parseProfileCrate(exported).entityRules).toEqual(parseProfileCrate(profile).entityRules)
    expect(extractProfileSchema(exported)).toEqual(extractProfileSchema(profile))
    expect(extractShapesTexts(exported)).toEqual(extractShapesTexts(profile))
    expect(missingShapesArtifacts(exported)).toEqual([])
  })
})

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../shacl/__fixtures__/${name}`, import.meta.url)), 'utf8')
}

const CRATE_URL = 'https://example.org/crates/chemical-substance/ro-crate-metadata.json'

function crate(): unknown {
  return JSON.parse(fixture('chemical-substance-profile-crate.json'))
}

const shapes = () => fixture('chemical-substance.shacl.ttl')

// Serves the crate's own relative artifact paths; anything else is a miss, so a
// test can prove the resolver asked for the right file.
function server(available: Record<string, string>) {
  const asked: string[] = []
  return {
    asked,
    fetch: async (url: string) => {
      asked.push(url)
      const text = available[url]
      if (text === undefined) throw new Error(`not found: ${url}`)
      return text
    },
  }
}

describe('an externally authored profile crate', () => {
  it('finds the validation-role artifact', async () => {
    // The portal writes the `constraints` role; the DX-PROF vocabulary's own
    // term for the same artifact is `validation`, which real crates use.
    const { fetch } = server({ [`${new URL('constraints/chemical-substance.shacl.ttl', CRATE_URL)}`]: shapes() })
    const resolved = await resolveProfileArtifacts(crate(), fetch, CRATE_URL)
    expect(extractShapesTexts(resolved).shapesText).toContain('sh:NodeShape')
  })

  it('resolves artifacts against the crate url', async () => {
    const { asked, fetch } = server({ [`${new URL('constraints/chemical-substance.shacl.ttl', CRATE_URL)}`]: shapes() })
    await resolveProfileArtifacts(crate(), fetch, CRATE_URL)
    expect(asked).toContain('https://example.org/crates/chemical-substance/constraints/chemical-substance.shacl.ttl')
  })

  it('survives an unreachable side artifact', async () => {
    // A directory crate lists its prose and licence files too; one that will not
    // load must not stop the rules being read.
    const { fetch } = server({ [`${new URL('constraints/chemical-substance.shacl.ttl', CRATE_URL)}`]: shapes() })
    const resolved = await resolveProfileArtifacts(crate(), fetch, CRATE_URL)
    expect(missingShapesArtifacts(resolved)).toEqual([])
  })

  it('gives imported and stored SHACL-only profiles identical controls and additional requirements', async () => {
    const { fetch } = server({ [`${new URL('constraints/chemical-substance.shacl.ttl', CRATE_URL)}`]: shapes() })
    const resolved = await resolveProfileArtifacts(crate(), fetch, CRATE_URL)
    const parsed = parseProfileCrate(resolved)
    expect(parsed.name).toContain('ChemicalSubstance')
    // The crate carries no Describo mode file, so its rules live in the shapes.
    expect(parsed.entityRules).toHaveLength(0)
    const imported = liftShapes(parsed.shapesText ?? '')
    const stored = await parseProfileCrateForControls(resolved)
    const importedDatasetRules = imported.entities.find((entity) => isDatasetType(entity.type))?.propertyRules ?? []

    expect(imported.entities).toHaveLength(9)
    expect(imported.fieldCount).toBe(28)
    expect(stored.entityRules).toEqual(imported.entities)
    expect(controlsFromRules(stored.datasetPropertyRules, stored.entityRules)).toEqual(
      controlsFromRules(importedDatasetRules, imported.entities),
    )
    expect(stored.liftNotes).toEqual(imported.notes)
    expect(stored.liftNotes.length).toBeGreaterThan(0)
    expect(parsed.shapesText).toBe(shapes())
    expect(parsed.customShapesText).toBeUndefined()
  })

  it('names the file it cannot reach', async () => {
    // Uploaded as a single ro-crate-metadata.json there is no base to resolve
    // the relative artifact path against, so the import must say which file.
    const { fetch } = server({})
    const resolved = await resolveProfileArtifacts(crate(), fetch)
    expect(extractShapesTexts(resolved).shapesText).toBeUndefined()
    expect(missingShapesArtifacts(resolved)).toEqual(['constraints/chemical-substance.shacl.ttl'])
  })
})
