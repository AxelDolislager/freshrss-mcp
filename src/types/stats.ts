/**
 * Unread count for a specific stream
 */
export interface UnreadCount {
  id: string;
  count: number;
  newestItemTimestamp?: string;
}

/**
 * Overall statistics
 */
export interface Statistics {
  totalUnread: number;
  feeds: UnreadCount[];
  categories: UnreadCount[];
  labels: UnreadCount[];
}

/**
 * User information
 */
export interface UserInfo {
  userId: string;
  userName: string;
  userProfileId: string;
  userEmail?: string;
}
