/**
 * Represents an RSS feed subscription
 */
export interface Feed {
  id: string;
  title: string;
  url: string;
  websiteUrl?: string;
  categoryId: string;
  categoryName: string;
  iconUrl?: string;
  unreadCount?: number;
}

/**
 * Options for subscribing to a feed
 */
export interface SubscribeOptions {
  url: string;
  title?: string;
  category?: string;
}

/**
 * Options for editing a feed
 */
export interface EditFeedOptions {
  feedId: string;
  title?: string;
  category?: string;
}
