# FreshRSS MCP Server

Model Context Protocol (MCP) server for interacting with a FreshRSS instance.

## Features

- Articles: list, filter, read/unread, star/unstar, mark‑all‑read
- Feeds: list, subscribe, unsubscribe, rename, move between folders
- Folders & labels: list, create via tagging, rename, delete
- OPML: export/import subscriptions
- Quick‑add: add a site URL and let FreshRSS discover the feed
- Fever helpers: favicons, unread/starred ID lists

## Requirements

- Node.js 18+
- FreshRSS with Google Reader API enabled
- FreshRSS API password (Settings → Profile → API Management)

## Installation

```bash
npm install -g @equaldepth/freshrss-mcp-server
```

## Usage

Example `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "freshrss": {
      "command": "freshrss-mcp",
      "args": [],
      "env": {
        "FRESHRSS_URL": "https://your-freshrss-instance.com",
        "FRESHRSS_USERNAME": "your-username",
        "FRESHRSS_API_PASSWORD": "your-api-password"
      }
    }
  }
}
```

## Tools

Articles:
- `list_articles`
- `mark_as_read`
- `mark_as_unread`
- `star_articles`
- `unstar_articles`
- `mark_all_as_read`

Feeds:
- `list_feeds`
- `subscribe`
- `unsubscribe`
- `edit_feed`
- `export_opml`
- `import_opml`
- `quickadd_feed`

Folders & labels:
- `list_folders`
- `list_labels`
- `add_labels`
- `remove_labels`
- `rename_folder`
- `rename_label`
- `delete_folder`
- `delete_label`

Stats:
- `get_stats`
- `get_user_info`

Favicons & sync (Fever API):
- `list_favicons`
- `get_feed_favicon`
- `list_unread_article_ids`
- `list_starred_article_ids`

## Examples

```json
{ "name": "list_articles", "arguments": { "filter": "unread", "order": "newest", "count": 10 } }
{ "name": "list_articles", "arguments": { "state": "starred", "count": 5 } }
{ "name": "subscribe", "arguments": { "url": "https://example.com/feed.xml", "title": "Example", "category": "Tech" } }
{ "name": "edit_feed", "arguments": { "feedId": "1", "category": "Tech" } }
{ "name": "export_opml", "arguments": {} }
```

Tool inputs are strictly validated; unknown fields error.

## Development

```bash
npm run dev
npm run lint
npm run typecheck
npm run format
npm run build
```

## License

MIT
