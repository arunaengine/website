// The node's MCP tools, mapped to AI SDK tools. Nothing about the tool surface
// is duplicated here: names, descriptions and schemas all come from the server.
import { dynamicTool, jsonSchema, type JSONSchema7, type ToolSet } from 'ai'
import { denied, type ApprovalGate } from './types'

export interface McpToolAnnotations {
  title?: string
  readOnlyHint?: boolean
  destructiveHint?: boolean
}

export interface McpToolDescriptor {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  annotations?: McpToolAnnotations
}

/** The transport the tools run over; the real one wraps the MCP SDK client. */
export interface McpToolSource {
  listTools(): Promise<McpToolDescriptor[]>
  callTool(name: string, input: Record<string, unknown>): Promise<unknown>
}

const EMPTY_SCHEMA: JSONSchema7 = { type: 'object', properties: {} }

/** A tool the server did not mark read-only is treated as a write. */
export function isWriteTool(descriptor: McpToolDescriptor): boolean {
  return descriptor.annotations?.readOnlyHint !== true
}

function schemaOf(descriptor: McpToolDescriptor): JSONSchema7 {
  const schema = descriptor.inputSchema
  return schema && typeof schema === 'object' ? (schema as JSONSchema7) : EMPTY_SCHEMA
}

/**
 * Builds the AI SDK tool set for one MCP server. Write tools go through the
 * approval gate while the toggle is on; a denial answers the model with the
 * denial result instead of running anything.
 */
export function nodeTools(
  descriptors: McpToolDescriptor[],
  source: McpToolSource,
  gate: ApprovalGate,
): ToolSet {
  const tools: ToolSet = {}
  for (const descriptor of descriptors) {
    const write = isWriteTool(descriptor)
    tools[descriptor.name] = dynamicTool({
      description: descriptor.description ?? descriptor.annotations?.title ?? descriptor.name,
      inputSchema: jsonSchema(schemaOf(descriptor)),
      async execute(input, { toolCallId }) {
        const args = (input ?? {}) as Record<string, unknown>
        if (write && gate.enabled()) {
          const approved = await gate.ask({ id: toolCallId, name: descriptor.name, input: args }, false)
          if (!approved) return denied()
        }
        return source.callTool(descriptor.name, args)
      },
    })
  }
  return tools
}

/** One tool set for the model: node tools first, editor tools override by name. */
export function mergeTools(...sets: ToolSet[]): ToolSet {
  return Object.assign({}, ...sets) as ToolSet
}
