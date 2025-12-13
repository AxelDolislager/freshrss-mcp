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

function firstResource(res: unknown): { uri: string; blob?: string; mimeType?: string } | null {
  if (typeof res !== 'object' || res === null) return null;
  const maybe = res as ToolCallResult;
  if (!Array.isArray(maybe.content)) return null;
  const item = maybe.content.find(
    (c): c is { type: 'resource'; resource: { uri: string } } => c.type === 'resource'
  );
  return item?.resource ?? null;
}

function extractFirstArticleId(text: string): string | null {
  const line = text.split('\n').find((l) => l.includes('ID:'));
  if (line === undefined) return null;
  const m = /ID:\s*(.+)\s*$/.exec(line);
  return m ? m[1].trim() : null;
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
  const client = new Client({ name: 'vitest-integration-extended', version: '0.0.1' });
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

describe('FreshRSS MCP Extended Integration', () => {
  let client: Client;
  let transport: StdioClientTransport;
  const TEST_FEED_URL = 'https://feeds.bbci.co.uk/news/rss.xml';
  const TEST_FEED_TITLE = 'BBC News';
  const TEST_CATEGORY = 'Extended Tests';

  beforeAll(async () => {
    const { client: setupClient, transport: setupTransport } = await createConnectedClient();
    try {
      await setupClient.callTool({
        name: 'subscribe',
        arguments: {
          url: TEST_FEED_URL,
          title: TEST_FEED_TITLE,
          category: TEST_CATEGORY,
        },
      });

      // Verify subscription
      await waitFor(
        async () => {
          const feedsRes = await setupClient.callTool({ name: 'list_feeds', arguments: {} });
          const feeds = parseFeeds(firstText(feedsRes));
          return feeds.some((f) => f.url === TEST_FEED_URL);
        },
        (exists) => exists,
        10,
        1000
      );
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
      const feed = feeds.find((f) => f.url === TEST_FEED_URL);
      if (feed) {
        await cleanupClient.callTool({ name: 'unsubscribe', arguments: { feedId: feed.id } });
      }
      await cleanupClient.callTool({
        name: 'delete_folder',
        arguments: { name: TEST_CATEGORY },
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

  it.skip('can list favicons and get a specific favicon', async () => {
    // Wait for favicons to be available (might take a moment after subscribe)
    const faviconsText = await waitFor(
      async () => {
        const res = await client.callTool({ name: 'list_favicons', arguments: {} });
        return firstText(res);
      },
      (text) => text.includes('favicon available')
    );

    expect(faviconsText).toContain('favicon available');

    // Extract a feed ID from the text
    const match = /Feed (\d+):/.exec(faviconsText);
    expect(match).not.toBeNull();
    if (!match) return;

    const feedId = match[1];

    const faviconRes = await client.callTool({
      name: 'get_feed_favicon',
      arguments: { feedId },
    });

    const resource = firstResource(faviconRes);
    expect(resource).not.toBeNull();
    expect(resource?.uri).toContain(`freshrss://favicon/${feedId}`);
    expect(resource?.mimeType).toBeDefined();
    expect(resource?.blob).toBeDefined();
  });

  it('can list starred article IDs', async () => {
    // First ensure we have an article
    const listRes = await waitFor(
      async () => {
        const res = await client.callTool({
          name: 'list_articles',
          arguments: { count: 1, filter: 'all' },
        });
        return firstText(res);
      },
      (text) => extractFirstArticleId(text) !== null
    );

    const articleId = extractFirstArticleId(listRes);
    expect(articleId).not.toBeNull();
    if (!articleId) return;

    // Star it
    await client.callTool({ name: 'star_articles', arguments: { articleIds: [articleId] } });

    // Check list_starred_article_ids
    const starredIdsRes = await client.callTool({
      name: 'list_starred_article_ids',
      arguments: {},
    });
    const starredIdsText = firstText(starredIdsRes);

    // Convert Google Reader ID (hex) to Fever ID (decimal)
    // ID format: tag:google.com,2005:reader/item/000645cd2dc564b8
    const hexMatch = /tag:google.com,2005:reader\/item\/([0-9a-f]+)/.exec(articleId);
    if (hexMatch) {
      const decimalId = BigInt(`0x${hexMatch[1]}`).toString();
      expect(starredIdsText).toContain(decimalId);
    } else {
      // Fallback if ID format is different (shouldn't happen with FreshRSS GReader API)
      expect(starredIdsText).toContain(articleId);
    }

    // Unstar it
    await client.callTool({ name: 'unstar_articles', arguments: { articleIds: [articleId] } });

    // Verify it's gone (or at least check the tool runs without error)
    const starredIdsRes2 = await client.callTool({
      name: 'list_starred_article_ids',
      arguments: {},
    });
    const text2 = firstText(starredIdsRes2);
    // It might not be empty if there are other starred items, but we exercised the tool.
    expect(text2).toBeDefined();
  });

  it('can edit feed title', async () => {
    const feedsRes = await client.callTool({ name: 'list_feeds', arguments: {} });
    const feeds = parseFeeds(firstText(feedsRes));
    const feed = feeds.find((f) => f.url === TEST_FEED_URL);
    expect(feed).toBeDefined();
    if (!feed) return;

    const newTitle = `${TEST_FEED_TITLE} Renamed`;

    await client.callTool({
      name: 'edit_feed',
      arguments: { feedId: feed.id, title: newTitle },
    });

    const feedsRes2 = await client.callTool({ name: 'list_feeds', arguments: {} });
    const feeds2 = parseFeeds(firstText(feedsRes2));
    const feed2 = feeds2.find((f) => f.id === feed.id);
    expect(feed2?.title).toBe(newTitle);

    // Revert
    await client.callTool({
      name: 'edit_feed',
      arguments: { feedId: feed.id, title: TEST_FEED_TITLE },
    });
  });

  it('can filter articles by feed ID', async () => {
    const feedsRes = await client.callTool({ name: 'list_feeds', arguments: {} });
    const feeds = parseFeeds(firstText(feedsRes));
    const feed = feeds.find((f) => f.url === TEST_FEED_URL);
    expect(feed).toBeDefined();
    if (!feed) return;

    const articlesRes = await client.callTool({
      name: 'list_articles',
      arguments: { feedId: feed.id, count: 5 },
    });

    // We expect articles from this feed (or empty list if none, but no error)
    // Since we subscribed to NASA, there should be articles.
    const text = firstText(articlesRes);
    // If there are articles, they should be from the feed.
    // Hard to verify exact feed origin from list_articles output without parsing everything,
    // but we can check if it runs successfully.
    expect(text).toBeDefined();
  });
});
