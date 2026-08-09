"use client";

import { useMemo } from "react";
import { LineChart } from "lucide-react";

import type { PortfolioChartPoint } from "@/lib/earn/performance";
import { formatUsdDisplay } from "@/lib/earn/performance";

type YieldChartProps = {
  points: PortfolioChartPoint[];
  buildingHistory: boolean;
  message?: string;
  className?: string;
};

/**
 * Interactive-enough SVG portfolio chart.
 * Only renders points derived from indexed events + live value — never fabricated history.
 */
export function YieldChart({
  points,
  buildingHistory,
  message,
  className,
}: YieldChartProps) {
  const geometry = useMemo(() => {
    if (points.length === 0) return null;

    const values = points.map((p) => {
      const n = Number(p.value);
      return Number.isFinite(n) ? n : 0;
    });
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = max === min ? Math.max(max * 0.02, 1) : (max - min) * 0.12;
    const yMin = Math.max(0, min - pad);
    const yMax = max + pad;

    const width = 640;
    const height = 220;
    const left = 48;
    const right = 16;
    const top = 16;
    const bottom = 36;
    const plotW = width - left - right;
    const plotH = height - top - bottom;

    const coords = points.map((p, i) => {
      const x =
        points.length === 1
          ? left + plotW / 2
          : left + (i / (points.length - 1)) * plotW;
      const v = Number(p.value);
      const ratio = yMax === yMin ? 0.5 : (v - yMin) / (yMax - yMin);
      const y = top + plotH * (1 - ratio);
      return { x, y, point: p, value: v };
    });

    const line = coords
      .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(" ");

    const area =
      coords.length > 0
        ? `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${(top + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(top + plotH).toFixed(1)} Z`
        : "";

    return { width, height, left, top, plotH, coords, line, area, yMin, yMax };
  }, [points]);

  if (buildingHistory || points.length === 0) {
    return (
      <section className={`earn-chart-card ${className ?? ""}`}>
        <div className="earn-chart-header">
          <LineChart className="h-4 w-4" />
          <h2>Portfolio value</h2>
        </div>
        <div className="earn-chart-empty">
          <p className="earn-chart-empty-title">Building your earnings history…</p>
          <p className="earn-footnote">
            {message ??
              "The chart is generated from on-chain deposit and withdrawal events. No fabricated historical data."}
          </p>
        </div>
      </section>
    );
  }

  if (!geometry) return null;

  return (
    <section className={`earn-chart-card ${className ?? ""}`}>
      <div className="earn-chart-header">
        <LineChart className="h-4 w-4" />
        <h2>Portfolio value</h2>
        <span className="earn-pill">From indexed events</span>
      </div>
      <p className="earn-footnote earn-chart-note">
        Points reflect deposits, withdrawals, and your current on-chain value —
        not interpolated daily yield.
      </p>

      <div className="earn-chart-svg-wrap">
        <svg
          aria-label="Portfolio value over time"
          className="earn-chart-svg"
          role="img"
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        >
          <defs>
            <linearGradient id="earnAreaFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--earn-chart-line)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--earn-chart-line)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* grid */}
          {[0, 0.5, 1].map((t) => {
            const y = geometry.top + geometry.plotH * (1 - t);
            return (
              <line
                key={t}
                className="earn-chart-grid"
                x1={geometry.left}
                x2={geometry.width - 16}
                y1={y}
                y2={y}
              />
            );
          })}

          <path d={geometry.area} fill="url(#earnAreaFill)" />
          <path
            className="earn-chart-line"
            d={geometry.line}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {geometry.coords.map((c, i) => (
            <g key={`${c.point.at}-${i}`}>
              <circle
                className={
                  c.point.kind === "current"
                    ? "earn-chart-dot earn-chart-dot-current"
                    : "earn-chart-dot"
                }
                cx={c.x}
                cy={c.y}
                r={c.point.kind === "current" ? 5 : 3.5}
              >
                <title>
                  {c.point.label}: ${formatUsdDisplay(c.point.value)} (
                  {c.point.kind})
                </title>
              </circle>
              <text
                className="earn-chart-axis"
                textAnchor="middle"
                x={c.x}
                y={geometry.height - 12}
              >
                {c.point.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="earn-chart-legend">
        <span>
          Start ${formatUsdDisplay(points[0]?.value)}
        </span>
        <span>
          Latest ${formatUsdDisplay(points[points.length - 1]?.value)}
        </span>
      </div>
    </section>
  );
}
