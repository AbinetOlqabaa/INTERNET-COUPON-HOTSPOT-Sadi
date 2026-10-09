import React, { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_BASE_URL ?? '';

interface AIProvider {
  id: string;
  provider: 'gemini' | 'groq' | 'ollama' | 'openai_compatible';
  model: string;
  type: 'hosted' | 'local';
  endpoint?: string | null;
  maskedKey: string;
  capabilities: string[];
  isFreeTier: boolean;
  priority: number;
  enabled: boolean;
  health: 'healthy' | 'degraded' | 'rate_limited' | 'unreachable';
  quotaEvidence?: {
    remainingRequests?: number;
    resetAt?: string;
    source: string;
  };
}

interface ForecastData {
  forecastPeriod: string;
  projectedRevenueMinor: number;
  projectedSessions: number;
  uncertaintyBandPercent: number;
  minimumDataWarning?: string | null;
  dataFreshness: string;
  disclaimer: string;
}

interface Anomaly {
  id: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  recommendation: string;
  detectedAt: string;
}

interface AICopilotViewProps {
  token: string;
  currency?: string;
  onFeedback: (msg: string, type: 'ok' | 'err') => void;
}

export function AICopilotView({ token, currency = 'USD', onFeedback }: AICopilotViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'copilot' | 'providers' | 'forecast' | 'anomalies' | 'support'>('copilot');
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);

  // Copilot Chat
  const [copilotQuestion, setCopilotQuestion] = useState('');
  const [copilotAnswer, setCopilotAnswer] = useState<{
    query: string;
    response: string;
    providerUsed: string;
    freeTierRouting: boolean;
    citedSources: string[];
    safetyPolicy: { requiresOwnerConfirmation: boolean; automatedActionPermitted: boolean; note: string };
  } | null>(null);
  const [asking, setAsking] = useState(false);

  // Support Drafter
  const [customerIssue, setCustomerIssue] = useState('');
  const [supportDraft, setSupportDraft] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);

  // New Provider Form
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProvider, setNewProvider] = useState<'gemini' | 'groq' | 'ollama' | 'openai_compatible'>('gemini');
  const [newModel, setNewModel] = useState('gemini-1.5-flash');
  const [newKey, setNewKey] = useState('');
  const [isFree, setIsFree] = useState(true);
  const [priority, setPriority] = useState(1);
  const [savingProvider, setSavingProvider] = useState(false);

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/v1/ai/providers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setProviders(d.providers);
      }
    } catch {
      // ignore
    }
  }, [token]);

  const fetchForecast = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/v1/ai/forecast`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setForecast(await res.json());
    } catch {
      // ignore
    }
  }, [token]);

  const fetchAnomalies = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/v1/ai/anomalies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setAnomalies(d.anomalies);
      }
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    fetchProviders();
    fetchForecast();
    fetchAnomalies();
  }, [fetchProviders, fetchForecast, fetchAnomalies]);

  const handleAskCopilot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!copilotQuestion.trim()) return;
    setAsking(true);
    try {
      const res = await fetch(`${API}/api/v1/ai/copilot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question: copilotQuestion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Copilot query failed');
      setCopilotAnswer(data);
    } catch (err: unknown) {
      onFeedback((err as Error).message, 'err');
    } finally {
      setAsking(false);
    }
  };

  const handleDraftSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerIssue.trim()) return;
    setDrafting(true);
    try {
      const res = await fetch(`${API}/api/v1/ai/support-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ customerIssue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Support draft failed');
      setSupportDraft(data.draftResponse);
      onFeedback('Privacy-safe response draft generated.', 'ok');
    } catch (err: unknown) {
      onFeedback((err as Error).message, 'err');
    } finally {
      setDrafting(false);
    }
  };

  const handleCreateProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProvider(true);
    try {
      const res = await fetch(`${API}/api/v1/ai/providers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider: newProvider,
          model: newModel,
          apiKey: newKey || undefined,
          isFreeTier: isFree,
          priority: Number(priority),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Registration failed');
      onFeedback('AI Provider registered with masked key.', 'ok');
      setShowAddProvider(false);
      setNewKey('');
      fetchProviders();
    } catch (err: unknown) {
      onFeedback((err as Error).message, 'err');
    } finally {
      setSavingProvider(false);
    }
  };

  const handleTestProvider = async (id: string) => {
    try {
      const res = await fetch(`${API}/api/v1/ai/providers/${id}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Test failed');
      onFeedback(`Health check OK (${data.latencyMs}ms). Quota source: ${data.quotaEvidence.source}`, 'ok');
      fetchProviders();
    } catch (err: unknown) {
      onFeedback((err as Error).message, 'err');
    }
  };

  return (
    <div className="tab-pane active">
      <div className="heading">
        <div>
          <small>AI INFRASTRUCTURE &amp; ASSISTANCE</small>
          <h2>Operations Copilot &amp; Provider Registry</h2>
          <p>
            Free-first routing, masked API keys, privacy-safe drafts, and grounded business assistance.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className={activeSubTab === 'copilot' ? '' : 'secondary'}
            onClick={() => setActiveSubTab('copilot')}
          >
            💬 Copilot
          </button>
          <button
            type="button"
            className={activeSubTab === 'forecast' ? '' : 'secondary'}
            onClick={() => setActiveSubTab('forecast')}
          >
            📈 Forecasts
          </button>
          <button
            type="button"
            className={activeSubTab === 'anomalies' ? '' : 'secondary'}
            onClick={() => setActiveSubTab('anomalies')}
          >
            🚨 Anomalies ({anomalies.length})
          </button>
          <button
            type="button"
            className={activeSubTab === 'support' ? '' : 'secondary'}
            onClick={() => setActiveSubTab('support')}
          >
            ✉️ Support Drafter
          </button>
          <button
            type="button"
            className={activeSubTab === 'providers' ? '' : 'secondary'}
            onClick={() => setActiveSubTab('providers')}
          >
            ⚙️ Providers ({providers.length})
          </button>
        </div>
      </div>

      {/* SUB-TAB: COPILOT */}
      {activeSubTab === 'copilot' && (
        <div>
          <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
            <h3 style={{ marginTop: 0 }}>Business Operations Assistant</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
              Ask questions about sales, active packages, or gateway status. Responses cite verified ledger records and
              cannot execute automated destructive commands.
            </p>

            <form onSubmit={handleAskCopilot}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <input
                  type="text"
                  placeholder="e.g. What is our net revenue and active session count today?"
                  value={copilotQuestion}
                  onChange={(e) => setCopilotQuestion(e.target.value)}
                  required
                />
                <button type="submit" disabled={asking}>
                  {asking ? 'Consulting...' : 'Ask Copilot'}
                </button>
              </div>
            </form>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <button
                type="button"
                className="secondary"
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}
                onClick={() => setCopilotQuestion('What is our current revenue and sales performance?')}
              >
                Prompt: Revenue summary
              </button>
              <button
                type="button"
                className="secondary"
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}
                onClick={() => setCopilotQuestion('How many active sessions and packages do we have?')}
              >
                Prompt: Package &amp; session status
              </button>
              <button
                type="button"
                className="secondary"
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}
                onClick={() => setCopilotQuestion('What is the current health of our network gateways?')}
              >
                Prompt: Gateway health
              </button>
            </div>

            {copilotAnswer && (
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: '8px',
                  padding: '1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#60a5fa', fontWeight: 'bold' }}>
                    🤖 Answer (Model: {copilotAnswer.providerUsed})
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
                    Routing: {copilotAnswer.freeTierRouting ? 'Free Tier Priority' : 'Paid Tier'}
                  </span>
                </div>
                <p style={{ margin: '0 0 0.75rem 0', lineHeight: '1.5' }}>{copilotAnswer.response}</p>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.5rem' }}>
                  <strong>Cited Verified Sources:</strong> {copilotAnswer.citedSources.join(', ')}
                  <br />
                  <span style={{ color: '#f59e0b' }}>⚠️ {copilotAnswer.safetyPolicy.note}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB: FORECAST */}
      {activeSubTab === 'forecast' && (
        <div>
          <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
            <h3 style={{ marginTop: 0 }}>Statistical Demand &amp; Revenue Forecast</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
              Calculated using observed historical session intervals and verified ledger payments.
            </p>

            {forecast ? (
              <div>
                <div className="grid" style={{ marginBottom: '1rem' }}>
                  <article className="card">
                    <span className="icon ok">📊</span>
                    <div>
                      <h3>
                        {currency} {((forecast.projectedRevenueMinor) / 100).toFixed(2)}
                      </h3>
                      <p>
                        Projected 7-Day Revenue (Uncertainty: ±{forecast.uncertaintyBandPercent}%)
                      </p>
                    </div>
                  </article>
                  <article className="card">
                    <span className="icon ok">⏱️</span>
                    <div>
                      <h3>~{forecast.projectedSessions} Sessions</h3>
                      <p>Projected User Connections (Next 7 Days)</p>
                    </div>
                  </article>
                </div>

                {forecast.minimumDataWarning && (
                  <div
                    style={{
                      background: 'rgba(245, 158, 11, 0.15)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      color: '#fbbf24',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                      marginBottom: '1rem',
                    }}
                  >
                    ⚠️ {forecast.minimumDataWarning}
                  </div>
                )}

                <small style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Freshness: {forecast.dataFreshness} · {forecast.disclaimer}
                </small>
              </div>
            ) : (
              <p>Loading statistical model forecast...</p>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB: ANOMALIES */}
      {activeSubTab === 'anomalies' && (
        <div>
          <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
            <h3 style={{ marginTop: 0 }}>Rule-Backed &amp; Statistical Anomalies</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
              Automated detection of unusual activity, offline gateways, and refund spikes.
            </p>

            {anomalies.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {anomalies.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      background: a.severity === 'high' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                      border: `1px solid ${a.severity === 'high' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                      borderRadius: '6px',
                      padding: '0.75rem 1rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <strong style={{ color: a.severity === 'high' ? '#f87171' : '#fbbf24' }}>
                        {a.severity.toUpperCase()}: {a.title}
                      </strong>
                      <small style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {new Date(a.detectedAt).toLocaleTimeString()}
                      </small>
                    </div>
                    <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.9rem' }}>{a.description}</p>
                    <div style={{ fontSize: '0.85rem', color: '#93c5fd' }}>
                      Recommendation: {a.recommendation}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '6px', color: '#34d399' }}>
                ✓ No critical operational anomalies detected. Network and ledger integrity nominal.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB: SUPPORT DRAFTER */}
      {activeSubTab === 'support' && (
        <div>
          <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
            <h3 style={{ marginTop: 0 }}>Privacy-Safe Support Response Drafter</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
              Paste customer problem reports. All telephone numbers, emails, credit cards, and MAC addresses are
              automatically scrubbed before draft synthesis.
            </p>

            <form onSubmit={handleDraftSupport}>
              <label>
                Customer Inquiry / Issue Description:
                <textarea
                  rows={3}
                  placeholder="e.g. User on phone +123456789 cannot access login portal or redeem coupon code..."
                  value={customerIssue}
                  onChange={(e) => setCustomerIssue(e.target.value)}
                  required
                />
              </label>
              <button type="submit" disabled={drafting}>
                {drafting ? 'Sanitizing &amp; Drafting...' : 'Generate Privacy-Safe Draft'}
              </button>
            </form>

            {supportDraft && (
              <div style={{ marginTop: '1.25rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#10b981' }}>Proposed Draft (PII Redacted)</h4>
                <p style={{ margin: 0, lineHeight: '1.5', whiteSpace: 'pre-line' }}>{supportDraft}</p>
                <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                  ⚠️ Always verify and personalize before sending to the customer. Never include administrative passwords.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB: PROVIDERS */}
      {activeSubTab === 'providers' && (
        <div>
          <div className="heading" style={{ marginBottom: '1rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>Registered AI Providers</h3>
              <small>Free-First Priority Execution</small>
            </div>
            <button type="button" onClick={() => setShowAddProvider(true)}>
              + Register Model Provider
            </button>
          </div>

          <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
            {providers.length > 0 ? (
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Model</th>
                      <th>Tier</th>
                      <th>Masked Key</th>
                      <th>Health</th>
                      <th>Priority</th>
                      <th>Quota Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.provider.toUpperCase()}</strong>
                        </td>
                        <td>{p.model}</td>
                        <td>
                          <span className={`status-pill ${p.isFreeTier ? 'active' : ''}`}>
                            {p.isFreeTier ? 'Free Tier' : 'Paid Tier'}
                          </span>
                        </td>
                        <td>
                          <code>{p.maskedKey}</code>
                        </td>
                        <td>
                          <span className={`status-pill ${p.health === 'healthy' ? 'active' : 'revoked'}`}>
                            {p.health}
                          </span>
                        </td>
                        <td>#{p.priority}</td>
                        <td>
                          {p.quotaEvidence?.remainingRequests !== undefined
                            ? `${p.quotaEvidence.remainingRequests} remaining (${p.quotaEvidence.source})`
                            : 'Standard quota'}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="secondary"
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                            onClick={() => handleTestProvider(p.id)}
                          >
                            Probe
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: 'rgba(255,255,255,0.6)' }}>
                No external AI providers registered. System currently uses deterministic grounded aggregators. Register a
                Gemini or Groq model to activate advanced reasoning.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Add Provider Modal */}
      {showAddProvider && (
        <div className="modal-backdrop">
          <div className="card modal-content" style={{ maxWidth: '460px' }}>
            <h3>Register AI Model Provider</h3>
            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>
              Keys are encrypted at rest and always masked (e.g. AIza...4a1b). Raw keys are never leaked to clients.
            </p>

            <form onSubmit={handleCreateProvider}>
              <label>
                Provider:
                <select value={newProvider} onChange={(e) => setNewProvider(e.target.value as any)}>
                  <option value="gemini">Google Gemini</option>
                  <option value="groq">Groq</option>
                  <option value="ollama">Ollama (Local/On-device)</option>
                  <option value="openai_compatible">OpenAI Compatible</option>
                </select>
              </label>

              <label>
                Model Identifier:
                <input
                  type="text"
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  placeholder="e.g. gemini-1.5-flash or llama-3.1-8b"
                  required
                />
              </label>

              <label>
                API Key (Optional for Local Ollama):
                <input
                  type="password"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="Enter API key..."
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={isFree}
                  onChange={(e) => setIsFree(e.target.checked)}
                />
                Is Free-Tier Eligible (Free models are routed first)
              </label>

              <label>
                Routing Priority (1 = Highest):
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                />
              </label>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="secondary" onClick={() => setShowAddProvider(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={savingProvider}>
                  {savingProvider ? 'Registering...' : 'Save Provider'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <aside>
        <strong>Safety &amp; Privacy Architecture</strong>
        <p>
          AI features only query authorized aggregates and execute free-first model routing. It never bypasses terms of
          service, never shares PII with remote models, and cannot modify system access without human owner approval.
        </p>
      </aside>
    </div>
  );
}
