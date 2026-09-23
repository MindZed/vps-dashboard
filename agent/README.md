# MindZed Agent (`mindzed-agent`)

A high-performance, ultra-lightweight Go daemon (< 15 MB RAM) designed for Oracle Linux Ampere (ARM64) instances running Docker Swarm / Dokploy. It streams real-time CPU, RAM, Disk, and Network telemetry and provisions isolated PostgreSQL databases atomically.

---

## Features
- **Real-Time System Telemetry:** Powered by `gopsutil` for accurate CPU load, RAM allocation, Root disk space, and Uptime.
- **Neon-Style PostgreSQL Provisioner:** Creates atomic database instances, isolated users with 32-character crypto passwords, and grants scoped permissions.
- **Zero-DB Whitelist Persistence:** Saves GitHub auth whitelist and admin roles to `whitelist.json` on disk (creates 0 tables in PostgreSQL).
- **Connection Format Engine:** Outputs ready-to-use connection strings for Dokploy internal networking, local SSH tunnels, and Vercel/Prisma external access.
- **Cloudflare Tunnel Ready:** Standardized `/health` endpoint for tunnel liveness checks and Uptime Kuma heartbeats.
- **Secured API:** Guarded by `X-Agent-Secret` bearer token validation.

---

> 📖 **Full Installation Guide:** See [INSTALL.md](INSTALL.md) for detailed step-by-step instructions for Dokploy, Docker Compose, Bare-Metal Linux, and Cloudflare Tunnel.

---

## Deployment Option 1: Deploy with Dokploy (Recommended)

1. In Dokploy, create a new **Application**.
2. Select **Docker / Git** deployment pointing to your repository's `/agent` directory.
3. Configure the network to join your Dokploy PostgreSQL network (e.g. `dokploy-network`).
4. Set the Environment Variables:
   ```env
   PORT=8080
   AGENT_SECRET=your_super_secret_key_change_me
   DATABASE_URL=postgres://postgres:your_dokploy_pw@postgres-databases-sharedpostgres-kooq42:5432/postgres?sslmode=disable
   PG_INTERNAL_HOST=postgres-databases-sharedpostgres-kooq42
   PG_EXTERNAL_HOST=your_vps_ip
   SSH_LOCAL_PORT=5433
   ```
5. Deploy! Expose domain `agent.mindzed.tech` through Cloudflare Tunnel or Dokploy Traefik.

---

## Deployment Option 2: Native Systemd Service

1. Build for ARM64 on your build machine or directly on the VPS:
   ```bash
   CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o mindzed-agent main.go
   ```
2. Move binary to `/opt/mindzed-agent/`:
   ```bash
   sudo mkdir -p /opt/mindzed-agent
   sudo cp mindzed-agent /opt/mindzed-agent/
   sudo cp .env.example /opt/mindzed-agent/.env
   # Edit /opt/mindzed-agent/.env with your real credentials
   ```
3. Install systemd service:
   ```bash
   sudo cp mindzed-agent.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now mindzed-agent
   sudo systemctl status mindzed-agent
   ```

---

## API Endpoints

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `GET` | `/health` | No | Liveness probe for Cloudflare Tunnel / Kuma |
| `GET` | `/api/v1/system/vitals` | Yes (`X-Agent-Secret`) | Real-time CPU, RAM, Disk, Net, and Uptime |
| `GET` | `/api/v1/databases` | Yes (`X-Agent-Secret`) | List all databases with owners and disk size |
| `POST` | `/api/v1/databases` | Yes (`X-Agent-Secret`) | Provision new database and user atomically |
| `DELETE` | `/api/v1/databases/:name` | Yes (`X-Agent-Secret`) | Safely drop active connections and drop DB |
