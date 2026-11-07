#!/usr/bin/env bash
# Pull, install, build, restart AS Hosting, then report which environment
# variables the running app actually sees. Key names and set/empty only, so it
# is safe to run in a shared terminal or paste into a chat.
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SERVICE="${SERVICE:-as-hosting}"
PORT="${PORT:-5173}"

REQUIRED=(DATABASE_URL SESSION_SECRET PUBLIC_BASE_URL)
OPTIONAL=(SLACK_BOT_TOKEN SLACK_SIGNING_SECRET GITHUB_STATUS_TOKEN ANALYTICS_RETENTION_DAYS THUMBNAILS_ENABLED ANALYTICS_ALERTS_ENABLED)

cd "$APP_DIR"

echo "==> Pulling $(git rev-parse --abbrev-ref HEAD) in $APP_DIR"
before=$(git rev-parse --short HEAD)
git pull --ff-only
after=$(git rev-parse --short HEAD)
if [ "$before" = "$after" ]; then
	echo "    already at $after"
else
	echo "    $before -> $after"
fi

echo "==> Installing dependencies"
npm install --no-audit --no-fund 2>&1 | tail -3

echo "==> Building"
npm run build 2>&1 | grep -vE "^\s*(- |\[PLUGIN_TIMINGS\]|Those rows|Measured inside|Not measurable|See https://rolldown)" | tail -5

RUNTIME_ENV=""
if command -v systemctl >/dev/null 2>&1; then
	echo "==> Restarting $SERVICE"
	if systemctl restart "$SERVICE"; then
		sleep 2
		pid=$(systemctl show -p MainPID --value "$SERVICE" || true)
		echo "    $(systemctl is-active "$SERVICE" 2>/dev/null || echo unknown) (pid ${pid:-none})"
		if [ -n "${pid:-}" ] && [ "${pid:-}" != "0" ]; then
			RUNTIME_ENV="/proc/$pid/environ"
		fi
	else
		echo "    !! restart failed, check SERVICE=$SERVICE and systemctl status $SERVICE"
	fi
else
	echo "==> systemctl not found, skipping restart"
fi

report() {
	local label="$1" source="$2" key line val state
	echo "  $label"
	for key in "${REQUIRED[@]}" "${OPTIONAL[@]}"; do
		line=$(grep -a -m1 -E "^${key}=" "$source" 2>/dev/null || true)
		if [ -z "$line" ]; then
			state="missing"
		elif [ -n "${line#*=}" ]; then
			state="set"
		else
			state="empty"
		fi
		printf '    %-26s %s\n' "$key" "$state"
	done
}

echo "==> Environment"
if [ -f .env ]; then
	report ".env (used by vite at build time)" .env
else
	echo "  no .env in $APP_DIR"
fi

if [ -n "$RUNTIME_ENV" ] && [ -r "$RUNTIME_ENV" ]; then
	tr '\0' '\n' < "$RUNTIME_ENV" > /tmp/as-hosting-env.txt
	report "running process (what the app actually reads)" /tmp/as-hosting-env.txt
	rm -f /tmp/as-hosting-env.txt

	for key in "${REQUIRED[@]}"; do
		if ! tr '\0' '\n' < "$RUNTIME_ENV" | grep -qE "^${key}=.+"; then
			echo "  !! $key is not set in the running process, the app will misbehave"
		fi
	done
	if ! tr '\0' '\n' < "$RUNTIME_ENV" | grep -qE '^NODE_ENV=production'; then
		echo "  !! NODE_ENV=production is missing at runtime, so cookies are not marked Secure"
	fi
elif [ -n "$RUNTIME_ENV" ]; then
	echo "  cannot read $RUNTIME_ENV, rerun with sudo to check the live process"
fi

if command -v node >/dev/null 2>&1; then
	if node -e "require('playwright').chromium.executablePath()" >/dev/null 2>&1; then
		echo "==> Playwright chromium present, deploy screenshots will run"
	else
		echo "==> Playwright chromium missing, run: npx playwright install chromium"
	fi
fi

echo "==> Health"
for path in /health /health/db; do
	if code=$(curl -fsS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}${path}" 2>/dev/null); then
		echo "    ${path} ${code}"
	else
		echo "    ${path} no response on port ${PORT}"
	fi
done

echo "==> Done"
