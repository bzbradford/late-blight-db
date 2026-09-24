#!/usr/bin/env bash
# Deploys the committed HEAD to the staging server, or rolls back to the previous release.
#
#   deploy/deploy.sh             build locally, upload, install, migrate, switch, restart
#   deploy/deploy.sh rollback    point `current` at the previous release and restart
#
# Server layout (under ~deploy/blightmap):
#   releases/<UTC timestamp>/   git archive of the commit + the locally built build/
#   current -> releases/...     what the service runs
#   shared/.env                 configuration and secrets (deploy/env.staging.example)
# The last KEEP releases are kept for rollback. A rollback does not undo migrations.
#
# The build runs here, not on the server: it has ~2 GB of memory to spare, shared with
# the Rails apps. The server only installs packages (the app's runtime dependencies,
# and the tools that migrate, seed, and run create-admin).
set -euo pipefail

SSH_HOST="${DEPLOY_HOST:-deploy@dev.agweather.cals.wisc.edu}"
SSH_PORT="${DEPLOY_PORT:-216}"
APP_DIR="blightmap" # relative to the deploy user's home
KEEP=5

cd "$(dirname "$0")/.."
PNPM_VERSION="$(node -p "require('./package.json').packageManager.split('@')[1]")"
remote() { ssh -p "$SSH_PORT" "$SSH_HOST" "$@"; }

# Shared by deploy and rollback: restart, then wait up to 30 s for /health.
REMOTE_RESTART='
restart_and_check() {
	systemctl --user restart blightmap
	for _ in $(seq 30); do
		if curl -fsS http://127.0.0.1:3100/health >/dev/null 2>&1; then
			echo "Healthy: $(readlink current) ($(cat current/REVISION 2>/dev/null || echo "?"))"
			return 0
		fi
		sleep 1
	done
	echo "Not healthy after 30 s. Recent log:" >&2
	journalctl --user -u blightmap -n 40 --no-pager >&2 || true
	return 1
}
'

if [[ "${1:-}" == "rollback" ]]; then
	remote "bash -s" <<EOF
set -euo pipefail
export XDG_RUNTIME_DIR=/run/user/\$(id -u)
cd ~/$APP_DIR
$REMOTE_RESTART
active=\$(basename "\$(readlink current)")
previous=\$(ls -1 releases | sort | awk -v a="\$active" '\$0 < a' | tail -1)
[[ -n "\$previous" ]] || { echo "No release older than \$active." >&2; exit 1; }
ln -sfn "releases/\$previous" current
echo "Rolling back \$active -> \$previous (migrations are not undone)."
restart_and_check
EOF
	exit 0
fi

if [[ -n "$(git status --porcelain)" ]]; then
	echo "Uncommitted changes. A release is exactly one commit: commit or stash first." >&2
	exit 1
fi

REVISION="$(git rev-parse --short HEAD)"
RELEASE="$(date -u +%Y%m%d%H%M%S)"
echo "Deploying $REVISION as release $RELEASE to $SSH_HOST"

pnpm build

remote "mkdir -p ~/$APP_DIR/releases/$RELEASE ~/$APP_DIR/shared ~/.config/systemd/user"
git archive --format=tar HEAD | remote "tar -x -C ~/$APP_DIR/releases/$RELEASE"
rsync -az --delete -e "ssh -p $SSH_PORT" build/ "$SSH_HOST:$APP_DIR/releases/$RELEASE/build/"

remote "bash -s" <<EOF
set -euo pipefail
export XDG_RUNTIME_DIR=/run/user/\$(id -u)
cd ~/$APP_DIR
$REMOTE_RESTART

[[ -f shared/.env ]] || { echo "Missing ~/$APP_DIR/shared/.env (see deploy/README.md)." >&2; exit 1; }

cd releases/$RELEASE
echo "$REVISION" > REVISION
ln -s ../../shared/.env .env

echo "Installing packages (pnpm $PNPM_VERSION)"
# The deploy user's .bashrc exports NODE_ENV=production, which would skip the dev
# packages that migrate, seed, and create-admin need.
CI=true NODE_ENV=development npx --yes "pnpm@$PNPM_VERSION" install --frozen-lockfile --reporter=append-only

echo "Migrating and seeding reference data"
set -a; . ./.env; set +a
npx --yes "pnpm@$PNPM_VERSION" exec drizzle-kit migrate
npx --yes "pnpm@$PNPM_VERSION" seed

cd ~/$APP_DIR
cp "releases/$RELEASE/deploy/blightmap.service" ~/.config/systemd/user/blightmap.service
systemctl --user daemon-reload
systemctl --user enable blightmap >/dev/null 2>&1

previous=\$(readlink current 2>/dev/null || true)
ln -sfn "releases/$RELEASE" current
if ! restart_and_check; then
	if [[ -n "\$previous" ]]; then
		echo "Switching back to \$previous (migrations are not undone)." >&2
		ln -sfn "\$previous" current
		restart_and_check || true
	fi
	exit 1
fi

# Keep the newest $KEEP releases, never the active one.
active=\$(basename "\$(readlink current)")
ls -1 releases | sort | head -n -$KEEP | while read -r old; do
	[[ "\$old" == "\$active" ]] || rm -rf "releases/\$old"
done
EOF
