import type { HttpClient } from './http-client.js';
import type { Feed } from '../types/index.js';

interface SubscriptionItem {
  id: string;
  title: string;
  url: string;
  htmlUrl?: string;
  iconUrl?: string;
  categories: { id: string; label: string }[];
}

interface SubscriptionResponse {
  subscriptions: SubscriptionItem[];
}

/**
 * Service for managing feed subscriptions
 */
export class FeedService {
  constructor(private readonly http: HttpClient) {}

  /**
   * List all subscribed feeds
   */
  async list(): Promise<Feed[]> {
    const data = await this.http.get<SubscriptionResponse>('/reader/api/0/subscription/list');
    return data.subscriptions.map((sub) => this.mapFeed(sub));
  }

  /**
   * Subscribe to a new feed
   */
  async subscribe(feedUrl: string, title?: string, category?: string): Promise<void> {
    const body: Record<string, string> = {
      ac: 'subscribe',
      s: `feed/${feedUrl}`,
    };
    if (title !== undefined && title !== '') body.t = title;
    if (category !== undefined && category !== '') body.a = `user/-/label/${category}`;

    await this.http.post('/reader/api/0/subscription/edit', body);
  }

  /**
   * Unsubscribe from a feed
   */
  async unsubscribe(feedId: string): Promise<void> {
    await this.http.post('/reader/api/0/subscription/edit', {
      ac: 'unsubscribe',
      s: `feed/${feedId}`,
    });
  }

  /**
   * Edit a feed subscription
   */
  async edit(feedId: string, title?: string, category?: string): Promise<void> {
    const body: Record<string, string> = {
      ac: 'edit',
      s: `feed/${feedId}`,
    };
    if (title !== undefined && title !== '') body.t = title;
    if (category !== undefined && category !== '') body.a = `user/-/label/${category}`;

    await this.http.post('/reader/api/0/subscription/edit', body);
  }

  /**
   * Export subscriptions as OPML.
   */
  async exportOpml(): Promise<string> {
    return this.http.getText('/reader/api/0/subscription/export');
  }

  /**
   * Import subscriptions from OPML.
   */
  async importOpml(opmlXml: string): Promise<void> {
    await this.http.postRaw('/reader/api/0/subscription/import', opmlXml);
  }

  /**
   * Quick-add a feed URL (FreshRSS will detect the actual feed).
   */
  async quickadd(feedUrl: string): Promise<void> {
    await this.http.post('/reader/api/0/subscription/quickadd', { quickadd: feedUrl });
  }

  private mapFeed(sub: SubscriptionItem): Feed {
    return {
      id: sub.id.replace('feed/', ''),
      title: sub.title,
      url: sub.url,
      websiteUrl: sub.htmlUrl,
      iconUrl: sub.iconUrl,
      categoryId: sub.categories[0]?.id.replace('user/-/label/', '') ?? '',
      categoryName: sub.categories[0]?.label ?? '',
    };
  }
}
