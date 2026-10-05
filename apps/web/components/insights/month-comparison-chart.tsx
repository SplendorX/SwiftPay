"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";

/**
 * This month against last month: running total per day, one line each.
 *
 * Built to the house chart spec: 2px lines, a 10% wash under the current
 * month, an end dot with a surface ring, hairline gridlines, one y-axis with
 * clean ticks, and a crosshair whose tooltip lists both months at that day.
 * Colours come from `--insight-current` / `--insight-previous`, validated for
 * colour-blind separation on both themes.
 */
export function MonthComparisonChart({
  current,
  currentLabel,
  daysElapsed,
  format,
  formatTick,
  monthShort,
  previous,
  previousLabel,
}: {
  /** Running totals for each elapsed day of this month. */
  current: number[];
  currentLabel: string;
  daysElapsed: number;
  format: (value: number) => string;
  formatTick: (value: number) => string;
  /** "Oct": prefixes the x-axis days. */
  monthShort: string;
  /** Running totals for every day of last month. */
  previous: number[];
  previousLabel: string;
}) {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at its real width, so axis text stays at reading size on a phone
  // and doesn't balloon on a desktop.
  const [width, setWidth] = useState(640);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const height = Math.round(Math.min(320, Math.max(220, width * 0.62)));
  const pad = { bottom: 30, left: 52, right: 12, top: 14 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const days = Math.max(current.length, previous.length, daysElapsed, 28);

  const { ticks, top } = useMemo(() => {
    const max = Math.max(0, ...current, ...previous);
    return niceScale(max);
  }, [current, previous]);

  const x = (dayIndex: number) => pad.left + (days <= 1 ? 0 : (dayIndex / (days - 1)) * plotW);
  const y = (value: number) => pad.top + plotH - (top === 0 ? 0 : (value / top) * plotH);

  const path = (values: number[]) =>
    values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const shown = current.slice(0, Math.max(1, daysElapsed));
  const area =
    shown.length > 0
      ? `${path(shown)} L${x(shown.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`
      : "";
  // Fewer day labels when narrow, so they never touch.
  const xTicks = (width < 420 ? [0, 7, 14, 21, 28] : [0, 5, 10, 15, 20, 25]).filter((index) => index < days);

  function onPointer(event: PointerEvent<SVGRectElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * width;
    const index = Math.round(((px - pad.left) / plotW) * (days - 1));
    setHover(Math.max(0, Math.min(days - 1, index)));
  }

  const hoverCurrent = hover !== null && hover < shown.length ? shown[hover] : null;
  const hoverPrevious = hover !== null && hover < previous.length ? previous[hover] : null;
  const tooltipLeft = hover !== null ? (x(hover) / width) * 100 : 0;

  return (
    <div className="insights-chart">
      <div className="insights-chart-legend" aria-hidden>
        <span>
          <i className="insights-key insights-key-current" />
          {currentLabel}
        </span>
        <span>
          <i className="insights-key insights-key-previous" />
          {previousLabel}
        </span>
      </div>

      <div className="insights-chart-frame" ref={frameRef}>
        <svg
          aria-labelledby={`${id}-title`}
          className="insights-chart-svg"
          ref={svgRef}
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <title id={`${id}-title`}>
            {`${currentLabel}: ${format(shown.at(-1) ?? 0)} so far. ${previousLabel}: ${format(previous.at(-1) ?? 0)} in total.`}
          </title>
          <defs>
            <linearGradient id={`${id}-wash`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--insight-current)" stopOpacity="0.14" />
              <stop offset="100%" stopColor="var(--insight-current)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {ticks.map((tick) => (
            <g key={tick}>
              <line className="insights-grid" x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} />
              <text className="insights-tick" textAnchor="end" x={pad.left - 10} y={y(tick) + 4}>
                {formatTick(tick)}
              </text>
            </g>
          ))}
          {xTicks.map((index) => (
            <text className="insights-tick" key={index} textAnchor="middle" x={x(index)} y={height - 8}>
              {`${monthShort} ${index + 1}`}
            </text>
          ))}

          {area ? <path d={area} fill={`url(#${id}-wash)`} /> : null}
          <path className="insights-line insights-line-previous" d={path(previous)} />
          <path className="insights-line insights-line-current" d={path(shown)} />
          {shown.length > 0 ? (
            <circle
              className="insights-dot insights-dot-current"
              cx={x(shown.length - 1)}
              cy={y(shown[shown.length - 1])}
              r={5}
            />
          ) : null}

          {hover !== null ? (
            <g>
              <line className="insights-crosshair" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotH} />
              {hoverPrevious !== null ? (
                <circle className="insights-dot insights-dot-previous" cx={x(hover)} cy={y(hoverPrevious)} r={4.5} />
              ) : null}
              {hoverCurrent !== null ? (
                <circle className="insights-dot insights-dot-current" cx={x(hover)} cy={y(hoverCurrent)} r={4.5} />
              ) : null}
            </g>
          ) : null}

          {/* The whole plot is the hit target: readers aim at a day, not a line. */}
          <rect
            fill="transparent"
            height={plotH + pad.top}
            onPointerDown={onPointer}
            onPointerLeave={() => setHover(null)}
            onPointerMove={onPointer}
            width={plotW + 12}
            x={pad.left - 6}
            y={0}
          />
        </svg>

        {hover !== null ? (
          <div
            className="insights-tooltip"
            role="status"
            style={{
              left: `${tooltipLeft}%`,
              transform: `translateX(${tooltipLeft > 60 ? "-105%" : "5%"})`,
            }}
          >
            <p className="insights-tooltip-day">{`${monthShort} ${hover + 1}`}</p>
            <p className="insights-tooltip-row">
              <i className="insights-key insights-key-current" />
              <strong>{hoverCurrent !== null ? format(hoverCurrent) : "—"}</strong>
              <span>{currentLabel}</span>
            </p>
            <p className="insights-tooltip-row">
              <i className="insights-key insights-key-previous" />
              <strong>{hoverPrevious !== null ? format(hoverPrevious) : "—"}</strong>
              <span>{previousLabel}</span>
            </p>
          </div>
        ) : null}
      </div>

      {/* The same numbers without hovering. */}
      <details className="insights-table">
        <summary>View as table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">{currentLabel}</th>
              <th scope="col">{previousLabel}</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: days }, (_, index) => (
              <tr key={index}>
                <th scope="row">{index + 1}</th>
                <td>{index < shown.length ? format(shown[index]) : "—"}</td>
                <td>{index < previous.length ? format(previous[index]) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** A clean ceiling and four even ticks (0 … top). */
function niceScale(max: number) {
  if (max <= 0) return { ticks: [0, 250, 500, 750, 1000], top: 1000 };
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= rough) ?? 10 * magnitude;
  const top = step * 4;
  return { ticks: [0, step, step * 2, step * 3, top], top };
}
