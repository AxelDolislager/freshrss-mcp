import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Helpers to build MCP tool responses with correct literal types.
 *
 * Without these, TypeScript tends to widen e.g. { type: 'text' } to { type: string },
 * which fails strict SDK typings during CI `tsc --noEmit`.
 */

export type ToolContent = CallToolResult['content'][number];

export type TextToolContent = Extract<ToolContent, { type: 'text' }>;
export type ResourceToolContent = Extract<ToolContent, { type: 'resource' }>;

export function textContent(text: string): TextToolContent {
  return { type: 'text', text };
}

export function resourceContent(resource: ResourceToolContent['resource']): ResourceToolContent {
  return { type: 'resource', resource };
}

export function textResult(text: string): CallToolResult {
  return { content: [textContent(text)] };
}

export function resourceResult(resource: ResourceToolContent['resource']): CallToolResult {
  return { content: [resourceContent(resource)] };
}
