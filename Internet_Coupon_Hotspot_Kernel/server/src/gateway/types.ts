import type { GatewayCapabilities } from '../contracts/index.js';

export interface GatewayCommandResult {
  success: boolean;
  gatewayName: string;
  command: 'authorize' | 'disconnect' | 'query_accounting' | 'sync_queues';
  timestamp: string;
  clientMac: string;
  details?: Record<string, unknown>;
  disclosure?: string;
  error?: string;
}

export interface ClientAccountingData {
  clientMac: string;
  online: boolean;
  uptimeSeconds?: number;
  bytesDown?: number;
  bytesUp?: number;
  measured: boolean; // true if observed on hardware, false if estimated or unsupported
  lastSeenAt: string;
  disclosure?: string;
}

export interface GatewayHealthResult {
  status: 'online' | 'offline' | 'unmanaged';
  latencyMs?: number;
  lastSeenAt: string;
  version?: string;
  activeLeasesCount?: number;
  details?: Record<string, unknown>;
  disclosure?: string;
}

export interface GatewayAuthorizeInput {
  clientMac: string;
  clientIp?: string;
  durationSeconds: number;
  speedLimitDownKbps?: number | null;
  speedLimitUpKbps?: number | null;
  dataQuotaBytes?: number | null;
  sessionId?: string;
}
