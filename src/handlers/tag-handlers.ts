import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FreshRSSClient } from '../api/index.js';
import { modifyLabelsSchema, renameTagSchema, deleteTagSchema } from '../tools/tag-tools.js';
import { textResult } from '../utils/mcp-results.js';
import { wrapTool } from '../utils/tool-errors.js';

/**
 * Register folder and label tools
 */
export function registerTagTools(server: McpServer, client: FreshRSSClient): void {
  server.registerTool(
    'list_folders',
    {
      description: 'List all folders/categories',
      inputSchema: z.object({}).strict(),
    },
    wrapTool('list_folders', async () => {
      const { folders } = await client.tags.list();

      if (folders.length === 0) {
        return textResult('No folders found.');
      }

      const formatted = folders
        .map((f) => {
          const unread = f.unreadCount !== undefined ? ` (${f.unreadCount.toString()} unread)` : '';
          return `- ${f.name}${unread}`;
        })
        .join('\n');

      return textResult(formatted);
    })
  );

  server.registerTool(
    'list_labels',
    {
      description: 'List all labels/tags',
      inputSchema: z.object({}).strict(),
    },
    wrapTool('list_labels', async () => {
      const { labels } = await client.tags.list();

      if (labels.length === 0) {
        return textResult('No labels found.');
      }

      const formatted = labels
        .map((l) => {
          const unread = l.unreadCount !== undefined ? ` (${l.unreadCount.toString()} unread)` : '';
          return `- ${l.name}${unread}`;
        })
        .join('\n');

      return textResult(formatted);
    })
  );

  server.registerTool(
    'add_labels',
    {
      description: 'Add labels to articles',
      inputSchema: modifyLabelsSchema,
    },
    wrapTool('add_labels', async (args: z.infer<typeof modifyLabelsSchema>) => {
      await client.tags.addToArticles(args.articleIds, args.labels);
      return textResult(
        `Added labels [${args.labels.join(', ')}] to ${args.articleIds.length.toString()} article(s).`
      );
    })
  );

  server.registerTool(
    'remove_labels',
    {
      description: 'Remove labels from articles',
      inputSchema: modifyLabelsSchema,
    },
    wrapTool('remove_labels', async (args: z.infer<typeof modifyLabelsSchema>) => {
      await client.tags.removeFromArticles(args.articleIds, args.labels);
      return textResult(
        `Removed labels [${args.labels.join(', ')}] from ${args.articleIds.length.toString()} article(s).`
      );
    })
  );

  server.registerTool(
    'rename_folder',
    {
      description: 'Rename a folder/category',
      inputSchema: renameTagSchema,
    },
    wrapTool('rename_folder', async (args: z.infer<typeof renameTagSchema>) => {
      await client.tags.rename(args.oldName, args.newName);
      return textResult(`Renamed folder "${args.oldName}" to "${args.newName}".`);
    })
  );

  server.registerTool(
    'rename_label',
    {
      description: 'Rename a label',
      inputSchema: renameTagSchema,
    },
    wrapTool('rename_label', async (args: z.infer<typeof renameTagSchema>) => {
      await client.tags.rename(args.oldName, args.newName);
      return textResult(`Renamed label "${args.oldName}" to "${args.newName}".`);
    })
  );

  server.registerTool(
    'delete_folder',
    {
      description: 'Delete a folder/category (feeds will be moved to default)',
      inputSchema: deleteTagSchema,
    },
    wrapTool('delete_folder', async (args: z.infer<typeof deleteTagSchema>) => {
      await client.tags.delete(args.name);
      return textResult(`Deleted folder "${args.name}".`);
    })
  );

  server.registerTool(
    'delete_label',
    {
      description: 'Delete a label',
      inputSchema: deleteTagSchema,
    },
    wrapTool('delete_label', async (args: z.infer<typeof deleteTagSchema>) => {
      await client.tags.delete(args.name);
      return textResult(`Deleted label "${args.name}".`);
    })
  );
}
