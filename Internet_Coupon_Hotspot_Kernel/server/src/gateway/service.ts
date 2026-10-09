import type { RepositoryRegistry } from '../db/repositories.js';
import type { GatewayEntity, SessionEntity, PackageEntity } from '../db/schema.js';
import type { GatewayAdapter } from './adapters/base.js';
import { LimitedOwnerGatewayAdapter } from './adapters/limited-owner.js';
import { MockTestGatewayAdapter } from './adapters/mock-test.js';
import type {
  GatewayCommandResult,
  ClientAccountingData,
  GatewayHealthResult,
} from './types.js';

export class GatewayService {
  private adapters = new Map<string, GatewayAdapter>();

  constructor(private db: RepositoryRegistry) {
    this.registerAdapter(new LimitedOwnerGatewayAdapter());
    this.registerAdapter(new MockTestGatewayAdapter());
  }

  registerAdapter(adapter: GatewayAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  getAdapter(name: string): GatewayAdapter {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new Error(`Gateway adapter '${name}' is not registered or supported.`);
    }
    return adapter;
  }

  /**
   * Resolves the gateway adapter for a specific owner
   */
  async resolveAdapterForOwner(ownerId: string, gatewayId?: string | null): Promise<{
    adapter: GatewayAdapter;
    gateway: GatewayEntity | null;
  }> {
    if (gatewayId) {
      const g = await this.db.gateways.findById(ownerId, gatewayId);
      if (g) {
        return { adapter: this.getAdapter(g.adapterType), gateway: g };
      }
    }

    const gateways = await this.db.gateways.list(ownerId);
    if (gateways.length > 0) {
      const primary = gateways[0];
      return { adapter: this.getAdapter(primary.adapterType), gateway: primary };
    }

    // Default to Limited Owner Mode (standard Android hotspot behavior)
    return { adapter: this.getAdapter('limited_owner'), gateway: null };
  }

  /**
   * Dispatches client authorization command to the appropriate gateway adapter
   */
  async authorizeSession(
    ownerId: string,
    session: SessionEntity,
    pkg?: PackageEntity | null
  ): Promise<GatewayCommandResult> {
    if (!session.deviceMac) {
      return {
        success: true,
        gatewayName: 'none',
        command: 'authorize',
        timestamp: new Date().toISOString(),
        clientMac: 'UNASSIGNED',
        disclosure: 'Session activated without physical MAC address constraint.',
      };
    }

    const { adapter, gateway } = await this.resolveAdapterForOwner(ownerId, session.gatewayId);

    const result = await adapter.authorizeClient({
      clientMac: session.deviceMac,
      clientIp: session.clientIp || undefined,
      durationSeconds: session.durationSeconds,
      speedLimitDownKbps: pkg?.speedLimitDownKbps,
      speedLimitUpKbps: pkg?.speedLimitUpKbps,
      dataQuotaBytes: pkg?.dataQuotaBytes,
      sessionId: session.id,
    });

    await this.db.audit.append({
      ownerId,
      actor: 'system:gateway',
      action: 'gateway.client_authorized',
      resourceType: 'access_session',
      resourceId: session.id,
      details: {
        adapter: adapter.name,
        clientMac: session.deviceMac,
        gatewayId: gateway?.id,
        success: result.success,
      },
    });

    return result;
  }

  /**
   * Dispatches client disconnection command to gateway adapter
   */
  async disconnectSession(
    ownerId: string,
    session: SessionEntity,
    reason?: string
  ): Promise<GatewayCommandResult> {
    if (!session.deviceMac) {
      return {
        success: true,
        gatewayName: 'none',
        command: 'disconnect',
        timestamp: new Date().toISOString(),
        clientMac: 'UNASSIGNED',
        disclosure: 'No MAC address associated with session to disconnect.',
      };
    }

    const { adapter, gateway } = await this.resolveAdapterForOwner(ownerId, session.gatewayId);
    const result = await adapter.disconnectClient(session.deviceMac, reason);

    await this.db.audit.append({
      ownerId,
      actor: 'system:gateway',
      action: 'gateway.client_disconnected',
      resourceType: 'access_session',
      resourceId: session.id,
      details: {
        adapter: adapter.name,
        clientMac: session.deviceMac,
        gatewayId: gateway?.id,
        success: result.success,
        reason,
      },
    });

    return result;
  }

  /**
   * Queries hardware telemetry or accounting counters for a client MAC
   */
  async queryAccounting(ownerId: string, clientMac: string, gatewayId?: string): Promise<ClientAccountingData> {
    const { adapter } = await this.resolveAdapterForOwner(ownerId, gatewayId);
    return await adapter.queryClientAccounting(clientMac);
  }

  /**
   * Queries live health status for an owner's gateway
   */
  async checkHealth(ownerId: string, gatewayId?: string): Promise<GatewayHealthResult> {
    const { adapter } = await this.resolveAdapterForOwner(ownerId, gatewayId);
    return await adapter.getHealth();
  }

  /**
   * Ingests asynchronous gateway telemetry or accounting callback events
   */
  async ingestGatewayEvent(
    ownerId: string,
    eventPayload: {
      eventType: string;
      clientMac?: string;
      bytesDown?: number;
      bytesUp?: number;
      timestamp?: string;
      details?: Record<string, unknown>;
    }
  ): Promise<{ acknowledged: boolean; eventId: string }> {
    const eventId = `gw_evt_${Date.now()}`;

    await this.db.audit.append({
      ownerId,
      actor: 'gateway:callback',
      action: `gateway.event_${eventPayload.eventType}`,
      resourceType: 'gateway_event',
      resourceId: eventId,
      details: eventPayload,
    });

    return { acknowledged: true, eventId };
  }
}
