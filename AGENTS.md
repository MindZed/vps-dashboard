# MindZed VPS & PostgreSQL Infrastructure Context (`AGENTS.md`)

> **Note for AI Coding Assistants & Agents:**  
> This file contains the complete architectural ground truth, server specifications, network routing, and database conventions for the MindZed project. Read this file to immediately regain full context on how this infrastructure is built and operates.

---

## 1. Server Hardware & Specifications
* **Cloud Provider:** Oracle Cloud Infrastructure (OCI) Always-Free Tier
* **Architecture:** Ampere A1 (ARM64)
* **Compute:** 4 OCPU (vCPU)
* **Memory:** 24 GB RAM (typically ~1.9 GB used, >21 GB free)
* **Storage:** 100 GB NVMe SSD
* **OS:** Ubuntu / Oracle Linux with Docker Swarm
* **Public IP:** `<YOUR_VPS_PUBLIC_IP>`
* **SSH Access:** `ssh mindzed` (configured in `~/.ssh/config` using your private key)

---

## 2. Network Map & Domains

| Service | Internal Port | External Port / Domain | Purpose |
| :--- | :--- | :--- | :--- |
| **Dokploy PaaS** | `3000` | `https://dokploy.mindzed.tech` | Docker Swarm PaaS manager |
| **mindzed-agent** | `8080` | `https://agent.mindzed.tech` | Go daemon for telemetry, provisioning, & query execution |
| **PostgreSQL 18** | `5432` | Internal Docker Swarm Only | Core relational & vector database (`sharedpostgres`) |
| **PgBouncer** | `6432` | `<YOUR_VPS_PUBLIC_IP>:6432` | Connection pooler (Transaction mode) for Serverless/Vercel |

* **Security Rule:** Port `5432` is intentionally NOT exposed to the public internet. External access must go through PgBouncer on port `6432` or via local SSH tunnel on port `5433`.

---

## 3. Database Architecture & Container Details

* **Docker Swarm Service Name:** `postgres-databases-sharedpostgres-kooq42`
* **Docker Image:** `postgres:18` (with `pgvector` extension enabled)
* **Persistent Volume:** `postgres-databases-sharedpostgres-kooq42-data`
* **Internal Data Directory:** `/var/lib/postgresql/18/docker`
* **Auto Config Location:** `/var/lib/postgresql/18/docker/postgresql.auto.conf`
* **PgBouncer Container Name:** `mindzed-pgbouncer`

### Active PostgreSQL Tuned Profile (24 GB RAM System)
The cluster has been optimized for high-performance vector retrieval and transactional workloads:
```ini
shared_buffers = '4GB'              # 32x default: keeps active tables & vector embeddings cached in RAM
work_mem = '32MB'                   # 8x default: in-memory sorts & vector distance calculations (<->)
effective_cache_size = '12GB'       # Guides planner on OS page cache
maintenance_work_mem = '1GB'        # Accelerates VACUUM and pgvector HNSW/IVFFlat index builds
random_page_cost = 1.1              # NVMe SSD optimized (lowered from magnetic disk default 4.0)
effective_io_concurrency = 200      # NVMe parallel I/O operations
checkpoint_completion_target = 0.9  # Smooth I/O flushing
wal_buffers = '16MB'                # WAL write throughput
default_statistics_target = 100
```

> **How to adjust in the future:**  
> Run `ALTER SYSTEM SET parameter = 'value';` followed by `SELECT pg_reload_conf();`. For `shared_buffers` or `wal_buffers`, restart the swarm service with `sudo docker service update --force postgres-databases-sharedpostgres-kooq42`.

---

## 4. Connection String Conventions

### Scenario A: App Deployed inside Dokploy (VPS)
* **Target:** Next.js / Node.js running as a persistent 24/7 container inside Dokploy.
* **Network:** Internal Docker network (no internet routing, ~0.1 ms latency).
* **Port:** Direct `5432`
* **Connection Rule:** **DO NOT** use `&connection_limit=1`. Use standard Prisma pooling (~10 connections).
* **Format:**
  ```text
  postgresql://<USER>:<PASSWORD>@postgres-databases-sharedpostgres-kooq42:5432/<DATABASE>
  ```

### Scenario B: Serverless App (Vercel / AWS Lambda / Cloudflare)
* **Target:** Ephemeral serverless functions that spin up and down dynamically.
* **Network:** External via PgBouncer.
* **Port:** `6432`
* **Connection Rule:** **MUST** use `&pgbouncer=true&connection_limit=1`.
  * `&pgbouncer=true`: Tells Prisma to disable prepared statements across pooled connections.
  * `&connection_limit=1`: Restricts each ephemeral function instance to 1 connection to avoid exhausting connection pools.
* **Format:**
  ```text
  postgresql://<USER>:<PASSWORD>@<YOUR_VPS_PUBLIC_IP>:6432/<DATABASE>?sslmode=disable&pgbouncer=true&connection_limit=1
  ```

### Scenario C: Local Migrations & GUI Tools (DBeaver, TablePlus)
* **SSH Forwarding Command:**
  ```bash
  ssh -L 5433:postgres-databases-sharedpostgres-kooq42:5432 mindzed
  ```
* **Format:**
  ```text
  postgresql://<USER>:<PASSWORD>@localhost:5433/<DATABASE>?sslmode=disable
  ```

---

## 5. Agent & Dashboard Integration
* **Dashboard:** Next.js App Router in `/web`
* **Agent:** Go Gin Daemon in `/agent`
* **Authentication:** Protected with header `X-Agent-Secret`.
* **Database Explorer Endpoint:** `POST https://agent.mindzed.tech/api/v1/explorer/query?db=postgres`
* **Telemetry Endpoint:** `GET https://agent.mindzed.tech/api/v1/system/vitals`
