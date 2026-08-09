#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerCatalogTools } from '../core/build-tools.js';
import { instructionsFor } from '../core/instructions.js';
import { RestAdapter } from './rest-adapter.js';

const server = new McpServer(
  {
    name: 'postfast',
    version: '0.4.2',
  },
  { instructions: instructionsFor('stdio') },
);

const port = new RestAdapter();

registerCatalogTools(server, { binding: 'stdio', port });

const transport = new StdioServerTransport();
await server.connect(transport);
