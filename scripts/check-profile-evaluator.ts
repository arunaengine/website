// Offline fixture runner for the profile evaluator. Runs under jiti with no
// alias config:  node_modules/.bin/jiti scripts/check-profile-evaluator.ts
//
// valueCases assert validateProfileData + scopeViolations per constraint keyword;
// crateCases assert evaluateCrate end to end (including conformant flag). The
// fixture (scripts/fixtures/profile-violation-matrix.json) is the shared contract
// the backend CEL tests (aruna#253/#255) will consume verbatim.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateCrate, scopeViolations } from '../src/lib/profiles/evaluate'
import { validateProfileData } from '../src/lib/profiles/validate'

const here = dirname(fileURLToPath(import.meta.url))
const matrix = JSON.parse(readFileSync(resolve(here, 'fixtures/profile-violation-matrix.json'), 'utf8'))

let failures = 0

// Identity key compared order-insensitively: rule id + severity + pointer +
// instance (the tuple the backend CEL parity is defined on, minus the human text).
function key(violation) {
  return `${violation.ruleId}::${violation.severity}::${violation.pointer}::${violation.instance ?? ''}`
}

function compare(name, actual, expected, extra = '') {
  const actualKeys = actual.map(key).sort()
  const expectedKeys = expected.map(key).sort()
  const ok = actualKeys.length === expectedKeys.length && actualKeys.every((value, index) => value === expectedKeys[index])
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? ' — ' + extra : ''}`)
  if (!ok) {
    failures += 1
    console.log(`  expected: ${JSON.stringify(expectedKeys)}`)
    console.log(`  actual:   ${JSON.stringify(actualKeys)}`)
  }
}

for (const testCase of matrix.valueCases) {
  const raw = validateProfileData(testCase.schema, testCase.values)
  const scoped = scopeViolations({ profileSlug: testCase.profileSlug, entity: testCase.entity }, raw)
  compare(`value: ${testCase.name}`, scoped, testCase.expect)
}

for (const testCase of matrix.crateCases) {
  const evaluation = evaluateCrate(testCase.crate, testCase.profile)
  const expectedErrors = testCase.expect.filter((violation) => violation.severity === 'error').length
  const conformantExpected = expectedErrors === 0
  const conformantNote =
    evaluation.conformant === conformantExpected
      ? `conformant=${evaluation.conformant}`
      : `conformant MISMATCH (got ${evaluation.conformant}, want ${conformantExpected})`
  if (evaluation.conformant !== conformantExpected) failures += 1
  compare(`crate: ${testCase.name}`, evaluation.violations, testCase.expect, conformantNote)
}

const total = matrix.valueCases.length + matrix.crateCases.length
console.log(`\n${total - failures}/${total} checks passed`)
process.exit(failures ? 1 : 0)
