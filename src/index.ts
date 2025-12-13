#!/usr/bin/env node
import 'dotenv/config';
import { createRequire } from 'module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FreshRSSClient } from './api/index.js';
import {
  registerArticleTools,
  registerFeedTools,
  registerTagTools,
  registerStatsTools,
  registerFeverTools,
} from './handlers/index.js';
import { getConfigFromEnv } from './utils/config.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

/**
 * Create and configure the MCP server
 */
function createServer(): McpServer {
  const server = new McpServer({
    name: 'freshrss-mcp',
    version,
  });

  return server;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const config = getConfigFromEnv();
  const client = new FreshRSSClient(config);

  // Authenticate on startup. If this fails (e.g., transient network issue),
  // keep the server up so tools can retry on first use.
  try {
    await client.authenticate();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      `Warning: initial FreshRSS authentication failed (${msg}). Tools will attempt to re-authenticate on demand.`
    );
  }

  const server = createServer();

  // Register all tools
  registerArticleTools(server, client);
  registerFeedTools(server, client);
  registerTagTools(server, client);
  registerStatsTools(server, client);
  registerFeverTools(server, client);

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
