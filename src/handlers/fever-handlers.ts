import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FreshRSSClient } from '../api/index.js';
import { getFaviconSchema, listFaviconsSchema, listIdsSchema } from '../tools/fever-tools.js';
import { resourceResult, textResult } from '../utils/mcp-results.js';
import { wrapTool } from '../utils/tool-errors.js';

function parseDataUri(dataUri: string): { mimeType: string; base64: string } | null {
  const regex = /^([^;]+);base64,(.+)$/;
  const match = regex.exec(dataUri);
  if (match === null) return null;
  return { mimeType: match[1], base64: match[2] };
}

export function registerFeverTools(server: McpServer, client: FreshRSSClient): void {
  server.registerTool(
    'list_favicons',
    {
      description: 'List favicons for subscribed feeds (Fever API)',
      inputSchema: listFaviconsSchema,
    },
    wrapTool('list_favicons', async () => {
      const favicons = await client.fever.listFavicons();
      if (favicons.length === 0) {
        return textResult('No favicons found.');
      }
      const text = favicons
        .map((f) => `- Feed ${f.feedId.toString()}: favicon available`)
        .join('\n');
      return textResult(text);
    })
  );

  server.registerTool(
    'get_feed_favicon',
    {
      description: 'Get a feed favicon as an MCP resource (Fever API)',
      inputSchema: getFaviconSchema,
    },
    wrapTool('get_feed_favicon', async (args: z.infer<typeof getFaviconSchema>) => {
      const favicons = await client.fever.listFavicons();
      const feedIdNum = Number(args.feedId);
      const found = favicons.find((f) => f.feedId === feedIdNum);
      if (found === undefined) {
        return textResult(`No favicon for feed ${args.feedId}.`);
      }
      const parsed = parseDataUri(found.dataUri);
      if (parsed === null) {
        return textResult('Invalid favicon data.');
      }
      return resourceResult({
        uri: `freshrss://favicon/${args.feedId}`,
        blob: parsed.base64,
        mimeType: parsed.mimeType,
      });
    })
  );

  server.registerTool(
    'list_unread_article_ids',
    {
      description: 'List unread article IDs (Fever API)',
      inputSchema: listIdsSchema,
    },
    wrapTool('list_unread_article_ids', async () => {
      const ids = await client.fever.listUnreadIds();
      return textResult(ids.length === 0 ? 'No unread IDs.' : ids.join(','));
    })
  );

  server.registerTool(
    'list_starred_article_ids',
    {
      description: 'List starred/saved article IDs (Fever API)',
      inputSchema: listIdsSchema,
    },
    wrapTool('list_starred_article_ids', async () => {
      const ids = await client.fever.listSavedIds();
      return textResult(ids.length === 0 ? 'No starred IDs.' : ids.join(','));
    })
  );
}
