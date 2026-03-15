import { useEffect, useState } from "react";

import type { AnalyticsSummary } from "@eyeguard/types";

import { apiClient } from "@/api/client";
import { TrendCharts } from "@/components/dashboard/TrendCharts";

function formatMinutes(totalSeconds: number): string {
  return `${Math.round(totalSeconds / 60)} min`;
}

export function DashboardPage() {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const summary = await apiClient.getAnalytics(14);
        if (mounted) {
          setAnalytics(summary);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load analytics.");
        }
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return <section className="card error-banner">{error}</section>;
  }

  if (!analytics) {
    return <section className="card loading-card">Loading analytics...</section>;
  }

  const summaryCards = [
    { label: "14-day screen time", value: formatMinutes(analytics.totals.screenTimeSeconds) },
    { label: "Breaks taken", value: analytics.totals.breaks },
    { label: "Total alerts", value: analytics.totals.alerts },
    { label: "Blink total", value: analytics.totals.blinks }
  ];

  return (
    <div className="page-stack">
      <section className="card dashboard-hero">
        <div>
          <p className="eyebrow">Analytics dashboard</p>
          <h2>Your recent wellness pattern at a glance</h2>
          <p>
            Review screen load, break adherence, posture warnings, and blink summaries. Data is scoped to your account
            and never includes raw webcam footage.
          </p>
        </div>
        <div className="dashboard-orb" />
      </section>

      <div className="metric-grid">
        {summaryCards.map((card) => (
          <article className="metric-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>

      <TrendCharts analytics={analytics} />

      <div className="home-grid">
        <section className="card">
          <div className="card-head">
            <div>
              <p className="eyebrow">Recent posture events</p>
              <h3>Latest red alerts</h3>
            </div>
          </div>
          <div className="event-list">
            {analytics.postureEvents.length === 0 ? (
              <p className="support-copy">No posture alerts yet.</p>
            ) : (
              analytics.postureEvents.map((event) => (
                <article className="event-item" key={event.id}>
                  <strong>{event.message}</strong>
                  {event.details?.reasons?.length ? <span>Reasons: {event.details.reasons.join(", ")}</span> : null}
                  <span>{new Date(event.createdAt).toLocaleString()}</span>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <p className="eyebrow">Break history</p>
              <h3>Recent resets</h3>
            </div>
          </div>
          <div className="event-list">
            {analytics.breakEvents.length === 0 ? (
              <p className="support-copy">Breaks will appear here once you start the 20-second flow.</p>
            ) : (
              analytics.breakEvents.map((event) => (
                <article className="event-item" key={event.id}>
                  <strong>{event.initiatedBy === "auto" ? "Auto reminder break" : "Manual break"}</strong>
                  <span>
                    {event.durationSeconds}s at {new Date(event.startedAt).toLocaleTimeString()}
                  </span>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
