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

# Create data directory for whitelist persistence
RUN mkdir -p /app/data

# Copy compiled binary from builder
COPY --from=builder /bin/mindzed-agent /app/mindzed-agent
RUN chmod +x /app/mindzed-agent

ENV WHITELIST_FILE=/app/data/whitelist.json

EXPOSE 8080
EXPOSE 8050

CMD ["/app/mindzed-agent"]
