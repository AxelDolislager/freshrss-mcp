/**
 * Represents a label/tag for organizing articles
 */
export interface Label {
  id: string;
  name: string;
  type: 'tag';
  unreadCount?: number;
}
