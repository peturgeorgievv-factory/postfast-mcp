import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  APP_RESOURCE_URI,
  assertAppOptions,
  listToolIcons,
  registerAppResource,
  type AppOptions,
} from './app.js';
import type { BackendPort } from './backend-port.js';
import { workspaceIdField } from './shared.js';
import type { Binding, ResolvedTool, ToolDef, ToolIcon } from './tool-def.js';
import { ALL_TOOLS } from './tools/index.js';

export interface ConfirmGateOptions {
  /** HMAC key for confirm tokens; at least 32 characters. */
  secret: string;
}

export interface BuildToolsOptions {
  binding: Binding;
  /**
   * Inject an optional `workspaceId` field into every workspace-scoped tool
   * (the remote host's multi-workspace connections). The stdio bin never sets
   * this — its pf-api-key is already workspace-scoped.
   */
  withWorkspaceField?: boolean;
  /**
   * When given, tools whose `portMethod` the port instance does not implement
   * are skipped with a stderr log — so an adapter built against an older
   * catalog keeps working when a newer catalog adds tools it can't serve yet.
   */
  port?: BackendPort;
  /**
   * Remote only. The key that signs prepare_inbox_action / confirm_inbox_action
   * tokens for comment replies, private replies and deletions. The remote
   * catalogue holds every post and reply for the user's yes either way;
   * without a key those two tools are left out (logged once), so comment
   * replies and deletions are unavailable.
   */
  confirmGate?: ConfirmGateOptions;
  /**
   * Remote only. Adds the calendar app: two view-opening entrypoint tools and
   * the view's analytics call, all hidden from the model, plus the view as a
   * UI resource (registerCatalogTools). When absent, the output is identical
   * to a catalog without the app.
   */
  app?: AppOptions;
}

let warnedNoConfirmSecret = false;

/** Resolve the catalog for one binding: filter, flatten binding-variant fields. */
export function buildTools(options: BuildToolsOptions): ResolvedTool[] {
  const { binding, withWorkspaceField = false, port, confirmGate, app } = options;
  const remote = binding === 'remote';
  if (remote && confirmGate && !(confirmGate.secret?.length >= 32)) {
    throw new Error('confirmGate.secret must be at least 32 characters.');
  }
  const secret = remote ? confirmGate?.secret : undefined;
  if (remote && !secret && !warnedNoConfirmSecret) {
    warnedNoConfirmSecret = true;
    console.error(
      '[postfast-mcp/core] no confirmGate secret: prepare_inbox_action and confirm_inbox_action are left out, so comment replies and deletions are unavailable',
    );
  }
  const appOn = remote && !!app;
  if (appOn) assertAppOptions(app);

  // Only app tools get the app options; the confirm secret goes to every tool as before.
  const contextFor = (def: ToolDef) => ({
    ...(secret ? { confirmSecret: secret } : {}),
    ...(appOn && def.appOnly ? { app } : {}),
  });

  return ALL_TOOLS.filter((def) => {
    if (def.binding !== 'both' && def.binding !== binding) return false;
    if (def.needsConfirmSecret && !secret) return false;
    if (def.appOnly && !appOn) return false;
    if (
      port &&
      def.portMethod &&
      typeof (port as unknown as Record<string, unknown>)[def.portMethod] !== 'function'
    ) {
      console.error(
        `[postfast-mcp/core] skipping tool "${def.name}": the backend port does not implement ${def.portMethod}() yet (older adapter, newer catalog)`,
      );
      return false;
    }
    return true;
  }).map((def) => {
    const inputSchema =
      typeof def.inputSchema === 'function' ? def.inputSchema(binding) : def.inputSchema;
    const annotations = remote && def.remoteAnnotations ? def.remoteAnnotations : def.annotations;
    const ctx = contextFor(def);

    return {
      name: def.name,
      title: def.title,
      description:
        typeof def.description === 'function' ? def.description(binding) : def.description,
      inputSchema:
        withWorkspaceField && def.workspaceScoped !== false
          ? { ...inputSchema, workspaceId: workspaceIdField }
          : inputSchema,
      annotations: { title: def.title, ...annotations },
      _meta: def._meta,
      ...(def.icons ? { icons: def.icons } : {}),
      portMethod: def.portMethod,
      // Hand the confirm secret and app options to run(), also for hosts that call tool.run() themselves.
      run: Object.keys(ctx).length
        ? (p, args, workspaceId) => def.run(p, args, workspaceId, ctx)
        : def.run,
      ...(def.toResult ? { toResult: def.toResult } : {}),
    };
  });
}

/**
 * Wrap backend data as MCP content: a JSON text block (proven across all
 * clients — and byte-stable for existing stdio consumers) plus
 * structuredContent for clients that read it. No catalog tool declares an
 * outputSchema: the SDK renders zod shapes as JSON Schema draft-07, and
 * clients whose validators accept only the 2020-12 dialect reject such a tool
 * at list time, before any call. structuredContent without a schema is valid
 * MCP and is never validated or stripped. Bare-array responses are wrapped as
 * { data } there, since structuredContent must be an object; the text block
 * stays the raw response.
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
export async function runTool(
  fn: () => Promise<unknown>,
  toResult: (data: unknown) => CallToolResult = toolResult,
): Promise<CallToolResult> {
  try {
    return toResult(await fn());
  } catch (err) {
    return toolError((err as Error).message || 'Tool execution failed.');
  }
}

export interface RegisterToolsOptions extends BuildToolsOptions {
  port: BackendPort;
}

/**
 * Register the resolved catalog for a binding on an MCP server. With `app`,
 * also registers the view as a UI resource and lists the app tools' icons,
 * but only when a registered tool opens the view (a port without the app
 * methods registers neither).
 */
export function registerCatalogTools(
  server: McpServer,
  options: RegisterToolsOptions,
): void {
  const { port } = options;
  const tools = buildTools(options);

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
        ...(tool._meta ? { _meta: tool._meta } : {}),
      },
      (args: Record<string, unknown>) =>
        runTool(() => {
          const { workspaceId, ...rest } = args ?? {};
          return tool.run(port, rest, workspaceId as string | undefined);
        }, tool.toResult),
    );
  }

  const opensView = (tool: ResolvedTool) =>
    (tool._meta?.ui as { resourceUri?: string } | undefined)?.resourceUri === APP_RESOURCE_URI;
  if (options.app && tools.some(opensView)) {
    registerAppResource(server, options.app);
    const icons = new Map<string, ToolIcon[]>();
    for (const tool of tools) if (tool.icons) icons.set(tool.name, tool.icons);
    listToolIcons(server, icons);
  }
}
