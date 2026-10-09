import React, { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_BASE_URL ?? '';

interface AnalyticsOverview {
  revenue: {
    totalRevenueMinor: number;
    totalRefundsMinor: number;
    netBalanceMinor: number;
    currency: string;
  };
  sessions: {
    total: number;
    active: number;
    expired: number;
    paused: number;
    revoked: number;
  };
  customers: {
    total: number;
    withConsent: number;
  };
  gateways: {
    total: number;
    online: number;
    offline: number;
    unmanaged: number;
  };
  dataFreshness: {
    timestamp: string;
    sourceLabels: string[];
  };
}

interface RevenueData {
  timeSeries: Array<{
    date: string;
    grossMinor: number;
    refundsMinor: number;
    netMinor: number;
    count: number;
  }>;
  providerBreakdown: Record<string, { totalMinor: number; count: number }>;
  dataFreshness: string;
  sourceLabels: string[];
}

interface UsageData {
  totalDeliveredHours: number;
  packageBreakdown: Array<{
    packageId: string;
    packageName: string;
    sessionCount: number;
    totalDurationSeconds: number;
  }>;
  sourceLabels: string[];
}

interface RetentionData {
  totalCustomers: number;
  returningCustomers: number;
  singleVisitCustomers: number;
  retentionRatePercentage: number;
  sourceLabels: string[];
}

interface AnalyticsViewProps {
  token: string;
  onFeedback: (msg: string, type: 'ok' | 'err') => void;
}

export function AnalyticsView({ token, onFeedback }: AnalyticsViewProps) {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [retention, setRetention] = useState<RetentionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [ovRes, revRes, usgRes, retRes] = await Promise.all([
        fetch(`${API}/api/v1/analytics/overview`, { headers }),
        fetch(`${API}/api/v1/analytics/revenue`, { headers }),
        fetch(`${API}/api/v1/analytics/usage`, { headers }),
        fetch(`${API}/api/v1/analytics/retention`, { headers }),
      ]);

      if (ovRes.ok) setOverview(await ovRes.json());
      if (revRes.ok) setRevenue(await revRes.json());
      if (usgRes.ok) setUsage(await usgRes.json());
      if (retRes.ok) setRetention(await retRes.json());
    } catch {
      onFeedback('Failed to load telemetry analytics.', 'err');
    } finally {
      setLoading(false);
    }
  }, [token, onFeedback]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleExport = async (type: 'ledger' | 'sessions') => {
    setDownloading(type);
    try {
      const res = await fetch(`${API}/api/v1/analytics/export?type=${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hotspot-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      onFeedback(`Exported ${type} CSV successfully.`, 'ok');
    } catch {
      onFeedback(`Failed to export ${type} CSV.`, 'err');
    } finally {
      setDownloading(null);
    }
  };

  const formatMoney = (minor: number, curr = 'USD') => `${curr} ${(minor / 100).toFixed(2)}`;

  if (loading && !overview) {
    return (
      <div className="tab-pane active" style={{ textAlign: 'center', padding: '3rem' }}>
        <p>Loading authoritative analytics &amp; ledger telemetry...</p>
      </div>
    );
  }

  return (
    <div className="tab-pane active">
      <div className="heading">
        <div>
          <small>EXECUTIVE TELEMETRY</small>
          <h2>Analytics &amp; Data Insights</h2>
          <p>
            Real-time integer financial accounting, session duration telemetry, and customer retention metrics.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="secondary"
            onClick={() => handleExport('ledger')}
            disabled={downloading !== null}
          >
            {downloading === 'ledger' ? 'Exporting...' : '📥 Export Ledger CSV'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => handleExport('sessions')}
            disabled={downloading !== null}
          >
            {downloading === 'sessions' ? 'Exporting...' : '📥 Export Sessions CSV'}
          </button>
          <button type="button" onClick={fetchAnalytics}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {overview && (
        <div className="grid" style={{ marginBottom: '1.5rem' }}>
          <article className="card">
            <span className="icon ok">💰</span>
            <div>
              <h3>{formatMoney(overview.revenue.netBalanceMinor, overview.revenue.currency)}</h3>
              <p>
                Net Revenue (Gross: {formatMoney(overview.revenue.totalRevenueMinor, overview.revenue.currency)} · Refunds:{' '}
                {formatMoney(overview.revenue.totalRefundsMinor, overview.revenue.currency)})
              </p>
            </div>
            <small>Audited</small>
          </article>

          <article className="card">
            <span className="icon ok">⏱️</span>
            <div>
              <h3>{usage ? `${usage.totalDeliveredHours} hrs` : '...'}</h3>
              <p>
                Total Hotspot Delivered Time · {overview.sessions.active} active · {overview.sessions.expired} completed
              </p>
            </div>
            <small>Authoritative</small>
          </article>

          <article className="card">
            <span className="icon ok">👥</span>
            <div>
              <h3>{retention ? `${retention.retentionRatePercentage}%` : '...'}</h3>
              <p>
                Customer Retention Rate ({retention?.returningCustomers ?? 0} repeat of {retention?.totalCustomers ?? 0}{' '}
                total)
              </p>
            </div>
            <small>Cohorts</small>
          </article>

          <article className="card">
            <span className="icon ok">🌐</span>
            <div>
              <h3>{overview.gateways.online} / {overview.gateways.total} Gateways Online</h3>
              <p>
                {overview.gateways.unmanaged} unmanaged or simulated adapters reporting
              </p>
            </div>
            <small>Network</small>
          </article>
        </div>
      )}

      {/* Revenue Breakdown */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div className="heading" style={{ marginBottom: '1rem' }}>
          <div>
            <small>FINANCIAL TIME SERIES</small>
            <h3 style={{ margin: 0 }}>Daily Revenue Ledger</h3>
          </div>
          <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>
            Source: Ledger Double-Entry Journals
          </span>
        </div>

        {revenue && revenue.timeSeries.length > 0 ? (
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Transactions</th>
                  <th>Gross Sales</th>
                  <th>Refunds</th>
                  <th>Net Balance</th>
                </tr>
              </thead>
              <tbody>
                {revenue.timeSeries.map((row) => (
                  <tr key={row.date}>
                    <td>
                      <code>{row.date}</code>
                    </td>
                    <td>{row.count}</td>
                    <td style={{ color: '#10b981' }}>{formatMoney(row.grossMinor)}</td>
                    <td style={{ color: row.refundsMinor > 0 ? '#ef4444' : 'inherit' }}>
                      {formatMoney(row.refundsMinor)}
                    </td>
                    <td>
                      <strong>{formatMoney(row.netMinor)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            No journal entries recorded yet. Complete voucher sales or cash payments to populate ledger records.
          </p>
        )}
      </div>

      {/* Package Usage & Retention */}
      <div className="grid" style={{ marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="heading" style={{ marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0 }}>Package Demand Distribution</h3>
            <small>By Delivered Time</small>
          </div>
          {usage && usage.packageBreakdown.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {usage.packageBreakdown.map((pkg) => (
                <div key={pkg.packageId}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span>{pkg.packageName}</span>
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>
                      {pkg.sessionCount} sessions · {Math.round((pkg.totalDurationSeconds / 3600) * 10) / 10}h
                    </span>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.1)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        background: '#3b82f6',
                        height: '100%',
                        width: `${Math.min(100, Math.max(5, (pkg.sessionCount / (overview?.sessions.total || 1)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>No package sessions recorded.</p>
          )}
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="heading" style={{ marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0 }}>Customer Engagement &amp; Retention</h3>
            <small>Repeat Visits</small>
          </div>
          {retention ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
                <span>Total Customers Tracked</span>
                <strong>{retention.totalCustomers}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
                <span>Returning Customers (&gt;1 session)</span>
                <strong style={{ color: '#10b981' }}>{retention.returningCustomers}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
                <span>Single Visit Visitors</span>
                <span>{retention.singleVisitCustomers}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Cohort Retention Rate</span>
                <strong style={{ color: '#3b82f6', fontSize: '1.1rem' }}>{retention.retentionRatePercentage}%</strong>
              </div>
            </div>
          ) : (
            <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>No customer data available.</p>
          )}
        </div>
      </div>

      <aside>
        <strong>Telemetry Provenance &amp; Verification</strong>
        <p>
          All metrics above derive from authoritative server timestamps, integer minor-unit double-entry records, and
          consent-verified sessions. Data freshness timestamp: {overview?.dataFreshness.timestamp ?? 'Current'}.
        </p>
      </aside>
    </div>
  );
}
