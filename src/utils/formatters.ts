/**
 * Format an article for display
 */
export function formatArticle(article: {
  title: string;
  url: string;
  feedTitle?: string;
  author?: string;
  isRead: boolean;
  isStarred: boolean;
  published: number;
  content: string;
}): string {
  const status = [article.isRead ? '✓ Read' : '○ Unread', article.isStarred ? '★' : '']
    .filter((s) => s !== '')
    .join(' ');

  const date = new Date(article.published / 1000).toLocaleString();

  return [
    `## ${article.title}`,
    `**Status:** ${status}`,
    article.feedTitle !== undefined && article.feedTitle !== ''
      ? `**Feed:** ${article.feedTitle}`
      : '',
    article.author !== undefined && article.author !== '' ? `**Author:** ${article.author}` : '',
    `**Published:** ${date}`,
    `**URL:** ${article.url}`,
    '',
    article.content,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Format a list of articles as a summary
 */
export function formatArticleList(
  articles: {
    id: string;
    title: string;
    feedTitle?: string;
    isRead: boolean;
    isStarred: boolean;
    published: number;
  }[]
): string {
  if (articles.length === 0) {
    return 'No articles found.';
  }

  return articles
    .map((a) => {
      const status = a.isRead ? '✓' : '○';
      const star = a.isStarred ? '★ ' : '';
      const date = new Date(a.published / 1000).toLocaleDateString();
      const feed = a.feedTitle !== undefined && a.feedTitle !== '' ? ` [${a.feedTitle}]` : '';
      return `${status} ${star}${a.title}${feed} (${date}) - ID: ${a.id}`;
    })
    .join('\n');
}
