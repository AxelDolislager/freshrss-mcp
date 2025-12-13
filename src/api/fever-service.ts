import type { HttpClient } from './http-client.js';

interface FeverFaviconsResponse {
  favicons: { id: number; data: string }[];
}

interface FeverIdsResponse {
  unread_item_ids?: string;
  saved_item_ids?: string;
}

export interface Favicon {
  feedId: number;
  dataUri: string;
}

/**
 * Service for Fever-compatible API endpoints.
 */
export class FeverService {
  constructor(private readonly http: HttpClient) {}

  async listFavicons(): Promise<Favicon[]> {
    const data = await this.http.postFever<FeverFaviconsResponse>({ favicons: '1' });
    return data.favicons.map((f) => ({ feedId: f.id, dataUri: f.data }));
  }

  async listUnreadIds(): Promise<string[]> {
    const data = await this.http.postFever<FeverIdsResponse>({ unread_item_ids: '1' });
    const ids = data.unread_item_ids ?? '';
    return ids === '' ? [] : ids.split(',').filter((s) => s !== '');
  }

  async listSavedIds(): Promise<string[]> {
    const data = await this.http.postFever<FeverIdsResponse>({ saved_item_ids: '1' });
    const ids = data.saved_item_ids ?? '';
    return ids === '' ? [] : ids.split(',').filter((s) => s !== '');
  }
}
