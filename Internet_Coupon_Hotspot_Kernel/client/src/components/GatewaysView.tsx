import React, { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_BASE_URL ?? '';

interface GatewayItem {
  id: string;
  name: string;
  mode: 'limited_owner_mode' | 'managed_gateway_mode';
  adapterType: string;
  status: string;
  host?: string | null;
  port?: number | null;
  lastSeenAt?: string | null;
}

interface GatewayCapabilities {
  mode: string;
  canAuthorizeAccess: boolean;
  canDisconnectClient: boolean;
  canLimitBandwidth: boolean;
  canMeasureTraffic: boolean;
  requiresHardwareGateway: boolean;
  disclosureStatement: string;
}

interface GatewaysViewProps {
  token: string;
  onFeedback: (message: string, type: 'success' | 'error') => void;
}

export function GatewaysView({ token, onFeedback }: GatewaysViewProps) {
  const [gateways, setGateways] = useState<GatewayItem[]>([]);
  const [activeAdapter, setActiveAdapter] = useState<string>('limited_owner');
  const [capabilities, setCapabilities] = useState<GatewayCapabilities | null>(null);
  const [loading, setLoading] = useState(false);

  // Register Gateway Form
  const [newGwName, setNewGwName] = useState('RouterOS Main Gateway');
  const [newGwMode, setNewGwMode] = useState<'limited_owner_mode' | 'managed_gateway_mode'>('managed_gateway_mode');
  const [newGwAdapter, setNewGwAdapter] = useState('mock_test_gateway');
  const [registering, setRegistering] = useState(false);

  // Diagnostics Panel
  const [selectedGwId, setSelectedGwId] = useState<string>('');
  const [diagMac, setDiagMac] = useState('11:22:33:44:55:66');
  const [diagResult, setDiagResult] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const loadGateways = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/gateways`, { headers });
      if (res.ok) {
        const data = await res.json();
        setGateways(data.gateways || []);
        setActiveAdapter(data.activeAdapter || 'limited_owner');
        setCapabilities(data.capabilities || null);
        if (data.gateways?.length > 0 && !selectedGwId) {
          setSelectedGwId(data.gateways[0].id);
        }
      }
    } catch {
      onFeedback('Failed to load gateways', 'error');
    } finally {
      setLoading(false);
    }
  }, [token, selectedGwId]);

  useEffect(() => {
    loadGateways();
  }, [loadGateways]);

  const handleRegisterGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    try {
      const res = await fetch(`${API}/api/v1/gateways`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: newGwName,
          mode: newGwMode,
          adapterType: newGwAdapter,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onFeedback(`Gateway registered successfully [${data.gateway.name}]`, 'success');
        setNewGwName('');
        loadGateways();
      } else {
        onFeedback(data.error?.message || 'Failed to register gateway', 'error');
      }
    } catch {
      onFeedback('Network error registering gateway', 'error');
    } finally {
      setRegistering(false);
    }
  };

  const handleCheckHealth = async () => {
    if (!selectedGwId) {
      onFeedback('Please select or register a gateway first', 'error');
      return;
    }
    setDiagLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/gateways/${selectedGwId}/health`, { headers });
      const data = await res.json();
      if (res.ok) {
        setDiagResult({ type: 'HEALTH_CHECK', data: data.health });
        onFeedback('Health check probe received', 'success');
      } else {
        onFeedback(data.error?.message || 'Health check probe failed', 'error');
      }
    } catch {
      onFeedback('Network error querying gateway health', 'error');
    } finally {
      setDiagLoading(false);
    }
  };

  const handleQueryAccounting = async () => {
    if (!selectedGwId) {
      onFeedback('Please select or register a gateway first', 'error');
      return;
    }
    setDiagLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/gateways/${selectedGwId}/accounting/${encodeURIComponent(diagMac)}`, { headers });
      const data = await res.json();
      if (res.ok) {
        setDiagResult({ type: 'ACCOUNTING_QUERY', data: data.accounting });
        onFeedback('Client traffic accounting retrieved', 'success');
      } else {
        onFeedback(data.error?.message || 'Accounting query failed', 'error');
      }
    } catch {
      onFeedback('Network error querying accounting', 'error');
    } finally {
      setDiagLoading(false);
    }
  };

  const handleTestDisconnect = async () => {
    if (!selectedGwId) {
      onFeedback('Please select or register a gateway first', 'error');
      return;
    }
    setDiagLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/gateways/${selectedGwId}/disconnect`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clientMac: diagMac,
          reason: 'Manual operator test kick',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setDiagResult({ type: 'DISCONNECT_COMMAND', data: data.result });
        onFeedback(`Disconnect command sent to client [${diagMac}]`, 'success');
      } else {
        onFeedback(data.error?.message || 'Disconnect command failed', 'error');
      }
    } catch {
      onFeedback('Network error executing disconnect', 'error');
    } finally {
      setDiagLoading(false);
    }
  };

  return (
    <div>
      <div className="heading">
        <div>
          <small>PHASE 9 &amp; 10: GATEWAY ADAPTERS &amp; NETWORK REALITY</small>
          <h2>Network Gateways &amp; Enforcement</h2>
        </div>
        <button type="button" className="btn-outline" onClick={loadGateways} disabled={loading}>
          {loading ? 'Refreshing...' : '🔄 Refresh Gateways'}
        </button>
      </div>

      {/* Prominent Architectural Disclosures */}
      <div className="grid" style={{ marginBottom: '1.5rem' }}>
        <article className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <span className="icon" style={{ background: '#fef3c7', color: '#b45309' }}>📱</span>
          <div>
            <h3>Mode A: Limited Owner Mode (Android Hotspot)</h3>
            <p style={{ margin: '0.4rem 0', fontSize: '0.85rem', lineHeight: 1.5 }}>
              Standard Android phones &amp; tablets running Wi-Fi hotspot <strong>cannot</strong> disconnect individual clients,
              limit bandwidth queues, or inspect per-client traffic bytes without a dedicated managed network gateway.
            </p>
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <span className="badge badge-inactive">Disconnect: Unsupported</span>
              <span className="badge badge-inactive">Bandwidth: Unmanaged</span>
              <span className="badge badge-inactive">Per-Client Bytes: Estimated</span>
            </div>
          </div>
        </article>

        <article className="card" style={{ borderLeft: '4px solid var(--color-brand-secondary)' }}>
          <span className="icon ok">🌐</span>
          <div>
            <h3>Mode B: Managed Gateway Mode (Hardware Router)</h3>
            <p style={{ margin: '0.4rem 0', fontSize: '0.85rem', lineHeight: 1.5 }}>
              Compatible with <strong>MikroTik RouterOS, OpenWrt, CoovaChilli</strong>, or managed RADIUS/REST controllers.
              Enforces real client kicks, dynamic bandwidth queues, and hardware-measured byte counters.
            </p>
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <span className="badge badge-active">Disconnect: Authoritative</span>
              <span className="badge badge-active">Bandwidth: Enforced</span>
              <span className="badge badge-active">Bytes: Hardware Counter</span>
            </div>
          </div>
        </article>
      </div>

      {/* Hardware Acceptance Truth In Labeling Notice */}
      <div style={{ background: '#f8fafc', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1rem 1.25rem', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <strong style={{ color: 'var(--color-brand-primary)' }}>Hardware Verification Disclosure:</strong>
          <span className="badge badge-inactive">Physical Hardware: NOT TESTED</span>
          <span className="badge badge-active">Test Harness Adapter: VERIFIED</span>
        </div>
        <p style={{ margin: 0, color: 'var(--color-muted)' }}>
          Physical hardware router tests require access to real on-premise MikroTik or OpenWrt appliances.
          The platform operates reliably with the validated <strong>Mock Test Gateway</strong> adapter for development, automated verification, and testing.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Register Gateway Form */}
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
          <h3 style={{ margin: '0 0 1rem 0' }}>Register Network Gateway</h3>
          <form onSubmit={handleRegisterGateway}>
            <div className="form-group">
              <label className="form-label">Gateway Friendly Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Front-Desk MikroTik hAP ac3"
                value={newGwName}
                onChange={(e) => setNewGwName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Operational Mode</label>
              <select
                className="form-input"
                value={newGwMode}
                onChange={(e) => {
                  const m = e.target.value as any;
                  setNewGwMode(m);
                  setNewGwAdapter(m === 'limited_owner_mode' ? 'limited_owner' : 'mock_test_gateway');
                }}
              >
                <option value="managed_gateway_mode">Mode B: Managed Gateway (RouterOS / Mock Gateway)</option>
                <option value="limited_owner_mode">Mode A: Limited Owner Mode (Android System Hotspot)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Gateway Adapter</label>
              <select
                className="form-input"
                value={newGwAdapter}
                onChange={(e) => setNewGwAdapter(e.target.value)}
              >
                <option value="mock_test_gateway">Mock Test Gateway Adapter (Validated Test Harness)</option>
                <option value="limited_owner">Limited Owner Adapter (Native Unmanaged Android)</option>
              </select>
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={registering}>
              {registering ? 'Registering...' : '+ Register Gateway'}
            </button>
          </form>
        </div>

        {/* Diagnostics & Command Test Harness */}
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Gateway Diagnostics Harness</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '1rem' }}>
            Dispatch test commands to verify adapter communication, traffic telemetry, and client kicks.
          </p>

          <div className="form-group">
            <label className="form-label">Target Gateway</label>
            <select
              className="form-input"
              value={selectedGwId}
              onChange={(e) => setSelectedGwId(e.target.value)}
            >
              {gateways.length === 0 ? (
                <option value="">No registered gateways (Limited Owner default active)</option>
              ) : (
                gateways.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} [{g.adapterType}] ({g.status})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Test Client MAC Address</label>
            <input
              type="text"
              className="form-input"
              value={diagMac}
              onChange={(e) => setDiagMac(e.target.value)}
              placeholder="11:22:33:44:55:66"
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <button
              type="button"
              className="btn-outline"
              onClick={handleCheckHealth}
              disabled={diagLoading}
              style={{ fontSize: '0.8rem' }}
            >
              🩺 Probe Health
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={handleQueryAccounting}
              disabled={diagLoading}
              style={{ fontSize: '0.8rem' }}
            >
              📊 Query Bytes
            </button>
            <button
              type="button"
              className="btn-outline"
              style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}
              onClick={handleTestDisconnect}
              disabled={diagLoading}
            >
              ⚡ Disconnect MAC
            </button>
          </div>

          {diagResult && (
            <div style={{ marginTop: '1rem', background: '#0f172a', color: '#38bdf8', padding: '0.85rem', borderRadius: '0.5rem', fontFamily: 'monospace', fontSize: '0.78rem', overflowX: 'auto' }}>
              <div style={{ color: '#94a3b8', marginBottom: '0.35rem' }}>// Result: {diagResult.type}</div>
              <pre style={{ margin: 0 }}>{JSON.stringify(diagResult.data, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>

      {/* Registered Gateways Table */}
      <div style={{ marginTop: '1.5rem', background: 'white', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Name</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Mode</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Adapter</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {gateways.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-muted)' }}>
                  No physical hardware gateways registered yet. Defaulting to built-in Limited Owner Mode.
                </td>
              </tr>
            ) : (
              gateways.map((g) => (
                <tr key={g.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{g.name}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className="badge badge-inactive">
                      {g.mode === 'managed_gateway_mode' ? 'Managed Router' : 'Android Hotspot'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>{g.adapterType}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className={`badge ${g.status === 'online' ? 'badge-active' : 'badge-inactive'}`}>
                      {g.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--color-muted)', fontSize: '0.78rem' }}>
                    {g.lastSeenAt ? new Date(g.lastSeenAt).toLocaleString() : 'Never'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
