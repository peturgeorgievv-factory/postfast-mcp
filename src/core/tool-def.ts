import type { ZodRawShape } from 'zod';
import type { BackendPort } from './backend-port.js';

/** The two deployments a catalog tool can ship in. */
export type Binding = 'stdio' | 'remote';

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint?: boolean;
  openWorldHint: boolean;
}

/**
 * One tool as authored in the catalog. `description`/`inputSchema` may be a
 * function of the binding for the few spots where the surfaces genuinely
 * differ (upload-tool references — stdio uploads local files, the remote
 * uploads conversation media/URLs). Everything else is binding-invariant.
 */
export interface ToolDef {
  name: string;
  /** Which binding(s) expose the tool. */
  binding: Binding | 'both';
  title: string;
  description: string | ((binding: Binding) => string);
  inputSchema: ZodRawShape | ((binding: Binding) => ZodRawShape);
  annotations: ToolAnnotations;
  /** Extra tool metadata, e.g. the ChatGPT file-param marker on upload_media. */
  _meta?: Record<string, unknown>;
  /** False only for tools that are not scoped to a workspace (list_workspaces). */
  workspaceScoped?: boolean;
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
   */
  run: (
    port: BackendPort,
    args: Record<string, unknown>,
    workspaceId?: string,
  ) => Promise<unknown>;
}

/** A ToolDef with binding-dependent fields resolved for one concrete binding. */
export interface ResolvedTool {
  name: string;
  title: string;
  description: string;
  inputSchema: ZodRawShape;
  annotations: ToolAnnotations;
  _meta?: Record<string, unknown>;
  portMethod?: keyof BackendPort;
  run: ToolDef['run'];
}
