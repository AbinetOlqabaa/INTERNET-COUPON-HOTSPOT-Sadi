import type { RepositoryRegistry } from '../db/repositories.js';

export interface AnalyticsOverview {
  revenue: {
    totalRevenueMinor: number;
    totalRefundsMinor: number;
    netBalanceMinor: number;
    currency: string;
  };
  sessions: {
    total: number;
    active: number;
    expired: number;
    paused: number;
    revoked: number;
  };
  customers: {
    total: number;
    withConsent: number;
  };
  gateways: {
    total: number;
    online: number;
    offline: number;
    unmanaged: number;
  };
  dataFreshness: {
    timestamp: string;
    sourceLabels: string[];
  };
}

export class AnalyticsService {
  constructor(private db: RepositoryRegistry) {}

  async getOverview(ownerId: string): Promise<AnalyticsOverview> {
    const owner = await this.db.owners.findById(ownerId);
    const currency = owner?.defaultCurrency ?? 'USD';

    const balance = await this.db.ledger.getBalance(ownerId, currency);
    const sessions = await this.db.sessions.list(ownerId);
    const customers = await this.db.customers.list(ownerId, 1000);
    const gateways = await this.db.gateways.list(ownerId);

    const activeSessions = sessions.filter((s) => s.status === 'active').length;
    const expiredSessions = sessions.filter((s) => s.status === 'expired').length;
    const pausedSessions = sessions.filter((s) => s.status === 'paused').length;
    const revokedSessions = sessions.filter((s) => s.status === 'revoked').length;

    const onlineGateways = gateways.filter((g) => g.status === 'online').length;
    const offlineGateways = gateways.filter((g) => g.status === 'offline').length;
    const unmanagedGateways = gateways.filter((g) => g.status === 'unmanaged').length;

    return {
      revenue: {
        totalRevenueMinor: balance.totalRevenueMinor,
        totalRefundsMinor: balance.totalRefundsMinor,
        netBalanceMinor: balance.netBalanceMinor,
        currency,
      },
      sessions: {
        total: sessions.length,
        active: activeSessions,
        expired: expiredSessions,
        paused: pausedSessions,
        revoked: revokedSessions,
      },
      customers: {
        total: customers.length,
        withConsent: customers.filter((c) => Boolean(c.consentAcceptedAt)).length,
      },
      gateways: {
        total: gateways.length,
        online: onlineGateways,
        offline: offlineGateways,
        unmanaged: unmanagedGateways,
      },
      dataFreshness: {
        timestamp: new Date().toISOString(),
        sourceLabels: [
          'ledger_journal_verified',
          'session_clock_authoritative',
          'gateway_adapter_telemetry',
        ],
      },
    };
  }

  async getRevenueTimeSeries(ownerId: string) {
    const ledger = await this.db.ledger.listByOwner(ownerId);
    const daysMap = new Map<
      string,
      { date: string; grossMinor: number; refundsMinor: number; netMinor: number; count: number }
    >();

    for (const entry of ledger) {
      const date = entry.createdAt.slice(0, 10);
      const existing = daysMap.get(date) ?? {
        date,
        grossMinor: 0,
        refundsMinor: 0,
        netMinor: 0,
        count: 0,
      };

      if (entry.amountMinor > 0) {
        existing.grossMinor += entry.amountMinor;
      } else {
        existing.refundsMinor += Math.abs(entry.amountMinor);
      }
      existing.netMinor = existing.grossMinor - existing.refundsMinor;
      existing.count += 1;
      daysMap.set(date, existing);
    }

    const timeSeries = Array.from(daysMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Also compute by provider source
    const payments = await this.db.payments.list(ownerId, { limit: 1000 });
    const providerBreakdown: Record<string, { totalMinor: number; count: number }> = {};
    for (const p of payments.payments) {
      if (p.status === 'completed') {
        const prov = p.provider || 'unknown';
        if (!providerBreakdown[prov]) {
          providerBreakdown[prov] = { totalMinor: 0, count: 0 };
        }
        providerBreakdown[prov].totalMinor += p.amountMinor;
        providerBreakdown[prov].count += 1;
      }
    }

    return {
      timeSeries,
      providerBreakdown,
      dataFreshness: new Date().toISOString(),
      sourceLabels: ['payment_gateway_webhooks', 'manual_cash_receipts'],
    };
  }

  async getUsageMetrics(ownerId: string) {
    const sessions = await this.db.sessions.list(ownerId);
    const packages = await this.db.packages.list(ownerId);

    const packageUsage: Record<
      string,
      { packageId: string; packageName: string; sessionCount: number; totalDurationSeconds: number }
    > = {};

    for (const pkg of packages) {
      packageUsage[pkg.id] = {
        packageId: pkg.id,
        packageName: pkg.name,
        sessionCount: 0,
        totalDurationSeconds: 0,
      };
    }

    let totalDurationSeconds = 0;
    for (const s of sessions) {
      totalDurationSeconds += s.durationSeconds;
      if (packageUsage[s.packageId]) {
        packageUsage[s.packageId].sessionCount += 1;
        packageUsage[s.packageId].totalDurationSeconds += s.durationSeconds;
      }
    }

    return {
      totalDeliveredHours: Math.round((totalDurationSeconds / 3600) * 10) / 10,
      packageBreakdown: Object.values(packageUsage),
      sourceLabels: ['server_authoritative_session_clock', 'mock_gateway_accounting'],
      dataFreshness: new Date().toISOString(),
    };
  }

  async getRetentionMetrics(ownerId: string) {
    const customers = await this.db.customers.list(ownerId, 1000);
    const sessions = await this.db.sessions.list(ownerId);

    const customerSessionCounts = new Map<string, number>();
    for (const s of sessions) {
      if (s.customerId) {
        customerSessionCounts.set(s.customerId, (customerSessionCounts.get(s.customerId) ?? 0) + 1);
      }
    }

    let returningCustomers = 0;
    for (const [, count] of customerSessionCounts.entries()) {
      if (count > 1) returningCustomers += 1;
    }

    const totalTracked = customers.length;
    const retentionRate = totalTracked > 0 ? Math.round((returningCustomers / totalTracked) * 100) : 0;

    return {
      totalCustomers: totalTracked,
      returningCustomers,
      singleVisitCustomers: totalTracked - returningCustomers,
      retentionRatePercentage: retentionRate,
      sourceLabels: ['consent_verified_customer_sessions'],
      dataFreshness: new Date().toISOString(),
    };
  }

  async exportCsv(ownerId: string, type: 'ledger' | 'sessions'): Promise<string> {
    if (type === 'ledger') {
      const entries = await this.db.ledger.listByOwner(ownerId);
      const rows = [
        'ID,Date,EntryType,Account,AmountMinor,Currency,ReferenceID,Description,Actor',
        ...entries.map((e) =>
          [
            e.id,
            e.createdAt,
            e.entryType,
            e.account,
            e.amountMinor,
            e.currency,
            e.referenceId ?? '',
            `"${(e.description ?? '').replace(/"/g, '""')}"`,
            e.actor ?? '',
          ].join(',')
        ),
      ];
      return rows.join('\n');
    }

    const sessions = await this.db.sessions.list(ownerId);
    const rows = [
      'ID,CustomerID,PackageID,Status,DurationSeconds,RemainingSeconds,ActivatedAt,ExpiresAt,DeviceMAC,ClientIP,CreatedAt',
      ...sessions.map((s) =>
        [
          s.id,
          s.customerId ?? '',
          s.packageId,
          s.status,
          s.durationSeconds,
          s.remainingSeconds,
          s.activatedAt ?? '',
          s.expiresAt ?? '',
          s.deviceMac ?? '',
          s.clientIp ?? '',
          s.createdAt,
        ].join(',')
      ),
    ];
    return rows.join('\n');
  }
}
