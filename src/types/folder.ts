/**
 * Represents a folder/category for organizing feeds
 */
export interface Folder {
  id: string;
  name: string;
  type: 'folder';
  unreadCount?: number;
}
