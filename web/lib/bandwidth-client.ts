export interface BandwidthDailyRecord {
  date: string; // "2026-10-18"
  egress_gb: number;
  ingress_gb: number;
  total_gb: number;
}

export interface BandwidthMonthlyRecord {
  month: string; // "2026-10"
  egress_gb: number;
  ingress_gb: number;
  days_count: number;
}

export interface BandwidthSummaryResponse {
  current_month_egress_gb: number;
  monthly_limit_gb: number; // 10,000 GB (10 TB Free Tier)
  percent_used: number;
  is_overflow: boolean;
  days_remaining: number;
  projected_month_gb: number;
  today_live_egress_gb: number;
  today_live_ingress_gb: number;
  last_synced_at: string;
  daily_records: BandwidthDailyRecord[];
  monthly_records: BandwidthMonthlyRecord[];
  isMock: boolean;
}

const DEFAULT_MOCK_BANDWIDTH: BandwidthSummaryResponse = {
  current_month_egress_gb: 14.8,
  monthly_limit_gb: 10000,
  percent_used: 0.15,
  is_overflow: false,
  days_remaining: 13,
  projected_month_gb: 24.2,
  today_live_egress_gb: 0.42,
  today_live_ingress_gb: 0.18,
  last_synced_at: new Date().toISOString(),
  daily_records: [
    { date: "2026-10-10", egress_gb: 0.18, ingress_gb: 0.12, total_gb: 0.30 },
    { date: "2026-10-11", egress_gb: 0.22, ingress_gb: 0.14, total_gb: 0.36 },
    { date: "2026-10-12", egress_gb: 0.19, ingress_gb: 0.15, total_gb: 0.34 },
    { date: "2026-10-13", egress_gb: 0.25, ingress_gb: 0.17, total_gb: 0.42 },
    { date: "2026-10-14", egress_gb: 3.27, ingress_gb: 0.21, total_gb: 3.48 }, // Dokploy ghcr spike
    { date: "2026-10-15", egress_gb: 0.94, ingress_gb: 0.19, total_gb: 1.13 },
    { date: "2026-10-16", egress_gb: 0.62, ingress_gb: 0.18, total_gb: 0.80 },
    { date: "2026-10-17", egress_gb: 0.81, ingress_gb: 0.22, total_gb: 1.03 },
    { date: "2026-10-18", egress_gb: 0.74, ingress_gb: 0.20, total_gb: 0.94 },
    { date: "2026-10-19", egress_gb: 0.42, ingress_gb: 0.18, total_gb: 0.60 },
  ],
  monthly_records: [
    { month: "2026-08", egress_gb: 6.8, ingress_gb: 3.2, days_count: 31 },
    { month: "2026-09", egress_gb: 12.4, ingress_gb: 5.1, days_count: 30 },
    { month: "2026-10", egress_gb: 14.8, ingress_gb: 4.8, days_count: 19 },
  ],
  isMock: false,
};

export async function fetchBandwidthSummary(): Promise<BandwidthSummaryResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch("/api/proxy/bandwidth/history", {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return {
        ...data,
        isMock: false,
      };
    }
  } catch (err) {
    console.warn("[BandwidthClient] Using fallback summary:", err);
  }

  return DEFAULT_MOCK_BANDWIDTH;
}

export async function pingLiveBandwidth(): Promise<{
  today_egress_gb: number;
  today_ingress_gb: number;
  synced_at: string;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch("/api/proxy/bandwidth/live", {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("[BandwidthClient] Live ping fallback:", err);
  }

  return {
    today_egress_gb: 0.42,
    today_ingress_gb: 0.18,
    synced_at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}
