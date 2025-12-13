import { z } from 'zod';

/**
 * Schema for subscribing to a feed
 */
export const subscribeSchema = z
  .object({
    url: z.string().url().describe('URL of the RSS/Atom feed'),
    title: z.string().optional().describe('Custom title for the feed'),
    category: z.string().optional().describe('Category/folder to add the feed to'),
  })
  .strict();

/**
 * Schema for unsubscribing from a feed
 */
export const unsubscribeSchema = z
  .object({
    feedId: z.string().describe('ID of the feed to unsubscribe from'),
  })
  .strict();

/**
 * Schema for editing a feed
 */
export const editFeedSchema = z
  .object({
    feedId: z.string().describe('ID of the feed to edit'),
    title: z.string().optional().describe('New title for the feed'),
    category: z.string().optional().describe('New category/folder for the feed'),
  })
  .strict();

export const exportOpmlSchema = z.object({}).strict();

export const importOpmlSchema = z
  .object({
    opml: z.string().min(1).describe('OPML XML content to import'),
  })
  .strict();

export const quickaddSchema = z
  .object({
    url: z.string().url().describe('Website or feed URL to quick-add'),
  })
  .strict();
