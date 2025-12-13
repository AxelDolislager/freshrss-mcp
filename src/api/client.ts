import type { FreshRSSConfig } from '../types/index.js';
import { HttpClient } from './http-client.js';
import { ArticleService } from './article-service.js';
import { FeedService } from './feed-service.js';
import { TagService } from './tag-service.js';
import { StatsService } from './stats-service.js';
import { FeverService } from './fever-service.js';

export { FreshRSSError, AuthenticationError, NotFoundError } from './errors.js';

/**
 * Main FreshRSS API client
 */
export class FreshRSSClient {
  private readonly http: HttpClient;

  public readonly articles: ArticleService;
  public readonly feeds: FeedService;
  public readonly tags: TagService;
  public readonly stats: StatsService;
  public readonly fever: FeverService;

  constructor(config: FreshRSSConfig) {
    this.http = new HttpClient(config);
    this.articles = new ArticleService(this.http);
    this.feeds = new FeedService(this.http);
    this.tags = new TagService(this.http);
    this.stats = new StatsService(this.http);
    this.fever = new FeverService(this.http);
  }

  /**
   * Authenticate with FreshRSS
   */
  async authenticate(): Promise<void> {
    await this.http.authenticate();
  }
}
