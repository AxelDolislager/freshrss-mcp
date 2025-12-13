import { z } from 'zod';

/**
 * Schema for listing articles
 */
export const listArticlesSchema = z
  .object({
    count: z.number().min(1).max(100).optional().describe('Number of articles to return (1-100)'),
    filter: z.enum(['all', 'read', 'unread']).optional().describe('Filter by read status'),
    starred: z.boolean().optional().describe('Only return starred articles'),
    state: z
      .enum(['reading-list', 'starred', 'read', 'unread'])
      .optional()
      .describe('Predefined stream/state to list. Overrides other selectors if set.'),
    streamId: z
      .string()
      .optional()
      .describe(
        'Full greader stream ID (e.g., feed/123, user/-/label/FolderName, user/-/state/com.google/reading-list). Overrides all other selectors.'
      ),
    feedId: z.string().optional().describe('Filter by feed ID'),
    category: z.string().optional().describe('Filter by category/folder name'),
    label: z.string().optional().describe('Filter by label name'),
    order: z.enum(['newest', 'oldest']).optional().describe('Sort order'),
    continuation: z.string().optional().describe('Continuation token for pagination'),
  })
  .strict();

/**
 * Schema for marking articles as read/unread
 */
export const markArticlesSchema = z
  .object({
    articleIds: z.array(z.string()).min(1).describe('Article IDs to mark'),
  })
  .strict();

/**
 * Schema for starring/unstarring articles
 */
export const starArticlesSchema = z
  .object({
    articleIds: z.array(z.string()).min(1).describe('Article IDs to star/unstar'),
  })
  .strict();

/**
 * Schema for marking all as read
 */
export const markAllReadSchema = z
  .object({
    streamId: z
      .string()
      .describe(
        'Stream ID (feed/123, user/-/label/FolderName, or user/-/state/com.google/reading-list)'
      ),
    olderThan: z.number().optional().describe('Only mark articles older than this Unix timestamp'),
  })
  .strict();
