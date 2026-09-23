import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://agent.mindzed.tech";
const AGENT_SECRET = process.env.AGENT_SECRET || process.env.NEXT_PUBLIC_AGENT_SECRET || "dfb2bd78acdzfdxarf379161b46bd31e0890610fab9028x1";

async function proxyRequest(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  // 1. Session verification: User must be signed in with GitHub
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Please sign in with your GitHub account to access MindZed Hub." },
      { status: 401 }
    );
  }

  const { path } = await params;
  const targetPath = path.join("/");
  const searchParams = req.nextUrl.search;
  const upstreamUrl = `${AGENT_URL}/api/v1/${targetPath}${searchParams}`;

  const headers: Record<string, string> = {
    "X-Agent-Secret": AGENT_SECRET,
    "Accept": "application/json",
  };

  const contentType = req.headers.get("content-type");
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  let body: BodyInit | undefined;
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    try {
      body = await req.text();
    } catch {
      // Body may be empty
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const upstreamRes = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body,
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    const data = await upstreamRes.text();
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", upstreamRes.headers.get("Content-Type") || "application/json");

    return new NextResponse(data, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`[Proxy Error] Failed to reach upstream agent at ${upstreamUrl}:`, error);
    return NextResponse.json(
      { error: "Bad Gateway", message: "Could not reach MindZed VPS Agent." },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
