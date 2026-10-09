import React, { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_BASE_URL ?? '';

export interface NotificationItem {
  id: string;
  recipientType: string;
  recipientId: string;
  channel: string;
  template: string;
  title: string;
  message: string;
  status: 'pending' | 'delivered' | 'failed' | 'read';
  deliveryAttempts: number;
  maxAttempts: number;
  lastAttemptAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  createdAt: string;
}

interface NotificationsModalProps {
  token: string;
  onClose: () => void;
  onFeedback: (msg: string, type: 'ok' | 'err') => void;
}

export function NotificationsModal({ token, onClose, onFeedback }: NotificationsModalProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setNotifications(d.notifications);
      }
    } catch {
      onFeedback('Failed to load notifications.', 'err');
    } finally {
      setLoading(false);
    }
  }, [token, onFeedback]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkRead = async (id: string) => {
    try {
      const res = await fetch(`${API}/api/v1/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Mark read failed');
      fetchNotifications();
    } catch {
      onFeedback('Failed to mark notification as read.', 'err');
    }
  };

  const handleRetry = async (id: string) => {
    try {
      const res = await fetch(`${API}/api/v1/notifications/${id}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Retry failed');
      onFeedback('Delivery re-attempted successfully.', 'ok');
      fetchNotifications();
    } catch (err: unknown) {
      onFeedback((err as Error).message, 'err');
    }
  };

  const handleCheckExpiring = async () => {
    setChecking(true);
    try {
      const res = await fetch(`${API}/api/v1/notifications/check-expiring`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        onFeedback(`Scanned active sessions: ${data.generatedAlertsCount} warning notification(s) dispatched.`, 'ok');
        fetchNotifications();
      }
    } catch {
      onFeedback('Failed to scan expiring sessions.', 'err');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="card modal-content" style={{ maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>System Notifications &amp; Alerts</h3>
            <small style={{ color: 'rgba(255,255,255,0.6)' }}>
              In-app, portal toasts, and delivery dispatch states
            </small>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button type="button" className="secondary" onClick={handleCheckExpiring} disabled={checking}>
            {checking ? 'Scanning...' : '⏱️ Scan Expiring Sessions'}
          </button>
          <button type="button" className="secondary" onClick={fetchNotifications}>
            🔄 Refresh
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {loading ? (
            <p style={{ textAlign: 'center', padding: '1rem' }}>Loading alerts...</p>
          ) : notifications.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
              No notifications currently recorded.
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                style={{
                  background: n.status === 'read' ? 'rgba(255,255,255,0.02)' : 'rgba(59, 130, 246, 0.08)',
                  border: `1px solid ${n.status === 'read' ? 'rgba(255,255,255,0.06)' : 'rgba(59, 130, 246, 0.25)'}`,
                  borderRadius: '6px',
                  padding: '0.75rem 1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                  <strong>{n.title}</strong>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <span className={`status-pill ${n.status === 'delivered' ? 'active' : n.status === 'failed' ? 'revoked' : ''}`}>
                      {n.status}
                    </span>
                    <small style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                      {new Date(n.createdAt).toLocaleTimeString()}
                    </small>
                  </div>
                </div>

                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)' }}>
                  {n.message}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
                  <span>
                    Channel: <code>{n.channel}</code> · Attempts: {n.deliveryAttempts}/{n.maxAttempts}
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {n.status === 'failed' && (
                      <button
                        type="button"
                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                        onClick={() => handleRetry(n.id)}
                      >
                        Retry
                      </button>
                    )}
                    {n.status !== 'read' && (
                      <button
                        type="button"
                        className="secondary"
                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                        onClick={() => handleMarkRead(n.id)}
                      >
                        Mark Read
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
