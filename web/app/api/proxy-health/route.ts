import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://agent.mindzed.tech";

export async function GET() {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`${AGENT_URL}/health`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) {
      return NextResponse.json({ ok: false, status: "error", latencyMs, postgres: "disconnected" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({
      ok: true,
      status: data.status || "ok",
      latencyMs,
      postgres: data.postgres || "connected",
      version: data.version || "1.0.0",
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      status: "unreachable",
      latencyMs: 0,
      postgres: "unknown",
      error: String(e),
    }, { status: 502 });
  }
}
