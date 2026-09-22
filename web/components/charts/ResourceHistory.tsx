"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";

export interface ResourceDataPoint {
  time: string;
  cpu: number;
  ram: number;
}

interface ResourceHistoryProps {
  data: ResourceDataPoint[];
}

export default function ResourceHistory({ data }: ResourceHistoryProps) {
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

    const times = data.map((d) => d.time);
    const cpuValues = data.map((d) => d.cpu);
    const ramValues = data.map((d) => d.ram);

    // Minimalist streaming area chart with soft indicating palette
    const option: echarts.EChartsOption = {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(18, 18, 20, 0.95)",
        borderColor: "#27272a",
        textStyle: { color: "#f4f4f5", fontSize: 11 },
        formatter: (params: unknown) => {
          if (!Array.isArray(params)) return "";
          const header = `<div class="font-mono text-zinc-500 text-[10px] mb-1">${params[0].axisValue}</div>`;
          const lines = params
            .map(
              (p) =>
                `<div class="flex items-center justify-between gap-4 text-xs py-0.5">
                  <span class="flex items-center gap-1.5 text-zinc-400">
                    <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background-color:${p.color};"></span>
                    ${p.seriesName}
                  </span>
                  <span class="font-mono font-bold text-white">${p.value}%</span>
                </div>`
            )
            .join("");
          return `<div class="p-1">${header}${lines}</div>`;
        },
      },
      legend: {
        data: ["CPU Load", "RAM Allocation"],
        top: 0,
        right: 12,
        textStyle: { color: "#71717a", fontSize: 11 },
        icon: "roundRect",
        itemWidth: 10,
        itemHeight: 10,
      },
      grid: {
        top: 32,
        left: 36,
        right: 16,
        bottom: 24,
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: times,
        axisLine: { lineStyle: { color: "#27272a" } },
        axisLabel: { color: "#71717a", fontSize: 10 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 100,
        splitNumber: 4,
        axisLine: { show: false },
        axisLabel: {
          color: "#71717a",
          fontSize: 10,
          formatter: "{value}%",
        },
        splitLine: {
          lineStyle: {
            color: "rgba(255, 255, 255, 0.04)",
            type: "dashed",
          },
        },
      },
      series: [
        {
          name: "CPU Load",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: cpuValues,
          lineStyle: {
            width: 2,
            color: "#34d399", // Soft mint
          },
          itemStyle: {
            color: "#34d399",
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(52, 211, 153, 0.2)" },
              { offset: 1, color: "rgba(52, 211, 153, 0.0)" },
            ]),
          },
        },
        {
          name: "RAM Allocation",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: ramValues,
          lineStyle: {
            width: 1.5,
            color: "#38bdf8", // Soft sky blue
          },
          itemStyle: {
            color: "#38bdf8",
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(56, 189, 248, 0.15)" },
              { offset: 1, color: "rgba(56, 189, 248, 0.0)" },
            ]),
          },
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

  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  return (
    <div className="relative w-full h-[200px]">
      <div ref={chartRef} className="w-full h-full" />
    </div>
  );
}
