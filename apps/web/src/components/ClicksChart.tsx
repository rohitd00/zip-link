import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface TimelinePoint {
  bucketStart: string;
  clickCount: number;
}

const CHART_ACCENT_COLOR = "#5b57e0";

/**
 * The clicks-over-time chart, plus a collapsible accessible table of the
 * exact same data. Section 7.7 of the design specification requires a
 * textual/tabular alternative to the chart, not just a chart with a
 * tooltip; a <details> element gives keyboard and screen-reader users a
 * way to reach every value without hovering.
 */
export function ClicksChart({
  timeline,
  timezone,
}: {
  timeline: TimelinePoint[];
  timezone: string;
}) {
  const chartData = timeline.map((point) => ({
    ...point,
    label: formatBucketLabel(point.bucketStart, timezone),
  }));

  return (
    <div>
      <div className="h-64 w-full" role="img" aria-label="Clicks over time chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="clicksAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_ACCENT_COLOR} stopOpacity={0.18} />
                <stop offset="100%" stopColor={CHART_ACCENT_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#e6e6ea" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: "#6b6b76" }}
              tickLine={false}
              axisLine={{ stroke: "#e6e6ea" }}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: "#6b6b76" }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip
              formatter={(value) => [Number(value).toLocaleString(), "Clicks"]}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #0f0f13",
                backgroundColor: "#0f0f13",
                color: "#ffffff",
                fontSize: 13,
                boxShadow: "0 8px 16px -4px rgb(15 15 19 / 0.25)",
              }}
              itemStyle={{ color: "#ffffff" }}
              labelStyle={{ color: "#a1a1aa" }}
              cursor={{ stroke: "#e6e6ea", strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="clickCount"
              stroke={CHART_ACCENT_COLOR}
              strokeWidth={2}
              fill="url(#clicksAreaFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-accent hover:underline">
          View as table
        </summary>
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">Clicks over time, times shown in {timezone}</caption>
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th scope="col" className="py-1.5 font-medium">
                Time
              </th>
              <th scope="col" className="py-1.5 font-medium">
                Clicks
              </th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((point) => (
              <tr key={point.bucketStart} className="border-b border-border last:border-b-0">
                <td className="py-1.5 text-text">
                  {formatBucketLabel(point.bucketStart, timezone)}
                </td>
                <td className="py-1.5 text-text">{point.clickCount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function formatBucketLabel(isoTimestamp: string, timezone: string): string {
  const date = new Date(isoTimestamp);

  return date.toLocaleString(undefined, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: date.getUTCHours() === 0 && date.getUTCMinutes() === 0 ? undefined : "numeric",
  });
}
