#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PostFastClient } from './client.js';
import { registerPostTools } from './tools/posts.js';
import { registerAccountTools } from './tools/accounts.js';
import { registerFileTools } from './tools/files.js';

const server = new McpServer({
  name: 'postfast',
  version: '0.1.1',
});

const client = new PostFastClient();

registerPostTools(server, client);
registerAccountTools(server, client);
registerFileTools(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
