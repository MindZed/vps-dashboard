# syntax=docker/dockerfile:1

# -------------------------------------------------------------
# Stage 1: Build binary (optimized for ARM64 Oracle Ampere & AMD64)
# -------------------------------------------------------------
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install git and ca-certificates
RUN apk add --no-cache git ca-certificates tzdata

# Copy source code and dependencies
COPY . .

# Download dependencies and ensure go.sum is complete
RUN go mod tidy && go mod download

# Build binary natively for host CPU (auto-detects ARM64 or AMD64)
RUN CGO_ENABLED=0 go build \
    -ldflags="-s -w -X main.version=1.0.0" \
    -o /bin/mindzed-agent \
    main.go

# -------------------------------------------------------------
# Stage 2: Production Runtime with Native PostgreSQL 18 Client
# -------------------------------------------------------------
FROM postgres:18-bookworm

WORKDIR /app

# Create data and backup directories for persistence
RUN mkdir -p /app/data /app/data/backups

# Copy compiled Go binary from builder
COPY --from=builder /bin/mindzed-agent /app/mindzed-agent
RUN chmod +x /app/mindzed-agent

ENV WHITELIST_FILE=/app/data/whitelist.json
ENV BACKUP_DIR=/app/data/backups
ENV BACKUP_CONFIG_FILE=/app/data/backup_schedules.json

# Declare persistent volume so container updates never destroy whitelist or backups
VOLUME ["/app/data"]

EXPOSE 8080
EXPOSE 8050

ENTRYPOINT []
CMD ["/app/mindzed-agent"]
