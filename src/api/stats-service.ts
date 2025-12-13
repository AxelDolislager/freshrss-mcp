import type { HttpClient } from './http-client.js';
import type { Statistics, UnreadCount, UserInfo } from '../types/index.js';

interface UnreadCountItem {
  id: string;
  count: number;
  newestItemTimestampUsec?: string;
}

interface UnreadCountResponse {
  max: number;
  unreadcounts: UnreadCountItem[];
}

/**
 * Service for statistics and user info
 */
export class StatsService {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get user information
   */
  async getUserInfo(): Promise<UserInfo> {
    return this.http.get<UserInfo>('/reader/api/0/user-info');
  }

  /**
   * Get unread counts and statistics
   */
  async getStatistics(): Promise<Statistics> {
    const data = await this.http.get<UnreadCountResponse>('/reader/api/0/unread-count');

    const feeds: UnreadCount[] = [];
    const categories: UnreadCount[] = [];
    const labels: UnreadCount[] = [];

    for (const item of data.unreadcounts) {
      const unreadCount: UnreadCount = {
        id: item.id,
        count: item.count,
        newestItemTimestamp: item.newestItemTimestampUsec,
      };

      if (item.id.startsWith('feed/')) {
        feeds.push(unreadCount);
      } else if (item.id.includes('/label/')) {
        categories.push(unreadCount);
      }
    }

    return {
      totalUnread: data.max,
      feeds,
      categories,
      labels,
    };
  }
}
