import 'dotenv/config';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface ToolContent {
  type: string;
  text?: string;
  resource?: {
    uri: string;
    blob?: string;
    text?: string;
    mimeType?: string;
  };
}
interface ToolCallResult {
  content?: ToolContent[];
}

const serverParams = {
  command: 'node',
  args: ['dist/index.js'],
  cwd: process.cwd(),
  env: { ...process.env },
};

function firstText(res: unknown): string {
  if (typeof res !== 'object' || res === null) return '';
  const maybe = res as ToolCallResult;
  if (!Array.isArray(maybe.content)) return '';
  const item = maybe.content.find(
    (c): c is { type: 'text'; text: string } => c.type === 'text' && typeof c.text === 'string'
  );
  return item?.text ?? '';
}

function extractFirstArticleId(text: string): string | null {
  const line = text.split('\n').find((l) => l.includes('ID:'));
  if (line === undefined) return null;
  const m = /ID:\s*(.+)\s*$/.exec(line);
  return m ? m[1].trim() : null;
}

function parseArticleLine(
  text: string,
  articleId: string
): { isRead: boolean; isStarred: boolean } {
  const line = text.split('\n').find((l) => l.includes(`ID: ${articleId}`));
  if (line === undefined) {
    throw new Error(`Article line not found for ${articleId}`);
  }
  const isRead = line.trim().startsWith('✓');
  const isStarred = line.includes('★');
  return { isRead, isStarred };
}

interface ParsedFeed {
  id: string;
  title: string;
  url: string;
  category?: string;
}

function parseFeeds(text: string): ParsedFeed[] {
  const lines = text.split('\n');
  const feeds: ParsedFeed[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i];
    if (!header.trim().startsWith('- ')) continue;
    const titleMatch = /^-\s(.+?)(?:\s\[(.+)\])?$/.exec(header.trim());
    if (titleMatch === null) continue;
    const title = titleMatch[1];
    const category = titleMatch[2];

    const urlLine = lines.at(i + 1);
    const idLine = lines.at(i + 2);
    if (urlLine == null || idLine == null) continue;

    const urlMatch = /URL:\s*(.+)$/.exec(urlLine.trim());
    const idMatch = /ID:\s*(.+)$/.exec(idLine.trim());
    if (urlMatch == null || idMatch == null) continue;

    feeds.push({ id: idMatch[1], title, url: urlMatch[1], category });
  }
  return feeds;
}

async function createConnectedClient(): Promise<{
  client: Client;
  transport: StdioClientTransport;
}> {
  const client = new Client({ name: 'vitest-integration', version: '0.0.1' });
  const transport = new StdioClientTransport(serverParams);
  await client.connect(transport);
  return { client, transport };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(
  action: () => Promise<T>,
  predicate: (result: T) => boolean,
  retries = 30,
  interval = 1000
): Promise<T> {
  let lastResult: T | undefined;
  for (let i = 0; i < retries; i++) {
    lastResult = await action();
    if (predicate(lastResult)) {
      return lastResult;
    }
    await sleep(interval);
  }
  if (lastResult === undefined) throw new Error('Action never returned a result');
  return lastResult;
}

describe('FreshRSS MCP integration', () => {
  let client: Client;
  let transport: StdioClientTransport;
  const listFeeds = async (): Promise<ParsedFeed[]> => {
    const feedsRes = await client.callTool({ name: 'list_feeds', arguments: {} });
    return parseFeeds(firstText(feedsRes));
  };

  beforeAll(async () => {
    const { client: setupClient, transport: setupTransport } = await createConnectedClient();
    try {
      await setupClient.callTool({
        name: 'subscribe',
        arguments: {
          url: 'https://github.blog/feed/',
          title: 'GitHub Blog',
          category: 'Integration Tests',
        },
      });
    } catch (e) {
      console.error('Failed to seed data:', e);
    } finally {
      await setupTransport.close();
      await setupClient.close();
    }
  });

  afterAll(async () => {
    const { client: cleanupClient, transport: cleanupTransport } = await createConnectedClient();
    try {
      const feedsRes = await cleanupClient.callTool({ name: 'list_feeds', arguments: {} });
      const feeds = parseFeeds(firstText(feedsRes));
      const feed = feeds.find((f) => f.url === 'https://github.blog/feed/');
      if (feed) {
        await cleanupClient.callTool({ name: 'unsubscribe', arguments: { feedId: feed.id } });
      }
      await cleanupClient.callTool({
        name: 'delete_folder',
        arguments: { name: 'Integration Tests' },
      });
    } catch (e) {
      console.error('Failed to cleanup data:', e);
    } finally {
      await cleanupTransport.close();
      await cleanupClient.close();
    }
  });

  beforeEach(async () => {
    ({ client, transport } = await createConnectedClient());
  });

  afterEach(async () => {
    await transport.close();
    await client.close();
  });

  it('lists tools and basic metadata', async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);

    expect(toolNames).toContain('list_articles');
    expect(toolNames).toContain('export_opml');
    expect(toolNames).toContain('quickadd_feed');
    expect(toolNames).toContain('list_favicons');
    expect(toolNames).toContain('list_unread_article_ids');

    const userInfo = await client.callTool({ name: 'get_user_info', arguments: {} });
    expect(firstText(userInfo)).toContain('Username');

    const stats = await client.callTool({ name: 'get_stats', arguments: {} });
    expect(firstText(stats)).toContain('Total Unread');
  });

  it('supports OPML export', async () => {
    const opml = await client.callTool({ name: 'export_opml', arguments: {} });
    const text = firstText(opml);
    expect(text).toContain('<opml');
    expect(text).toContain('<outline');
  });

  it('can move a feed between folders and clean up', async () => {
    const feeds = await listFeeds();
    expect(feeds.length).toBeGreaterThan(0);
    const feedId = feeds[0].id;
    const originalCategory = feeds[0].category ?? 'Uncategorized';
    const tempCategory = `mcp-test-folder-${Date.now().toString()}`;
    const renamedCategory = `${tempCategory}-renamed`;

    try {
      await client.callTool({
        name: 'edit_feed',
        arguments: { feedId, category: tempCategory },
      });

      const foldersAfterMove = await client.callTool({ name: 'list_folders', arguments: {} });
      expect(firstText(foldersAfterMove)).toContain(tempCategory);

      await client.callTool({
        name: 'rename_folder',
        arguments: { oldName: tempCategory, newName: renamedCategory },
      });
      const foldersAfterRename = await client.callTool({ name: 'list_folders', arguments: {} });
      expect(firstText(foldersAfterRename)).toContain(renamedCategory);
    } finally {
      await client.callTool({
        name: 'edit_feed',
        arguments: { feedId, category: originalCategory },
      });
      await client.callTool({
        name: 'delete_folder',
        arguments: { name: renamedCategory },
      });
    }
  });

  it('can toggle read/unread and star/unstar on an article', async () => {
    const listText = await waitFor(
      async () => {
        const listRes = await client.callTool({
          name: 'list_articles',
          arguments: { count: 5, filter: 'all', order: 'newest' },
        });
        return firstText(listRes);
      },
      (text) => extractFirstArticleId(text) !== null
    );

    const articleId = extractFirstArticleId(listText);
    expect(articleId).not.toBeNull();
    if (articleId === null) throw new Error('Could not parse article ID');

    const initial = parseArticleLine(listText, articleId);

    try {
      await client.callTool({ name: 'mark_as_read', arguments: { articleIds: [articleId] } });
      const afterRead = await client.callTool({
        name: 'list_articles',
        arguments: { count: 5, filter: 'all', order: 'newest' },
      });
      expect(parseArticleLine(firstText(afterRead), articleId).isRead).toBe(true);

      await client.callTool({ name: 'star_articles', arguments: { articleIds: [articleId] } });
      const afterStar = await client.callTool({
        name: 'list_articles',
        arguments: { count: 5, filter: 'all', order: 'newest' },
      });
      expect(parseArticleLine(firstText(afterStar), articleId).isStarred).toBe(true);
    } finally {
      if (!initial.isStarred) {
        await client.callTool({ name: 'unstar_articles', arguments: { articleIds: [articleId] } });
      }
      if (!initial.isRead) {
        await client.callTool({ name: 'mark_as_unread', arguments: { articleIds: [articleId] } });
      }
    }
  });

  it('supports labels flow and Fever ID lists', async () => {
    const label1 = `mcp-test-label-${Date.now().toString()}`;
    const label2 = `${label1}-renamed`;
    const labelStreamId = `user/-/label/${label2}`;

    const unreadIds = await client.callTool({
      name: 'list_unread_article_ids',
      arguments: {},
    });
    expect(firstText(unreadIds)).toBeTypeOf('string');

    try {
      const articlesText = await waitFor(
        async () => {
          const articles = await client.callTool({
            name: 'list_articles',
            arguments: { count: 5, filter: 'all', order: 'newest' },
          });
          return firstText(articles);
        },
        (text) => extractFirstArticleId(text) !== null
      );

      const articleId = extractFirstArticleId(articlesText);
      expect(articleId).not.toBeNull();
      if (articleId === null) throw new Error('Could not parse article ID');

      await client.callTool({
        name: 'add_labels',
        arguments: { articleIds: [articleId], labels: [label1] },
      });

      const labelsAfterAdd = await client.callTool({ name: 'list_labels', arguments: {} });
      expect(firstText(labelsAfterAdd)).toContain(label1);

      await client.callTool({
        name: 'rename_label',
        arguments: { oldName: label1, newName: label2 },
      });

      const labelsAfterRename = await client.callTool({ name: 'list_labels', arguments: {} });
      expect(firstText(labelsAfterRename)).toContain(label2);

      // Ensure the article is unread so mark_all_as_read has an effect.
      await client.callTool({
        name: 'mark_as_unread',
        arguments: { articleIds: [articleId] },
      });

      // Mark all as read for the temporary label stream (limited scope).
      await client.callTool({
        name: 'mark_all_as_read',
        arguments: { streamId: labelStreamId },
      });

      const afterMarkAll = await client.callTool({
        name: 'list_articles',
        arguments: { count: 5, label: label2, filter: 'all', order: 'newest' },
      });
      const lineState = parseArticleLine(firstText(afterMarkAll), articleId);
      expect(lineState.isRead).toBe(true);

      await client.callTool({
        name: 'remove_labels',
        arguments: { articleIds: [articleId], labels: [label2] },
      });
    } finally {
      try {
        // Restore to unread so we don't permanently alter state if possible.
        await client.callTool({
          name: 'mark_as_unread',
          arguments: { articleIds: [articleId] },
        });
        await client.callTool({ name: 'delete_label', arguments: { name: label2 } });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it('covers subscribe, quickadd, and OPML import (with cleanup)', async () => {
    const before = await listFeeds();
    const beforeUrls = new Set(before.map((f) => f.url));

    const feedUrl = 'https://xkcd.com/atom.xml';
    await client.callTool({
      name: 'subscribe',
      arguments: { url: feedUrl, title: 'xkcd', category: 'mcp-test' },
    });

    const afterSubscribe = await listFeeds();
    const createdSubscribe = afterSubscribe.find((f) => f.url === feedUrl);

    const quickUrl = 'https://planetpython.org/rss20.xml';
    await client.callTool({
      name: 'quickadd_feed',
      arguments: { url: quickUrl },
    });

    const afterQuickadd = await listFeeds();
    const createdQuickadd = afterQuickadd.find(
      (f) => f.url === quickUrl && !beforeUrls.has(quickUrl)
    );

    const opml = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>MCP Import</title></head><body><outline text="mcp"><outline text="xkcd" type="rss" xmlUrl="${feedUrl}" /></outline></body></opml>`;
    await client.callTool({
      name: 'import_opml',
      arguments: { opml },
    });

    try {
      const feedsAfterAll = await listFeeds();
      expect(feedsAfterAll.some((f) => f.url === feedUrl)).toBe(true);
    } finally {
      if (createdSubscribe !== undefined && !beforeUrls.has(createdSubscribe.url)) {
        await client.callTool({
          name: 'unsubscribe',
          arguments: { feedId: createdSubscribe.id },
        });
      }
      if (createdQuickadd !== undefined) {
        await client.callTool({
          name: 'unsubscribe',
          arguments: { feedId: createdQuickadd.id },
        });
      }
      await client.callTool({
        name: 'delete_folder',
        arguments: { name: 'mcp-test' },
      });
    }
  });
});
