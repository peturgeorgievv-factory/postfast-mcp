import { accountTools } from './accounts.js';
import { inboxTools } from './inbox.js';
import { postTools } from './posts.js';
import { tiktokTools } from './tiktok.js';
import { uploadTools } from './uploads.js';
import { workspaceTools } from './workspaces.js';
import type { ToolDef } from '../tool-def.js';

/**
 * Every PostFast tool, in registration order. The order filtered to a binding
 * must stay a superset-append of the published order — clients and their
 * prompts see it, so existing tools keep their positions and new waves go
 * at the end.
 */
export const ALL_TOOLS: ToolDef[] = [
  ...postTools,
  ...accountTools,
  ...workspaceTools,
  ...uploadTools,
  ...inboxTools,
  ...tiktokTools,
];
