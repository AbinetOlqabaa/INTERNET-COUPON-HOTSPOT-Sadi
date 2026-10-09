import React, { useState, useEffect } from 'react';
import { PWAInstallButton } from './PWAInstallButton.js';
import { OfflineIndicator } from './OfflineIndicator.js';

const API = import.meta.env.VITE_API_BASE_URL ?? '';

interface PublicSessionData {
  id: string;
  status: 'created' | 'awaiting_payment' | 'payment_verified' | 'activation_pending' | 'active' | 'expired' | 'activation_failed' | 'paused' | 'revoked' | 'cancelled';
  durationSeconds: number;
  remainingSeconds: number;
  activatedAt?: string | null;
  expiresAt?: string | null;
  deviceMac?: string | null;
  packageName?: string;
}

interface CustomerPortalViewProps {
  ownerId?: string;
  businessName?: string;
  onFeedback: (message: string, type: 'success' | 'error') => void;
}

export function CustomerPortalView({ ownerId, businessName, onFeedback }: CustomerPortalViewProps) {
  const [voucherCode, setVoucherCode] = useState('');
  const [deviceMac, setDeviceMac] = useState('AA:BB:CC:DD:EE:FF');
  const [isRedeeming, setIsRedeeming] = useState(false);

  // Active Customer Session
  const [activeSession, setActiveSession] = useState<PublicSessionData | null>(() => {
    const saved = localStorage.getItem('hotspot_customer_session');
    if (saved) {
      try { return JSON.parse(saved); } catch { return null; }
    }
    return null;
  });

  const [polling, setPolling] = useState(false);

  // Poll public session status from server
  const pollSession = async (sessionId: string) => {
    setPolling(true);
    try {
      const res = await fetch(`${API}/api/v1/sessions/public/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveSession(data.session);
        localStorage.setItem('hotspot_customer_session', JSON.stringify(data.session));
      } else if (res.status === 404) {
        onFeedback('Session was not found or has been purged', 'error');
        setActiveSession(null);
        localStorage.removeItem('hotspot_customer_session');
      }
    } catch {
      onFeedback('Network error checking session status', 'error');
    } finally {
      setPolling(false);
    }
  };

  // Real-time local countdown clock for active session
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'active') return;

    const interval = setInterval(() => {
      setActiveSession((prev) => {
        if (!prev || prev.status !== 'active' || prev.remainingSeconds <= 0) return prev;
        const nextSecs = prev.remainingSeconds - 1;
        if (nextSecs <= 0) {
          return { ...prev, remainingSeconds: 0, status: 'expired' };
        }
        return { ...prev, remainingSeconds: nextSecs };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession?.status]);

  const handleRedeemVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucherCode.trim()) {
      onFeedback('Please enter a voucher code', 'error');
      return;
    }

    if (!ownerId) {
      onFeedback('Owner context not detected. Please ensure an operator is registered.', 'error');
      return;
    }

    setIsRedeeming(true);
    try {
      const res = await fetch(`${API}/api/v1/sessions/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerId,
          code: voucherCode.trim().toUpperCase(),
          deviceMac: deviceMac || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActiveSession(data.session);
        localStorage.setItem('hotspot_customer_session', JSON.stringify(data.session));
        onFeedback(`Voucher redeemed! Connected to ${data.packageName}`, 'success');
        setVoucherCode('');
      } else {
        onFeedback(data.error?.message || 'Voucher redemption failed', 'error');
      }
    } catch {
      onFeedback('Network error redeeming voucher', 'error');
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleDisconnectLocal = () => {
    setActiveSession(null);
    localStorage.removeItem('hotspot_customer_session');
    onFeedback('Cleared local portal session state', 'success');
  };

  const formatRemainingTime = (seconds: number) => {
    if (seconds <= 0) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      {/* Mobile-Friendly Captive Portal Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--color-brand-primary), #1e3a8a)',
          color: 'white',
          borderRadius: 'var(--radius-card)',
          padding: '2rem 1.5rem',
          textAlign: 'center',
          boxShadow: 'var(--shadow-card)',
          marginBottom: '1.5rem',
        }}
      >
        <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>📶</span>
        <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.5rem' }}>{businessName || 'Hotspot Wi-Fi Portal'}</h2>
        <p style={{ margin: '0 0 1rem 0', opacity: 0.85, fontSize: '0.9rem' }}>
          Customer Self-Service Internet Access &amp; Voucher Portal
        </p>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <PWAInstallButton compact />
        </div>
      </div>
      <OfflineIndicator />

      {/* ACTIVE SESSION CARD */}
      {activeSession ? (
        <div
          style={{
            background: 'white',
            borderRadius: 'var(--radius-card)',
            padding: '1.5rem',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-card)',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-brand-primary)' }}>
              {activeSession.packageName || 'Internet Access Pass'}
            </span>
            <span
              className={`badge ${
                activeSession.status === 'active'
                  ? 'badge-active'
                  : activeSession.status === 'paused'
                  ? 'badge-inactive'
                  : 'badge-inactive'
              }`}
              style={{
                background:
                  activeSession.status === 'active'
                    ? '#dcfce7'
                    : activeSession.status === 'paused'
                    ? '#fef3c7'
                    : '#fee2e2',
                color:
                  activeSession.status === 'active'
                    ? '#166534'
                    : activeSession.status === 'paused'
                    ? '#92400e'
                    : '#991b1b',
              }}
            >
              {activeSession.status.toUpperCase()}
            </span>
          </div>

          {/* Large Countdown Display */}
          <div
            style={{
              background: 'var(--color-bg)',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              textAlign: 'center',
              marginBottom: '1.25rem',
              border: '1px solid var(--color-border)',
            }}
          >
            <small style={{ textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', fontWeight: 700 }}>
              Remaining Time
            </small>
            <div
              style={{
                fontSize: '2.5rem',
                fontFamily: 'monospace',
                fontWeight: 800,
                color:
                  activeSession.status === 'active'
                    ? 'var(--color-success)'
                    : activeSession.status === 'paused'
                    ? '#b45309'
                    : 'var(--color-danger)',
                margin: '0.25rem 0',
              }}
            >
              {formatRemainingTime(activeSession.remainingSeconds)}
            </div>
            <small style={{ color: 'var(--color-muted)' }}>
              {activeSession.status === 'active'
                ? 'Countdown clock verified with server UTC timestamps'
                : activeSession.status === 'paused'
                ? 'Session is temporarily paused by operator'
                : 'Session duration has concluded'}
            </small>
          </div>

          {/* Session Details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            <div>
              <span style={{ color: 'var(--color-muted)' }}>Device MAC:</span>
              <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{activeSession.deviceMac || 'Auto-Detected'}</div>
            </div>
            <div>
              <span style={{ color: 'var(--color-muted)' }}>Expires At:</span>
              <div style={{ fontWeight: 600 }}>
                {activeSession.expiresAt ? new Date(activeSession.expiresAt).toLocaleTimeString() : 'N/A'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn-outline"
              style={{ flex: 1 }}
              onClick={() => pollSession(activeSession.id)}
              disabled={polling}
            >
              {polling ? 'Checking...' : '🔄 Refresh Status'}
            </button>
            <button
              type="button"
              className="btn-outline"
              style={{ flex: 1, color: 'var(--color-danger)' }}
              onClick={handleDisconnectLocal}
            >
              Log Out
            </button>
          </div>
        </div>
      ) : (
        /* VOUCHER REDEMPTION CARD */
        <div
          style={{
            background: 'white',
            borderRadius: 'var(--radius-card)',
            padding: '1.75rem',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-card)',
            marginBottom: '1.5rem',
          }}
        >
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Redeem Internet Coupon / Voucher</h3>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Enter the voucher code from your printed receipt or SMS ticket to start your session.
          </p>

          <form onSubmit={handleRedeemVoucher}>
            <div className="form-group">
              <label className="form-label">Voucher / Coupon Code</label>
              <input
                type="text"
                placeholder="e.g. PASS_1HR_XYZ or COUPON"
                className="form-input"
                style={{ fontSize: '1.1rem', letterSpacing: '0.05em', textTransform: 'uppercase', textAlign: 'center', fontWeight: 700 }}
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Client Device MAC (Auto-Detected)</label>
              <input
                type="text"
                className="form-input"
                value={deviceMac}
                onChange={(e) => setDeviceMac(e.target.value)}
                placeholder="AA:BB:CC:DD:EE:FF"
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', marginTop: '0.5rem' }}
              disabled={isRedeeming}
            >
              {isRedeeming ? 'Validating Voucher...' : 'Connect to High-Speed Internet'}
            </button>
          </form>
        </div>
      )}

      {/* Connection Help & Guide */}
      <div
        style={{
          background: 'white',
          borderRadius: 'var(--radius-card)',
          padding: '1.5rem',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <h4 style={{ margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>ℹ️</span> Hotspot Instructions &amp; Help
        </h4>
        <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--color-muted)', display: 'flex', flexDirection: 'column', gap: '0.4rem', lineHeight: 1.5 }}>
          <li>
            <strong>Connect to Hotspot:</strong> Connect your device to the local Wi-Fi hotspot network.
          </li>
          <li>
            <strong>Get a Voucher:</strong> Purchase an access voucher from the front desk cashier or select an online package.
          </li>
          <li>
            <strong>Activate Access:</strong> Enter your voucher code above and click <em>Connect</em>.
          </li>
          <li>
            <strong>Keep Page Open:</strong> You can return to this portal at any time to check remaining time or extend your access.
          </li>
        </ol>
      </div>
    </div>
  );
}
