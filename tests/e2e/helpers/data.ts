import { randomUUID } from 'node:crypto'

export function createProjectTestData() {
  const uniqueId = `${Date.now().toString(36)}-${randomUUID().split('-')[0]}`

  return {
    name: `pw-e2e-${uniqueId}`,
    title: `Playwright Project ${uniqueId}`,
    description: `Created by the Playwright resource creation flow ${uniqueId}.`,
  }
}

export function createTokenTestData() {
  const uniqueId = `${Date.now().toString(36)}-${randomUUID().split('-')[0]}`

  return {
    name: `pw-token-${uniqueId}`,
  }
}
