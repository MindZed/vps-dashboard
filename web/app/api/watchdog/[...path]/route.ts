import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const WATCHDOG_URL = process.env.WATCHDOG_URL || process.env.NEXT_PUBLIC_WATCHDOG_URL || process.env.NEXT_PUBLIC_KUMA_URL || "https://status.mindzed.tech";
const AGENT_SECRET = process.env.WATCHDOG_SECRET || process.env.AGENT_SECRET || process.env.NEXT_PUBLIC_AGENT_SECRET || "dfb2bd78acdzfdxarf379161b46bd31e0890610fab9028x1";

async function proxyWatchdog(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  // 1. Session check: User must be signed in
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Please sign in with your GitHub account to access Watchdog." },
      { status: 401 }
    );
  }

  const { path } = await params;
  const targetPath = path.join("/");
  const searchParams = req.nextUrl.search;
  const upstreamUrl = `${WATCHDOG_URL}/api/v1/${targetPath}${searchParams}`;

  const headers: Record<string, string> = {
    "X-Agent-Secret": AGENT_SECRET,
    "Accept": "application/json",
    "User-Agent": "MindzedHub/1.0",
  };

  const contentType = req.headers.get("content-type");
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  let body: BodyInit | undefined;
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    try {
      body = await req.text();
    } catch {
      // Body may be empty
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const upstreamRes = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body,
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    const textData = await upstreamRes.text();
    let jsonBody: string;
    try {
      JSON.parse(textData);
      jsonBody = textData;
    } catch {
      jsonBody = JSON.stringify({
        error: upstreamRes.ok ? "OK" : `Upstream returned ${upstreamRes.status}`,
        message: textData || `Upstream returned status ${upstreamRes.status}`,
      });
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", "application/json");

    return new NextResponse(jsonBody, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.warn(`[Watchdog Proxy] Could not reach Sentinel upstream at ${upstreamUrl}:`, error);
    return NextResponse.json(
      { error: "Bad Gateway", message: "Could not reach MindZed Sentinel daemon." },
      { status: 502 }
    );
  }
}

export const GET = proxyWatchdog;
export const POST = proxyWatchdog;
export const PUT = proxyWatchdog;
export const PATCH = proxyWatchdog;
export const DELETE = proxyWatchdog;
