/**
 * Represents an article/entry from FreshRSS
 */
export interface Article {
  id: string;
  title: string;
  content: string;
  summary?: string;
  author?: string;
  url: string;
  feedId: string;
  feedTitle?: string;
  published: number;
  crawled: number;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
  categories: string[];
}

/**
 * Options for listing articles
 */
export interface ListArticlesOptions {
  count?: number;
  filter?: 'all' | 'read' | 'unread';
  starred?: boolean;
  /**
   * Predefined stream/state to list.
   * If provided, takes precedence over starred/feedId/category/label.
   */
  state?: 'reading-list' | 'starred' | 'read' | 'unread';
  /**
   * Full greader stream ID such as:
   * feed/123, user/-/label/FolderName, user/-/state/com.google/reading-list, etc.
   * If provided, takes highest precedence.
   */
  streamId?: string;
  feedId?: string;
  category?: string;
  label?: string;
  order?: 'newest' | 'oldest';
  continuation?: string;
  newerThan?: number;
  olderThan?: number;
}

/**
 * Response from listing articles
 */
export interface ListArticlesResponse {
  articles: Article[];
  continuation?: string;
}
