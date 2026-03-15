import type { AnalyticsSummary } from "@eyeguard/types";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type TrendChartsProps = {
  analytics: AnalyticsSummary;
};

export function TrendCharts({ analytics }: TrendChartsProps) {
  return (
    <div className="chart-grid">
      <section className="card chart-card">
        <div className="card-head">
          <div>
            <p className="eyebrow">Daily screen load</p>
            <h3>Screen time trend</h3>
          </div>
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analytics.history}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="date" stroke="#aeb5ad" />
              <YAxis stroke="#aeb5ad" />
              <Tooltip />
              <Area
                dataKey="totalScreenTimeSeconds"
                stroke="#f3b95f"
                fill="url(#screenTimeGradient)"
                fillOpacity={1}
              />
              <defs>
                <linearGradient id="screenTimeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f3b95f" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="#f3b95f" stopOpacity={0.05} />
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card chart-card">
        <div className="card-head">
          <div>
            <p className="eyebrow">Behavior loop</p>
            <h3>Breaks and posture alerts</h3>
          </div>
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.history}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="date" stroke="#aeb5ad" />
              <YAxis stroke="#aeb5ad" />
              <Tooltip />
              <Bar dataKey="totalBreaks" fill="#8ba888" radius={[10, 10, 0, 0]} />
              <Bar dataKey="postureAlerts" fill="#ff5f5d" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
