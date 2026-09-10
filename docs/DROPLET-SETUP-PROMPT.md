# Brief: create the DigitalOcean Droplet for POD

Hand this whole file to Claude Cowork. It assumes no knowledge of the project.

---

## What you are doing

You are creating **one Ubuntu server** on DigitalOcean, through the
DigitalOcean web console in the browser. That is the entire job.

You are **not** installing anything, not deploying code, and not configuring
the application. Someone else does all of that afterwards over SSH. Your
output is a working server and its IP address.

The software that will run on it is POD — a vehicle import, delivery and
RTMS road-safety compliance system for a Southern African haulage operator.
You do not need to understand it. It matters only twice: it decides the size
of the server, and it means the server will eventually hold real business
data, so the SSH key below must be added correctly or nobody can reach it.

## Before you start

The user is already signed in to DigitalOcean in the browser. If you find you
are not signed in, stop and ask — do not create an account.

**This costs real money: about US$24 per month, billed to the user's existing
DigitalOcean account.** Read the whole brief, get to the final review screen,
and then *stop and show the user what you are about to create and its price*
before clicking the button that creates it.

## The exact specification

Go to **Create → Droplets** and set:

| Setting | Value | Why it matters |
|---|---|---|
| Region | **London (LON1)** | Lowest latency to Southern Africa of DigitalOcean's regions. Amsterdam (AMS3) is an equally good second choice. There is no African region. |
| OS image | **Ubuntu 24.04 (LTS) x64** | The deployment steps that follow assume Ubuntu LTS and `apt`. |
| Droplet type | **Basic** | |
| CPU option | **Regular (Disk type: SSD)** | Premium Intel/AMD also work; they cost more for no benefit here. |
| Size | **4 GB RAM / 2 vCPUs / 80 GB SSD** — about **$24/mo** | Do not go smaller. This is the one number that must not be economised. See below. |
| Authentication | **SSH Key** (not password) | |
| Hostname | `pod-prod` | |

### Do not choose a smaller size

The $6 and $12 Droplets will not run this stack. It includes ClamAV, a virus
scanner that holds roughly **1 GB of signature data resident in memory** at
all times, plus PostgreSQL, Redis, MinIO, Meilisearch, a PDF renderer and two
Node services. Measured steady state is about 2 GB, and the container build
peaks well above that.

If you pick 2 GB to save money, the build will be killed by the kernel
out-of-memory reaper part-way through and the failure will look like an
unrelated bug. 4 GB is the floor.

Everything else on the create page can be left at its default. **Do not**
enable backups, monitoring add-ons, or a VPC that is not the default — none
are needed and some cost extra.

## The SSH key — get this exactly right

Under **Authentication**, choose **SSH Key**, then **Add SSH Key**, and paste
this public key. It is a public key: it is safe to paste and safe to store.

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOYLez0LWQ910MPDBldcdG5FqxZmjF2FnKums8nAsDfS nedico-app
```

Name it `nedico-app`.

If a key named `nedico-app` already exists on the account, select the
existing one rather than adding a duplicate — but first confirm its
fingerprint matches:

```
SHA256:lq+HHERXhU+KwOnqEOJqNsAOVPsppZTMRIhC3huIQCg
```

**If you skip this or paste it wrong, the server is unreachable and has to be
destroyed and recreated.** Password authentication is not an acceptable
substitute; the deployment that follows assumes key-based SSH as `root`.

## Do not create anything else

Specifically, do **not** create:

- a **Managed Database** — PostgreSQL runs in a container on this Droplet
- a **Load Balancer** — a single server is the intended design
- a **Cloud Firewall** — the firewall is configured on the machine itself in
  the next phase; adding a DigitalOcean firewall too can lock everyone out
- **Spaces / object storage** — MinIO runs in a container
- a **domain or DNS records** — the deployment uses `sslip.io`, which needs
  nothing bought and nothing configured

Each of these costs money and each would have to be undone.

## When it is running

Wait until the Droplet shows as **Active** and has been allocated a public
IPv4 address. Then report back with:

1. **The public IPv4 address** — this is the important one
2. The Droplet name and region
3. Confirmation that the `nedico-app` SSH key was attached at creation
4. The monthly price shown on the final screen

Do not attempt to SSH in, run commands on it, or install anything. Hand back
the IP and stop there.

## If something goes wrong

- **Ran out of credit / payment declined** → stop and tell the user. Do not
  try a smaller size to get under a limit.
- **4 GB unavailable in London** → try Amsterdam (AMS3), then Frankfurt
  (FRA1). Report which region you used.
- **Unsure at any point** → stop and ask. A wrong Droplet costs money to
  leave running and time to unpick; a question costs nothing.

---

## What happens next (context only — not your job)

Once the IP comes back, the deployment is:

1. `root` over SSH → create a `pod` user, install Docker, add 4 GB of swap,
   enable `ufw` with only OpenSSH, 80 and 443 open
2. Clone the private repo, fill in `.env` from `.env.production.example`
3. `docker compose -f docker-compose.prod.yml up -d --build` — the API
   container runs `prisma migrate deploy` on start, so the schema builds
   itself
4. Seed the RTMS toolkit lookups, then reset every seeded password
5. Reach it at `pod.<the-ip>.sslip.io` over real HTTPS, with certificates
   issued automatically by Let's Encrypt

None of that is in scope for this brief.
