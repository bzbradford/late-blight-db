# Staging deploy

Staging runs on `dev.agweather.cals.wisc.edu` (Ubuntu 24.04, nginx, Postgres 18, Node
24 via `n`) next to the Rails apps, at **https://blightmap.dev.agweather.cals.wisc.edu**.

- The app is one Node process (`build/index.js`) on `127.0.0.1:3100`, run by a systemd
  **user** service owned by `deploy`, so deploys and restarts need no sudo. nginx proxies
  to it; it doesn't use Passenger.
- `deploy/deploy.sh` builds on your machine, then uploads the commit and the build as a
  timestamped release. On the server it installs packages, runs migrations and
  `pnpm seed`, switches `current`, and restarts. It keeps 5 releases.
  `deploy/deploy.sh rollback` goes back one.
- If the new release fails `/health` within 30 s, the script switches back to the one
  before and prints the service log. Migrations are never undone, by either path. Keep
  them additive so an older release still runs against the newer schema.

## One-time setup

Steps 1–4 need someone with sudo on the server (or with DNS access for step 1).

1. **DNS.** Add an A record for `blightmap.dev.agweather.cals.wisc.edu` pointing at
   `35.160.62.117`, the same address as `dev.agweather.cals.wisc.edu`. Certbot needs it
   in step 4. Check it with `getent hosts blightmap.dev.agweather.cals.wisc.edu`.

2. **Database.** Use a password with only letters and digits: it goes into a URL, and
   the deploy script reads `.env` with the shell.

   ```bash
   sudo -u postgres psql -c "create role blightmap login password 'CHANGE_ME'"
   sudo -u postgres createdb -O blightmap blightmap_staging
   ```

3. **Let the service run without a login session.**

   ```bash
   sudo loginctl enable-linger deploy
   ```

4. **nginx and HTTPS** (from a checkout of this repo on the server, or copy the file up):

   ```bash
   sudo cp nginx-blightmap.conf /etc/nginx/sites-available/blightmap
   sudo ln -s /etc/nginx/sites-available/blightmap /etc/nginx/sites-enabled/blightmap
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d blightmap.dev.agweather.cals.wisc.edu --redirect
   ```

5. **Configuration**, as `deploy`: copy `deploy/env.staging.example` to
   `~/blightmap/shared/.env`, fill in the database password and a fresh
   `BETTER_AUTH_SECRET`, then `chmod 600 ~/blightmap/shared/.env`.

6. **First deploy**, from your machine: `deploy/deploy.sh`.

7. **First admin**, on the server. The command prints a generated password. After this,
   invite everyone else from `/admin/users`.

   ```bash
   cd ~/blightmap/current && npx pnpm@10.15.0 create-admin --email you@wisc.edu --name "Your Name"
   ```

   (The server's global pnpm is 9.9; the project pins 10.15 in `packageManager`, and
   `npx` runs that version without touching the global one.)

## Day to day

```bash
deploy/deploy.sh             # deploy the committed HEAD
deploy/deploy.sh rollback    # back to the previous release
ssh -p 216 deploy@dev.agweather.cals.wisc.edu \
  'XDG_RUNTIME_DIR=/run/user/$(id -u) journalctl --user -u blightmap -f'           # logs
```

`DEPLOY_HOST` / `DEPLOY_PORT` point the script at another server with the same layout.
