// Regenerates src/lib/profiles/vocab.json from the official schema.org release.
// The DCMI Metadata Terms entries already in the file are kept verbatim; only
// the schema.org half is rebuilt. Run with: node scripts/build-vocab.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RELEASE_URL = 'https://schema.org/version/latest/schemaorg-current-https.jsonld'
const TARGET = fileURLToPath(new URL('../src/lib/profiles/vocab.json', import.meta.url))
const SCHEMA_PREFIX = 'schema:'
const SCHEMA_NAMESPACE = 'http://schema.org/'

// Hosted extensions ship in the core release and stay; pending and attic terms
// are proposals and retired terms, which no author should be offered.
const EXCLUDED_SECTIONS = /pending|attic/

const DATATYPE_KINDS = {
  Text: 'text',
  Number: 'number',
  Integer: 'integer',
  Float: 'number',
  Boolean: 'boolean',
  Date: 'date',
  DateTime: 'datetime',
  Time: 'text',
  URL: 'url',
}

function list(value) {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function ids(value) {
  return list(value).map((entry) => (typeof entry === 'string' ? entry : entry['@id'])).filter(Boolean)
}

function uriOf(curie) {
  return curie.startsWith(SCHEMA_PREFIX) ? `${SCHEMA_NAMESPACE}${curie.slice(SCHEMA_PREFIX.length)}` : curie
}

const MAX_DESCRIPTION = 198
const ABBREVIATION = /(?:\b(?:e\.g|i\.e|etc|cf|vs|approx|no|resp|fig|inc|ltd|dr|mr|mrs|st|u\.s)|\s[a-z])$/i

// The sentence a comment opens with, so a picker row stays one line.
function firstSentence(paragraph) {
  const ends = /[.!?](?=\s+[A-Z0-9(])/g
  for (let end = ends.exec(paragraph); end; end = ends.exec(paragraph)) {
    if (!ABBREVIATION.test(paragraph.slice(0, end.index))) return paragraph.slice(0, end.index + 1)
  }
  return paragraph
}

// One readable line, without the markdown, HTML and cross-reference syntax
// schema.org writes into its comments.
function summary(value) {
  const raw = list(value)
    .map((entry) => (typeof entry === 'string' ? entry : entry['@value'] ?? ''))
    .find(Boolean) ?? ''
  const paragraph = raw
    .replace(/\\n/g, '\n')
    .split(/\n\s*\n/)[0]
    .replace(/<[^>]*>/g, '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/```+/g, '')
    .replace(/\\([().*_])/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  const sentence = firstSentence(paragraph)
  return sentence.length > MAX_DESCRIPTION ? `${sentence.slice(0, MAX_DESCRIPTION)}\u2026` : sentence
}

// "AboutPage" -> "About page", "accessibilityAPI" -> "Accessibility API".
function humanLabel(name) {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z0-9]+)([A-Z][a-z])/g, '$1 $2')
    .split(' ')
    .map((word) => (/^[A-Z0-9]{2,}$/.test(word) ? word : word.toLowerCase()))
    .join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function kindOf(targets) {
  const names = targets.map((uri) => uri.slice(SCHEMA_NAMESPACE.length))
  if (names.some((name) => !(name in DATATYPE_KINDS))) return 'entity'
  for (const name of names) {
    const kind = DATATYPE_KINDS[name]
    if (kind && kind !== 'text') return kind
  }
  return 'text'
}

function typed(node, type) {
  return list(node['@type']).includes(type)
}

function included(node) {
  if (!node['@id']?.startsWith(SCHEMA_PREFIX) || node['schema:supersededBy']) return false
  return !ids(node['schema:isPartOf']).some((section) => EXCLUDED_SECTIONS.test(section))
}

function byName(a, b) {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'en') || a.uri.localeCompare(b.uri)
}

const release = await fetch(RELEASE_URL).then((response) => {
  if (!response.ok) throw new Error(`${RELEASE_URL} answered ${response.status}`)
  return response.json()
})
const graph = list(release['@graph'])
// Datatypes, plus what specialises a primitive one (Float, Integer, URL), are
// values rather than entity types.
const datatypes = new Set(graph.filter((node) => typed(node, 'schema:DataType')).map((node) => node['@id']))
for (const id of datatypes) if (id.slice(SCHEMA_PREFIX.length) in DATATYPE_KINDS) datatypes.add(id)
const primitives = new Set([...datatypes].filter((id) => id.slice(SCHEMA_PREFIX.length) in DATATYPE_KINDS))
for (let added = true; added;) {
  added = false
  for (const node of graph) {
    if (primitives.has(node['@id']) || !ids(node['rdfs:subClassOf']).some((parent) => primitives.has(parent))) continue
    primitives.add(node['@id'])
    datatypes.add(node['@id'])
    added = true
  }
}

const properties = []
const classes = []
for (const node of graph) {
  if (!included(node)) continue
  const name = node['@id'].slice(SCHEMA_PREFIX.length)
  const term = {
    uri: uriOf(node['@id']),
    name,
    label: humanLabel(name),
    description: summary(node['rdfs:comment']),
    source: 'schema.org',
  }
  if (typed(node, 'rdf:Property')) {
    const targets = ids(node['schema:rangeIncludes']).map(uriOf)
    const domains = ids(node['schema:domainIncludes']).map(uriOf)
    properties.push({
      ...term,
      kind: kindOf(targets),
      ...(targets.length ? { targets } : {}),
      ...(domains.length ? { domains } : {}),
    })
  } else if (typed(node, 'rdfs:Class') && !datatypes.has(node['@id'])) {
    const parents = ids(node['rdfs:subClassOf']).filter((id) => id.startsWith(SCHEMA_PREFIX)).map(uriOf)
    classes.push({ ...term, ...(parents.length ? { parents } : {}) })
  }
}

// Dublin Core is not published as JSON-LD alongside schema.org; its entries were
// generated once from the DCMI release and are carried over unchanged.
const existing = JSON.parse(readFileSync(TARGET, 'utf8'))
const carried = (terms) => terms.filter((term) => term.source !== 'schema.org')
const vocab = {
  properties: [...properties, ...carried(existing.properties)].sort(byName),
  classes: [...classes, ...carried(existing.classes)].sort(byName),
}
writeFileSync(TARGET, JSON.stringify(vocab))
process.stdout.write(`${vocab.properties.length} properties, ${vocab.classes.length} classes\n`)
