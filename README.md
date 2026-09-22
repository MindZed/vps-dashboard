# MindZed Hub ⚡
> **Neon-Style PostgreSQL Database Provisioner, Oracle VPS Vitals & Infrastructure Watchdog**

MindZed Hub is an open-source, installable PWA dashboard built with **Next.js (App Router)**, **Framer Motion**, and **Apache ECharts**, paired with an ultra-lightweight Go background daemon (`mindzed-agent`) compiled for **Oracle Linux Ampere (ARM64)** behind a Cloudflare Tunnel.

---

## 🏛 System Topology & Architecture

```
                      ┌────────────────────────────────────────┐
                      │    MindZed Hub PWA (Next.js 14+)       │
                      │  • Apache ECharts Dials & Stream Area  │
                      │  • Neon-Style DB Provisioner           │
                      │  • Framer Motion Modals & Drawers      │
                      │  • Uptime Kuma Watchdog View           │
                      │  • Dual-Mode: Live VPS + Mock Fallback │
                      └──────────────────┬─────────────────────┘
                                         │ HTTPS + X-Agent-Secret
                                         ▼
                      ┌────────────────────────────────────────┐
                      │ Cloudflare Tunnel (agent.mindzed.tech) │
                      └──────────────────┬─────────────────────┘
                                         │
                                         ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ Oracle Linux Ampere VPS (ARM64 • 4 OCPU • 24 GB RAM)                   │
  │                                                                        │
  │   ┌──────────────────────────────────────────────────────────────┐     │
  │   │ mindzed-agent (Go Gin Daemon, < 15MB RAM)                    │     │
  │   │   • GET  /health (Liveness probe)                            │     │
  │   │   • GET  /api/v1/system/vitals (gopsutil CPU/RAM/Disk/Net)   │     │
  │   │   • POST /api/v1/databases (Atomic DB/User Provisioning)     │     │
  │   │   • GET  /api/v1/databases (Fleet list + pg_database_size)   │     │
  │   │   • DELETE /api/v1/databases/:name (Terminate + Drop)        │     │
  │   └───────────────┬──────────────────────────────────────────────┘     │
  │                   │ Docker Swarm Network / Dokploy                     │
  │                   ▼                                                    │
  │   ┌──────────────────────────────────────────────────────────────┐     │
  │   │ PostgreSQL Database Cluster (Dokploy / Shared Postgres)      │     │
  │   │ Host: postgres-databases-sharedpostgres-kooq42:5432          │     │
  │   └──────────────────────────────────────────────────────────────┘     │
  └────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Monorepo Structure

```text
mindzed-hub/
├── agent/                          # Go Daemon (Deployed to Oracle VPS)
│   ├── go.mod
│   ├── main.go                     # Gin REST HTTP server + Auth middleware
│   ├── handler/
│   │   ├── db.go                   # PostgreSQL creation, grant, drop & whitelist logic
│   │   └── vitals.go               # gopsutil CPU, RAM, Disk, Net & socket metrics
│   ├── Dockerfile                  # Multi-stage ARM64 Dockerfile (<20MB)
│   ├── mindzed-agent.service       # Native systemd unit file
│   ├── .env.example
│   └── README.md
│
├── web/                            # Next.js PWA Hub (Deployed to Vercel / Local)
│   ├── app/
│   │   ├── layout.tsx              # Root PWA layout + Theme & Metadata
│   │   ├── page.tsx                # Dashboard Overview (Vitals Gauges + Charts)
│   │   ├── databases/
│   │   │   └── page.tsx            # Neon-style DB Provisioner & DB Manager
│   │   ├── ports/
│   │   │   └── page.tsx            # Network Ports & Security Watchdog
│   │   ├── status/
│   │   │   └── page.tsx            # Uptime Kuma monitoring & incident log
│   │   └── api/
│   │       └── auth/[...nextauth]/ # GitHub OAuth + First-User Admin logic
│   ├── components/
│   │   ├── charts/
│   │   │   ├── VitalsGauge.tsx     # Apache ECharts dual gauge for CPU & RAM
│   │   │   └── ResourceHistory.tsx # ECharts streaming line/area chart
│   │   ├── db/
│   │   │   ├── CreateDbModal.tsx   # Framer-motion dialog for provisioning
│   │   │   └── ConnectionCard.tsx  # 1-click copy for Dokploy/SSH/Vercel URLs
│   │   └── Navbar.tsx              # Top navigation, live vitals pill, Whitelist manager
│   ├── lib/
│   │   ├── agent-client.ts         # Type-safe client for Go Agent endpoints
│   │   ├── use-live-vitals.ts      # Global CPU/RAM live telemetry with tab sleep
│   │   └── kuma-client.ts          # API connector for Uptime Kuma
│   ├── public/
│   │   ├── manifest.json           # PWA configuration
│   │   └── icons/                  # PWA app icons (SVG, 192x192, 512x512)
│   ├── .env.example
│   └── package.json
└── README.md
```

---

## 🚀 Quick Start (Local Development)

### 1. Run the Next.js PWA Hub (`web/`)

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
*Note: MindZed Hub features built-in **Simulated Demo Mode** that generates realistic telemetry and mock database provisioning out of the box if your Oracle VPS is not currently connected!*

### 2. Run or Test the Go Daemon (`agent/`)

```bash
cd agent
# Copy environment configuration
cp .env.example .env

# Run locally (requires Go 1.22+)
go run main.go
```

---

## 🛠 Deploying to Oracle Linux VPS via Dokploy

> 📖 **Comprehensive Installation Guide:** See [agent/INSTALL.md](agent/INSTALL.md) for full instructions covering Dokploy, Docker Compose, Bare-Metal Linux, and Cloudflare Tunnel.

1. **Deploy the Agent in Dokploy**:
   - In your Dokploy dashboard, create a new **Application**.
   - Point Git repository to your MindZed repo, Subpath `/agent`.
   - Attach the application to the network containing your PostgreSQL instance (e.g. `dokploy-network`).
   - Define Environment Variables:
     ```env
     PORT=8080
     AGENT_SECRET=your_32_character_secret_key
     DATABASE_URL=postgres://postgres:password@postgres-databases-sharedpostgres-kooq42:5432/postgres?sslmode=disable
     PG_INTERNAL_HOST=postgres-databases-sharedpostgres-kooq42
     PG_EXTERNAL_HOST=129.154.34.1
     SSH_LOCAL_PORT=5433
     WHITELIST_FILE=/app/data/whitelist.json
     ```
   - Add persistent volume mount: `/var/lib/mindzed/data` -> `/app/data` (preserves your admin & team whitelist across restarts).
   - Deploy container! *(Note: The agent creates 0 tables in your master PostgreSQL database!)*

2. **Connect Cloudflare Tunnel**:
   - In Cloudflare Zero Trust dashboard, create a public hostname: `agent.mindzed.tech`.
   - Point service to: `http://localhost:8080` (or the Dokploy container IP:port).

3. **Deploy the Web Hub to Vercel**:
   - Import the `/web` folder into Vercel.
   - Set environment variables:
     ```env
     NEXT_PUBLIC_AGENT_URL=https://agent.mindzed.tech
     NEXT_PUBLIC_AGENT_SECRET=your_32_character_secret_key
     AGENT_SECRET=your_32_character_secret_key
     ```
   - Deploy!

---

## 🔒 Security Model & Access Control

- **GitHub OAuth with First-User Admin Onboarding:**
  - Zero-database setup: user accounts and roles are saved by the Go Agent directly in PostgreSQL (`mindzed_auth_whitelist`).
  - The first person to log in via GitHub automatically becomes the Primary **Admin**.
  - The Admin can invite friends by typing their GitHub username in the **Team & Whitelist** settings drawer.
  - Non-whitelisted users are denied login.
- **Kernel Socket Security Watchdog (`/ports`):**
  - Inspects active TCP listening sockets via `gopsutil`.
  - Automatically identifies exposure levels:
    - 🟢 `safe_local` (`127.0.0.1`): Local-only daemons & tunnels.
    - 🔵 `docker_internal` (`172.x` / `10.x`): Dokploy internal services & Swarm networks.
    - 🟡 `public_exposed` (`0.0.0.0`): Gateways protected by Oracle VCN & `firewalld`.
  - Polled infrequently (every 3 minutes) or on-demand to maintain near-zero CPU footprint.
- **Bearer Authentication:** All non-health agent endpoints (`/api/v1/*`) are guarded by the `X-Agent-Secret` header.
- **SQL Sanitization:** Database names and role identifiers are strictly validated against `^[a-zA-Z0-9_]+$` to prevent SQL injection.
- **Connection Isolation:** Databases are provisioned with unique, dedicated users with 32-character high-entropy cryptographic passwords.
- **Safe 2-Step Drop:** Dropping a database terminates active connections via `pg_terminate_backend` before executing `DROP DATABASE`.

---

## 📄 License
MIT License. Open source and free for personal and commercial infrastructure management.
