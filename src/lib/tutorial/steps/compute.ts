// The compute tutorial, stop by stop. Every stop names a real control by its
// `data-tutorial` id on the route that mounts it; the wizard steps live in the
// query, exactly as the real Custom run wizard keeps them.
import type { TutorialStep } from '../session'

export const TUTORIAL_COMPUTE_ROUTE = '/app/tutorial/compute'
const WIZARD_WORKLOAD = `${TUTORIAL_COMPUTE_ROUTE}?step=1`
const WIZARD_REVIEW = `${TUTORIAL_COMPUTE_ROUTE}?step=2`
export const TUTORIAL_RUN_ROUTE = `${TUTORIAL_COMPUTE_ROUTE}?stage=run`

/** The step that opens the input picker for the reader. */
export const PICKER_STEP_IDS = ['picker', 'mount']

export const computeTutorialSteps: TutorialStep[] = [
  {
    id: 'basics',
    route: TUTORIAL_COMPUTE_ROUTE,
    target: 'run-name',
    title: 'Name the run',
    advanceOn: 'next',
    body: 'A name is how you will recognise this run in the list later. Both fields are optional, and nothing here leaves your browser: this whole tutorial is a practice run.',
  },
  {
    id: 'group',
    route: TUTORIAL_COMPUTE_ROUTE,
    target: 'run-group',
    title: 'Pick the owning group',
    advanceOn: 'action',
    body: 'The group owns the run: it is billed for it, its members can see it, and the run dataset is written under it. Continue when you have one selected.',
  },
  {
    id: 'filesystem',
    route: WIZARD_WORKLOAD,
    target: 'run-filesystem',
    title: 'The container filesystem',
    advanceOn: 'next',
    body: 'This tree is what the run sees. Inputs are staged into it before the container starts, and captures are the paths written inside it that are uploaded afterwards.',
  },
  {
    id: 'add-input',
    route: WIZARD_WORKLOAD,
    target: 'run-add-input',
    title: 'Stage your data',
    advanceOn: 'next',
    body: 'Add input opens the picker over this node\'s buckets. Data is staged next to the compute, so the container reads local files instead of downloading them itself.',
  },
  {
    id: 'picker',
    route: WIZARD_WORKLOAD,
    target: 'input-picker',
    title: 'Files, folders, whole datasets',
    advanceOn: 'next',
    body: 'Tick single files, or a folder to take everything below it. A folder keeps its name inside the container and expands into one input per file when the run is assembled.',
  },
  {
    id: 'mount',
    route: WIZARD_WORKLOAD,
    target: 'input-mount',
    title: 'Where it lands',
    advanceOn: 'next',
    body: 'Mount under is the container directory the picks are staged in. Each input records the exact object version it read, so the same run can be repeated against the same bytes.',
  },
  {
    id: 'executor',
    route: WIZARD_WORKLOAD,
    target: 'run-executor',
    title: 'Image and command',
    advanceOn: 'next',
    body: 'The image and its command are the run itself. The command is argv, so the shell never expands anything for you.',
  },
  {
    id: 'resources',
    route: WIZARD_WORKLOAD,
    target: 'run-resources',
    title: 'Resources',
    advanceOn: 'next',
    body: 'Cores, memory and disk are the request the planner places against. Leave a field empty to let the node decide.',
  },
  {
    id: 'workspace',
    route: WIZARD_WORKLOAD,
    target: 'run-workspace',
    title: 'Scratch storage',
    advanceOn: 'next',
    body: 'The workspace is where the run writes while it works. A temporary one is deleted once the run succeeds; keep it when you expect to inspect what was written.',
  },
  {
    id: 'placement',
    route: WIZARD_WORKLOAD,
    target: 'run-placement',
    title: 'Execution options',
    advanceOn: 'action',
    body: 'Input mode decides whether the run reads a snapshot, follows the current version, or pins one exactly. These options travel on the native jobs API. Continue to the review.',
  },
  {
    id: 'review',
    route: WIZARD_REVIEW,
    target: 'run-review',
    title: 'Read the request',
    advanceOn: 'next',
    body: 'The request is shown verbatim: what is sent is what you see. Check the inputs, the captures and the placement before starting it.',
  },
  {
    id: 'submit',
    route: WIZARD_REVIEW,
    target: 'run-submit',
    title: 'Start the run',
    advanceOn: 'action',
    body: 'Run accepts the request and hands back a run id. In this tutorial the run is simulated, so nothing is queued on a node.',
  },
  {
    id: 'states',
    route: TUTORIAL_RUN_ROUTE,
    target: 'run-progress',
    title: 'Follow the states',
    advanceOn: 'next',
    body: 'A run goes Pending, Preparing, Running, Completed. The page polls for you; the simulated run walks the same four states over the next few seconds.',
  },
  {
    id: 'logs',
    route: TUTORIAL_RUN_ROUTE,
    target: 'run-executors',
    title: 'Output of the container',
    advanceOn: 'next',
    body: 'Standard output and standard error are captured for every executor, with its exit code. System logs beneath them are what the node did around the container.',
  },
  {
    id: 'artifacts',
    route: TUTORIAL_RUN_ROUTE,
    target: 'run-artifacts',
    title: 'What the run produced',
    advanceOn: 'next',
    body: 'Captured files are listed with their size and destination. Preview opens an image, a table or a text file right here; anything else is offered as a download.',
  },
  {
    id: 'details',
    route: TUTORIAL_RUN_ROUTE,
    target: 'run-details',
    title: 'The record it leaves',
    advanceOn: 'next',
    body: 'Group, resources, timestamps and tags stay on the run record, and a real run also writes a dataset under runs/ describing what it read and wrote.',
  },
]
