import type { GatewayAdapter } from './base.js';
import type {
  GatewayCommandResult,
  ClientAccountingData,
  GatewayHealthResult,
  GatewayAuthorizeInput,
} from '../types.js';
import { getGatewayCapabilities } from '../../contracts/index.js';

interface MockLease {
  mac: string;
  ip?: string;
  durationSeconds: number;
  authorizedAt: number;
  speedLimitDownKbps?: number | null;
  speedLimitUpKbps?: number | null;
  bytesDown: number;
  bytesUp: number;
}

/**
 * MockTestGatewayAdapter
 * 
 * STRICT TEST-ONLY / SANDBOX ADAPTER.
 * Simulates a managed hardware gateway (e.g. MikroTik RouterOS or OpenWrt captive portal).
 * Clearly labeled TEST ONLY. Never conflate this with physical router hardware tests.
 */
export class MockTestGatewayAdapter implements GatewayAdapter {
  readonly name = 'mock_test_gateway';
  readonly isTestOnly = true;

  private activeLeases = new Map<string, MockLease>();
  private simulatedLatencyMs = 25;

  getCapabilities() {
    const caps = getGatewayCapabilities('managed_gateway_mode');
    return {
      ...caps,
      disclosureStatement:
        'TEST ONLY - Operating via Mock Test Gateway Simulator. Telemetry is hermetically simulated for automated unit and integration tests.',
    };
  }

  async getHealth(): Promise<GatewayHealthResult> {
    return {
      status: 'online',
      latencyMs: this.simulatedLatencyMs,
      lastSeenAt: new Date().toISOString(),
      version: 'MockGatewayOS-v7.12 (TEST ONLY)',
      activeLeasesCount: this.activeLeases.size,
      disclosure: 'TEST ONLY - Simulated hardware router health telemetry.',
    };
  }

  async authorizeClient(input: GatewayAuthorizeInput): Promise<GatewayCommandResult> {
    const normalizedMac = input.clientMac.toUpperCase();
    const lease: MockLease = {
      mac: normalizedMac,
      ip: input.clientIp,
      durationSeconds: input.durationSeconds,
      authorizedAt: Date.now(),
      speedLimitDownKbps: input.speedLimitDownKbps,
      speedLimitUpKbps: input.speedLimitUpKbps,
      bytesDown: 1048576, // 1 MB initial simulated traffic
      bytesUp: 262144,
    };

    this.activeLeases.set(normalizedMac, lease);

    return {
      success: true,
      gatewayName: this.name,
      command: 'authorize',
      timestamp: new Date().toISOString(),
      clientMac: normalizedMac,
      disclosure: 'TEST ONLY - Client MAC successfully added to simulated router firewall bindings.',
      details: {
        leaseStatus: 'bound',
        simulatedSpeedQueue: input.speedLimitDownKbps ? `${input.speedLimitDownKbps}k` : 'unlimited',
      },
    };
  }

  async disconnectClient(clientMac: string, reason?: string): Promise<GatewayCommandResult> {
    const normalizedMac = clientMac.toUpperCase();
    const existed = this.activeLeases.delete(normalizedMac);

    return {
      success: true,
      gatewayName: this.name,
      command: 'disconnect',
      timestamp: new Date().toISOString(),
      clientMac: normalizedMac,
      disclosure: 'TEST ONLY - Simulated router firewall rule dropped and client disconnected.',
      details: {
        wasActive: existed,
        reason: reason || 'administrative_disconnect',
      },
    };
  }

  async queryClientAccounting(clientMac: string): Promise<ClientAccountingData> {
    const normalizedMac = clientMac.toUpperCase();
    const lease = this.activeLeases.get(normalizedMac);

    if (!lease) {
      return {
        clientMac: normalizedMac,
        online: false,
        bytesDown: 0,
        bytesUp: 0,
        measured: true,
        lastSeenAt: new Date().toISOString(),
        disclosure: 'TEST ONLY - No active lease found in simulated gateway binding table.',
      };
    }

    const elapsedSec = Math.floor((Date.now() - lease.authorizedAt) / 1000);
    // Simulate incremental traffic growth over time
    const bytesDown = lease.bytesDown + elapsedSec * 15000;
    const bytesUp = lease.bytesUp + elapsedSec * 5000;

    return {
      clientMac: normalizedMac,
      online: true,
      uptimeSeconds: elapsedSec,
      bytesDown,
      bytesUp,
      measured: true,
      lastSeenAt: new Date().toISOString(),
      disclosure: 'TEST ONLY - Real-time simulated byte counters from mock router hardware.',
    };
  }
}
