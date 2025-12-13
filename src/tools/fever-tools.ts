import { z } from 'zod';

export const listFaviconsSchema = z.object({}).strict();

export const getFaviconSchema = z
  .object({
    feedId: z.string().describe('Feed ID to get favicon for'),
  })
  .strict();

export const listIdsSchema = z.object({}).strict();
