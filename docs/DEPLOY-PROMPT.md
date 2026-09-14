# Deployment prompt — Claude Code on the droplet

Two phases. Phase 1 is a handful of commands you run on your Mac to get the
code and Claude Code onto the droplet. Phase 2 is the brief you paste into
the session running there.

There is no git remote for this repo — it exists only on your Mac — so the
code travels as a **git bundle**: a single file that clones into a real
repository with full history, without involving GitHub or any third party.

---

## Phase 1 — on your Mac

```bash
# 1. Pack the repo. Tracked files only: no node_modules, no build output,
#    and not your local .env (it is gitignored, so a bundle cannot carry it).
git bundle create /tmp/pod.bundle --all

# 2. Send it, and clone from it on the droplet.
scp /tmp/pod.bundle <user>@<droplet-ip>:~/
ssh <user>@<droplet-ip> 'sudo apt-get update -qq && sudo apt-get install -y git curl'
ssh <user>@<droplet-ip> 'git clone ~/pod.bundle ~/pod && cd ~/pod && git log --oneline -1'

# 3. Install Claude Code on the droplet (needs Node 18+).
ssh <user>@<droplet-ip> 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs'
ssh <user>@<droplet-ip> 'sudo npm i -g @anthropic-ai/claude-code'
```

Then `ssh` in, `cd ~/pod`, start `claude`, and paste Phase 2.

**To ship code changes later:** re-run `git bundle create /tmp/pod.bundle --all`,
`scp` it to the same path, then `cd ~/pod && git pull` on the droplet. The
clone's origin is the bundle file, so this works with no remote.

---

## Phase 2 — paste into Claude Code on the droplet

```text
Deploy this repo to production on this DigitalOcean droplet. You are running
on the droplet itself, in ~/pod. You have no prior context on this project,
so read this whole brief before running anything.

## What you are deploying

POD — a cross-border vehicle import and delivery platform, plus an RTMS
fleet-compliance module (SANS 1395) covering vehicles, drivers, trips and
audit reporting. It holds real customer records and real compliance
documents, so treat it as production data from the first command.

A monorepo with two apps and their supporting services:
  - apps/api   NestJS + Prisma, talks to PostgreSQL 16
  - apps/web   Next.js 15 (App Router)
  - Redis      BullMQ scheduled jobs (compliance expiry sweeps, reminders)
  - MinIO      uploaded documents and photos, ClamAV-scanned before serving
  - Meilisearch  search index, rebuildable from Postgres
  - Gotenberg  renders the RTMS audit-pack PDFs
  - Caddy      TLS termination, the only service exposed to the network

## Use the right compose file — the easiest way to ruin this

There are two, and the default is the wrong one.

  docker-compose.prod.yml   ← USE THIS
  docker-compose.yml        ← DEVELOPMENT ONLY. Never deploy it.

The development file starts infrastructure only — no api or web container,
so the application would not run at all — publishes eight ports directly to
the host, uses the dev passwords committed in this repo, and includes a
Keycloak that production does not use. Deploying it would put Postgres,
MinIO and Meilisearch on the public internet with known credentials.

Pass `-f docker-compose.prod.yml` on EVERY compose command. A bare
`docker compose up` silently picks the development file.

## Read this next

DEPLOY.md in the repo root is an accurate walkthrough written against the
production compose file. Follow it. This brief adds what is easy to get
wrong.

## Ask me for these before you start

  - my three hostnames, or this droplet's public IP if I want to use sslip.io
  - an email address for Let's Encrypt

The three hostnames all point at this droplet and each gets its own
certificate:

  WEB_HOSTNAME    the web app          proxied to web:3000
  API_HOSTNAME    the API              proxied to api:4000
  FILES_HOSTNAME  file downloads       proxied to minio:9000

FILES_HOSTNAME is not optional and cannot be merged into the others.
Document, photo and audit-pack links are pre-signed S3 URLs, and an AWS
SigV4 signature covers the host name — the host cannot be rewritten after
signing, so the browser must reach exactly the host the URL was signed for.

## Sequence

1. Check this droplet is big enough. Measured steady state is about 2 GB,
   because ClamAV holds roughly 1 GB of virus signatures. Under 4 GB of RAM,
   stop and tell me. Add 4 GB of swap before building — the Next.js build,
   not the runtime, is the memory peak.

2. Install Docker if absent. Configure ufw to allow only OpenSSH, 80 and
   443. Nothing else needs to be reachable: in the production file only
   Caddy publishes ports, and every other service is reached over the
   compose network by name. Do not lock yourself out — allow OpenSSH first.

3. `cp .env.production.example .env` and fill in EVERY value. Generate each
   secret with `openssl rand -base64 48`. Do not invent passwords by hand,
   do not commit .env, and do not print secrets back to me.

4. For the first run set CADDY_CA_DIRECTIVE to the Let's Encrypt staging URL
   — there is a commented line in the env file. Getting DNS wrong against
   the production endpoint locks the account out for a week.

5. Confirm all three DNS records already resolve to this droplet's public
   IP. Caddy needs them to complete the ACME challenge. If they do not
   resolve, stop and tell me; do not start the stack.

6. `docker compose -f docker-compose.prod.yml up -d --build`
   This takes several minutes. If you are in an SSH session that might drop,
   run it under `tmux` or `nohup` so a disconnect cannot kill the build.

7. `docker compose -f docker-compose.prod.yml --profile tools run --rm seed`
   The seed is idempotent. It cannot be run from outside the droplet because
   Postgres publishes no port; that profile reaches it over the compose
   network.

## Do not report success until all of these pass

  - every container running, none restarting:
    `docker compose -f docker-compose.prod.yml ps`
  - GET /api/health returns ok
  - the web app responds
  - signed in as admin, an audit pack builds AND its PDF actually downloads
    from the files hostname. Test this one explicitly. It is the only check
    that exercises Gotenberg, MinIO and the pre-signed URL host together,
    and it is the part most likely to be misconfigured. A link that 404s
    means FILES_HOSTNAME is wrong.
  - the existing deals board still lists deals

Then remove CADDY_CA_DIRECTIVE, restart Caddy, and confirm the certificates
are real rather than staging.

## What you cannot verify from here — say so explicitly

You are inside the droplet, so a check against localhost proves the
container is up but proves nothing about public DNS, the firewall, or the
certificate chain. Those are the most likely failures.

Finish by printing the exact commands for me to run on my own machine, with
my real hostnames filled in, and tell me you could not verify them yourself:

    curl -sS https://<API_HOSTNAME>/api/health
    curl -sSI https://<WEB_HOSTNAME> | head -1

If either fails from my machine while working from yours, the fault is DNS,
ufw or the certificate — not the application.

## Report back

  - the three URLs
  - the two commands above for me to run
  - that I must still sign in and reset all seven seeded passwords — they
    are all the `seed.ts` fallback on predictable usernames (owner, admin, theo…)
  - how to ship a code change: I re-bundle on my Mac, scp it to ~/pod.bundle,
    and you run `git pull && docker compose -f docker-compose.prod.yml up -d --build`
  - anything you had to change to make it work

## If something fails

Show me the real error and stop. Do not work around it by publishing
container ports, disabling TLS, loosening the firewall, weakening a
password, using `curl -k`, or dropping a service from the stack. If the
image build runs out of memory, say so — the fix is to build the images
elsewhere and push them, not to shrink the stack.
```
