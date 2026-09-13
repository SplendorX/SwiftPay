"use client";

import { useState } from "react";
import type { CashFlowDataPoint } from "./types";

type CashFlowChartProps = {
  points: CashFlowDataPoint[];
};

export function CashFlowChart({ points }: CashFlowChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!points || points.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
        No cash flow data available for this period.
      </div>
    );
  }

  // Calculate SVG bounds & scaling
  const maxVal = Math.max(
    ...points.map((p) => Math.max(p.incoming, p.outgoing)),
    1000
  );
  const ceiling = Math.ceil(maxVal * 1.15); // Add 15% headroom

  const width = 800;
  const height = 240;
  const paddingX = 40;
  const paddingTop = 20;
  const paddingBottom = 35;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingTop - paddingBottom;

  const getX = (index: number) => {
    if (points.length === 1) return paddingX + chartWidth / 2;
    return paddingX + (index / (points.length - 1)) * chartWidth;
  };

  const getY = (val: number) => {
    return paddingTop + chartHeight - (val / ceiling) * chartHeight;
  };

  // Generate smooth SVG paths using cubic bezier
  const createSmoothPath = (values: number[]) => {
    if (values.length === 0) return "";
    const pts = values.map((v, i) => ({ x: getX(i), y: getY(v) }));
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = i != pts.length - 2 ? pts[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  };

  const incomingValues = points.map((p) => p.incoming);
  const outgoingValues = points.map((p) => p.outgoing);

  const incomingPath = createSmoothPath(incomingValues);
  const outgoingPath = createSmoothPath(outgoingValues);

  // Gradient area paths
  const incomingArea = `${incomingPath} L ${getX(points.length - 1)} ${paddingTop + chartHeight} L ${getX(0)} ${paddingTop + chartHeight} Z`;
  const outgoingArea = `${outgoingPath} L ${getX(points.length - 1)} ${paddingTop + chartHeight} L ${getX(0)} ${paddingTop + chartHeight} Z`;

  // Grid lines
  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  const activePoint = hoveredIndex !== null ? points[hoveredIndex] : null;
  const activeX = hoveredIndex !== null ? getX(hoveredIndex) : 0;
  const activeIncomingY = activePoint ? getY(activePoint.incoming) : 0;
  const activeOutgoingY = activePoint ? getY(activePoint.outgoing) : 0;

  return (
    <div className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        style={{ maxHeight: "280px" }}
      >
        <defs>
          <linearGradient id="incomingGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="outgoingGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {gridSteps.map((step, i) => {
          const y = paddingTop + chartHeight * (1 - step);
          return (
            <g key={i}>
              <line
                x1={paddingX}
                y1={y}
                x2={width - paddingX}
                y2={y}
                stroke="currentColor"
                className="text-border/60"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
            </g>
          );
        })}

        {/* Gradient areas */}
        <path d={incomingArea} fill="url(#incomingGrad)" />
        <path d={outgoingArea} fill="url(#outgoingGrad)" />

        {/* Lines */}
        <path
          d={incomingPath}
          fill="none"
          stroke="#10B981"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={outgoingPath}
          fill="none"
          stroke="#8B5CF6"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Interactive column triggers */}
        {points.map((pt, idx) => {
          const x = getX(idx);
          const colWidth = chartWidth / points.length;
          return (
            <rect
              key={idx}
              x={x - colWidth / 2}
              y={paddingTop}
              width={colWidth}
              height={chartHeight + paddingBottom}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          );
        })}

        {/* Hover vertical indicator line */}
        {hoveredIndex !== null && (
          <line
            x1={activeX}
            y1={paddingTop}
            x2={activeX}
            y2={paddingTop + chartHeight}
            stroke="currentColor"
            className="text-muted-foreground/40"
            strokeDasharray="3 3"
            strokeWidth="1.5"
          />
        )}

        {/* Hover points */}
        {hoveredIndex !== null && activePoint && (
          <>
            <circle
              cx={activeX}
              cy={activeIncomingY}
              r="5"
              fill="#10B981"
              stroke="#FFFFFF"
              strokeWidth="2"
              className="shadow-md"
            />
            <circle
              cx={activeX}
              cy={activeOutgoingY}
              r="5"
              fill="#8B5CF6"
              stroke="#FFFFFF"
              strokeWidth="2"
              className="shadow-md"
            />
          </>
        )}

        {/* X-axis date labels */}
        {points.map((pt, idx) => {
          // Display labels with reasonable spacing
          const shouldShow =
            points.length <= 8 ||
            idx === 0 ||
            idx === points.length - 1 ||
            idx % Math.ceil(points.length / 5) === 0;

          if (!shouldShow) return null;

          return (
            <text
              key={idx}
              x={getX(idx)}
              y={height - 6}
              textAnchor="middle"
              className="text-[11px] font-medium fill-muted-foreground"
            >
              {pt.label}
            </text>
          );
        })}
      </svg>

      {/* Floating Tooltip */}
      {hoveredIndex !== null && activePoint && (
        <div
          className="pointer-events-none absolute -top-12 z-20 transform -translate-x-1/2 rounded-lg border border-border bg-popover/95 px-3 py-2 shadow-lg backdrop-blur-xs text-xs"
          style={{
            left: `${(activeX / width) * 100}%`,
          }}
        >
          <div className="font-semibold text-foreground mb-1">{activePoint.label}</div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>In: ${activePoint.incoming.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 font-medium">
              <span className="h-2 w-2 rounded-full bg-purple-500" />
              <span>Out: ${activePoint.outgoing.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
          <div className="mt-1 pt-1 border-t border-border/60 text-muted-foreground flex justify-between gap-2">
            <span>Net Flow:</span>
            <span
              className={
                activePoint.net >= 0
                  ? "font-semibold text-emerald-600 dark:text-emerald-400"
                  : "font-semibold text-rose-600 dark:text-rose-400"
              }
            >
              {activePoint.net >= 0 ? "+" : ""}$
              {activePoint.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
