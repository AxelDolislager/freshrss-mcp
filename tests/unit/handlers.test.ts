import { describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FreshRSSClient } from '../../src/api/index.js';
import {
  registerArticleTools,
  registerFeedTools,
  registerFeverTools,
  registerStatsTools,
  registerTagTools,
} from '../../src/handlers/index.js';

interface TextContent {
  type: 'text';
  text: string;
}

interface ResourceContent {
  type: 'resource';
  resource: { uri: string; mimeType?: string; text?: string; blob?: string };
}

interface McpResult {
  content: (TextContent | ResourceContent)[];
}

type ToolHandler = (args?: unknown) => Promise<McpResult>;

class FakeServer {
  public tools = new Map<string, { handler: ToolHandler }>();

  registerTool(name: string, _meta: unknown, handler: unknown): void {
    this.tools.set(name, { handler: handler as ToolHandler });
  }
}

function getHandler(server: FakeServer, name: string): ToolHandler {
  const tool = server.tools.get(name);
  if (tool === undefined) throw new Error(`Missing tool: ${name}`);
  return tool.handler;
}

function getText(result: McpResult): string {
  const first = result.content.at(0);
  if (first?.type !== 'text') throw new Error('Expected text result');
  return first.text;
}

describe('tool handlers', () => {
  it('registerFeedTools registers and runs tools', async () => {
    const server = new FakeServer();
    const client = {
      feeds: {
        list: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: '1', title: 'T', url: 'http://f', categoryName: 'Cat' }]),
        subscribe: vi.fn().mockResolvedValue(undefined),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
        edit: vi.fn().mockResolvedValue(undefined),
        exportOpml: vi.fn().mockResolvedValue('<opml/>'),
        importOpml: vi.fn().mockResolvedValue(undefined),
        quickadd: vi.fn().mockResolvedValue(undefined),
      },
    };

    registerFeedTools(server as unknown as McpServer, client as unknown as FreshRSSClient);

    const listFeeds = getHandler(server, 'list_feeds');
    expect(getText(await listFeeds())).toContain('No feeds subscribed.');
    expect(getText(await listFeeds())).toContain('T [Cat]');

    const subscribe = getHandler(server, 'subscribe');
    await subscribe({ url: 'http://x', title: 'tt', category: 'c' });
    expect(client.feeds.subscribe).toHaveBeenCalledWith('http://x', 'tt', 'c');

    const unsubscribe = getHandler(server, 'unsubscribe');
    await unsubscribe({ feedId: '1' });
    expect(client.feeds.unsubscribe).toHaveBeenCalledWith('1');

    const edit = getHandler(server, 'edit_feed');
    await edit({ feedId: '1', title: 'n', category: 'c' });
    expect(client.feeds.edit).toHaveBeenCalledWith('1', 'n', 'c');

    const exportOpml = getHandler(server, 'export_opml');
    expect(getText(await exportOpml({}))).toBe('<opml/>');

    const importOpml = getHandler(server, 'import_opml');
    await importOpml({ opml: '<opml/>' });
    expect(client.feeds.importOpml).toHaveBeenCalledWith('<opml/>');

    const quickadd = getHandler(server, 'quickadd_feed');
    await quickadd({ url: 'http://site' });
    expect(client.feeds.quickadd).toHaveBeenCalledWith('http://site');
  });

  it('registerTagTools lists folders/labels and edits', async () => {
    const server = new FakeServer();
    const client = {
      tags: {
        list: vi
          .fn()
          .mockResolvedValueOnce({ folders: [], labels: [] })
          .mockResolvedValueOnce({ folders: [], labels: [] })
          .mockResolvedValueOnce({
            folders: [{ name: 'F', unreadCount: 2 }],
            labels: [{ name: 'L', unreadCount: undefined }],
          })
          .mockResolvedValueOnce({
            folders: [{ name: 'F', unreadCount: 2 }],
            labels: [{ name: 'L', unreadCount: undefined }],
          }),
        addToArticles: vi.fn().mockResolvedValue(undefined),
        removeFromArticles: vi.fn().mockResolvedValue(undefined),
        rename: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    };

    registerTagTools(server as unknown as McpServer, client as unknown as FreshRSSClient);

    expect(getText(await getHandler(server, 'list_folders')())).toContain('No folders');
    expect(getText(await getHandler(server, 'list_labels')())).toContain('No labels');

    expect(getText(await getHandler(server, 'list_folders')())).toContain('F (2 unread)');
    expect(getText(await getHandler(server, 'list_labels')())).toContain('- L');

    await getHandler(server, 'add_labels')({ articleIds: ['a'], labels: ['x'] });
    expect(client.tags.addToArticles).toHaveBeenCalledWith(['a'], ['x']);

    await getHandler(server, 'remove_labels')({ articleIds: ['a'], labels: ['x'] });
    expect(client.tags.removeFromArticles).toHaveBeenCalledWith(['a'], ['x']);

    await getHandler(server, 'rename_folder')({ oldName: 'o', newName: 'n' });
    await getHandler(server, 'rename_label')({ oldName: 'o', newName: 'n' });
    expect(client.tags.rename).toHaveBeenCalledTimes(2);

    await getHandler(server, 'delete_folder')({ name: 'x' });
    await getHandler(server, 'delete_label')({ name: 'x' });
    expect(client.tags.delete).toHaveBeenCalledTimes(2);
  });

  it('registerArticleTools runs list/mark/star tools', async () => {
    const server = new FakeServer();
    const client = {
      articles: {
        list: vi.fn().mockResolvedValue({
          articles: [
            {
              id: '1',
              title: 'T',
              feedTitle: '',
              isRead: false,
              isStarred: true,
              published: 0,
            },
          ],
          continuation: 'c',
        }),
        markAsRead: vi.fn().mockResolvedValue(undefined),
        markAsUnread: vi.fn().mockResolvedValue(undefined),
        star: vi.fn().mockResolvedValue(undefined),
        unstar: vi.fn().mockResolvedValue(undefined),
        markAllAsRead: vi.fn().mockResolvedValue(undefined),
      },
    };

    registerArticleTools(server as unknown as McpServer, client as unknown as FreshRSSClient);

    const list = await getHandler(server, 'list_articles')({});
    const listText = getText(list);
    expect(listText).toContain('ID: 1');
    expect(listText).toContain('More articles available. Use continuation: c');

    await getHandler(server, 'mark_as_read')({ articleIds: ['1', '2'] });
    expect(client.articles.markAsRead).toHaveBeenCalledWith(['1', '2']);

    await getHandler(server, 'mark_as_unread')({ articleIds: ['1'] });
    expect(client.articles.markAsUnread).toHaveBeenCalledWith(['1']);

    await getHandler(server, 'star_articles')({ articleIds: ['1'] });
    expect(client.articles.star).toHaveBeenCalledWith(['1']);

    await getHandler(server, 'unstar_articles')({ articleIds: ['1'] });
    expect(client.articles.unstar).toHaveBeenCalledWith(['1']);

    await getHandler(server, 'mark_all_as_read')({ streamId: 'feed/1', olderThan: 0 });
    expect(client.articles.markAllAsRead).toHaveBeenCalledWith('feed/1', 0);
  });

  it('registerStatsTools formats output', async () => {
    const server = new FakeServer();
    const client = {
      stats: {
        getStatistics: vi.fn().mockResolvedValue({
          totalUnread: 12,
          feeds: Array.from({ length: 12 }).map((_, i) => ({ id: `feed/${String(i)}`, count: i })),
          categories: [{ id: 'user/-/label/C', count: 1 }],
          labels: [],
        }),
        getUserInfo: vi
          .fn()
          .mockResolvedValueOnce({ userId: '1', userName: 'u', userEmail: 'e' })
          .mockResolvedValueOnce({ userId: '1', userName: 'u', userEmail: '' }),
      },
    };

    registerStatsTools(server as unknown as McpServer, client as unknown as FreshRSSClient);

    const statsText = getText(await getHandler(server, 'get_stats')());
    expect(statsText).toContain('## FreshRSS Statistics');
    expect(statsText).toContain('### Categories');

    const infoWithEmailText = getText(await getHandler(server, 'get_user_info')());
    expect(infoWithEmailText).toContain('**Email:**');

    const infoNoEmailText = getText(await getHandler(server, 'get_user_info')());
    expect(infoNoEmailText).not.toContain('**Email:**');
  });

  it('registerFeverTools handles missing/invalid favicons', async () => {
    const server = new FakeServer();
    const client = {
      fever: {
        listFavicons: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ feedId: 2, dataUri: 'image/png;base64,AA==' }])
          .mockResolvedValueOnce([{ feedId: 2, dataUri: 'image/png;base64,AA==' }])
          .mockResolvedValueOnce([{ feedId: 1, dataUri: 'invalid' }])
          .mockResolvedValueOnce([{ feedId: 2, dataUri: 'image/png;base64,AA==' }]),
        listUnreadIds: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(['9']),
        listSavedIds: vi.fn().mockResolvedValueOnce(['1', '2']).mockResolvedValueOnce([]),
      },
    };

    registerFeverTools(server as unknown as McpServer, client as unknown as FreshRSSClient);

    expect(getText(await getHandler(server, 'list_favicons')())).toContain('No favicons');
    expect(getText(await getHandler(server, 'list_favicons')())).toContain(
      '- Feed 2: favicon available'
    );

    expect(getText(await getHandler(server, 'get_feed_favicon')({ feedId: '999' }))).toContain(
      'No favicon'
    );
    expect(getText(await getHandler(server, 'get_feed_favicon')({ feedId: '1' }))).toContain(
      'Invalid favicon'
    );

    const ok = await getHandler(server, 'get_feed_favicon')({ feedId: '2' });
    const first = ok.content.at(0);
    if (first?.type !== 'resource') {
      throw new Error('Expected resource result');
    }
    expect(first.resource.uri).toBe('freshrss://favicon/2');

    expect(getText(await getHandler(server, 'list_unread_article_ids')())).toContain('No unread');
    expect(getText(await getHandler(server, 'list_unread_article_ids')())).toBe('9');

    expect(getText(await getHandler(server, 'list_starred_article_ids')())).toBe('1,2');
    expect(getText(await getHandler(server, 'list_starred_article_ids')())).toContain('No starred');
  });
});
