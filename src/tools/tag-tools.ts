import { z } from 'zod';

/**
 * Schema for adding/removing labels from articles
 */
export const modifyLabelsSchema = z
  .object({
    articleIds: z.array(z.string()).min(1).describe('Article IDs to modify'),
    labels: z.array(z.string()).min(1).describe('Label names to add/remove'),
  })
  .strict();

/**
 * Schema for renaming a folder or label
 */
export const renameTagSchema = z
  .object({
    oldName: z.string().describe('Current name of the folder/label'),
    newName: z.string().describe('New name for the folder/label'),
  })
  .strict();

/**
 * Schema for deleting a folder or label
 */
export const deleteTagSchema = z
  .object({
    name: z.string().describe('Name of the folder/label to delete'),
  })
  .strict();
