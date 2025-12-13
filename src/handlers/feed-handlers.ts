import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FreshRSSClient } from '../api/index.js';
import {
  subscribeSchema,
  unsubscribeSchema,
  editFeedSchema,
  exportOpmlSchema,
  importOpmlSchema,
  quickaddSchema,
} from '../tools/feed-tools.js';
import { textResult } from '../utils/mcp-results.js';
import { wrapTool } from '../utils/tool-errors.js';

/**
 * Register feed-related tools
 */
export function registerFeedTools(server: McpServer, client: FreshRSSClient): void {
  server.registerTool(
    'list_feeds',
    {
      description: 'List all subscribed RSS feeds',
      inputSchema: z.object({}).strict(),
    },
    wrapTool('list_feeds', async () => {
      const feeds = await client.feeds.list();

      if (feeds.length === 0) {
        return textResult('No feeds subscribed.');
      }

      const formatted = feeds
        .map((f) => {
          const category = f.categoryName !== '' ? ` [${f.categoryName}]` : '';
          return `- ${f.title}${category}\n  URL: ${f.url}\n  ID: ${f.id}`;
        })
        .join('\n\n');

      return textResult(formatted);
    })
  );

  server.registerTool(
    'subscribe',
    {
      description: 'Subscribe to a new RSS feed',
      inputSchema: subscribeSchema,
    },
    wrapTool('subscribe', async (args: z.infer<typeof subscribeSchema>) => {
      await client.feeds.subscribe(args.url, args.title, args.category);
      return textResult(`Successfully subscribed to ${args.url}`);
    })
  );

  server.registerTool(
    'unsubscribe',
    {
      description: 'Unsubscribe from an RSS feed',
      inputSchema: unsubscribeSchema,
    },
    wrapTool('unsubscribe', async (args: z.infer<typeof unsubscribeSchema>) => {
      await client.feeds.unsubscribe(args.feedId);
      return textResult(`Successfully unsubscribed from feed ${args.feedId}`);
    })
  );

  server.registerTool(
    'edit_feed',
    {
      description: 'Edit a feed subscription (rename or move to different category)',
      inputSchema: editFeedSchema,
    },
    wrapTool('edit_feed', async (args: z.infer<typeof editFeedSchema>) => {
      await client.feeds.edit(args.feedId, args.title, args.category);
      return textResult(`Successfully updated feed ${args.feedId}`);
    })
  );

  server.registerTool(
    'export_opml',
    {
      description: 'Export all subscriptions as OPML',
      inputSchema: exportOpmlSchema,
    },
    wrapTool('export_opml', async () => {
      const opml = await client.feeds.exportOpml();
      return textResult(opml);
    })
  );

  server.registerTool(
    'import_opml',
    {
      description: 'Import subscriptions from OPML',
      inputSchema: importOpmlSchema,
    },
    wrapTool('import_opml', async (args: z.infer<typeof importOpmlSchema>) => {
      await client.feeds.importOpml(args.opml);
      return textResult('Imported OPML subscriptions.');
    })
  );

  server.registerTool(
    'quickadd_feed',
    {
      description: 'Quick-add a feed URL; FreshRSS will detect the actual feed.',
      inputSchema: quickaddSchema,
    },
    wrapTool('quickadd_feed', async (args: z.infer<typeof quickaddSchema>) => {
      await client.feeds.quickadd(args.url);
      return textResult(`Quick-added feed from ${args.url}`);
    })
  );
}
