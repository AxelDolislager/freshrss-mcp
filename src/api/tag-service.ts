import type { HttpClient } from './http-client.js';
import type { Folder, Label } from '../types/index.js';

interface TagItem {
  id: string;
  type?: string;
  unread_count?: number;
}

interface TagResponse {
  tags: TagItem[];
}

/**
 * Service for managing folders and labels
 */
export class TagService {
  constructor(private readonly http: HttpClient) {}

  /**
   * List all folders and labels
   */
  async list(): Promise<{ folders: Folder[]; labels: Label[] }> {
    const data = await this.http.get<TagResponse>('/reader/api/0/tag/list');

    const folders: Folder[] = [];
    const labels: Label[] = [];

    for (const tag of data.tags) {
      if (tag.id.includes('/state/')) continue;

      const name = tag.id.replace('user/-/label/', '');

      if (tag.type === 'folder') {
        folders.push({
          id: tag.id,
          name,
          type: 'folder',
          unreadCount: tag.unread_count,
        });
      } else if (tag.type === 'tag') {
        labels.push({
          id: tag.id,
          name,
          type: 'tag',
          unreadCount: tag.unread_count,
        });
      }
    }

    return { folders, labels };
  }

  /**
   * Add labels to articles
   */
  async addToArticles(articleIds: string[], labelNames: string[]): Promise<void> {
    const labelTags = labelNames.map((l) => `user/-/label/${l}`);
    await this.http.post('/reader/api/0/edit-tag', {
      i: articleIds,
      a: labelTags,
    });
  }

  /**
   * Remove labels from articles
   */
  async removeFromArticles(articleIds: string[], labelNames: string[]): Promise<void> {
    const labelTags = labelNames.map((l) => `user/-/label/${l}`);
    await this.http.post('/reader/api/0/edit-tag', {
      i: articleIds,
      r: labelTags,
    });
  }

  /**
   * Rename a folder or label
   */
  async rename(oldName: string, newName: string): Promise<void> {
    await this.http.post('/reader/api/0/rename-tag', {
      s: `user/-/label/${oldName}`,
      dest: `user/-/label/${newName}`,
    });
  }

  /**
   * Delete a folder or label
   */
  async delete(name: string): Promise<void> {
    await this.http.post('/reader/api/0/disable-tag', {
      s: `user/-/label/${name}`,
    });
  }
}
