import React, { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_BASE_URL ?? '';

interface SessionItem {
  id: string;
  ownerId: string;
  customerId?: string | null;
  packageId: string;
  status: 'created' | 'awaiting_payment' | 'payment_verified' | 'activation_pending' | 'active' | 'expired' | 'activation_failed' | 'paused' | 'revoked' | 'cancelled';
  durationSeconds: number;
  remainingSeconds: number;
  activatedAt?: string | null;
  expiresAt?: string | null;
  deviceMac?: string | null;
  clientIp?: string | null;
  createdAt: string;
}

interface PackageItem {
  id: string;
  name: string;
  durationSeconds: number;
  price: { amountMinor: number; currency: string };
}

interface SessionsViewProps {
  token: string;
  packages: PackageItem[];
  onFeedback: (message: string, type: 'success' | 'error') => void;
}

export function SessionsView({ token, packages, onFeedback }: SessionsViewProps) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isReconciling, setIsReconciling] = useState(false);

  // New Session Form State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createPkgId, setCreatePkgId] = useState('');
  const [createMac, setCreateMac] = useState('');
  const [createIp, setCreateIp] = useState('');
  const [createInitialStatus, setCreateInitialStatus] = useState<'awaiting_payment' | 'payment_verified'>('payment_verified');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Extend Modal State
  const [extendSessionId, setExtendSessionId] = useState<string | null>(null);
  const [extendSeconds, setExtendSeconds] = useState<number>(1800);
  const [extendSubmitting, setExtendSubmitting] = useState(false);

  // Pause & Revoke Modal State
  const [pauseSessionId, setPauseSessionId] = useState<string | null>(null);
  const [pauseReason, setPauseReason] = useState('Customer requested pause');
  const [revokeSessionId, setRevokeSessionId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('Administrative revocation');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const url = statusFilter === 'all'
        ? `${API}/api/v1/sessions`
        : `${API}/api/v1/sessions?status=${encodeURIComponent(statusFilter)}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch {
      onFeedback('Failed to load access sessions', 'error');
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Real-time ticking clock for active sessions
  useEffect(() => {
    const timer = setInterval(() => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.status === 'active' && s.remainingSeconds > 0) {
            const nextRemaining = s.remainingSeconds - 1;
            if (nextRemaining <= 0) {
              return { ...s, remainingSeconds: 0, status: 'expired' };
            }
            return { ...s, remainingSeconds: nextRemaining };
          }
          return s;
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleActivate = async (sessionId: string) => {
    try {
      const res = await fetch(`${API}/api/v1/sessions/${sessionId}/activate`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        onFeedback(`Session activated successfully (${data.session.durationSeconds}s duration started)`, 'success');
        loadSessions();
      } else {
        onFeedback(data.error?.message || 'Activation failed', 'error');
      }
    } catch {
      onFeedback('Network error activating session', 'error');
    }
  };

  const handleExtend = async () => {
    if (!extendSessionId) return;
    setExtendSubmitting(true);
    try {
      const res = await fetch(`${API}/api/v1/sessions/${extendSessionId}/extend`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ additionalSeconds: extendSeconds }),
      });
      const data = await res.json();
      if (res.ok) {
        onFeedback(`Session extended by ${Math.round(extendSeconds / 60)} minutes`, 'success');
        setExtendSessionId(null);
        loadSessions();
      } else {
        onFeedback(data.error?.message || 'Failed to extend session', 'error');
      }
    } catch {
      onFeedback('Network error extending session', 'error');
    } finally {
      setExtendSubmitting(false);
    }
  };

  const handlePause = async () => {
    if (!pauseSessionId) return;
    try {
      const res = await fetch(`${API}/api/v1/sessions/${pauseSessionId}/pause`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: pauseReason }),
      });
      const data = await res.json();
      if (res.ok) {
        onFeedback('Session paused. Duration clock is frozen.', 'success');
        setPauseSessionId(null);
        loadSessions();
      } else {
        onFeedback(data.error?.message || 'Failed to pause session', 'error');
      }
    } catch {
      onFeedback('Network error pausing session', 'error');
    }
  };

  const handleResume = async (sessionId: string) => {
    try {
      const res = await fetch(`${API}/api/v1/sessions/${sessionId}/resume`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        onFeedback('Session resumed. Duration clock restarted with updated expiry timestamp.', 'success');
        loadSessions();
      } else {
        onFeedback(data.error?.message || 'Failed to resume session', 'error');
      }
    } catch {
      onFeedback('Network error resuming session', 'error');
    }
  };

  const handleRevoke = async () => {
    if (!revokeSessionId) return;
    try {
      const res = await fetch(`${API}/api/v1/sessions/${revokeSessionId}/revoke`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: revokeReason }),
      });
      const data = await res.json();
      if (res.ok) {
        onFeedback('Session administratively revoked.', 'success');
        setRevokeSessionId(null);
        loadSessions();
      } else {
        onFeedback(data.error?.message || 'Failed to revoke session', 'error');
      }
    } catch {
      onFeedback('Network error revoking session', 'error');
    }
  };

  const handleReconcileExpiry = async () => {
    setIsReconciling(true);
    try {
      const res = await fetch(`${API}/api/v1/sessions/reconcile-expiry`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        onFeedback(`Expiry reconciliation completed. Reconciled ${data.expiredCount} expired session(s).`, 'success');
        loadSessions();
      } else {
        onFeedback(data.error?.message || 'Reconciliation failed', 'error');
      }
    } catch {
      onFeedback('Network error during reconciliation', 'error');
    } finally {
      setIsReconciling(false);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createPkgId) {
      onFeedback('Please select an access package', 'error');
      return;
    }
    setCreateSubmitting(true);
    try {
      const res = await fetch(`${API}/api/v1/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          packageId: createPkgId,
          deviceMac: createMac || undefined,
          clientIp: createIp || undefined,
          initialStatus: createInitialStatus,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onFeedback(`Access session created [${data.session.id.substring(0, 8)}]`, 'success');
        setShowCreateModal(false);
        setCreateMac('');
        setCreateIp('');
        loadSessions();
      } else {
        onFeedback(data.error?.message || 'Failed to create session', 'error');
      }
    } catch {
      onFeedback('Network error creating session', 'error');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const formatRemaining = (seconds: number) => {
    if (seconds <= 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
    }
    return `${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="badge badge-active">Active</span>;
      case 'paused':
        return <span className="badge badge-inactive" style={{ background: '#fef3c7', color: '#92400e' }}>Paused</span>;
      case 'payment_verified':
        return <span className="badge" style={{ background: '#dbeafe', color: '#1e40af' }}>Paid &amp; Ready</span>;
      case 'awaiting_payment':
        return <span className="badge" style={{ background: '#f3e8ff', color: '#6b21a8' }}>Awaiting Pay</span>;
      case 'expired':
        return <span className="badge badge-inactive">Expired</span>;
      case 'revoked':
        return <span className="badge badge-inactive" style={{ background: '#fee2e2', color: '#991b1b' }}>Revoked</span>;
      default:
        return <span className="badge badge-inactive">{status}</span>;
    }
  };

  const activeCount = sessions.filter((s) => s.status === 'active').length;
  const pausedCount = sessions.filter((s) => s.status === 'paused').length;
  const pendingCount = sessions.filter((s) => s.status === 'payment_verified' || s.status === 'awaiting_payment').length;
  const expiredCount = sessions.filter((s) => s.status === 'expired' || s.status === 'revoked').length;

  return (
    <div>
      <div className="heading">
        <div>
          <small>PHASE 8: SERVER-AUTHORITATIVE SESSION CLOCKS</small>
          <h2>Access Sessions &amp; Time Clocks</h2>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-outline"
            onClick={handleReconcileExpiry}
            disabled={isReconciling}
          >
            {isReconciling ? 'Reconciling...' : '🔄 Reconcile Expiry'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (packages.length > 0 && !createPkgId) {
                setCreatePkgId(packages[0].id);
              }
              setShowCreateModal(true);
            }}
          >
            + Create Session
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid" style={{ marginBottom: '1.5rem' }}>
        <article className="card">
          <span className="icon ok">⚡</span>
          <div>
            <h3>{activeCount} Active</h3>
            <p>Live countdown clocks running</p>
          </div>
        </article>
        <article className="card">
          <span className="icon" style={{ background: '#fef3c7', color: '#b45309' }}>⏸</span>
          <div>
            <h3>{pausedCount} Paused</h3>
            <p>Duration clocks frozen</p>
          </div>
        </article>
        <article className="card">
          <span className="icon" style={{ background: '#dbeafe', color: '#1d4ed8' }}>⏳</span>
          <div>
            <h3>{pendingCount} Pending</h3>
            <p>Awaiting gateway activation</p>
          </div>
        </article>
        <article className="card">
          <span className="icon" style={{ background: '#f3f4f6', color: '#6b7280' }}>🏁</span>
          <div>
            <h3>{expiredCount} Terminated</h3>
            <p>Expired or revoked sessions</p>
          </div>
        </article>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {['all', 'active', 'paused', 'payment_verified', 'awaiting_payment', 'expired'].map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setStatusFilter(filter)}
            className={`btn-outline ${statusFilter === filter ? 'btn-primary' : ''}`}
            style={{
              padding: '0.4rem 0.85rem',
              fontSize: '0.8rem',
              textTransform: 'capitalize',
            }}
          >
            {filter.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Sessions Table */}
      <div style={{ background: 'white', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)', overflowX: 'auto', boxShadow: 'var(--shadow-card)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Remaining Time</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Device MAC</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Package</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Expires At (UTC)</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted)' }}>
                  {loading ? 'Loading sessions...' : 'No access sessions found matching current filter.'}
                </td>
              </tr>
            ) : (
              sessions.map((s) => {
                const pkg = packages.find((p) => p.id === s.packageId);
                const isLive = s.status === 'active';
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {getStatusBadge(s.status)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          fontWeight: isLive ? 700 : 500,
                          color: isLive ? 'var(--color-success)' : s.status === 'paused' ? '#b45309' : 'var(--color-muted)',
                          fontFamily: 'monospace',
                          fontSize: '0.95rem',
                        }}
                      >
                        {formatRemaining(s.remainingSeconds)}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>
                      {s.deviceMac || <span style={{ color: 'var(--color-muted)' }}>Unassigned</span>}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {pkg?.name || s.packageId.substring(0, 8)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--color-muted)', fontSize: '0.78rem' }}>
                      {s.expiresAt ? new Date(s.expiresAt).toLocaleTimeString() : 'Not activated'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                        {s.status === 'payment_verified' && (
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                            onClick={() => handleActivate(s.id)}
                          >
                            Activate Now
                          </button>
                        )}
                        {s.status === 'active' && (
                          <>
                            <button
                              type="button"
                              className="btn-outline"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              onClick={() => setExtendSessionId(s.id)}
                            >
                              + Extend
                            </button>
                            <button
                              type="button"
                              className="btn-outline"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              onClick={() => setPauseSessionId(s.id)}
                            >
                              Pause
                            </button>
                            <button
                              type="button"
                              className="btn-outline"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: 'var(--color-danger)' }}
                              onClick={() => setRevokeSessionId(s.id)}
                            >
                              Revoke
                            </button>
                          </>
                        )}
                        {s.status === 'paused' && (
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                            onClick={() => handleResume(s.id)}
                          >
                            Resume
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE SESSION MODAL */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: 'var(--radius-card)', padding: '1.5rem', maxWidth: '440px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Create Access Session</h3>
            <form onSubmit={handleCreateSession}>
              <div className="form-group">
                <label className="form-label">Access Package</label>
                <select
                  className="form-input"
                  value={createPkgId}
                  onChange={(e) => setCreatePkgId(e.target.value)}
                  required
                >
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({Math.round(p.durationSeconds / 60)} mins - ${(p.price.amountMinor / 100).toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Client Device MAC Address (Optional)</label>
                <input
                  type="text"
                  placeholder="AA:BB:CC:11:22:33"
                  className="form-input"
                  value={createMac}
                  onChange={(e) => setCreateMac(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Initial State</label>
                <select
                  className="form-input"
                  value={createInitialStatus}
                  onChange={(e) => setCreateInitialStatus(e.target.value as any)}
                >
                  <option value="payment_verified">Payment Verified (Ready to Activate)</option>
                  <option value="awaiting_payment">Awaiting Payment</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button type="button" className="btn-outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={createSubmitting}>
                  {createSubmitting ? 'Creating...' : 'Create Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXTEND DURATION MODAL */}
      {extendSessionId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: 'var(--radius-card)', padding: '1.5rem', maxWidth: '380px', width: '100%' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Extend Session Duration</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '1rem' }}>
              Add additional time to this active session without interrupting client connectivity.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              {[
                { label: '+15 Mins', secs: 900 },
                { label: '+30 Mins', secs: 1800 },
                { label: '+1 Hour', secs: 3600 },
                { label: '+2 Hours', secs: 7200 },
              ].map((tier) => (
                <button
                  key={tier.secs}
                  type="button"
                  className={`btn-outline ${extendSeconds === tier.secs ? 'btn-primary' : ''}`}
                  onClick={() => setExtendSeconds(tier.secs)}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                >
                  {tier.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button type="button" className="btn-outline" onClick={() => setExtendSessionId(null)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleExtend} disabled={extendSubmitting}>
                {extendSubmitting ? 'Extending...' : 'Confirm Extension'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAUSE MODAL */}
      {pauseSessionId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: 'var(--radius-card)', padding: '1.5rem', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>Pause Access Session</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '1rem' }}>
              Freezes the countdown clock and logs reason in the audit trail.
            </p>
            <div className="form-group">
              <label className="form-label">Pause Reason</label>
              <input
                type="text"
                className="form-input"
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                required
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button type="button" className="btn-outline" onClick={() => setPauseSessionId(null)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handlePause}>
                Pause Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVOKE MODAL */}
      {revokeSessionId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: 'var(--radius-card)', padding: '1.5rem', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-danger)' }}>Revoke Access Session</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '1rem' }}>
              Immediately terminates internet access, sets remaining time to zero, and commands the gateway adapter.
            </p>
            <div className="form-group">
              <label className="form-label">Revocation Reason</label>
              <input
                type="text"
                className="form-input"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                required
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button type="button" className="btn-outline" onClick={() => setRevokeSessionId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ background: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                onClick={handleRevoke}
              >
                Revoke Access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
