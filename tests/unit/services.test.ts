import { describe, expect, it, vi } from 'vitest';
import type { HttpClient } from '../../src/api/http-client.js';
import { ArticleService } from '../../src/api/article-service.js';
import { FeedService } from '../../src/api/feed-service.js';
import { FeverService } from '../../src/api/fever-service.js';
import { StatsService } from '../../src/api/stats-service.js';
import { TagService } from '../../src/api/tag-service.js';

describe('API services', () => {
  it('FeedService maps and calls endpoints', async () => {
    const http = {
      get: vi.fn().mockResolvedValue({
        subscriptions: [
          {
            id: 'feed/123',
            title: 'Feed',
            url: 'http://example.com/rss',
            htmlUrl: 'http://example.com',
            iconUrl: 'http://example.com/favicon.ico',
            categories: [{ id: 'user/-/label/Tech', label: 'Tech' }],
          },
        ],
      }),
      post: vi.fn().mockResolvedValue('OK'),
      getText: vi.fn().mockResolvedValue('<opml/>'),
      postRaw: vi.fn().mockResolvedValue('OK'),
    };

    const svc = new FeedService(http as unknown as HttpClient);
    const feeds = await svc.list();
    expect(http.get).toHaveBeenCalledWith('/reader/api/0/subscription/list');
    expect(feeds[0]).toEqual({
      id: '123',
      title: 'Feed',
      url: 'http://example.com/rss',
      websiteUrl: 'http://example.com',
      iconUrl: 'http://example.com/favicon.ico',
      categoryId: 'Tech',
      categoryName: 'Tech',
    });

    await svc.subscribe('http://f', 'Title', 'Cat');
    expect(http.post).toHaveBeenCalledWith('/reader/api/0/subscription/edit', {
      ac: 'subscribe',
      s: 'feed/http://f',
      t: 'Title',
      a: 'user/-/label/Cat',
    });

    await svc.unsubscribe('123');
    expect(http.post).toHaveBeenCalledWith('/reader/api/0/subscription/edit', {
      ac: 'unsubscribe',
      s: 'feed/123',
    });

    await svc.edit('123', 'New', 'Cat');
    expect(http.post).toHaveBeenCalledWith('/reader/api/0/subscription/edit', {
      ac: 'edit',
      s: 'feed/123',
      t: 'New',
      a: 'user/-/label/Cat',
    });

    expect(await svc.exportOpml()).toBe('<opml/>');
    expect(http.getText).toHaveBeenCalledWith('/reader/api/0/subscription/export');

    await svc.importOpml('<opml/>');
    expect(http.postRaw).toHaveBeenCalledWith('/reader/api/0/subscription/import', '<opml/>');

    await svc.quickadd('http://site');
    expect(http.post).toHaveBeenCalledWith('/reader/api/0/subscription/quickadd', {
      quickadd: 'http://site',
    });
  });

  it('TagService lists folders/labels and edits tags', async () => {
    const http = {
      get: vi.fn().mockResolvedValue({
        tags: [
          { id: 'user/-/label/Folder1', type: 'folder', unread_count: 2 },
          { id: 'user/-/label/Label1', type: 'tag', unread_count: 5 },
          { id: 'user/-/state/com.google/read', type: 'tag', unread_count: 99 },
        ],
      }),
      post: vi.fn().mockResolvedValue('OK'),
    };

    const svc = new TagService(http as unknown as HttpClient);
    const res = await svc.list();
    expect(res.folders).toEqual([
      { id: 'user/-/label/Folder1', name: 'Folder1', type: 'folder', unreadCount: 2 },
    ]);
    expect(res.labels).toEqual([
      { id: 'user/-/label/Label1', name: 'Label1', type: 'tag', unreadCount: 5 },
    ]);

    await svc.addToArticles(['a1', 'a2'], ['L1']);
    expect(http.post).toHaveBeenCalledWith('/reader/api/0/edit-tag', {
      i: ['a1', 'a2'],
      a: ['user/-/label/L1'],
    });

    await svc.removeFromArticles(['a1'], ['L1']);
    expect(http.post).toHaveBeenCalledWith('/reader/api/0/edit-tag', {
      i: ['a1'],
      r: ['user/-/label/L1'],
    });

    await svc.rename('Old', 'New');
    expect(http.post).toHaveBeenCalledWith('/reader/api/0/rename-tag', {
      s: 'user/-/label/Old',
      dest: 'user/-/label/New',
    });

    await svc.delete('Gone');
    expect(http.post).toHaveBeenCalledWith('/reader/api/0/disable-tag', { s: 'user/-/label/Gone' });
  });

  it('ArticleService builds endpoints/params and maps articles', async () => {
    const http = {
      get: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'item1',
            title: 'Title',
            published: 10,
            crawlTimeMsec: '42',
            author: 'Me',
            canonical: [{ href: 'http://canonical' }],
            summary: { content: 'Sum' },
            origin: { streamId: 'feed/99', title: 'Feed99' },
            categories: [
              'user/-/state/com.google/read',
              'user/-/state/com.google/starred',
              'user/-/label/L1',
            ],
          },
        ],
        continuation: 'c1',
      }),
      post: vi.fn().mockResolvedValue('OK'),
    };

    const svc = new ArticleService(http as unknown as HttpClient);
    const result = await svc.list({
      count: 5,
      filter: 'unread',
      order: 'oldest',
      continuation: 'x',
    });

    expect(http.get).toHaveBeenCalledWith(
      '/reader/api/0/stream/contents/user/-/state/com.google/reading-list',
      { n: '5', r: 'o', c: 'x', xt: 'user/-/state/com.google/read' }
    );

    expect(result.continuation).toBe('c1');
    expect(result.articles[0]).toMatchObject({
      id: 'item1',
      title: 'Title',
      content: 'Sum',
      author: 'Me',
      url: 'http://canonical',
      feedId: '99',
      feedTitle: 'Feed99',
      isRead: true,
      isStarred: true,
      labels: ['L1'],
      published: 10 * 1000000,
      crawled: 42 * 1000,
    });

    await svc.markAsRead(['a']);
    expect(http.post).toHaveBeenCalledWith('/reader/api/0/edit-tag', {
      i: ['a'],
      a: 'user/-/state/com.google/read',
    });

    await svc.markAsUnread(['a']);
    expect(http.post).toHaveBeenCalledWith('/reader/api/0/edit-tag', {
      i: ['a'],
      r: 'user/-/state/com.google/read',
    });

    await svc.star(['a']);
    expect(http.post).toHaveBeenCalledWith('/reader/api/0/edit-tag', {
      i: ['a'],
      a: 'user/-/state/com.google/starred',
    });

    await svc.unstar(['a']);
    expect(http.post).toHaveBeenCalledWith('/reader/api/0/edit-tag', {
      i: ['a'],
      r: 'user/-/state/com.google/starred',
    });

    await svc.markAllAsRead('feed/1');
    expect(http.post).toHaveBeenCalledWith('/reader/api/0/mark-all-as-read', { s: 'feed/1' });

    await svc.markAllAsRead('feed/1', 123);
    expect(http.post).toHaveBeenCalledWith('/reader/api/0/mark-all-as-read', {
      s: 'feed/1',
      ts: String(123 * 1000000),
    });

    await svc.list({ streamId: '/feed/1' });
    expect(http.get).toHaveBeenLastCalledWith('/reader/api/0/stream/contents/feed/1', {
      n: '20',
      r: 'd',
    });

    await svc.list({ state: 'read', filter: 'unread' });
    expect(http.get).toHaveBeenLastCalledWith(
      '/reader/api/0/stream/contents/user/-/state/com.google/read',
      { n: '20', r: 'd' }
    );

    await svc.list({ category: 'A B' });
    expect(http.get).toHaveBeenLastCalledWith('/reader/api/0/stream/contents/user/-/label/A%20B', {
      n: '20',
      r: 'd',
    });

    await svc.list({ newerThan: 1, olderThan: 2 });
    expect(http.get).toHaveBeenLastCalledWith(
      '/reader/api/0/stream/contents/user/-/state/com.google/reading-list',
      { n: '20', r: 'd', ot: '1', nt: '2' }
    );

    await svc.list({ state: 'unread', filter: 'read' });
    expect(http.get).toHaveBeenLastCalledWith(
      '/reader/api/0/stream/contents/user/-/state/com.google/unread',
      { n: '20', r: 'd' }
    );

    await svc.list({ feedId: '123' });
    expect(http.get).toHaveBeenLastCalledWith('/reader/api/0/stream/contents/feed/123', {
      n: '20',
      r: 'd',
    });

    await svc.list({ label: 'A/B' });
    expect(http.get).toHaveBeenLastCalledWith('/reader/api/0/stream/contents/user/-/label/A%2FB', {
      n: '20',
      r: 'd',
    });

    await svc.list({ state: 'reading-list' });
    expect(http.get).toHaveBeenLastCalledWith(
      '/reader/api/0/stream/contents/user/-/state/com.google/reading-list',
      { n: '20', r: 'd' }
    );

    await svc.list({ state: 'starred' });
    expect(http.get).toHaveBeenLastCalledWith(
      '/reader/api/0/stream/contents/user/-/state/com.google/starred',
      { n: '20', r: 'd' }
    );
  });

  it('StatsService splits unread counts', async () => {
    const http = {
      get: vi
        .fn()
        .mockResolvedValueOnce({ userId: '1', userName: 'u', userEmail: 'e' })
        .mockResolvedValueOnce({
          max: 3,
          unreadcounts: [
            { id: 'feed/1', count: 2, newestItemTimestampUsec: 't1' },
            { id: 'user/-/label/Cat', count: 1, newestItemTimestampUsec: 't2' },
          ],
        }),
    };

    const svc = new StatsService(http as unknown as HttpClient);
    expect(await svc.getUserInfo()).toEqual({ userId: '1', userName: 'u', userEmail: 'e' });

    const stats = await svc.getStatistics();
    expect(stats.totalUnread).toBe(3);
    expect(stats.feeds).toEqual([{ id: 'feed/1', count: 2, newestItemTimestamp: 't1' }]);
    expect(stats.categories).toEqual([
      { id: 'user/-/label/Cat', count: 1, newestItemTimestamp: 't2' },
    ]);
    expect(stats.labels).toEqual([]);
  });

  it('FeverService parses IDs and favicons', async () => {
    const http = {
      postFever: vi
        .fn()
        .mockResolvedValueOnce({ favicons: [{ id: 2, data: 'data:image/png;base64,AA==' }] })
        .mockResolvedValueOnce({ unread_item_ids: '1,2,,3' })
        .mockResolvedValueOnce({ saved_item_ids: '' }),
    };

    const svc = new FeverService(http as unknown as HttpClient);
    expect(await svc.listFavicons()).toEqual([
      { feedId: 2, dataUri: 'data:image/png;base64,AA==' },
    ]);
    expect(await svc.listUnreadIds()).toEqual(['1', '2', '3']);
    expect(await svc.listSavedIds()).toEqual([]);
  });
});
