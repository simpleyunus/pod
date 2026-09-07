# Deployment prompt

Paste the block below into a fresh Claude Code session running **on your
Mac, in this repo**. It drives the droplet over SSH and assumes no prior
context.

Why from the Mac rather than on the droplet:

- This repo has **no git remote**. It exists only on this machine, so the
  code has to be pushed from here — there is nothing to `git clone`.
- Verification then happens from outside the droplet, over the real public
  hostnames. Testing from `localhost` on the droplet cannot catch a DNS,
  firewall or certificate mistake; testing from here does.

---

```text
Deploy this repo to a DigitalOcean droplet over SSH. You are running on my
Mac, inside the repo. You have no prior context on it, so read this whole
brief before running anything.

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
production compose file. Follow it. This brief adds the SSH specifics and
the things that are easy to get wrong.

## Ask me for these before you start

  - the SSH target for the droplet (user@host, or an ssh config alias)
  - my three hostnames, or the droplet's public IP if I want to use sslip.io
  - an email address for Let's Encrypt

Confirm SSH works before anything else: `ssh <target> 'echo ok && free -g'`.
If you cannot connect, stop and tell me.

The three hostnames all point at the droplet and each gets its own
certificate:

  WEB_HOSTNAME    the web app          proxied to web:3000
  API_HOSTNAME    the API              proxied to api:4000
  FILES_HOSTNAME  file downloads       proxied to minio:9000

FILES_HOSTNAME is not optional and cannot be merged into the others.
Document, photo and audit-pack links are pre-signed S3 URLs, and an AWS
SigV4 signature covers the host name — the host cannot be rewritten after
signing, so the browser must reach exactly the host the URL was signed for.

## Sequence

All droplet commands go over SSH. Nothing in this sequence runs the app on
my Mac.

1. Check the droplet is big enough. Measured steady state is about 2 GB,
   because ClamAV holds roughly 1 GB of virus signatures. Under 4 GB of RAM,
   stop and tell me. Add 4 GB of swap before building — the Next.js build,
   not the runtime, is the memory peak.

2. Install Docker if absent. Configure ufw to allow only OpenSSH, 80 and
   443. Nothing else needs to be reachable: in the production file only
   Caddy publishes ports, and every other service is reached over the
   compose network by name.

3. Ship the code. There is no git remote, so do not try to clone. Send
   exactly the tracked files, which excludes node_modules, build output and
   my local .env:

     ssh <target> 'mkdir -p ~/pod'
     git archive --format=tar HEAD | ssh <target> 'tar -x -C ~/pod'

   Verify the transfer before continuing: docker-compose.prod.yml,
   infra/Caddyfile, apps/api and apps/web must all be present, and .env
   must NOT be.

4. Create .env ON THE DROPLET, not here — secrets should not land on my
   Mac's disk. Copy .env.production.example to .env over SSH and fill in
   every value, generating each secret on the droplet with
   `openssl rand -base64 48`. Do not print any secret back to me.

5. For the first run set CADDY_CA_DIRECTIVE to the Let's Encrypt staging
   URL — there is a commented line in the env file. Getting DNS wrong
   against the production endpoint locks the account out for a week.

6. Confirm all three DNS records already resolve to the droplet's IP, using
   `dig` from my Mac so you are testing real public DNS. If they do not
   resolve, stop and tell me; do not start the stack.

7. Build and start. The build takes several minutes and a dropped SSH
   connection would kill it, so run it detached and poll rather than
   holding the connection open:

     ssh <target> 'cd ~/pod && nohup docker compose -f docker-compose.prod.yml \
       up -d --build > deploy.log 2>&1 &'

   Then poll deploy.log until it finishes, and show me the tail if it fails.

8. Seed:

     ssh <target> 'cd ~/pod && docker compose -f docker-compose.prod.yml \
       --profile tools run --rm seed'

   The seed is idempotent. It cannot be run from my Mac because Postgres
   publishes no port; that profile reaches it over the compose network.

## Do not report success until all of these pass

Run every check FROM MY MAC against the public hostnames, not over SSH
against localhost. Testing from inside the droplet cannot catch a DNS,
firewall or certificate fault, which are the most likely failures here.

  - every container running, none restarting (over SSH:
    `docker compose -f docker-compose.prod.yml ps`)
  - https://<API_HOSTNAME>/api/health returns ok, from my Mac
  - the web app loads at https://<WEB_HOSTNAME>, from my Mac
  - signed in as admin, an audit pack builds AND its PDF actually downloads
    from the files hostname. Test this one explicitly. It is the only check
    that exercises Gotenberg, MinIO and the pre-signed URL host together,
    and it is the part most likely to be misconfigured. A link that 404s
    means FILES_HOSTNAME is wrong.
  - the existing deals board still lists deals
  - the certificate chain is valid from my Mac (`curl` without -k)

Then remove CADDY_CA_DIRECTIVE, restart Caddy, and confirm the certificates
are real rather than staging — a staging cert will fail a plain curl.

## Report back

  - the three URLs
  - that I must still sign in and reset all seven seeded passwords — they
    are all `ChangeMe123!` on predictable usernames (owner, admin, theo…)
  - how to redeploy after I change code here (re-run the git archive step,
    then `up -d --build`)
  - anything you had to change to make it work

## If something fails

Show me the real error and stop. Do not work around it by publishing
container ports, disabling TLS, loosening the firewall, weakening a
password, using `curl -k`, or dropping a service from the stack. If the
image build runs out of memory on the droplet, say so — the fix is to build
the images on my Mac and push them to a registry, not to shrink the stack.
```

---

## Running it on the droplet instead

Only viable once this repo has a git remote to clone from. The sequence is
the same, minus the `git archive` step, but the verification is weaker:
checks would run against `localhost` on the droplet and would not exercise
public DNS, the firewall or the certificates.
