export function createProjectTestData() {
  const uniqueId = Date.now().toString()

  return {
    name: `pw-e2e-${uniqueId}`,
    title: `Playwright Project ${uniqueId}`,
    description: `Created by the Playwright resource creation flow ${uniqueId}.`,
  }
}
