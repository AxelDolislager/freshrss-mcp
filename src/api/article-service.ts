import type { HttpClient } from './http-client.js';
import type { Article, ListArticlesOptions, ListArticlesResponse } from '../types/index.js';

interface StreamItem {
  id: string;
  title: string;
  published: number;
  crawlTimeMsec: string;
  author?: string;
  canonical?: { href: string }[];
  alternate?: { href: string }[];
  summary?: { content: string };
  content?: { content: string };
  origin?: { streamId: string; title: string };
  categories: string[];
}

interface StreamResponse {
  items: StreamItem[];
  continuation?: string;
}

/**
 * Service for managing articles
 */
export class ArticleService {
  constructor(private readonly http: HttpClient) {}

  /**
   * List articles with filtering options
   */
  async list(options: ListArticlesOptions = {}): Promise<ListArticlesResponse> {
    const params = this.buildParams(options);
    const endpoint = this.buildEndpoint(options);

    const data = await this.http.get<StreamResponse>(endpoint, params);
    const articles = data.items.map((item) => this.mapArticle(item));

    return {
      articles,
      continuation: data.continuation,
    };
  }

  /**
   * Mark articles as read
   */
  async markAsRead(articleIds: string[]): Promise<void> {
    await this.http.post('/reader/api/0/edit-tag', {
      i: articleIds,
      a: 'user/-/state/com.google/read',
    });
  }

  /**
   * Mark articles as unread
   */
  async markAsUnread(articleIds: string[]): Promise<void> {
    await this.http.post('/reader/api/0/edit-tag', {
      i: articleIds,
      r: 'user/-/state/com.google/read',
    });
  }

  /**
   * Star articles
   */
  async star(articleIds: string[]): Promise<void> {
    await this.http.post('/reader/api/0/edit-tag', {
      i: articleIds,
      a: 'user/-/state/com.google/starred',
    });
  }

  /**
   * Unstar articles
   */
  async unstar(articleIds: string[]): Promise<void> {
    await this.http.post('/reader/api/0/edit-tag', {
      i: articleIds,
      r: 'user/-/state/com.google/starred',
    });
  }

  /**
   * Mark all articles as read in a stream
   */
  async markAllAsRead(streamId: string, olderThan?: number): Promise<void> {
    const body: Record<string, string> = { s: streamId };
    if (olderThan !== undefined && olderThan !== 0) {
      body.ts = String(olderThan * 1000000);
    }
    await this.http.post('/reader/api/0/mark-all-as-read', body);
  }

  private buildParams(options: ListArticlesOptions): Record<string, string> {
    const ignoreFilter = options.state === 'read' || options.state === 'unread';
    const params: Record<string, string> = {
      n: String(options.count ?? 20),
      r: options.order === 'oldest' ? 'o' : 'd',
    };

    if (options.continuation !== undefined && options.continuation !== '') {
      params.c = options.continuation;
    }
    if (options.newerThan !== undefined && options.newerThan !== 0) {
      params.ot = String(options.newerThan);
    }
    if (options.olderThan !== undefined && options.olderThan !== 0) {
      params.nt = String(options.olderThan);
    }
    if (!ignoreFilter) {
      if (options.filter === 'unread') params.xt = 'user/-/state/com.google/read';
      if (options.filter === 'read') params.it = 'user/-/state/com.google/read';
    }

    return params;
  }

  private buildEndpoint(options: ListArticlesOptions): string {
    const base = '/reader/api/0/stream/contents';

    if (options.streamId !== undefined && options.streamId !== '') {
      const id = options.streamId.replace(/^\//, '');
      return `${base}/${id}`;
    }

    if (options.state !== undefined) {
      switch (options.state) {
        case 'reading-list':
          return `${base}/user/-/state/com.google/reading-list`;
        case 'starred':
          return `${base}/user/-/state/com.google/starred`;
        case 'read':
          return `${base}/user/-/state/com.google/read`;
        case 'unread':
          return `${base}/user/-/state/com.google/unread`;
      }
    }

    if (options.starred === true) return `${base}/user/-/state/com.google/starred`;
    if (options.feedId !== undefined && options.feedId !== '') {
      return `${base}/feed/${options.feedId}`;
    }
    if (options.category !== undefined && options.category !== '') {
      return `${base}/user/-/label/${encodeURIComponent(options.category)}`;
    }
    if (options.label !== undefined && options.label !== '') {
      return `${base}/user/-/label/${encodeURIComponent(options.label)}`;
    }

    return `${base}/user/-/state/com.google/reading-list`;
  }

  private mapArticle(item: StreamItem): Article {
    const isRead = item.categories.some((c) => c.includes('state/com.google/read'));
    const isStarred = item.categories.some((c) => c.includes('state/com.google/starred'));
    const labels = item.categories
      .filter((c) => c.includes('/label/') && !c.includes('/state/'))
      .map((c) => c.replace('user/-/label/', ''));

    return {
      id: item.id,
      title: item.title,
      content: item.content?.content ?? item.summary?.content ?? '',
      summary: item.summary?.content,
      author: item.author,
      url: item.canonical?.[0]?.href ?? item.alternate?.[0]?.href ?? '',
      feedId: item.origin?.streamId.replace('feed/', '') ?? '',
      feedTitle: item.origin?.title,
      published: item.published * 1000000,
      crawled: parseInt(item.crawlTimeMsec) * 1000,
      isRead,
      isStarred,
      labels,
      categories: item.categories,
    };
  }
}
