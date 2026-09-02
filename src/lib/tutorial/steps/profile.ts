// The profile tutorial, stop by stop: the real profile builder, then the real
// dataset editor validating against what the builder just wrote. The builder's
// step lives in the query, exactly as ProfileNewView keeps it.
import type { TutorialStep } from '../session'

export const TUTORIAL_PROFILE_ROUTE = '/app/tutorial/profile'
const BUILDER_RULES = `${TUTORIAL_PROFILE_ROUTE}?step=2`
const BUILDER_REVIEW = `${TUTORIAL_PROFILE_ROUTE}?step=3`
export const TUTORIAL_EDITOR_ROUTE = `${TUTORIAL_PROFILE_ROUTE}?stage=editor`
export const TUTORIAL_SAVED_ROUTE = `${TUTORIAL_PROFILE_ROUTE}?stage=saved`

export const profileTutorialSteps: TutorialStep[] = [
  {
    id: 'basics',
    route: TUTORIAL_PROFILE_ROUTE,
    target: 'profile-basics',
    title: 'Name the profile',
    advanceOn: 'action',
    body: 'A profile is a dataset of its own, stored under profiles/ and owned by a group. The slug becomes its address, so it is fixed once the profile exists. Nothing here leaves your browser: this whole tutorial is a practice run. Continue when you have read it.',
  },
  {
    id: 'shape',
    route: BUILDER_RULES,
    target: 'profile-shape',
    title: 'The root dataset shape',
    advanceOn: 'next',
    body: 'Every RO-Crate has exactly one root, and this shape holds the rules for it. The four rules it starts with are the ones the RO-Crate specification asks of every dataset.',
  },
  {
    id: 'obligation',
    route: BUILDER_RULES,
    target: 'profile-obligation',
    title: 'How strictly a rule applies',
    advanceOn: 'next',
    body: 'Required fails validation when the value is missing, Recommended only warns, and Optional is offered without ever complaining. This is the single choice that decides what a write is refused for.',
  },
  {
    id: 'property',
    route: BUILDER_RULES,
    target: 'profile-add-property',
    title: 'Add what your data needs',
    advanceOn: 'next',
    body: 'A rule names a property term, the kind of value it takes, and how many entries are allowed. Picking a schema.org term keeps the profile readable to tools that never saw it.',
  },
  {
    id: 'reference',
    route: BUILDER_RULES,
    target: 'profile-reference',
    title: 'Rules that point at other things',
    advanceOn: 'action',
    body: 'The Creator rule asks for a Person, so the Person shape below holds the rules every Person in a dataset is checked against. One shape, reused by every rule that points at that type. Continue to the review.',
  },
  {
    id: 'review',
    route: BUILDER_REVIEW,
    target: 'profile-review',
    title: 'What the profile will ask for',
    advanceOn: 'next',
    body: 'The review states whether the profile can be created and what is still missing. The generated files are here too: the SHACL shapes are the ones the node validates against, and they have the final word.',
  },
  {
    id: 'visibility',
    route: BUILDER_REVIEW,
    target: 'profile-visibility',
    title: 'Who may use it',
    advanceOn: 'next',
    body: 'A public profile is registered under a permanent address and any dataset in the realm may declare it. This practice profile stays with its group, which is what a profile still being worked on should do.',
  },
  {
    id: 'create',
    route: BUILDER_REVIEW,
    target: 'profile-create',
    title: 'Create the profile',
    advanceOn: 'action',
    body: 'Create stores the profile and its generated files. In this tutorial the profile is simulated, so nothing is written to a node; the next stop uses it on a dataset all the same.',
  },
  {
    id: 'pick',
    route: TUTORIAL_EDITOR_ROUTE,
    target: 'dataset-profile',
    title: 'Apply it to a dataset',
    advanceOn: 'next',
    body: 'This is the dataset editor on a new dataset. The picker lists the public profiles and the profiles of this dataset\'s group, so the one you just created is in it.',
  },
  {
    id: 'requirements',
    route: TUTORIAL_EDITOR_ROUTE,
    target: 'dataset-issues',
    title: 'What the profile expects',
    advanceOn: 'next',
    body: 'Choosing it added an empty row for every property it requires, and a Person for the Creator rule. Open this bar to read everything still outstanding, each with a jump to the field it belongs to.',
  },
  {
    id: 'fill',
    route: TUTORIAL_EDITOR_ROUTE,
    target: 'dataset-name',
    title: 'Fill the first value',
    advanceOn: 'next',
    body: 'Give the dataset a name. The name is also what the storage path is derived from, so the location in the header follows along as you type.',
  },
  {
    id: 'describe',
    route: TUTORIAL_EDITOR_ROUTE,
    target: 'dataset-description',
    title: 'Say what it contains',
    advanceOn: 'next',
    body: 'Describe the dataset. Once the editor\'s own checks are answered the draft is worth sending to the node, and the check below starts running on every edit.',
  },
  {
    id: 'rejected',
    route: TUTORIAL_EDITOR_ROUTE,
    target: 'dataset-check',
    title: 'The node would refuse this',
    advanceOn: 'next',
    body: 'The check runs the draft exactly as a save would, without saving. While a required property is empty it comes back refused, and every missing one is named with the entity it belongs to.',
  },
  {
    id: 'fix',
    route: TUTORIAL_EDITOR_ROUTE,
    target: 'dataset-issues',
    title: 'Correct the draft',
    advanceOn: 'next',
    body: 'What is left is the license and a name for the Person the Creator rule added. Open a line here to jump straight to the field it belongs to; every edit re-runs the check.',
  },
  {
    id: 'accepted',
    route: TUTORIAL_EDITOR_ROUTE,
    target: 'dataset-check',
    title: 'Accepted',
    advanceOn: 'next',
    body: 'With every required value answered the verdict flips, and the panel names the profile the draft was found valid against. Only a refusal blocks the save; advisory findings never do.',
  },
  {
    id: 'save',
    route: TUTORIAL_EDITOR_ROUTE,
    target: 'dataset-save',
    title: 'Save the dataset',
    advanceOn: 'action',
    body: 'Saving validates once more and only then writes. In this tutorial the write is simulated, so no dataset is created.',
  },
  {
    id: 'done',
    route: TUTORIAL_SAVED_ROUTE,
    target: 'tutorial-done',
    title: 'That is the whole loop',
    advanceOn: 'next',
    body: 'A profile describes what a kind of dataset must carry, a dataset declares it, and the node enforces it on every tagged write. Finish to return to your profiles.',
  },
]
