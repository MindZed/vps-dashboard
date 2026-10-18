/**
 * Server-Side Upstream Authentication Helper
 *
 * Attaches X-Agent-Secret and Cloudflare Zero Trust Service Token headers
 * (CF-Access-Client-Id, CF-Access-Client-Secret) for secure serverless-to-VPS communication.
 */

export function getAgentUpstreamHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const agentSecret = process.env.AGENT_SECRET;
  const cfClientId = process.env.CF_ACCESS_CLIENT_ID;
  const cfClientSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...customHeaders,
  };

  if (agentSecret) {
    headers["X-Agent-Secret"] = agentSecret.trim();
  }

  // Cloudflare Zero Trust Service Auth
  if (cfClientId && cfClientSecret) {
    headers["CF-Access-Client-Id"] = cfClientId.trim();
    headers["CF-Access-Client-Secret"] = cfClientSecret.trim();
  }

  return headers;
}

export function getWatchdogUpstreamHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const watchdogSecret = process.env.WATCHDOG_SECRET || process.env.AGENT_SECRET;
  const cfClientId = process.env.CF_ACCESS_CLIENT_ID;
  const cfClientSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...customHeaders,
  };

  if (watchdogSecret) {
    headers["X-Agent-Secret"] = watchdogSecret.trim();
  }

  if (cfClientId && cfClientSecret) {
    headers["CF-Access-Client-Id"] = cfClientId.trim();
    headers["CF-Access-Client-Secret"] = cfClientSecret.trim();
  }

  return headers;
}
