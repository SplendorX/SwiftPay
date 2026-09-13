"use client";

import { BusinessMetricCard } from "./business-metric-card";
import type { BusinessMetricItem } from "./types";

type BusinessMetricsGridProps = {
  metrics: BusinessMetricItem[];
};

export function BusinessMetricsGrid({ metrics }: BusinessMetricsGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <BusinessMetricCard key={metric.id} metric={metric} />
      ))}
    </div>
  );
}
