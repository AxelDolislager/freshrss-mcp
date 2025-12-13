import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FreshRSSClient } from '../api/index.js';
import { textResult } from '../utils/mcp-results.js';
import { wrapTool } from '../utils/tool-errors.js';

/**
 * Register statistics and user info tools
 */
export function registerStatsTools(server: McpServer, client: FreshRSSClient): void {
  server.registerTool(
    'get_stats',
    {
      description: 'Get unread counts and statistics',
      inputSchema: z.object({}).strict(),
    },
    wrapTool('get_stats', async () => {
      const stats = await client.stats.getStatistics();

      const lines = [
        `## FreshRSS Statistics`,
        `**Total Unread:** ${stats.totalUnread.toString()}`,
        '',
        '### Top Feeds by Unread Count',
      ];

      const topFeeds = stats.feeds.sort((a, b) => b.count - a.count).slice(0, 10);

      for (const feed of topFeeds) {
        const feedId = feed.id.replace('feed/', '');
        lines.push(`- ${feedId}: ${feed.count.toString()} unread`);
      }

      if (stats.categories.length > 0) {
        lines.push('', '### Categories');
        for (const cat of stats.categories) {
          const name = cat.id.replace('user/-/label/', '');
          lines.push(`- ${name}: ${cat.count.toString()} unread`);
        }
      }

      return textResult(lines.join('\n'));
    })
  );

  server.registerTool(
    'get_user_info',
    {
      description: 'Get current user information',
      inputSchema: z.object({}).strict(),
    },
    wrapTool('get_user_info', async () => {
      const info = await client.stats.getUserInfo();

      const lines = [
        `**User ID:** ${info.userId}`,
        `**Username:** ${info.userName}`,
        info.userEmail !== undefined && info.userEmail !== '' ? `**Email:** ${info.userEmail}` : '',
      ].filter((line) => line !== '');

      return textResult(lines.join('\n'));
    })
  );
}
