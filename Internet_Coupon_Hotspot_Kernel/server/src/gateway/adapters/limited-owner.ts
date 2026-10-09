import type { GatewayAdapter } from './base.js';
import type {
  GatewayCommandResult,
  ClientAccountingData,
  GatewayHealthResult,
  GatewayAuthorizeInput,
} from '../types.js';
import { getGatewayCapabilities } from '../../contracts/index.js';

/**
 * LimitedOwnerGatewayAdapter
 * 
 * Represents standard Android system hotspot or unmanaged owner mode.
 * Honestly discloses that standard Android OS prevents third-party apps
 * from disconnecting individual Wi-Fi clients, enforcing speed tiers, or measuring per-MAC traffic.
 */
export class LimitedOwnerGatewayAdapter implements GatewayAdapter {
  readonly name = 'limited_owner';
  readonly isTestOnly = false;

  getCapabilities() {
    return getGatewayCapabilities('limited_owner_mode');
  }

  async getHealth(): Promise<GatewayHealthResult> {
    return {
      status: 'unmanaged',
      lastSeenAt: new Date().toISOString(),
      disclosure:
        'Running in Limited Owner Mode (Android system hotspot). Device hardware network controls are unmanaged by third-party applications.',
    };
  }

  async authorizeClient(input: GatewayAuthorizeInput): Promise<GatewayCommandResult> {
    return {
      success: true,
      gatewayName: this.name,
      command: 'authorize',
      timestamp: new Date().toISOString(),
      clientMac: input.clientMac,
      disclosure:
        'Session record authorized in software. Notice: Android system hotspot operates unmanaged without hardware firewall enforcement.',
      details: {
        enforcement: 'simulated_local_lease',
        durationSeconds: input.durationSeconds,
      },
    };
  }

  async disconnectClient(clientMac: string, reason?: string): Promise<GatewayCommandResult> {
    return {
      success: false,
      gatewayName: this.name,
      command: 'disconnect',
      timestamp: new Date().toISOString(),
      clientMac,
      error: 'DISCONNECT_UNSUPPORTED_ON_ANDROID_HOTSPOT',
      disclosure:
        'Standard Android hotspot mode cannot disconnect individual clients. A managed router gateway is required for client disconnection.',
      details: { reason },
    };
  }

  async queryClientAccounting(clientMac: string): Promise<ClientAccountingData> {
    return {
      clientMac,
      online: true,
      measured: false,
      lastSeenAt: new Date().toISOString(),
      disclosure:
        'Traffic accounting is unavailable in limited owner mode. Traffic metrics are estimated or unsupported.',
    };
  }
}
