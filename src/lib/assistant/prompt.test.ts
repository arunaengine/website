import { describe, expect, it } from 'vitest'
import { systemPrompt } from './prompt'

describe('systemPrompt', () => {
  it('names the page the user is looking at right after the route', () => {
    const prompt = systemPrompt({
      route: '/app/datasets/01H',
      page: {
        kind: 'dataset',
        title: 'Water quality 2026',
        details: { 'document id': '01H', path: 'meta/water.json', group: 'g-1', profile: '', entities: '12' },
      },
    })
    const lines = prompt.split('\n')
    const routeIndex = lines.indexOf('The user is on the route /app/datasets/01H.')

    expect(lines[routeIndex + 1]).toBe(
      'The user is looking at the dataset "Water quality 2026" '
      + '(document id 01H, path meta/water.json, group g-1, entities 12).',
    )
  })

  it('names the open run form and who presses Run', () => {
    const prompt = systemPrompt({
      route: '/app/compute/new',
      runForm: {
        name: 'align-and-count',
        executor: 'the python-uv runtime',
        inputs: 3,
        outputs: 1,
        problems: 2,
      },
    })

    expect(prompt).toContain(
      'A run form is open: "align-and-count" on the python-uv runtime, 3 inputs and 1 output.',
    )
    expect(prompt).toContain('It still needs 2 things.')
    expect(prompt).toContain('the user presses Run, you never do')
  })

  it('leaves the run form out when no run page is open', () => {
    expect(systemPrompt({ route: '/app/compute' })).not.toContain('A run form is open')
  })

  it('leaves the page out when the view registered none', () => {
    const prompt = systemPrompt({ route: '/app/assistant' })

    expect(prompt).not.toContain('The user is looking at')
    expect(prompt).toContain('The user is on the route /app/assistant.')
  })

  it('names a page without details or a title', () => {
    const prompt = systemPrompt({ route: '/app/groups', page: { kind: 'groups page', title: '', details: {} } })

    expect(prompt).toContain('The user is looking at the groups page.')
  })

  it('gives the user and active group ids so they are not re-queried', () => {
    const prompt = systemPrompt({
      route: '/app/buckets',
      identity: { userId: 'u-1@realm', realmId: 'r-1', groupId: 'g-1', groupName: 'Marine Genomics Lab' },
    })

    expect(prompt).toContain(
      'Use these ids directly instead of looking them up: the signed-in user is u-1@realm, '
      + 'the active realm is r-1, the active group is g-1 (Marine Genomics Lab).',
    )
  })

  it('omits the identity line when no user is set', () => {
    const prompt = systemPrompt({ route: '/app/assistant' })

    expect(prompt).not.toContain('Use these ids directly')
  })

  it('asks for clear Markdown and the show_ tools', () => {
    const prompt = systemPrompt({ route: '/app/assistant' })

    expect(prompt).toContain('short Markdown')
    expect(prompt).toContain('never dump raw JSON')
  })

  it('tells the model a denial is final', () => {
    const prompt = systemPrompt({ route: '/app/assistant' })

    expect(prompt).toContain(
      "A denied tool call is the user's decision: do not retry it, say what was denied and ask what should change.",
    )
  })

  it('tells the model how to build a dataset from a bucket', () => {
    const prompt = systemPrompt({ route: '/app/assistant' })

    expect(prompt).toContain(
      'To build a dataset from a bucket, inventory it first: list_objects with the prefix, '
      + 'following next_cursor until it is absent.',
    )
    expect(prompt).toContain(
      'Derive what the data supports: read README, LICENSE, CITATION.cff and similar text objects, '
      + 'and use the file names; say where each suggestion came from.',
    )
    expect(prompt).toContain(
      'Ask once, in one compact message, for what the data cannot answer: name, description, '
      + 'creator or author, license, datePublished, keywords, and the profile.',
    )
    expect(prompt).toContain('Offer a suggested value beside each field so the user can accept or edit it.')
    expect(prompt).toContain(
      'Never invent a person, an organization, an identifier, a license or a date; ask instead, once.',
    )
    expect(prompt).toContain(
      'A field the user declines stays absent; optional fields are never a reason to ask again.',
    )
    expect(prompt).toContain('Show the planned crate with show_crate and validate it before anything is created.')
    expect(prompt).toContain(
      'Call create_dataset only after the user confirms; in the dataset editor use the editor tools '
      + 'and let the user save.',
    )
  })

  it('tells the model to read real data and never invent one', () => {
    const prompt = systemPrompt({ route: '/app/assistant' })

    expect(prompt).toContain(
      'Read the real data before answering: list_objects, stat_object, read_object and get_dataset hold the details.',
    )
    expect(prompt).toContain(
      'Never invent an id, key, job id, version, size or result; say plainly when a tool did not return one.',
    )
    expect(prompt).toContain('Check every tool result: stop on an error, report it, and never retry a denial.')
    expect(prompt).toContain('aggregate_objects for counts and bytes over time under a prefix')
  })

  it('tells the model how to run a script and wait for it', () => {
    const prompt = systemPrompt({ route: '/app/assistant' })

    expect(prompt).toContain('Start a job only when code, a library or data too large to read is needed')
    expect(prompt).toContain('list_runtimes')
    expect(prompt).toContain('"container_path": "/work/chart.png"')
    expect(prompt).toContain('A submission is not a result: poll get_job until succeeded, failed or cancelled.')
    expect(prompt).toContain('indeterminate proves nothing')
    expect(prompt).toContain("A failed job's error and log tails are the evidence")
    expect(prompt).toContain('A script has no network unless dependencies are declared')
  })

  it('tells the model to answer job questions with the job card', () => {
    const prompt = systemPrompt({ route: '/app/assistant' })

    expect(prompt).toContain(
      'Answer every job submission and every job status with show_job, passing the job id and the fields '
      + 'get_job returned; never write a job state out as text or JSON.',
    )
    expect(prompt).toContain('a job with show_job')
    expect(prompt).toContain('A card carries the facts, so keep the words beside it short.')
  })

  it('names the tree, timeline, code and diff cards', () => {
    const prompt = systemPrompt({ route: '/app/assistant' })

    expect(prompt).toContain('Show a bucket or folder listing with show_tree')
    expect(prompt).toContain('show_timeline')
    expect(prompt).toContain('show_code')
    expect(prompt).toContain('show_diff')
  })

  it('tells the model to keep quotas and sizes round', () => {
    const prompt = systemPrompt({ route: '/app/assistant' })

    expect(prompt).toContain(
      'Set a quota or a resource limit to a round whole number in the unit a person uses (2 GiB, 8 GiB, 500 GB) '
      + 'and convert that to its exact byte value; never set an odd derived byte count.',
    )
    expect(prompt).toContain(
      'Report a quota or a size as a rounded value with at most one decimal place and a unit, '
      + 'never a long decimal expansion.',
    )
  })

  it('tells the model to show what a job produced', () => {
    const prompt = systemPrompt({ route: '/app/assistant' })

    expect(prompt).toContain('After a job succeeds, call list_job_outputs and show what it produced.')
    expect(prompt).toContain('Show an image, a PDF or any other file with show_artifact')
    expect(prompt).toContain('never paste file bytes into an answer')
    expect(prompt).toContain(
      'Name a stored result by its bucket and key, as bucket/results/report.json or '
      + 's3://bucket/results/report.json, so the portal can link it; a file name on its own only links once the '
      + 'bucket is clear from the message.',
    )
  })

  it('states the realm totals when they are known', () => {
    const prompt = systemPrompt({
      route: '/app',
      realm: { datasets: 12, profiles: 3, groups: 5, nodesOnline: '2 / 4', objects: 40, buckets: 6 },
    })

    expect(prompt).toContain(
      'This realm currently holds 12 datasets, 3 profiles, 5 groups, 40 objects, 6 buckets, with 2 / 4 nodes online.',
    )
    expect(prompt).toContain('answer count questions from them directly')
  })

  it('leaves the realm line out when no totals are given', () => {
    const prompt = systemPrompt({ route: '/app' })

    expect(prompt).not.toContain('This realm currently')
    expect(prompt).not.toContain('answer count questions from them directly')
  })
})
