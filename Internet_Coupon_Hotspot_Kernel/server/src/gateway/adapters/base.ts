import type { GatewayCapabilities } from '../../contracts/index.js';
import type {
  GatewayCommandResult,
  ClientAccountingData,
  GatewayHealthResult,
  GatewayAuthorizeInput,
} from '../types.js';

export interface GatewayAdapter {
  readonly name: string;
  readonly isTestOnly: boolean;
  getCapabilities(): GatewayCapabilities;
  getHealth(config?: Record<string, unknown>): Promise<GatewayHealthResult>;
  authorizeClient(input: GatewayAuthorizeInput, config?: Record<string, unknown>): Promise<GatewayCommandResult>;
  disconnectClient(clientMac: string, reason?: string, config?: Record<string, unknown>): Promise<GatewayCommandResult>;
  queryClientAccounting(clientMac: string, config?: Record<string, unknown>): Promise<ClientAccountingData>;
}
