import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  APP_RESOURCE_URI,
  assertAppOptions,
  registerAppResource,
  type AppOptions,
} from './app.js';
import type { BackendPort } from './backend-port.js';
import {
  assertScopeChallengeOptions,
  insufficientScopeResult,
  isInsufficientScopeError,
  type ScopeChallengeOptions,
  type SecurityScheme,
} from './scope-challenge.js';
import { workspaceIdField } from './shared.js';
import type { Binding, ResolvedTool, ToolDef } from './tool-def.js';
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
   * Remote only. The key that signs and checks the confirm tokens of the
   * comment tools: preview_comment_reply → reply_to_comment,
   * preview_private_reply → send_private_reply and preview_comment_deletion →
   * delete_comment. The remote catalogue holds every post and reply for the
   * user's yes either way; without a key those six tools are left out (logged
   * once), so comment replies and deletions are unavailable.
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
      '[postfast-mcp/core] no confirmGate secret: the comment reply, private reply and deletion tools are left out, so comment replies and deletions are unavailable',
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
    // Remote only: the hosted connector is the one clients sign in to with OAuth.
    const securitySchemes: SecurityScheme[] | undefined =
      remote && def.scopes ? [{ type: 'oauth2', scopes: [...def.scopes] }] : undefined;

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
      _meta: securitySchemes ? { ...def._meta, securitySchemes } : def._meta,
      ...(def.icons ? { icons: def.icons } : {}),
      ...(securitySchemes ? { securitySchemes } : {}),
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

/**
 * Run a handler, converting thrown errors into `isError` tool results.
 * `onError` may answer an error with a result of its own; when it returns
 * nothing, the error's message is the result.
 */
export async function runTool(
  fn: () => Promise<unknown>,
  toResult: (data: unknown) => CallToolResult = toolResult,
  onError?: (err: unknown) => CallToolResult | undefined,
): Promise<CallToolResult> {
  try {
    return toResult(await fn());
  } catch (err) {
    return onError?.(err) ?? toolError((err as Error).message || 'Tool execution failed.');
  }
}

export interface RegisterToolsOptions extends BuildToolsOptions {
  port: BackendPort;
  /**
   * Remote only. When a tool's port call throws InsufficientScopeError (the
   * backend refused the token's scopes), the result becomes an OAuth
   * insufficient_scope challenge naming this metadata URL and the tool's
   * scopes, so a client can ask the user for them and retry. Without it the
   * error stays an ordinary tool error.
   */
  scopeChallenge?: ScopeChallengeOptions;
}

/**
 * The challenge for a tool whose call the backend refused for scope, or
 * undefined when one cannot help: the tool needs no scope, or the token
 * already has every scope the tool declares (asking again would loop).
 */
function scopeChallengeFor(
  tool: ResolvedTool,
  options: ScopeChallengeOptions,
  authInfo: AuthInfo | undefined,
): CallToolResult | undefined {
  const scopes = tool.securitySchemes?.flatMap((scheme) => scheme.scopes) ?? [];
  const granted = Array.isArray(authInfo?.scopes) ? authInfo.scopes : undefined;
  if (!scopes.length || (granted && scopes.every((scope) => granted.includes(scope)))) {
    return undefined;
  }
  return insufficientScopeResult({ ...options, scopes, grantedScopes: granted });
}

type RequestHandler = (request: unknown, extra: unknown) => Promise<unknown>;

/**
 * Adds fields McpServer has no option for (`securitySchemes`, `icons`) to the
 * named tools in tools/list, by wrapping its tools/list handler; every other
 * field stays the SDK's own output. If the SDK keeps its handlers elsewhere,
 * nothing is added and a log line says so: `securitySchemes` still reach
 * clients in each tool's `_meta`, and the host falls back to the app's logo.
 */
function listToolFields(server: McpServer, fields: Map<string, Record<string, unknown>>): void {
  const handlers = (server.server as unknown as { _requestHandlers?: unknown })._requestHandlers;
  const list =
    handlers instanceof Map ? (handlers.get('tools/list') as RequestHandler | undefined) : undefined;
  if (!list) {
    console.error(
      '[postfast-mcp/core] securitySchemes and icons not listed at the top level: no tools/list handler to wrap',
    );
    return;
  }
  (handlers as Map<string, RequestHandler>).set('tools/list', async (request, extra) => {
    const result = (await list(request, extra)) as { tools?: Record<string, unknown>[] };
    for (const tool of result.tools ?? []) {
      Object.assign(tool, fields.get(tool.name as string));
    }
    return result;
  });
}

/**
 * Register the resolved catalog for a binding on an MCP server. On the remote
 * binding every tool lists its `securitySchemes`. With `app`, also registers
 * the view as a UI resource and lists the app tools' icons, but only when a
 * registered tool opens the view (a port without the app methods registers
 * neither).
 */
export function registerCatalogTools(
  server: McpServer,
  options: RegisterToolsOptions,
): void {
  const { port } = options;
  const scopeChallenge = options.binding === 'remote' ? options.scopeChallenge : undefined;
  if (scopeChallenge) assertScopeChallengeOptions(scopeChallenge);
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
      (args: Record<string, unknown>, extra?: { authInfo?: AuthInfo }) =>
        runTool(
          () => {
            const { workspaceId, ...rest } = args ?? {};
            return tool.run(port, rest, workspaceId as string | undefined);
          },
          tool.toResult,
          scopeChallenge
            ? (err) =>
                isInsufficientScopeError(err)
                  ? scopeChallengeFor(tool, scopeChallenge, extra?.authInfo)
                  : undefined
            : undefined,
        ),
    );
  }

  const listed = new Map<string, Record<string, unknown>>();
  for (const tool of tools) {
    if (tool.securitySchemes) listed.set(tool.name, { securitySchemes: tool.securitySchemes });
  }
  const opensView = (tool: ResolvedTool) =>
    (tool._meta?.ui as { resourceUri?: string } | undefined)?.resourceUri === APP_RESOURCE_URI;
  if (options.app && tools.some(opensView)) {
    registerAppResource(server, options.app);
    for (const tool of tools) {
      if (tool.icons) listed.set(tool.name, { ...listed.get(tool.name), icons: tool.icons });
    }
  }
  if (listed.size) listToolFields(server, listed);
}
