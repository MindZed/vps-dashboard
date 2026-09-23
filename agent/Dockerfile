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
# Stage 2: Minimal Production Runtime (< 20MB)
# -------------------------------------------------------------
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata wget

WORKDIR /app

# Run as non-root user for security
RUN addgroup -S mindzed && adduser -S mindzed -G mindzed
RUN mkdir -p /app/data && chown -R mindzed:mindzed /app

# Copy compiled binary from builder
COPY --from=builder /bin/mindzed-agent /app/mindzed-agent

ENV WHITELIST_FILE=/app/data/whitelist.json

USER mindzed

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD sh -c "wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8080}/health || exit 1"

ENTRYPOINT ["/app/mindzed-agent"]
