"use server";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { CreateDatabaseRequest, CreateDatabaseResponse } from "@/lib/agent-client";
import { getAgentUpstreamHeaders } from "@/lib/upstream-auth";

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://agent.mindzed.tech";

export async function createDatabaseAction(payload: CreateDatabaseRequest): Promise<{
  success: boolean;
  data?: CreateDatabaseResponse;
  error?: string;
}> {
  // 1. Enforce authenticated session
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { success: false, error: "Unauthorized: Active signed-in session required" };
  }

  try {
    const res = await fetch(`${AGENT_URL}/api/v1/databases`, {
      method: "POST",
      headers: getAgentUpstreamHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to create database" }));
      return { success: false, error: err.error || `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return { success: false, error: errMsg };
  }
}

export async function deleteDatabaseAction(name: string): Promise<{
  success: boolean;
  error?: string;
}> {
  // 1. Enforce authenticated session
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { success: false, error: "Unauthorized: Active signed-in session required" };
  }

  try {
    const res = await fetch(`${AGENT_URL}/api/v1/databases/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: getAgentUpstreamHeaders(),
      cache: "no-store",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to delete database" }));
      return { success: false, error: err.error || `HTTP ${res.status}` };
    }

    return { success: true };
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return { success: false, error: errMsg };
  }
}

