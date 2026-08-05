import { accountTools } from './accounts.js';
import { postTools } from './posts.js';
import { uploadTools } from './uploads.js';
import { workspaceTools } from './workspaces.js';
import type { ToolDef } from '../tool-def.js';

/**
 * Every PostFast tool, in registration order. The order filtered to the stdio
 * binding must stay exactly the published bin's tools/list order — clients and
 * their prompts see it.
 */
export const ALL_TOOLS: ToolDef[] = [
  ...postTools,
  ...accountTools,
  ...workspaceTools,
  ...uploadTools,
];
