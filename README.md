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
```

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
- **Archive**: Stop serving (files retained)
- **Relaunch**: Restore archived site
- **Delete**: Permanently remove archived files

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
- `GET /privacy` - Public analytics privacy explainer

## License

Ashford School Hack Club
