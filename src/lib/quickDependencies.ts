// Dependency specs of a quick run: validation, registry checks and the two
// generated forms (PEP 723 metadata for uv, an import map for Deno).
import { errorMessage } from '@/lib/utils'
import { fetchWithTimeout } from '@/lib/fetch'
import type { Runtime } from '@/lib/quickRuntimes'

export type DependencyVerification = 'checking' | 'available' | 'not-found' | 'unverified'
export const VERIFICATION_LABEL: Record<DependencyVerification, string> = {
  checking: 'Checking',
  available: 'Available',
  'not-found': 'Not found',
  unverified: 'Unverified',
}
export interface DependencyVerificationResult {
  state: DependencyVerification
  detail: string
}

export function npmPackageName(spec: string): string {
  if (!spec.startsWith('@')) return spec.split('@')[0]
  const slash = spec.indexOf('/')
  const version = spec.indexOf('@', slash + 1)
  return version === -1 ? spec : spec.slice(0, version)
}

function pythonPackage(spec: string): { name: string; constraint: string } | null {
  const match = spec.match(/^([a-z0-9][a-z0-9._-]*)(?:\[[^\]]+\])?\s*(.*)$/i)
  return match ? { name: match[1], constraint: match[2].trim() } : null
}

/** The refusal for a drafted dependency, or null when it can be added. */
export function dependencyError(
  runtime: Runtime['id'],
  draft: string,
  dependencies: string[],
): string | null {
  const dependency = draft.trim()
  if (!dependency) return null
  if (dependencies.some((entry) => entry.toLowerCase() === dependency.toLowerCase())) {
    return 'This dependency is already in the list.'
  }
  if (
    runtime === 'python-uv' &&
    (dependency.startsWith('-') || !/^[a-z0-9][a-z0-9._-]*(?:\[[a-z0-9_,.-]+\])?(?:\s*(?:===|==|~=|!=|<=|>=|<|>).+|\s*@\s*\S+)?(?:\s*;.+)?$/i.test(dependency))
  ) {
    return 'Use a PyPI requirement such as requests>=2.'
  }
  if (
    runtime === 'deno' &&
    !/^(?:@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9._-]+)(?:@[^\s]+)?$/i.test(dependency)
  ) {
    return 'Use an npm package such as chalk or @scope/package@1.'
  }
  if (
    runtime === 'deno' &&
    dependencies.some(
      (entry) => npmPackageName(entry).toLowerCase() === npmPackageName(dependency).toLowerCase(),
    )
  ) {
    return 'This npm package already has a selected version.'
  }
  return null
}

/** Browser-only registry lookup; uv or Deno still resolves authoritatively. */
export async function checkDependency(
  runtime: Runtime['id'],
  dependency: string,
): Promise<DependencyVerificationResult> {
  try {
    if (runtime === 'python-uv') {
      const parsed = pythonPackage(dependency)
      if (!parsed) throw new Error('The requirement could not be inspected in the browser.')
      const response = await fetchWithTimeout(`https://pypi.org/pypi/${encodeURIComponent(parsed.name)}/json`, {}, 5_000)
      if (response.status === 404) {
        return { state: 'not-found', detail: `${parsed.name} was not found on PyPI.` }
      }
      if (!response.ok) throw new Error(`PyPI returned ${response.status}.`)
      const metadata = (await response.json()) as { releases?: Record<string, unknown> }
      const exact = parsed.constraint.match(/^===?\s*([^,;\s]+)$/)
      if (!parsed.constraint) {
        return { state: 'available', detail: 'Package exists on PyPI.' }
      }
      if (exact) {
        return metadata.releases && exact[1] in metadata.releases
          ? { state: 'available', detail: `Version ${exact[1]} exists on PyPI.` }
          : { state: 'not-found', detail: `Version ${exact[1]} was not found on PyPI.` }
      }
      return { state: 'unverified', detail: 'Package exists; this version constraint needs uv to resolve it.' }
    }
    const name = npmPackageName(dependency)
    const specifier = dependency.slice(name.length + (dependency.length > name.length ? 1 : 0))
    const response = await fetchWithTimeout(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {}, 5_000)
    if (response.status === 404) {
      return { state: 'not-found', detail: `${name} was not found on npm.` }
    }
    if (!response.ok) throw new Error(`npm returned ${response.status}.`)
    const metadata = (await response.json()) as {
      versions?: Record<string, unknown>
      'dist-tags'?: Record<string, string>
    }
    if (!specifier) return { state: 'available', detail: 'Package exists on npm.' }
    if (metadata.versions && specifier in metadata.versions) {
      return { state: 'available', detail: `Version ${specifier} exists on npm.` }
    }
    if (metadata['dist-tags'] && specifier in metadata['dist-tags']) {
      return { state: 'available', detail: `Tag ${specifier} exists on npm.` }
    }
    if (/^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/i.test(specifier)) {
      return { state: 'not-found', detail: `Version ${specifier} was not found on npm.` }
    }
    return { state: 'unverified', detail: 'Package exists; this version range needs Deno to resolve it.' }
  } catch (err) {
    return { state: 'unverified', detail: `Registry check unavailable: ${errorMessage(err)}` }
  }
}

/** The deno.json content mapping bare imports to the picked npm versions. */
export function denoImportMap(dependencies: string[]): string {
  return JSON.stringify(
    {
      imports: Object.fromEntries(
        dependencies.map((dependency) => [npmPackageName(dependency), `npm:${dependency}`]),
      ),
    },
    null,
    2,
  )
}

export function dependenciesFromDenoConfig(text: string): string[] {
  try {
    const parsed = JSON.parse(text) as { imports?: Record<string, string> }
    return Object.values(parsed.imports ?? {})
      .filter((value) => typeof value === 'string' && value.startsWith('npm:'))
      .map((value) => value.slice('npm:'.length))
  } catch {
    return []
  }
}

/** Prefixes the script with the PEP 723 block uv reads its requirements from. */
export function inlineDependencies(script: string, dependencies: string[]): string {
  const lines = dependencies.map((dependency) => `#   ${JSON.stringify(dependency)},`).join('\n')
  return `# /// script\n# requires-python = ">=3.13"\n# dependencies = [\n${lines}\n# ]\n# ///\n${script}`
}

// Reverses the injection: strips a portal-shaped leading metadata block and
// returns the dependency list it carried.
export function extractInlineDependencies(text: string): { script: string; dependencies: string[] } {
  const match = text.match(
    /^# \/\/\/ script\n# requires-python = "[^"]*"\n# dependencies = \[\n((?:#   .*\n)*)# \]\n# \/\/\/\n/,
  )
  if (!match) return { script: text, dependencies: [] }
  const dependencies: string[] = []
  for (const line of match[1].split('\n')) {
    const dep = line.match(/^#\s+("(?:[^"\\]|\\.)*"),?\s*$/)
    if (!dep) continue
    try {
      dependencies.push(JSON.parse(dep[1]) as string)
    } catch {
      // A hand-edited block that no longer parses stays in the script verbatim.
      return { script: text, dependencies: [] }
    }
  }
  return { script: text.slice(match[0].length), dependencies }
}
