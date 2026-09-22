"use server";

import { CreateDatabaseRequest, CreateDatabaseResponse } from "@/lib/agent-client";

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://agent.mindzed.tech";
const AGENT_SECRET = process.env.AGENT_SECRET || "mindzed-insecure-dev-secret-change-me";

export async function createDatabaseAction(payload: CreateDatabaseRequest): Promise<{
  success: boolean;
  data?: CreateDatabaseResponse;
  error?: string;
}> {
  try {
    const res = await fetch(`${AGENT_URL}/api/v1/databases`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Secret": AGENT_SECRET,
        Accept: "application/json",
      },
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
  try {
    const res = await fetch(`${AGENT_URL}/api/v1/databases/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: {
        "X-Agent-Secret": AGENT_SECRET,
        Accept: "application/json",
      },
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
