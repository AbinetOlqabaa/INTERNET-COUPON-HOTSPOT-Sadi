import React, { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_BASE_URL ?? '';

interface SegmentsData {
  summary: {
    VIP: { count: number; customerIds: string[] };
    REGULAR: { count: number; customerIds: string[] };
    AT_RISK: { count: number; customerIds: string[] };
    NEW: { count: number; customerIds: string[] };
  };
  totalCustomers: number;
  rules: Record<string, string>;
}

interface CustomerProfile {
  customerId: string;
  displayName?: string | null;
  segment: 'VIP' | 'REGULAR' | 'AT_RISK' | 'NEW';
  segmentExplanation: {
    criteria: string;
    evidence: Record<string, unknown>;
  };
  badges: Array<{
    id: string;
    badgeCode: string;
    name: string;
    criteriaEvidence: Record<string, unknown>;
    awardedAt: string;
  }>;
  bonuses: Array<{
    id: string;
    bonusType: string;
    amountUnits: number;
    budgetDeductionMinor: number;
    status: string;
    expiresAt: string;
    auditReason: string;
  }>;
  lifetimeSpendMinor: number;
  totalSessions: number;
}

interface LoyaltyViewProps {
  token: string;
  onFeedback: (msg: string, type: 'ok' | 'err') => void;
}

export function LoyaltyView({ token, onFeedback }: LoyaltyViewProps) {
  const [segments, setSegments] = useState<SegmentsData | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(false);

  // Form states for granting bonuses
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [bonusType, setBonusType] = useState<'free_minutes' | 'discount_voucher'>('free_minutes');
  const [bonusAmount, setBonusAmount] = useState(30);
  const [budgetDeduction, setBudgetDeduction] = useState(100);
  const [bonusReason, setBonusReason] = useState('Customer Loyalty Reward');
  const [granting, setGranting] = useState(false);

  const fetchSegments = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/v1/loyalty/segments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSegments(await res.json());
      }
    } catch {
      onFeedback('Failed to load loyalty segments.', 'err');
    }
  }, [token, onFeedback]);

  useEffect(() => {
    fetchSegments();
  }, [fetchSegments]);

  const loadCustomer = async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/loyalty/customers/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setCustomerProfile(await res.json());
        setSelectedCustomerId(id);
      } else {
        onFeedback('Customer loyalty profile not found.', 'err');
      }
    } catch {
      onFeedback('Failed to fetch customer profile.', 'err');
    } finally {
      setLoading(false);
    }
  };

  const handleAwardBadge = async (code: 'EARLY_ADOPTER' | 'LOYAL_STREAMER' | 'WEEKEND_WARRIOR' | 'COMMUNITY_REGULAR') => {
    if (!selectedCustomerId) return;
    try {
      const res = await fetch(`${API}/api/v1/loyalty/badges`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          badgeCode: code,
          evidence: { manualGrantBy: 'owner', timestamp: new Date().toISOString() },
        }),
      });
      if (!res.ok) throw new Error('Badge award failed');
      onFeedback(`Badge awarded successfully!`, 'ok');
      loadCustomer(selectedCustomerId);
    } catch {
      onFeedback('Failed to award badge.', 'err');
    }
  };

  const handleGrantBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;
    setGranting(true);
    try {
      const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      const res = await fetch(`${API}/api/v1/loyalty/bonuses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          bonusType,
          amountUnits: Number(bonusAmount),
          budgetDeductionMinor: Number(budgetDeduction),
          expiresAt,
          auditReason: bonusReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Bonus grant failed');
      onFeedback('Bounded bonus granted and audited.', 'ok');
      setShowBonusModal(false);
      loadCustomer(selectedCustomerId);
    } catch (err: unknown) {
      onFeedback((err as Error).message, 'err');
    } finally {
      setGranting(false);
    }
  };

  return (
    <div className="tab-pane active">
      <div className="heading">
        <div>
          <small>CUSTOMER RELATIONSHIP &amp; RETENTION</small>
          <h2>Explainable Segments &amp; Loyalty</h2>
          <p>
            Objective, privacy-preserving classification based on recency, frequency, and spend.
          </p>
        </div>
        <button type="button" onClick={fetchSegments}>
          🔄 Refresh Segments
        </button>
      </div>

      {segments && (
        <div className="grid" style={{ marginBottom: '1.5rem' }}>
          <article className="card">
            <span className="icon ok">⭐</span>
            <div>
              <h3>VIP Cohort ({segments.summary.VIP.count})</h3>
              <p>{segments.rules.VIP}</p>
            </div>
            <small>High Value</small>
          </article>

          <article className="card">
            <span className="icon ok">🌱</span>
            <div>
              <h3>New Visitors ({segments.summary.NEW.count})</h3>
              <p>{segments.rules.NEW}</p>
            </div>
            <small>Onboarding</small>
          </article>

          <article className="card">
            <span className="icon ok">👥</span>
            <div>
              <h3>Regulars ({segments.summary.REGULAR.count})</h3>
              <p>{segments.rules.REGULAR}</p>
            </div>
            <small>Core</small>
          </article>

          <article className="card">
            <span className="icon warn">⚠️</span>
            <div>
              <h3>At-Risk ({segments.summary.AT_RISK.count})</h3>
              <p>{segments.rules.AT_RISK}</p>
            </div>
            <small>Win-Back</small>
          </article>
        </div>
      )}

      {/* Customer Lookup & Profile Card */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>Inspect Customer Loyalty Profile</h3>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
          Enter a customer UUID to inspect explainable segment evidence, awarded badges, and grant bounded bonuses.
        </p>

        <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '600px', marginBottom: '1.25rem' }}>
          <input
            type="text"
            placeholder="Paste customer ID..."
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value.trim())}
          />
          <button type="button" onClick={() => loadCustomer(selectedCustomerId)} disabled={loading}>
            {loading ? 'Inspecting...' : 'Inspect Profile'}
          </button>
        </div>

        {customerProfile && (
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <h4 style={{ margin: '0 0 0.25rem 0' }}>
                  {customerProfile.displayName || 'Customer'} (
                  <span style={{ color: '#3b82f6' }}>{customerProfile.segment}</span>)
                </h4>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>
                  ID: <code>{customerProfile.customerId}</code>
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="secondary" onClick={() => setShowBonusModal(true)}>
                  🎁 Grant Bounded Bonus
                </button>
              </div>
            </div>

            {/* Explanation Evidence Card */}
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
              <strong>Segment Explanation:</strong> {customerProfile.segmentExplanation.criteria}
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', color: 'rgba(255,255,255,0.8)' }}>
                Evidence:{' '}
                <code>{JSON.stringify(customerProfile.segmentExplanation.evidence)}</code>
              </div>
            </div>

            {/* Badges */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h5 style={{ margin: 0 }}>Awarded Badges ({customerProfile.badges.length})</h5>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button type="button" className="secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }} onClick={() => handleAwardBadge('COMMUNITY_REGULAR')}>
                    + Community Regular
                  </button>
                  <button type="button" className="secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }} onClick={() => handleAwardBadge('LOYAL_STREAMER')}>
                    + Loyal Streamer
                  </button>
                </div>
              </div>
              {customerProfile.badges.length > 0 ? (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {customerProfile.badges.map((b) => (
                    <span key={b.id} style={{ background: 'rgba(255,255,255,0.1)', padding: '0.25rem 0.6rem', borderRadius: '12px', fontSize: '0.85rem' }}>
                      🏅 {b.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>No badges awarded yet.</p>
              )}
            </div>

            {/* Active Bonuses */}
            <div>
              <h5 style={{ margin: '0 0 0.5rem 0' }}>Granted Bonuses ({customerProfile.bonuses.length})</h5>
              {customerProfile.bonuses.length > 0 ? (
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Benefit</th>
                        <th>Budget Minor</th>
                        <th>Status</th>
                        <th>Expires</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerProfile.bonuses.map((b) => (
                        <tr key={b.id}>
                          <td>{b.bonusType}</td>
                          <td>{b.bonusType === 'free_minutes' ? `${b.amountUnits} Mins` : `${b.amountUnits}% Off`}</td>
                          <td>{b.budgetDeductionMinor}</td>
                          <td>
                            <span className={`status-pill ${b.status === 'active' ? 'active' : ''}`}>
                              {b.status}
                            </span>
                          </td>
                          <td>{new Date(b.expiresAt).toLocaleDateString()}</td>
                          <td>{b.auditReason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>No bonuses granted.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Grant Bonus Modal */}
      {showBonusModal && (
        <div className="modal-backdrop">
          <div className="card modal-content" style={{ maxWidth: '480px' }}>
            <h3>Grant Bounded Customer Bonus</h3>
            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>
              All bonuses are strictly budget-capped, expire automatically, and require human owner authorization.
            </p>

            <form onSubmit={handleGrantBonus}>
              <label>
                Bonus Type:
                <select value={bonusType} onChange={(e) => setBonusType(e.target.value as any)}>
                  <option value="free_minutes">Free Internet Minutes</option>
                  <option value="discount_voucher">Discount Voucher (%)</option>
                </select>
              </label>

              <label>
                Benefit Units (Minutes or %):
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={bonusAmount}
                  onChange={(e) => setBonusAmount(Number(e.target.value))}
                  required
                />
              </label>

              <label>
                Budget Deduction (Integer Minor Units):
                <input
                  type="number"
                  min="0"
                  value={budgetDeduction}
                  onChange={(e) => setBudgetDeduction(Number(e.target.value))}
                  required
                />
              </label>

              <label>
                Audit Reason:
                <input
                  type="text"
                  value={bonusReason}
                  onChange={(e) => setBonusReason(e.target.value)}
                  required
                />
              </label>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" className="secondary" onClick={() => setShowBonusModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={granting}>
                  {granting ? 'Granting...' : 'Confirm Grant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <aside>
        <strong>Explainability &amp; Safety Constraint</strong>
        <p>
          Segmentation algorithms use only transparent activity rules without tracking sensitive demographic traits.
          AI can recommend bonuses, but cannot independently grant money or authorize access without explicit owner audit.
        </p>
      </aside>
    </div>
  );
}
