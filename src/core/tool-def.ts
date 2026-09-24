import type { ZodRawShape } from 'zod';
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

/**
 * One tool as authored in the catalog. `description`/`inputSchema` may be a
 * function of the binding for the few spots where the surfaces genuinely
 * differ (upload-tool references — stdio uploads local files, the remote
 * uploads conversation media/URLs). Everything else is binding-invariant.
 * The functions also receive `gated`: true only on a remote build with the
 * confirm gate on (BuildToolsOptions.confirmGate).
 */
export interface ToolDef {
  name: string;
  /** Which binding(s) expose the tool. */
  binding: Binding | 'both';
  title: string;
  description: string | ((binding: Binding, gated?: boolean) => string);
  inputSchema: ZodRawShape | ((binding: Binding, gated?: boolean) => ZodRawShape);
  annotations: ToolAnnotations;
  /** Replaces `annotations` when the confirm gate is on. */
  gatedAnnotations?: ToolAnnotations;
  /** Extra tool metadata, e.g. the ChatGPT file-param marker on upload_media. */
  _meta?: Record<string, unknown>;
  /** False only for tools that are not scoped to a workspace (list_workspaces). */
  workspaceScoped?: boolean;
  /** The tool exists only when the confirm gate is on. */
  gatedOnly?: boolean;
  /** The tool is dropped when the confirm gate is on. */
  hiddenWhenGated?: boolean;
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
   * `ctx.confirmSecret` is set by buildTools() when the confirm gate is on.
   */
  run: (
    port: BackendPort,
    args: Record<string, unknown>,
    workspaceId?: string,
    ctx?: { confirmSecret?: string },
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
  portMethod?: keyof BackendPort;
  run: ToolDef['run'];
}
