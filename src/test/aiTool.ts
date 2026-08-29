// Runs one AI SDK tool the way the loop would, without a model in the way.
import type { Tool } from 'ai'

export async function runTool(
  tool: Tool,
  input: Record<string, unknown>,
  toolCallId = 'call-1',
): Promise<unknown> {
  const execute = tool.execute
  if (!execute) throw new Error('tool has no execute')
  return execute(input, { toolCallId, messages: [], context: undefined })
}
