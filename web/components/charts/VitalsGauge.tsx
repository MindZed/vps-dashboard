"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";

interface VitalsGaugeProps {
  cpuPct: number;
  ramUsedMB: number;
  ramTotalMB: number;
}

export default function VitalsGauge({ cpuPct, ramUsedMB, ramTotalMB }: VitalsGaugeProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const ramPct = ramTotalMB > 0 ? Math.round((ramUsedMB / ramTotalMB) * 1000) / 10 : 0;

  // Soft indicator colors based on thresholds
  const getCpuColor = (val: number) => {
    if (val > 85) return "#f87171"; // soft red
    if (val > 70) return "#fbbf24"; // soft amber
    return "#34d399"; // soft mint / emerald
  };

  const getRamColor = (val: number) => {
    if (val > 85) return "#f87171"; // soft red
    if (val > 75) return "#fbbf24"; // soft amber
    return "#38bdf8"; // soft sky / blue
  };

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, {
        renderer: "canvas",
      });
    }

    const chart = chartInstance.current;
    const cpuColor = getCpuColor(cpuPct);
    const ramColor = getRamColor(ramPct);

    // Minimalist, non-overlapping dual ring gauges with soft indicator colors
    const option: echarts.EChartsOption = {
      backgroundColor: "transparent",
      tooltip: {
        show: false,
      },
      series: [
        // Left Gauge: CPU (Soft Mint/Amber/Red Arc)
        {
          type: "gauge",
          center: ["28%", "52%"],
          radius: "70%",
          startAngle: 215,
          endAngle: -35,
          min: 0,
          max: 100,
          splitNumber: 4,
          itemStyle: {
            color: cpuColor,
          },
          progress: {
            show: true,
            roundCap: true,
            width: 6,
          },
          pointer: {
            show: false,
          },
          axisLine: {
            roundCap: true,
            lineStyle: {
              width: 6,
              color: [[1, "#27272a"]], // Subtle dark track
            },
          },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          title: {
            show: true,
            offsetCenter: [0, "68%"],
            fontSize: 10,
            color: "#71717a",
            fontWeight: 500,
          },
          detail: {
            valueAnimation: true,
            offsetCenter: [0, "-5%"],
            fontSize: 24,
            fontWeight: 700,
            formatter: "{value}%",
            color: "#ffffff",
            fontFamily: "ui-monospace, monospace",
          },
          data: [
            {
              value: cpuPct,
              name: "CPU LOAD",
            },
          ],
        },

        // Right Gauge: RAM (Soft Sky/Amber/Red Arc)
        {
          type: "gauge",
          center: ["72%", "52%"],
          radius: "70%",
          startAngle: 215,
          endAngle: -35,
          min: 0,
          max: 100,
          splitNumber: 4,
          itemStyle: {
            color: ramColor,
          },
          progress: {
            show: true,
            roundCap: true,
            width: 6,
          },
          pointer: {
            show: false,
          },
          axisLine: {
            roundCap: true,
            lineStyle: {
              width: 6,
              color: [[1, "#27272a"]],
            },
          },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          title: {
            show: true,
            offsetCenter: [0, "68%"],
            fontSize: 10,
            color: "#71717a",
            fontWeight: 500,
          },
          detail: {
            valueAnimation: true,
            offsetCenter: [0, "-5%"],
            fontSize: 24,
            fontWeight: 700,
            formatter: "{value}%",
            color: "#ffffff",
            fontFamily: "ui-monospace, monospace",
          },
          data: [
            {
              value: ramPct,
              name: "RAM ALLOCATION",
            },
          ],
        },
      ],
    };

    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [cpuPct, ramPct]);

  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  return (
    <div className="relative w-full h-[200px] flex items-center justify-center">
      <div ref={chartRef} className="w-full h-full" />
    </div>
  );
}
