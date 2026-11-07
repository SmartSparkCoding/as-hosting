# AS Hosting

Private club management + public static hosting for Ashford School Hack Club.

## What is AS Hosting?

AS Hosting is a management platform for Ashford School Hack Club with a public static website hosting layer. Club leaders can manage users, deploy static websites from Git repositories, and track hosting usage.

### Features

- **User Management**: Main leader, co-leaders, and ambassadors with role-based permissions
- **Website Hosting**: Deploy static sites from public Git repositories
- **Public URLs**: Hosted sites are publicly accessible at `/<slug>/`
- **Archive/Relaunch**: Stop serving without deleting, restore when needed
- **Expiry**: Optional expiration dates for hosted sites
- **Storage Tracking**: Monitor disk usage across all hosted sites
- **Audit Log**: Track all administrative actions
- **Slack Notifications**: Get notified about deployments and account changes
- **Privacy-first analytics**: Cookie-free pageviews, referrers, devices, countries and engagement per site
- **Live visitors**: See who is on a site in the last five minutes, refreshed while the report is open
- **Slack alerts**: Get pinged about traffic spikes, 404 spikes and sites that suddenly went quiet
- **Releases and rollback**: Every deploy is kept as a release, so a bad push can be undone in one click
- **Site checks**: Each deploy scans the files for broken links, missing metadata and oversized assets
- **Screenshot**: A preview of the site is captured after every deploy
- **Commit statuses**: Deploy results are reported back to the GitHub repository
- **Visibility**: Public, unlisted (noindex, hidden from stats) or shared-password sites
- **Public stats**: A cookie-free club leaderboard of pageviews at `/stats`

## Tech Stack

- **Frontend**: SvelteKit, TypeScript, Tailwind CSS
- **Backend**: SvelteKit (Node.js adapter)
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Argon2id password hashing, secure HTTP-only sessions
- **Deployment**: Git clone + static file serving

## Local Mac Setup

### Prerequisites

- Node.js 18+
- Docker (for PostgreSQL)

### Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd as-hosting

# Install dependencies
npm install

# Start PostgreSQL
docker compose up -d

# Set up environment
cp .env.example .env

# Run database migrations
npm run db:push

# Start development server
npm run dev
```

Open http://localhost:5173 to see the first-run setup.

### Environment Variables

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/as_hosting
SESSION_SECRET=change-this-to-a-random-string
PUBLIC_BASE_URL=http://localhost:5173
NODE_ENV=development
PORT=5173

# Optional: Slack bot for notifications
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=

# Optional: how long analytics rows are kept (7-365, default 90)
ANALYTICS_RETENTION_DAYS=90

# Optional: report deploy results to GitHub as commit statuses (repo:status scope)
GITHUB_STATUS_TOKEN=

# Optional: screenshot each site after deploy (needs a chromium install)
THUMBNAILS_ENABLED=true

# Optional: Slack alerts for spikes, 404s and silent sites
ANALYTICS_ALERTS_ENABLED=true
```

After changing the schema, run `npm run db:push`. For deploy screenshots, run `npx playwright install chromium` once on the server; without it deploys still succeed and the preview card stays empty.

## First-Run Setup

When you first open AS Hosting with an empty database:

1. Enter your name, Slack ID, and password
2. You become the **Main Leader** with full control
3. The club "Ashford School Hack Club" is initialized automatically

## Creating Users

### Co-Leaders (max 2)

1. Go to Settings → People
2. Click "+ Add co-leader"
3. Enter their name and Slack ID
4. They create their own password on first login

### Ambassadors

1. Go to Settings → People
2. Click "+ Add ambassador"
3. Enter name, Slack ID, and permission level:
   - **Viewer**: Can view dashboard and websites
   - **Leader-equivalent**: Can also deploy and manage websites

## Deploying Websites

### Create a Website

1. Click "+ Add website" on the dashboard
2. Enter:
   - **Website name**: Display name
   - **Git repository URL**: Public HTTPS URL (e.g., `https://github.com/user/project`)
   - **Project slug**: URL path (auto-generated from name)
   - **Expiry date**: Optional

3. Click "Deploy website"

### Requirements

- Repository must be publicly accessible
- Must contain `index.html` at root
- No build step required (static files only)

### Public URL

Once deployed, your site is live at:

```
https://your-domain.com/<project-slug>/
```

## Managing Websites

- **Redeploy**: Pull latest changes from Git
- **Rollback**: Serve an earlier release again (see below)
- **Archive**: Stop serving (files retained)
- **Relaunch**: Restore archived site
- **Delete**: Permanently remove archived files

### Releases and rollback

Each successful deploy is published into `data/websites/<id>/releases/<timestamp>/` and `current` is a symlink that is swapped atomically, so there is no window where a site 404s mid-deploy. Deployment history shows the commit, the release name and a **Rollback** button on any earlier successful release. The last five releases are kept; the active one is never pruned.

### Site checks

After the files are validated, `hosting/audit.ts` scans them for the problems that actually bite club sites: missing `<title>`, viewport or description, broken relative links, oversized images and assets, a bloated total size. It produces a score out of 100 and a list of issues, both shown on the deployment row. This is a static file check, not Lighthouse: no headless Chrome and no live URL is involved.

### Screenshot

`hosting/thumbnail.ts` serves the published files from a throwaway local server and screenshots the result with Playwright at 1200x630. The image is stored at `data/websites/<id>/thumb.png` and shown on the site page behind the normal site permission. A missing browser or a broken page never fails a deploy; the screenshot is just skipped and the log says so.

### Commit statuses

When `GITHUB_STATUS_TOKEN` is set, every deploy posts a commit status to `https://api.github.com/repos/<owner>/<repo>/statuses/<sha>` with the context `as-hosting/deploy`, linking to the live site. Non-GitHub remotes and deploys without a token are no-ops, so this works fine without any configuration.

### Visibility

Each site is **Public** (indexable, listed on `/stats`), **Unlisted** (served by link only, `noindex`, excluded from search and stats) or **Password** (a shared password is required before any file, including assets, is served). Unlisted and password sites also stop appearing in the public stats page, and the per-site "count in public stats" toggle can opt a public site out.

## Public stats

`/stats` is a public, no-login page with seven and thirty day pageview and visitor totals across public club sites, a sparkline, and a per-site leaderboard linking to each site. Only site-level totals leave the server: no paths, referrers, countries or visitor detail, and unlisted or password-protected sites never appear.

## Analytics

Every hosted site gets a privacy-first analytics report at **Manage site → Analytics** (`/websites/<id>/analytics`), with 7, 30 and 90 day ranges and a CSV export.

### What is collected

| Area | Detail |
| --- | --- |
| Views | Pageviews per path, counted **server-side** so they still work with JavaScript disabled |
| Visitors | Unique visitors per day, derived from a daily-salted hash (no cookies) |
| Sessions | Visits and bounce rate, using a 30-minute inactivity window |
| Acquisition | Referrer **hostname** only, split into direct / search / social / referral, plus `utm_source` / `utm_medium` / `utm_campaign` |
| Audience | Device type, browser + major version, OS, country (from `CF-IPCountry` when present), browser language |
| Behaviour | Visible time on page, scroll depth, viewport, outbound link hosts, downloads, 404s, and a day × hour visit heatmap |

### What is never stored

No cookies, no `localStorage`, no raw IP addresses, no raw user-agent strings, no full URLs or query strings, and no cross-site identifiers. The visitor hash is `sha256(dailySalt + "|" + ip + "|" + userAgent)` truncated to 16 hex characters; the salt is generated in memory and rotated at UTC midnight, so hashes cannot be reversed or linked across days.

Requests are ignored entirely when the browser sends `DNT: 1` or `Sec-GPC: 1`, and requests from bots, link previews and prefetches are filtered out. The public explainer lives at `/privacy`.

### How it works

1. `GET /<slug>/<path>` records a `pageview`, `download` (known file extension) or `not_found` row, fire-and-forget, so serving is never blocked.
2. A `<script defer src="/__as-hosting/analytics.js">` tag is injected into served HTML (before `</body>`). It reports `engagement` (duration, scroll depth, viewport, language) and `outbound` (target host) to `POST /api/analytics`, using `navigator.sendBeacon` and no credentials.
3. `/api/analytics` only accepts same-origin JSON under 2 KB, validates the site and its `ACTIVE` status, clamps every numeric field, and rate limits to 40 events per minute per source IP.

### Live visitors

The report polls `/websites/<id>/analytics/live` every 20 seconds for a five minute window: distinct visitor hashes, pageviews and the busiest paths. This is the one place where the daily-salted hash is compared across a boundary, and it is safe because the salt only rotates at UTC midnight, so a five minute window never spans two salts. In-memory only, nothing is stored.

### Slack alerts

A background check runs every ten minutes for ACTIVE sites and DMs the site creator (when Slack notifications are on):

- **Traffic spike**: at least 20 pageviews in the last hour and four times the prior week's hourly average.
- **404 spike**: at least 10 missing pages in the last hour and three times the baseline, because something is linked wrong.
- **Traffic drop**: no pageviews in 24 hours after at least 10 the week before, which usually means the last deploy broke the site.

Each alert has a cooldown (3 hours for spikes and 404s, 24 hours for drops) so a noisy site does not spam anyone. Set `ANALYTICS_ALERTS_ENABLED=false` to turn them off.

### Retention and maintenance

Rows older than `ANALYTICS_RETENTION_DAYS` (default 90, min 7, max 365) are pruned on boot and every 6 hours. The table, indexes and cascade delete are part of the Drizzle schema, so `npm run db:push` is all that is needed — there are no migration files in this repo.

### Caveats

- Hosted HTML is sent with `Cache-Control: public, max-age=60` (root `max-age=300`), so repeat views inside that window come from the browser cache and are not counted.
- Country data needs a proxy that sets `CF-IPCountry` (Cloudflare). Other deployments simply get no country rows.
- Analytics requires `VIEW_WEBSITE`; anyone who can see a site can see its numbers.
- The comments in `src/lib/server/analytics/collect.ts` and `analytics.service.ts` document every field, so extend there rather than storing new raw request data.

## Production Deployment

### Debian Server Setup

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt-get install -y postgresql

# Create database
sudo -u postgres createdb as_hosting

# Clone and build
git clone <repo-url>
cd as-hosting
npm install
npm run build

# Set up environment
cp .env.example .env
# Edit .env with production values

# Run migrations
npm run db:push

# Start with PM2
pm2 start build/index.js --name as-hosting
pm2 save
```

### Reverse Proxy (Caddy)

```
as-hosting.dino.icu {
    reverse_proxy localhost:5173
}
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name as-hosting.dino.icu;

    ssl_certificate /etc/letsencrypt/live/as-hosting.dino.icu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/as-hosting.dino.icu/privkey.pem;

    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### DNS Configuration

Point your domain to the server:

```
as-hosting.dino.icu.  IN  A      <server-ip>
as-hosting.dino.icu.  IN  AAAA   <server-ipv6>
```

## Backups

### Database

```bash
pg_dump -U postgres as_hosting > backup_$(date +%Y%m%d).sql
```

### Hosting Storage

```bash
tar -czf hosting_backup_$(date +%Y%m%d).tar.gz data/websites/
```

### Automated Backups

Add to crontab:

```bash
# Daily at 2am
0 2 * * * cd /path/to/as-hosting && pg_dump -U postgres as_hosting | gzip > /backups/db_$(date +\%Y\%m\%d).sql.gz
0 2 * * * tar -czf /backups/hosting_$(date +\%Y\%m\%d).tar.gz /path/to/as-hosting/data/websites/
```

## Security

- Passwords hashed with Argon2id
- HTTP-only, Secure, SameSite cookies
- Rate limiting on login attempts
- Path traversal prevention for hosted files
- CSRF protection
- No secrets exposed to hosted websites
- Audit logging for all admin actions

## API Endpoints

- `GET /health` - Health check
- `GET /health/db` - Database health check
- `POST /api/auth/logout` - Logout
- `POST /api/settings/password` - Change password
- `POST /api/analytics` - Hosted-site engagement/outbound beacon (same-origin JSON, rate limited)
- `GET /__as-hosting/analytics.js` - Analytics beacon script injected into hosted HTML
- `GET /websites/<id>/analytics/export` - CSV export of a site's analytics
- `GET /websites/<id>/analytics/live` - Live visitor snapshot for the last five minutes
- `GET /websites/<id>/thumbnail` - Deploy screenshot (requires `VIEW_WEBSITE`)
- `POST /<slug>/` - Password submission for password-protected sites (the only accepted write to the serve route)
- `GET /stats` - Public aggregate pageviews across public sites
- `GET /privacy` - Public analytics privacy explainer

## License

Ashford School Hack Club
