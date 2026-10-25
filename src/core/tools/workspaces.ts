import type { ToolDef } from '../tool-def.js';

export const workspaceTools: ToolDef[] = [
  {
    name: 'list_workspaces',
    binding: 'remote',
    title: 'List Workspaces',
    description:
      'List the workspaces this connection can act in. Use a workspace id as the optional workspaceId argument on other tools to operate across multiple workspaces (the default workspace is used when omitted).',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    // Any token of the connection may list its workspaces.
    scopes: [],
    workspaceScoped: false,
    run: (port) => port.listWorkspaces(),
  },
];
