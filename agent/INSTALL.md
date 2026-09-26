# 🚀 MindZed Agent: VPS Installation & Deployment Guide

This guide explains how to install and run `mindzed-agent` on your **Oracle Linux Ampere (ARM64)** or **x86_64** VPS. 

---

## 📋 Table of Contents
1. [Architecture & Safety Guarantee](#1-architecture--safety-guarantee)
2. [Prerequisites](#2-prerequisites)
3. [Method 1: Deploy with Dokploy (Recommended for Dokploy Users)](#method-1-deploy-with-dokploy-recommended)
4. [Method 2: Deploy with Docker Compose](#method-2-deploy-with-docker-compose)
5. [Method 3: Native Systemd Binary (Bare-Metal)](#method-3-native-systemd-service-bare-metal)
6. [Setting up Cloudflare Tunnel (Zero-Trust HTTPS)](#setting-up-cloudflare-tunnel-zero-trust-https)
7. [Verification & Connecting to MindZed Hub](#verification--connecting-to-mindzed-hub)
8. [Troubleshooting & FAQ](#troubleshooting--faq)

---

## 1. Architecture & Safety Guarantee

```
  ┌────────────────────────────────────────────────────────┐
  │ Next.js Hub (Vercel or Localhost)                      │
  └───────────────────────────┬────────────────────────────┘
                              │ HTTPS (X-Agent-Secret)
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │ Cloudflare Tunnel (agent.yourdomain.com)              │
  │ (No public inbound ports opened on your VPS firewall!) │
  └───────────────────────────┬────────────────────────────┘
                              │ Localhost HTTP
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │ Oracle Linux VPS (Dokploy / Docker)                    │
  │                                                        │
  │   ┌────────────────────────────────────────────────┐   │
  │   │ mindzed-agent (Go daemon, < 15 MB RAM)         │   │
  │   │   • Reads host CPU, RAM, Disk, Sockets         │   │
  │   │   • Writes auth whitelist to `whitelist.json`  │   │
  │   └───────────────┬────────────────────────────────┘   │
  │                   │ Docker Swarm / Internal Network    │
  │                   ▼                                    │
  │   ┌────────────────────────────────────────────────┐   │
  │   │ PostgreSQL Database Server                     │   │
  │   └────────────────────────────────────────────────┘   │
  └────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **PostgreSQL Safety Guarantee:**
> - `mindzed-agent` creates **ZERO tables** in your master PostgreSQL database.
> - Team whitelist and admin settings are saved safely on disk in `whitelist.json`.
> - The agent **only creates new databases and users** when you explicitly click **"+ New Database"** in the web dashboard!

---

## 2. Prerequisites

1. An **Oracle Cloud Always-Free Ampere A1** instance (or any Linux VPS running Ubuntu, Debian, or Oracle Linux 8/9).
2. **PostgreSQL** running on the VPS (inside Dokploy or Docker).
3. A **32-character secret key** for authentication. You can generate one with:
   ```bash
   openssl rand -hex 32
   ```

---

## Method 1: Deploy with Dokploy (Recommended)

If you already use **Dokploy** on your VPS:

### Step 1: Create New Application
1. In Dokploy, go to your **Project** and click **Create Application**.
2. Select **Git** as the source:
   - **Repository:** `https://github.com/your-username/mindzed-hub` (or your private fork)
   - **Branch:** `main`
   - **Build Type:** `Dockerfile`
   - **Dockerfile Path:** `agent/Dockerfile`
   - **Context:** `agent`

### Step 2: Configure Docker Network
1. Go to the **Network** tab in your Dokploy application.
2. Select the Docker network where your PostgreSQL instance is running (usually `dokploy-network` or `sharedpostgres_default`).
   *This allows the agent to communicate directly with PostgreSQL over internal Docker DNS (`postgres:5432`).*

### Step 3: Set Environment Variables
Go to the **Environment** tab and add:

```env
PORT=8080
GIN_MODE=release
AGENT_SECRET=your_32_character_secret_key_here

# Internal PostgreSQL connection
DATABASE_URL=postgres://postgres:YOUR_POSTGRES_PASSWORD@postgres-databases-sharedpostgres-kooq42:5432/postgres?sslmode=disable

# Hostnames provided to the Web Hub when creating connection strings
PG_INTERNAL_HOST=postgres-databases-sharedpostgres-kooq42
PG_EXTERNAL_HOST=your_vps_ip_or_custom_domain
SSH_LOCAL_PORT=5433

# File path for persistent whitelist
WHITELIST_FILE=/app/data/whitelist.json
```

> [!TIP]
> If your Dokploy PostgreSQL container has a service name like `postgres-databases-sharedpostgres-kooq42`, set `DATABASE_URL` and `PG_INTERNAL_HOST` to match that exact container name!

### Step 4: Persistent Storage for Whitelist
1. In Dokploy, go to **Volumes / Mounts**.
2. Add a mount:
   - **Host Path:** `/var/lib/mindzed/data`
   - **Mount Path:** `/app/data`
   *This ensures your whitelist and admin settings survive container restarts.*

### Step 5: Deploy
Click **Deploy**! Once finished, Dokploy will build the minimal ARM64 Alpine container (< 20 MB).

---

## Method 2: Deploy with Docker Compose

If you run Docker without Dokploy:

1. Create a directory on your VPS:
   ```bash
   sudo mkdir -p /opt/mindzed-agent/data
   cd /opt/mindzed-agent
   ```

2. Create `docker-compose.yml`:
   ```yaml
   version: "3.8"

   services:
     agent:
       build:
         context: https://github.com/your-username/mindzed-hub.git#main:agent
         dockerfile: Dockerfile
       container_name: mindzed-agent
       restart: unless-stopped
       ports:
         - "127.0.0.1:8080:8080"
       environment:
         - PORT=8080
         - GIN_MODE=release
         - AGENT_SECRET=your_32_character_secret_key_here
         - DATABASE_URL=postgres://postgres:your_password@postgres-databases-sharedpostgres-kooq42:5432/postgres?sslmode=disable
         - PG_INTERNAL_HOST=postgres-databases-sharedpostgres-kooq42
         - PG_EXTERNAL_HOST=your_vps_ip
         - SSH_LOCAL_PORT=5433
         - WHITELIST_FILE=/app/data/whitelist.json
       volumes:
         - /opt/mindzed-agent/data:/app/data
       networks:
         - dokploy-network

   networks:
     dokploy-network:
       external: true
   ```

3. Start the container:
   ```bash
   docker compose up -d
   ```

---

## Method 3: Native Systemd Service (Bare-Metal)

For ultra-low RAM (< 10 MB) without Docker:

### 1. Compile or Download Binary
On an ARM64 Linux system (or cross-compile with Go 1.22+):
```bash
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o mindzed-agent main.go
```

### 2. Install to `/opt/mindzed-agent`
```bash
sudo mkdir -p /opt/mindzed-agent/data
sudo cp mindzed-agent /opt/mindzed-agent/
sudo chmod +x /opt/mindzed-agent/mindzed-agent
```

### 3. Create Configuration File
```bash
sudo nano /opt/mindzed-agent/.env
```
Paste:
```env
PORT=8080
GIN_MODE=release
AGENT_SECRET=your_32_character_secret_key_here
DATABASE_URL=postgres://postgres:your_password@127.0.0.1:5432/postgres?sslmode=disable
PG_INTERNAL_HOST=localhost
PG_EXTERNAL_HOST=your_vps_ip
SSH_LOCAL_PORT=5433
WHITELIST_FILE=/opt/mindzed-agent/data/whitelist.json
```

### 4. Enable Systemd Service
```bash
sudo cp mindzed-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mindzed-agent
sudo systemctl status mindzed-agent
```

---

## Setting up Cloudflare Tunnel (Zero-Trust HTTPS)

Cloudflare Tunnel lets your Next.js Hub communicate securely with the daemon **without opening port 8080 to the public internet**:

1. In the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/):
   - Go to **Networks** -> **Tunnels** -> **Create a tunnel**.
   - Choose **Cloudflared**.
   - Name it `mindzed-vps`.
2. Install the connector on your VPS using the command shown by Cloudflare:
   ```bash
   curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
   sudo dpkg -i cloudflared.deb
   sudo cloudflared service install <YOUR_TOKEN>
   ```
3. Add a **Public Hostname** in Cloudflare:
   - **Subdomain:** `agent`
   - **Domain:** `yourdomain.com` (e.g. `agent.mindzed.tech`)
   - **Type:** `HTTP`
   - **URL:** `localhost:8080` (or `mindzed-agent:8080` if using Docker network)
4. Save hostname!

---

## Verification & Connecting to MindZed Hub

### 1. Test Endpoint
Run from your terminal or open in browser:
```bash
curl https://agent.yourdomain.com/health
```
Expected response:
```json
{
  "status": "ok",
  "service": "mindzed-agent",
  "version": "1.0.0",
  "postgres": "connected",
  "timestamp": "2026-09-23T02:20:00Z"
}
```

### 2. Connect Your Next.js Hub
1. Deploy `web/` to **Vercel** or run it locally (`npm run dev`).
2. Set Environment Variables in Vercel or click the ⚙️ **Settings** icon in the Hub navbar:
   - **Agent URL:** `https://agent.yourdomain.com`
   - **Agent Secret:** Your 32-character key
3. Click **Test Endpoint** -> should turn green (**Online**).
4. Click **Save & Apply**!

---

## Troubleshooting & FAQ

### Q: Why does healthcheck say `"postgres": "disconnected"`?
- Ensure `DATABASE_URL` is correct and that the agent is on the same Docker network as your PostgreSQL container.
- If using Dokploy, test connecting with container name: `ping postgres` or `ping postgres-databases-sharedpostgres-kooq42`.

### Q: Does the agent expose PostgreSQL to the world?
- **No.** The agent communicates locally over Dokploy's private Docker network. External connections are only allowed if you manually open port 5432 in Oracle Cloud VCN ingress rules or use the provided secure SSH Tunnel command.

### Q: How much RAM does the agent use?
- Idles between **10 MB and 14 MB RAM** on Oracle Linux Ampere.
