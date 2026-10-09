/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Server, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Smartphone, 
  Code2, 
  AlertCircle 
} from 'lucide-react';

interface BackendHealthResponse {
  status: string;
  service: string;
  timestamp: string;
  uptimeSeconds: number;
  nodeVersion: string;
  environment: string;
  checks?: {
    runtime: string;
    backendHealth: string;
  };
}

export default function App() {
  const [healthData, setHealthData] = useState<BackendHealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const checkBackendHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    const start = performance.now();
    try {
      const response = await fetch('/api/health');
      const duration = Math.round(performance.now() - start);
      setLatencyMs(duration);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: BackendHealthResponse = await response.json();
      setHealthData(data);
      setLastChecked(new Date().toLocaleTimeString());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown communication error';
      setError(message);
      setHealthData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkBackendHealth();
  }, [checkBackendHealth]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 md:p-8 font-sans">
      <div className="max-w-2xl mx-auto w-full space-y-6">
        {/* Header Banner */}
        <header className="border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                Hotspot Kernel Landing Environment
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Technical kernel baseline for future autonomous development
              </p>
            </div>
          </div>
        </header>

        {/* Status Notice */}
        <div className="bg-amber-950/30 border border-amber-600/30 rounded-xl p-4 flex gap-3 text-amber-200 text-xs sm:text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-300">
              Technical Landing Kernel Active
            </p>
            <p className="text-slate-300 leading-relaxed">
              This page confirms the technical state of the project kernel. Application business features (coupons, customer sessions, gateway routing, payments) are deliberately omitted until the <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300">.ai</code> instruction pack is uploaded.
            </p>
          </div>
        </div>

        {/* Health Check Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Frontend Status */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                  Frontend Client
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Online
                </span>
              </div>
              <p className="text-sm text-slate-300 font-medium">React 19 + TypeScript + Vite</p>
              <p className="text-xs text-slate-400 mt-1">
                Mounted and rendering cleanly in current browser viewport.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-2 text-xs text-slate-400">
              <Smartphone className="h-4 w-4 text-slate-400" />
              <span>Mobile & tablet viewport ready</span>
            </div>
          </div>

          {/* Backend Status */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                  Backend API (/api/health)
                </span>
                {loading ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Checking...
                  </span>
                ) : healthData ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Healthy
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    <XCircle className="h-3.5 w-3.5" />
                    Unreachable
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-300 font-medium">Node.js Express Runtime</p>
              <p className="text-xs text-slate-400 mt-1">
                {healthData 
                  ? `Connected in ${latencyMs}ms. Uptime: ${healthData.uptimeSeconds}s`
                  : error 
                    ? `Error: ${error}`
                    : 'Awaiting connection verification...'}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>Last ping: {lastChecked || 'Never'}</span>
              <button
                type="button"
                onClick={checkBackendHealth}
                disabled={loading}
                className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                Re-check
              </button>
            </div>
          </div>
        </section>

        {/* Diagnostic Response Details */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-slate-200">
                Backend Health Response Payload
              </h2>
            </div>
            {latencyMs !== null && (
              <span className="text-xs text-slate-400 font-mono">
                RTT: {latencyMs}ms
              </span>
            )}
          </div>
          
          <div className="bg-slate-950 rounded-lg p-3 border border-slate-800/80 font-mono text-xs text-slate-300 overflow-x-auto">
            {loading && !healthData ? (
              <span className="text-slate-400">Fetching endpoint data...</span>
            ) : healthData ? (
              <pre className="text-emerald-400">{JSON.stringify(healthData, null, 2)}</pre>
            ) : (
              <pre className="text-rose-400">{JSON.stringify({ error, note: "Backend endpoint did not respond or returned error." }, null, 2)}</pre>
            )}
          </div>
        </section>

        {/* Environmental Guardrails */}
        <section className="bg-slate-900/50 border border-slate-800/70 rounded-xl p-4 space-y-2">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-400">
            Kernel Specifications & Next Gate
          </h3>
          <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
            <li>Runtime configuration: Express + Vite middleware on port 3000</li>
            <li>Production build target: ES2022 / modern browser bundle</li>
            <li>Android readiness: Responsive design prepared for Capacitor or PWA wrapping</li>
            <li>Stop condition: Standing by for uploaded <code className="text-slate-300">.ai</code> architecture instruction pack</li>
          </ul>
        </section>
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-400 py-4 mt-6 border-t border-slate-900">
        Hotspot Application Landing Kernel &bull; Ready for instruction pack ingestion
      </footer>
    </div>
  );
}
