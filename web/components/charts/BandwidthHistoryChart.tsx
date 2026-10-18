"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { BandwidthDailyRecord } from "@/lib/bandwidth-client";

interface BandwidthHistoryChartProps {
  data: BandwidthDailyRecord[];
}

export default function BandwidthHistoryChart({ data }: BandwidthHistoryChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, {
        renderer: "canvas",
      });
    }

    const chart = chartInstance.current;

    const dates = data.map((d) => {
      // e.g. "2026-10-14" -> "Oct 14"
      const parts = d.date.split("-");
      if (parts.length === 3) {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const m = parseInt(parts[1], 10) - 1;
        return `${months[m]} ${parts[2]}`;
      }
      return d.date;
    });

    const egress = data.map((d) => d.egress_gb);
    const ingress = data.map((d) => d.ingress_gb);

    const option: echarts.EChartsOption = {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(18, 18, 20, 0.95)",
        borderColor: "#27272a",
        textStyle: { color: "#f4f4f5", fontSize: 11 },
        formatter: (params: unknown) => {
          if (!Array.isArray(params)) return "";
          const header = `<div class="font-mono text-zinc-400 font-semibold text-xs mb-1">${params[0].axisValue}</div>`;
          const lines = params
            .map(
              (p) =>
                `<div class="flex items-center justify-between gap-6 text-xs py-0.5">
                  <span class="flex items-center gap-1.5 text-zinc-400">
                    <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background-color:${p.color};"></span>
                    ${p.seriesName}
                  </span>
                  <span class="font-mono font-bold text-white">${p.value} GB</span>
                </div>`
            )
            .join("");
          return `<div class="p-1">${header}${lines}</div>`;
        },
      },
      legend: {
        data: ["Outbound Egress", "Inbound Ingress"],
        top: 0,
        right: 12,
        textStyle: { color: "#a1a1aa", fontSize: 11 },
        icon: "roundRect",
        itemWidth: 10,
        itemHeight: 10,
      },
      grid: {
        top: 36,
        left: 8,
        right: 16,
        bottom: 8,
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: dates,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#27272a" } },
        axisLabel: {
          color: "#71717a",
          fontSize: 10,
          fontFamily: "monospace",
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        splitLine: {
          lineStyle: { color: "#18181b", type: "dashed" },
        },
        axisLabel: {
          color: "#71717a",
          fontSize: 10,
          fontFamily: "monospace",
          formatter: "{value} GB",
        },
      },
      series: [
        {
          name: "Outbound Egress",
          type: "line",
          smooth: 0.3,
          symbol: "circle",
          symbolSize: 6,
          itemStyle: {
            color: "#38bdf8", // Sky blue
          },
          lineStyle: {
            width: 2.5,
            color: "#38bdf8",
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(56, 189, 248, 0.35)" },
              { offset: 0.8, color: "rgba(56, 189, 248, 0.02)" },
              { offset: 1, color: "transparent" },
            ]),
          },
          data: egress,
        },
        {
          name: "Inbound Ingress",
          type: "line",
          smooth: 0.3,
          symbol: "none",
          itemStyle: {
            color: "#34d399", // Emerald green
          },
          lineStyle: {
            width: 1.5,
            type: "dashed",
            color: "#34d399",
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(52, 211, 153, 0.15)" },
              { offset: 1, color: "transparent" },
            ]),
          },
          data: ingress,
        },
      ],
    };

    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [data]);

  return <div ref={chartRef} className="w-full h-[260px]" />;
}
