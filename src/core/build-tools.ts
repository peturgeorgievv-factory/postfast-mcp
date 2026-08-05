import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { BackendPort } from './backend-port.js';
import { workspaceIdField } from './shared.js';
import type { Binding, ResolvedTool, ToolDef } from './tool-def.js';
import { ALL_TOOLS } from './tools/index.js';

export interface BuildToolsOptions {
  binding: Binding;
  /**
   * Inject an optional `workspaceId` field into every workspace-scoped tool
   * (the remote host's multi-workspace connections). The stdio bin never sets
   * this — its pf-api-key is already workspace-scoped.
   */
  withWorkspaceField?: boolean;
}

/** Resolve the catalog for one binding: filter, flatten binding-variant fields. */
export function buildTools(options: BuildToolsOptions): ResolvedTool[] {
  const { binding, withWorkspaceField = false } = options;

  return ALL_TOOLS.filter(
    (def) => def.binding === 'both' || def.binding === binding,
  ).map((def) => {
    const inputSchema =
      typeof def.inputSchema === 'function' ? def.inputSchema(binding) : def.inputSchema;

    return {
      name: def.name,
      title: def.title,
      description:
        typeof def.description === 'function' ? def.description(binding) : def.description,
      inputSchema:
        withWorkspaceField && def.workspaceScoped !== false
          ? { ...inputSchema, workspaceId: workspaceIdField }
          : inputSchema,
      outputSchema: def.outputSchema,
      annotations: def.annotations,
      _meta: def._meta,
      run: def.run,
    };
  });
}

/**
 * Wrap backend data as MCP content: a JSON text block (proven across all
 * clients — and byte-stable for existing stdio consumers) plus
 * structuredContent for clients that consume outputSchema. Bare-array
 * responses are wrapped as { data } there, since structuredContent must be an
 * object; the text block stays the raw response.
 */
export function toolResult(data: unknown): CallToolResult {
  const result: CallToolResult = {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
  if (data && typeof data === 'object') {
    result.structuredContent = Array.isArray(data)
      ? { data }
      : (data as Record<string, unknown>);
  }
  return result;
}

/** A business/tool error the model should see and react to (not a protocol error). */
export function toolError(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

/** Run a handler, converting thrown errors into `isError` tool results. */
export async function runTool(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return toolResult(await fn());
  } catch (err) {
    return toolError((err as Error).message || 'Tool execution failed.');
  }
}

export interface RegisterToolsOptions extends BuildToolsOptions {
  port: BackendPort;
}

/** Register the resolved catalog for a binding on an MCP server. */
export function registerCatalogTools(
  server: McpServer,
  options: RegisterToolsOptions,
): void {
  const { port } = options;

  for (const tool of buildTools(options)) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
        annotations: tool.annotations,
        ...(tool._meta ? { _meta: tool._meta } : {}),
      },
      (args: Record<string, unknown>) =>
        runTool(() => {
          const { workspaceId, ...rest } = args ?? {};
          return tool.run(port, rest, workspaceId as string | undefined);
        }),
    );
  }
}
