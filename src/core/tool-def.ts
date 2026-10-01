import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';
import type { AppOptions } from './app.js';
import type { BackendPort } from './backend-port.js';

/** The two deployments a catalog tool can ship in. */
export type Binding = 'stdio' | 'remote';

/**
 * The behaviour hints a tool authors. The display name is NOT here: it is
 * authored once as `ToolDef.title` and copied into the emitted annotations by
 * buildTools(), so the two can never disagree.
 */
export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint?: boolean;
  openWorldHint: boolean;
}

/**
 * What buildTools() emits: the authored hints plus the display name. Clients
 * are told to prefer the top-level `title`, then `annotations.title`, then
 * `name` — so the title is carried in both fields for clients (and directory
 * validators) that only read the annotation.
 */
export type ResolvedToolAnnotations = ToolAnnotations & { title: string };

/** An icon listed on a tool in tools/list. */
export interface ToolIcon {
  src: string;
  mimeType?: string;
  sizes?: string[];
}

/**
 * One tool as authored in the catalog. `description`/`inputSchema` may be a
 * function of the binding for the few spots where the surfaces genuinely
 * differ: upload-tool references (stdio uploads local files, the remote
 * uploads conversation media/URLs), and the remote binding's rule that every
 * post and comment reply waits for the user's yes. Everything else is
 * binding-invariant.
 */
export interface ToolDef {
  name: string;
  /** Which binding(s) expose the tool. */
  binding: Binding | 'both';
  title: string;
  description: string | ((binding: Binding) => string);
  inputSchema: ZodRawShape | ((binding: Binding) => ZodRawShape);
  annotations: ToolAnnotations;
  /** Replaces `annotations` on the remote binding. */
  remoteAnnotations?: ToolAnnotations;
  /** Extra tool metadata, e.g. the ChatGPT file-param marker on upload_media. */
  _meta?: Record<string, unknown>;
  /** False only for tools that are not scoped to a workspace (list_workspaces). */
  workspaceScoped?: boolean;
  /** The tool signs confirm tokens, so it exists only with BuildToolsOptions.confirmGate. */
  needsConfirmSecret?: boolean;
  /** The tool exists only when the host turns the app on (BuildToolsOptions.app). */
  appOnly?: boolean;
  /** Icons for tools/list. Only app tools carry them. */
  icons?: ToolIcon[];
  /** Turns run()'s data into the call result; toolResult() when absent. */
  toResult?: (data: unknown) => CallToolResult;
  /**
   * The BackendPort method this tool's run() dispatches to. When set and the
   * port instance lacks the method (an older adapter running a newer catalog),
   * the tool is skipped at registration with a stderr log instead of shipping
   * a broken tool — lets bindings adopt new tool waves on their own schedule.
   */
  portMethod?: keyof BackendPort;
  /**
   * Dispatch to the backend. `args` are the validated tool arguments minus
   * `workspaceId`, which is split off by the registrar and passed separately
   * (always undefined on stdio — the pf-api-key is already workspace-scoped).
   * `ctx.confirmSecret` is set by buildTools() when the host passes
   * confirmGate, `ctx.app` when the app is on.
   */
  run: (
    port: BackendPort,
    args: Record<string, unknown>,
    workspaceId?: string,
    ctx?: { confirmSecret?: string; app?: AppOptions },
  ) => Promise<unknown>;
}

/** A ToolDef with binding-dependent fields resolved for one concrete binding. */
export interface ResolvedTool {
  name: string;
  title: string;
  description: string;
  inputSchema: ZodRawShape;
  annotations: ResolvedToolAnnotations;
  _meta?: Record<string, unknown>;
  icons?: ToolIcon[];
  portMethod?: keyof BackendPort;
  run: ToolDef['run'];
  toResult?: ToolDef['toResult'];
}
