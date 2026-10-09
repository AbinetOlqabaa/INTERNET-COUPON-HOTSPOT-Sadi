import { randomUUID, pbkdf2Sync } from 'node:crypto';
import type {
  OwnerEntity,
  UserRole,
  CustomerEntity,
  PackageEntity,
  CouponEntity,
  SessionEntity,
  PaymentIntentEntity,
  LedgerEntryEntity,
  AuditEventEntity,
  PasswordResetTokenEntity,
  GatewayEntity,
  NotificationEntity,
  LoyaltyBadgeEntity,
  BonusGrantEntity,
  AIProviderEntity,
} from './schema.js';

export interface RepositoryRegistry {
  owners: OwnerRepository;
  customers: CustomerRepository;
  packages: PackageRepository;
  coupons: CouponRepository;
  sessions: SessionRepository;
  gateways: GatewayRepository;
  payments: PaymentRepository;
  ledger: LedgerRepository;
  audit: AuditRepository;
  passwordResets: PasswordResetRepository;
  notifications: NotificationRepository;
  loyalty: LoyaltyRepository;
  aiProviders: AIProviderRepository;
  runTransaction<T>(work: () => Promise<T>): Promise<T>;
}

export interface OwnerRepository {
  findById(id: string): Promise<OwnerEntity | null>;
  findByEmail(email: string): Promise<OwnerEntity | null>;
  listAll(
    limit?: number,
    offset?: number,
    role?: string,
    search?: string,
    status?: string
  ): Promise<{ users: OwnerEntity[]; totalCount: number }>;
  countSuperAdmins(): Promise<number>;
  create(owner: Omit<OwnerEntity, 'id' | 'createdAt' | 'updatedAt' | 'role'> & { role?: UserRole }): Promise<OwnerEntity>;
  update(id: string, patch: Partial<OwnerEntity>): Promise<OwnerEntity | null>;
  delete(id: string): Promise<boolean>;
}

export interface PasswordResetRepository {
  create(userId: string, tokenHash: string, expiresAt: string): Promise<PasswordResetTokenEntity>;
  findValid(tokenHash: string): Promise<PasswordResetTokenEntity | null>;
  markUsed(id: string): Promise<boolean>;
}

export interface CustomerRepository {
  findById(ownerId: string, id: string): Promise<CustomerEntity | null>;
  findByMac(ownerId: string, mac: string): Promise<CustomerEntity | null>;
  list(ownerId: string, limit?: number, offset?: number): Promise<CustomerEntity[]>;
  searchAndPaginate(
    ownerId: string,
    query?: string,
    limit?: number,
    offset?: number
  ): Promise<{ customers: CustomerEntity[]; totalCount: number }>;
  create(
    customer: Omit<CustomerEntity, 'id' | 'createdAt' | 'updatedAt' | 'dataRetentionConsent'> & {
      dataRetentionConsent?: boolean;
    }
  ): Promise<CustomerEntity>;
  update(ownerId: string, id: string, patch: Partial<CustomerEntity>): Promise<CustomerEntity | null>;
  delete(ownerId: string, id: string): Promise<boolean>;
}

export interface PackageRepository {
  findById(ownerId: string, id: string): Promise<PackageEntity | null>;
  list(ownerId: string, activeOnly?: boolean): Promise<PackageEntity[]>;
  create(pkg: Omit<PackageEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<PackageEntity>;
  update(ownerId: string, id: string, patch: Partial<PackageEntity>): Promise<PackageEntity | null>;
}

export interface CouponRepository {
  findById(ownerId: string, id: string): Promise<CouponEntity | null>;
  findByCode(ownerId: string, code: string): Promise<CouponEntity | null>;
  list(ownerId: string, limit?: number, offset?: number): Promise<{ coupons: CouponEntity[]; totalCount: number }>;
  create(coupon: Omit<CouponEntity, 'id' | 'createdAt'>): Promise<CouponEntity>;
  incrementUses(ownerId: string, id: string): Promise<boolean>;
}

export interface SessionRepository {
  findById(ownerId: string, id: string): Promise<SessionEntity | null>;
  findByIdPublic(id: string): Promise<SessionEntity | null>;
  list(ownerId: string, status?: string): Promise<SessionEntity[]>;
  listByCustomer(ownerId: string, customerId: string): Promise<SessionEntity[]>;
  listAllActive(): Promise<SessionEntity[]>;
  create(session: Omit<SessionEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<SessionEntity>;
  update(ownerId: string, id: string, patch: Partial<SessionEntity>): Promise<SessionEntity | null>;
  updateStatus(
    ownerId: string,
    id: string,
    status: SessionEntity['status'],
    timestamps?: { activatedAt?: string; expiresAt?: string }
  ): Promise<SessionEntity | null>;
}

export interface GatewayRepository {
  findById(ownerId: string, id: string): Promise<GatewayEntity | null>;
  list(ownerId: string): Promise<GatewayEntity[]>;
  create(gateway: Omit<GatewayEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<GatewayEntity>;
  update(ownerId: string, id: string, patch: Partial<GatewayEntity>): Promise<GatewayEntity | null>;
  delete(ownerId: string, id: string): Promise<boolean>;
}

export interface PaymentRepository {
  findById(ownerId: string, id: string): Promise<PaymentIntentEntity | null>;
  findByIdPublic(id: string): Promise<PaymentIntentEntity | null>;
  findByProviderRef(provider: string, providerRef: string): Promise<PaymentIntentEntity | null>;
  findByIdempotency(ownerId: string, key: string): Promise<PaymentIntentEntity | null>;
  list(
    ownerId: string,
    filters?: { status?: string; provider?: string; limit?: number; offset?: number }
  ): Promise<{ payments: PaymentIntentEntity[]; totalCount: number }>;
  create(payment: Omit<PaymentIntentEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<PaymentIntentEntity>;
  update(ownerId: string, id: string, patch: Partial<PaymentIntentEntity>): Promise<PaymentIntentEntity | null>;
  updateStatus(
    ownerId: string,
    id: string,
    status: PaymentIntentEntity['status'],
    patch?: Partial<PaymentIntentEntity>
  ): Promise<PaymentIntentEntity | null>;
}

export interface LedgerRepository {
  create(entry: Omit<LedgerEntryEntity, 'id' | 'createdAt'>): Promise<LedgerEntryEntity>;
  listByOwner(ownerId: string): Promise<LedgerEntryEntity[]>;
  getBalance(
    ownerId: string,
    currency?: string
  ): Promise<{ totalRevenueMinor: number; totalRefundsMinor: number; netBalanceMinor: number }>;
}

export interface AuditRepository {
  append(event: Omit<AuditEventEntity, 'id' | 'createdAt'>): Promise<AuditEventEntity>;
  list(ownerId: string, limit?: number): Promise<AuditEventEntity[]>;
}

export interface NotificationRepository {
  create(
    data: Omit<NotificationEntity, 'id' | 'createdAt' | 'updatedAt' | 'deliveryAttempts' | 'status'> & {
      deliveryAttempts?: number;
      status?: NotificationEntity['status'];
    }
  ): Promise<NotificationEntity>;
  findById(id: string): Promise<NotificationEntity | null>;
  list(
    ownerId: string,
    options?: {
      status?: string;
      recipientType?: string;
      recipientId?: string;
      unreadOnly?: boolean;
      limit?: number;
    }
  ): Promise<NotificationEntity[]>;
  listByRecipient(recipientId: string, limit?: number): Promise<NotificationEntity[]>;
  update(id: string, patch: Partial<NotificationEntity>): Promise<NotificationEntity | null>;
  markDelivered(id: string): Promise<NotificationEntity | null>;
  markFailed(id: string): Promise<NotificationEntity | null>;
  markRead(id: string): Promise<NotificationEntity | null>;
}

export interface LoyaltyRepository {
  listBadges(ownerId: string, customerId: string): Promise<LoyaltyBadgeEntity[]>;
  awardBadge(badge: Omit<LoyaltyBadgeEntity, 'id' | 'awardedAt'>): Promise<LoyaltyBadgeEntity>;
  createBonus(bonus: Omit<BonusGrantEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<BonusGrantEntity>;
  listBonuses(ownerId: string, customerId?: string, status?: string): Promise<BonusGrantEntity[]>;
  findBonusById(ownerId: string, id: string): Promise<BonusGrantEntity | null>;
  updateBonusStatus(
    ownerId: string,
    id: string,
    status: BonusGrantEntity['status'],
    claimedAt?: string
  ): Promise<BonusGrantEntity | null>;
}

export interface AIProviderRepository {
  list(ownerId: string): Promise<AIProviderEntity[]>;
  findById(ownerId: string, id: string): Promise<AIProviderEntity | null>;
  create(provider: Omit<AIProviderEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<AIProviderEntity>;
  update(ownerId: string, id: string, patch: Partial<AIProviderEntity>): Promise<AIProviderEntity | null>;
  delete(ownerId: string, id: string): Promise<boolean>;
}

/**
 * In-Memory Database Implementation for standalone execution & unit testing
 */
export class MemoryDatabase implements RepositoryRegistry {
  private ownersMap = new Map<string, OwnerEntity>();
  private customersMap = new Map<string, CustomerEntity>();
  private packagesMap = new Map<string, PackageEntity>();
  private couponsMap = new Map<string, CouponEntity>();
  private sessionsMap = new Map<string, SessionEntity>();
  private gatewaysMap = new Map<string, GatewayEntity>();
  private paymentsMap = new Map<string, PaymentIntentEntity>();
  private ledgerEntries: LedgerEntryEntity[] = [];
  private auditEvents: AuditEventEntity[] = [];
  private passwordResetsMap = new Map<string, PasswordResetTokenEntity>();
  private notificationsMap = new Map<string, NotificationEntity>();
  private badgesList: LoyaltyBadgeEntity[] = [];
  private bonusesMap = new Map<string, BonusGrantEntity>();
  private aiProvidersMap = new Map<string, AIProviderEntity>();

  async runTransaction<T>(work: () => Promise<T>): Promise<T> {
    return await work();
  }

  owners: OwnerRepository = {
    findById: async (id) => this.ownersMap.get(id) ?? null,
    findByEmail: async (email) => {
      for (const owner of this.ownersMap.values()) {
        if (owner.email.toLowerCase() === email.toLowerCase()) return owner;
      }
      return null;
    },
    listAll: async (limit = 50, offset = 0, role, search, status) => {
      const q = search?.trim().toLowerCase();
      const all = Array.from(this.ownersMap.values()).filter((u) => {
        if (role && u.role !== role) return false;
        if (status === 'active' && !u.isActive) return false;
        if (status === 'inactive' && u.isActive) return false;
        if (q) {
          const matchEmail = u.email.toLowerCase().includes(q);
          const matchBusiness = u.businessName.toLowerCase().includes(q);
          const matchDisplay = u.displayName?.toLowerCase().includes(q);
          return Boolean(matchEmail || matchBusiness || matchDisplay);
        }
        return true;
      });

      return {
        users: all.slice(offset, offset + limit),
        totalCount: all.length,
      };
    },
    countSuperAdmins: async () => {
      return Array.from(this.ownersMap.values()).filter(
        (u) => u.role === 'SUPER_ADMIN' && u.isActive
      ).length;
    },
    create: async (data) => {
      const now = new Date().toISOString();
      const owner: OwnerEntity = {
        ...data,
        id: randomUUID(),
        role: data.role || 'OWNER',
        displayName: data.displayName || null,
        ownerId: data.ownerId || null,
        lastLoginAt: data.lastLoginAt || null,
        createdAt: now,
        updatedAt: now,
      };
      this.ownersMap.set(owner.id, owner);
      return owner;
    },
    update: async (id, patch) => {
      const existing = this.ownersMap.get(id);
      if (!existing) return null;

      // Prevent deactivating or demoting the last active SUPER_ADMIN
      if (existing.role === 'SUPER_ADMIN') {
        const willBeInactive = patch.isActive === false;
        const willBeDemoted = patch.role && patch.role !== 'SUPER_ADMIN';
        if (willBeInactive || willBeDemoted) {
          const activeAdmins = Array.from(this.ownersMap.values()).filter(
            (u) => u.id !== id && u.role === 'SUPER_ADMIN' && u.isActive
          ).length;
          if (activeAdmins === 0) {
            throw new Error('Cannot deactivate or demote the last active SUPER_ADMIN.');
          }
        }
      }

      const updated: OwnerEntity = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      this.ownersMap.set(id, updated);
      return updated;
    },
    delete: async (id) => {
      const existing = this.ownersMap.get(id);
      if (!existing) return false;

      // Restrict deletion of last SUPER_ADMIN
      if (existing.role === 'SUPER_ADMIN') {
        const activeAdmins = Array.from(this.ownersMap.values()).filter(
          (u) => u.id !== id && u.role === 'SUPER_ADMIN' && u.isActive
        ).length;
        if (activeAdmins === 0) {
          throw new Error('Cannot delete the last active SUPER_ADMIN.');
        }
      }

      this.ownersMap.delete(id);
      return true;
    },
  };

  passwordResets: PasswordResetRepository = {
    create: async (userId, tokenHash, expiresAt) => {
      const reset: PasswordResetTokenEntity = {
        id: randomUUID(),
        userId,
        tokenHash,
        expiresAt,
        usedAt: null,
        createdAt: new Date().toISOString(),
      };
      this.passwordResetsMap.set(reset.id, reset);
      return reset;
    },
    findValid: async (tokenHash) => {
      for (const token of this.passwordResetsMap.values()) {
        if (token.tokenHash === tokenHash && !token.usedAt) {
          if (new Date(token.expiresAt).getTime() > Date.now()) {
            return token;
          }
        }
      }
      return null;
    },
    markUsed: async (id) => {
      const token = this.passwordResetsMap.get(id);
      if (!token) return false;
      token.usedAt = new Date().toISOString();
      return true;
    },
  };

  customers: CustomerRepository = {
    findById: async (ownerId, id) => {
      const c = this.customersMap.get(id);
      return c && c.ownerId === ownerId ? c : null;
    },
    findByMac: async (ownerId, mac) => {
      for (const c of this.customersMap.values()) {
        if (c.ownerId === ownerId && c.deviceMac?.toLowerCase() === mac.toLowerCase()) return c;
      }
      return null;
    },
    list: async (ownerId, limit = 50, offset = 0) => {
      return Array.from(this.customersMap.values())
        .filter((c) => c.ownerId === ownerId)
        .slice(offset, offset + limit);
    },
    searchAndPaginate: async (ownerId, query, limit = 50, offset = 0) => {
      const q = query?.trim().toLowerCase();
      const matched = Array.from(this.customersMap.values()).filter((c) => {
        if (c.ownerId !== ownerId) return false;
        if (!q) return true;
        const phoneMatch = c.phone?.toLowerCase().includes(q);
        const nameMatch = c.displayName?.toLowerCase().includes(q);
        const macMatch = c.deviceMac?.toLowerCase().includes(q);
        return Boolean(phoneMatch || nameMatch || macMatch);
      });
      return {
        customers: matched.slice(offset, offset + limit),
        totalCount: matched.length,
      };
    },
    create: async (data) => {
      const now = new Date().toISOString();
      const customer: CustomerEntity = {
        ...data,
        dataRetentionConsent: data.dataRetentionConsent ?? true,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      this.customersMap.set(customer.id, customer);
      return customer;
    },
    update: async (ownerId, id, patch) => {
      const customer = await this.customers.findById(ownerId, id);
      if (!customer) return null;
      const updated: CustomerEntity = {
        ...customer,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      this.customersMap.set(id, updated);
      return updated;
    },
    delete: async (ownerId, id) => {
      const customer = await this.customers.findById(ownerId, id);
      if (!customer) return false;
      this.customersMap.delete(id);
      return true;
    },
  };

  packages: PackageRepository = {
    findById: async (ownerId, id) => {
      const p = this.packagesMap.get(id);
      return p && p.ownerId === ownerId ? p : null;
    },
    list: async (ownerId, activeOnly = false) => {
      return Array.from(this.packagesMap.values()).filter(
        (p) => p.ownerId === ownerId && (!activeOnly || p.active)
      );
    },
    create: async (data) => {
      const now = new Date().toISOString();
      const pkg: PackageEntity = {
        ...data,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      this.packagesMap.set(pkg.id, pkg);
      return pkg;
    },
    update: async (ownerId, id, patch) => {
      const existing = await this.packages.findById(ownerId, id);
      if (!existing) return null;
      const updated: PackageEntity = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      this.packagesMap.set(id, updated);
      return updated;
    },
  };

  coupons: CouponRepository = {
    findById: async (ownerId, id) => {
      const c = this.couponsMap.get(id);
      return c && c.ownerId === ownerId ? c : null;
    },
    findByCode: async (ownerId, code) => {
      for (const coupon of this.couponsMap.values()) {
        if (coupon.ownerId === ownerId && coupon.code.toUpperCase() === code.toUpperCase()) {
          return coupon;
        }
      }
      return null;
    },
    list: async (ownerId, limit = 50, offset = 0) => {
      const all = Array.from(this.couponsMap.values()).filter((c) => c.ownerId === ownerId);
      return {
        coupons: all.slice(offset, offset + limit),
        totalCount: all.length,
      };
    },
    create: async (data) => {
      const existing = await this.coupons.findByCode(data.ownerId, data.code);
      if (existing) {
        throw new Error(`Unique constraint violation: Coupon code ${data.code} already exists for owner.`);
      }
      const coupon: CouponEntity = {
        ...data,
        code: data.code.toUpperCase(),
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      };
      this.couponsMap.set(coupon.id, coupon);
      return coupon;
    },
    incrementUses: async (ownerId, id) => {
      const coupon = this.couponsMap.get(id);
      if (!coupon || coupon.ownerId !== ownerId) return false;
      if (coupon.currentUses >= coupon.maxUses) return false;
      coupon.currentUses += 1;
      return true;
    },
  };

  sessions: SessionRepository = {
    findById: async (ownerId, id) => {
      const s = this.sessionsMap.get(id);
      return s && s.ownerId === ownerId ? s : null;
    },
    findByIdPublic: async (id) => {
      return this.sessionsMap.get(id) ?? null;
    },
    list: async (ownerId, status) => {
      return Array.from(this.sessionsMap.values()).filter(
        (s) => s.ownerId === ownerId && (!status || s.status === status)
      );
    },
    listByCustomer: async (ownerId, customerId) => {
      return Array.from(this.sessionsMap.values()).filter(
        (s) => s.ownerId === ownerId && s.customerId === customerId
      );
    },
    listAllActive: async () => {
      return Array.from(this.sessionsMap.values()).filter((s) => s.status === 'active');
    },
    create: async (data) => {
      const now = new Date().toISOString();
      const session: SessionEntity = {
        ...data,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      this.sessionsMap.set(session.id, session);
      return session;
    },
    update: async (ownerId, id, patch) => {
      const session = await this.sessions.findById(ownerId, id);
      if (!session) return null;
      const updated: SessionEntity = {
        ...session,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      this.sessionsMap.set(id, updated);
      return updated;
    },
    updateStatus: async (ownerId, id, status, timestamps) => {
      const session = await this.sessions.findById(ownerId, id);
      if (!session) return null;
      session.status = status;
      if (timestamps?.activatedAt) session.activatedAt = timestamps.activatedAt;
      if (timestamps?.expiresAt) session.expiresAt = timestamps.expiresAt;
      session.updatedAt = new Date().toISOString();
      return session;
    },
  };

  gateways: GatewayRepository = {
    findById: async (ownerId, id) => {
      const g = this.gatewaysMap.get(id);
      return g && g.ownerId === ownerId ? g : null;
    },
    list: async (ownerId) => {
      return Array.from(this.gatewaysMap.values()).filter((g) => g.ownerId === ownerId);
    },
    create: async (data) => {
      const now = new Date().toISOString();
      const gateway: GatewayEntity = {
        ...data,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      this.gatewaysMap.set(gateway.id, gateway);
      return gateway;
    },
    update: async (ownerId, id, patch) => {
      const g = await this.gateways.findById(ownerId, id);
      if (!g) return null;
      const updated: GatewayEntity = {
        ...g,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      this.gatewaysMap.set(id, updated);
      return updated;
    },
    delete: async (ownerId, id) => {
      const g = await this.gateways.findById(ownerId, id);
      if (!g) return false;
      this.gatewaysMap.delete(id);
      return true;
    },
  };

  payments: PaymentRepository = {
    findById: async (ownerId, id) => {
      const p = this.paymentsMap.get(id);
      return p && p.ownerId === ownerId ? p : null;
    },
    findByIdPublic: async (id) => {
      return this.paymentsMap.get(id) ?? null;
    },
    findByProviderRef: async (provider, providerRef) => {
      for (const p of this.paymentsMap.values()) {
        if (p.provider === provider && p.providerRef === providerRef) return p;
      }
      return null;
    },
    findByIdempotency: async (ownerId, key) => {
      for (const p of this.paymentsMap.values()) {
        if (p.ownerId === ownerId && p.idempotencyKey === key) return p;
      }
      return null;
    },
    list: async (ownerId, filters) => {
      const limit = filters?.limit ?? 50;
      const offset = filters?.offset ?? 0;
      const filtered = Array.from(this.paymentsMap.values())
        .filter((p) => {
          if (p.ownerId !== ownerId) return false;
          if (filters?.status && p.status !== filters.status) return false;
          if (filters?.provider && p.provider !== filters.provider) return false;
          return true;
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return {
        payments: filtered.slice(offset, offset + limit),
        totalCount: filtered.length,
      };
    },
    create: async (data) => {
      const existing = await this.payments.findByIdempotency(data.ownerId, data.idempotencyKey);
      if (existing) {
        throw new Error(`Unique constraint: idempotency key ${data.idempotencyKey} already used.`);
      }
      const now = new Date().toISOString();
      const payment: PaymentIntentEntity = {
        ...data,
        sessionId: data.sessionId ?? null,
        customerId: data.customerId ?? null,
        packageId: data.packageId ?? null,
        receiptNumber: data.receiptNumber ?? null,
        refundReason: data.refundReason ?? null,
        metadata: data.metadata ?? {},
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      this.paymentsMap.set(payment.id, payment);
      return payment;
    },
    update: async (ownerId, id, patch) => {
      const p = await this.payments.findById(ownerId, id);
      if (!p) return null;
      const updated: PaymentIntentEntity = {
        ...p,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      this.paymentsMap.set(id, updated);
      return updated;
    },
    updateStatus: async (ownerId, id, status, patch) => {
      const p = await this.payments.findById(ownerId, id);
      if (!p) return null;
      const updated: PaymentIntentEntity = {
        ...p,
        ...patch,
        status,
        updatedAt: new Date().toISOString(),
      };
      this.paymentsMap.set(id, updated);
      return updated;
    },
  };

  ledger: LedgerRepository = {
    create: async (data) => {
      const entry: LedgerEntryEntity = {
        ...data,
        referenceId: data.referenceId ?? null,
        description: data.description ?? null,
        account: data.account ?? 'revenue',
        actor: data.actor ?? null,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      };
      this.ledgerEntries.push(entry);
      return entry;
    },
    listByOwner: async (ownerId) => {
      return this.ledgerEntries
        .filter((e) => e.ownerId === ownerId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    getBalance: async (ownerId, currency) => {
      const entries = this.ledgerEntries.filter((e) => {
        if (e.ownerId !== ownerId) return false;
        if (currency && e.currency !== currency) return false;
        return true;
      });
      let totalRevenueMinor = 0;
      let totalRefundsMinor = 0;
      for (const e of entries) {
        if (e.amountMinor > 0) {
          totalRevenueMinor += e.amountMinor;
        } else {
          totalRefundsMinor += Math.abs(e.amountMinor);
        }
      }
      return {
        totalRevenueMinor,
        totalRefundsMinor,
        netBalanceMinor: totalRevenueMinor - totalRefundsMinor,
      };
    },
  };

  audit: AuditRepository = {
    append: async (data) => {
      const event: AuditEventEntity = {
        ...data,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      };
      this.auditEvents.push(event);
      return event;
    },
    list: async (ownerId, limit = 100) => {
      return this.auditEvents
        .filter((e) => e.ownerId === ownerId)
        .slice(-limit)
        .reverse();
    },
  };

  notifications: NotificationRepository = {
    create: async (data) => {
      const now = new Date().toISOString();
      const n: NotificationEntity = {
        ...data,
        id: randomUUID(),
        metadata: data.metadata ?? {},
        status: data.status ?? 'pending',
        deliveryAttempts: data.deliveryAttempts ?? 0,
        maxAttempts: data.maxAttempts ?? 3,
        lastAttemptAt: data.lastAttemptAt ?? null,
        deliveredAt: data.deliveredAt ?? null,
        readAt: data.readAt ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.notificationsMap.set(n.id, n);
      return n;
    },
    findById: async (id) => this.notificationsMap.get(id) ?? null,
    list: async (ownerId, options) => {
      let list = Array.from(this.notificationsMap.values()).filter((n) => n.ownerId === ownerId);
      if (options?.status) {
        list = list.filter((n) => n.status === options.status);
      }
      if (options?.recipientType) {
        list = list.filter((n) => n.recipientType === options.recipientType);
      }
      if (options?.recipientId) {
        list = list.filter((n) => n.recipientId === options.recipientId);
      }
      if (options?.unreadOnly) {
        list = list.filter((n) => n.status !== 'read');
      }
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (options?.limit) {
        list = list.slice(0, options.limit);
      }
      return list;
    },
    listByRecipient: async (recipientId, limit = 50) => {
      return Array.from(this.notificationsMap.values())
        .filter((n) => n.recipientId === recipientId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);
    },
    update: async (id, patch) => {
      const n = this.notificationsMap.get(id);
      if (!n) return null;
      const updated: NotificationEntity = {
        ...n,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      this.notificationsMap.set(id, updated);
      return updated;
    },
    markDelivered: async (id) => {
      const n = this.notificationsMap.get(id);
      if (!n) return null;
      const now = new Date().toISOString();
      const updated: NotificationEntity = {
        ...n,
        status: 'delivered',
        deliveredAt: now,
        deliveryAttempts: n.deliveryAttempts + 1,
        lastAttemptAt: now,
        updatedAt: now,
      };
      this.notificationsMap.set(id, updated);
      return updated;
    },
    markFailed: async (id) => {
      const n = this.notificationsMap.get(id);
      if (!n) return null;
      const now = new Date().toISOString();
      const updated: NotificationEntity = {
        ...n,
        status: 'failed',
        deliveryAttempts: n.deliveryAttempts + 1,
        lastAttemptAt: now,
        updatedAt: now,
      };
      this.notificationsMap.set(id, updated);
      return updated;
    },
    markRead: async (id) => {
      const n = this.notificationsMap.get(id);
      if (!n) return null;
      const now = new Date().toISOString();
      const updated: NotificationEntity = {
        ...n,
        status: 'read',
        readAt: now,
        updatedAt: now,
      };
      this.notificationsMap.set(id, updated);
      return updated;
    },
  };

  loyalty: LoyaltyRepository = {
    listBadges: async (ownerId, customerId) => {
      return this.badgesList.filter((b) => b.ownerId === ownerId && b.customerId === customerId);
    },
    awardBadge: async (badge) => {
      const existing = this.badgesList.find(
        (b) => b.ownerId === badge.ownerId && b.customerId === badge.customerId && b.badgeCode === badge.badgeCode
      );
      if (existing) return existing;
      const entity: LoyaltyBadgeEntity = {
        ...badge,
        id: randomUUID(),
        awardedAt: new Date().toISOString(),
      };
      this.badgesList.push(entity);
      return entity;
    },
    createBonus: async (bonus) => {
      const now = new Date().toISOString();
      const entity: BonusGrantEntity = {
        ...bonus,
        id: randomUUID(),
        status: bonus.status ?? 'active',
        claimedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.bonusesMap.set(entity.id, entity);
      return entity;
    },
    listBonuses: async (ownerId, customerId, status) => {
      return Array.from(this.bonusesMap.values())
        .filter((b) => {
          if (b.ownerId !== ownerId) return false;
          if (customerId && b.customerId !== customerId) return false;
          if (status && b.status !== status) return false;
          return true;
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    findBonusById: async (ownerId, id) => {
      const b = this.bonusesMap.get(id);
      if (!b || b.ownerId !== ownerId) return null;
      return b;
    },
    updateBonusStatus: async (ownerId, id, status, claimedAt) => {
      const b = this.bonusesMap.get(id);
      if (!b || b.ownerId !== ownerId) return null;
      const updated: BonusGrantEntity = {
        ...b,
        status,
        claimedAt: claimedAt ?? b.claimedAt,
        updatedAt: new Date().toISOString(),
      };
      this.bonusesMap.set(id, updated);
      return updated;
    },
  };

  aiProviders: AIProviderRepository = {
    list: async (ownerId) => {
      return Array.from(this.aiProvidersMap.values())
        .filter((p) => p.ownerId === ownerId)
        .sort((a, b) => a.priority - b.priority);
    },
    findById: async (ownerId, id) => {
      const p = this.aiProvidersMap.get(id);
      if (!p || p.ownerId !== ownerId) return null;
      return p;
    },
    create: async (provider) => {
      const now = new Date().toISOString();
      const entity: AIProviderEntity = {
        ...provider,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      this.aiProvidersMap.set(entity.id, entity);
      return entity;
    },
    update: async (ownerId, id, patch) => {
      const p = this.aiProvidersMap.get(id);
      if (!p || p.ownerId !== ownerId) return null;
      const updated: AIProviderEntity = {
        ...p,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      this.aiProvidersMap.set(id, updated);
      return updated;
    },
    delete: async (ownerId, id) => {
      const p = this.aiProvidersMap.get(id);
      if (!p || p.ownerId !== ownerId) return false;
      return this.aiProvidersMap.delete(id);
    },
  };

  /**
   * Seeds the permanent administrator credentials:
   * Email: administrator@hotspot.local
   * Password: admin@123456
   */
  seedPermanentAdmin(): OwnerEntity {
    const existing = Array.from(this.ownersMap.values()).find(
      (o) => o.email.toLowerCase() === 'administrator@hotspot.local'
    );
    if (existing) return existing;

    const now = new Date().toISOString();
    const admin: OwnerEntity = {
      id: 'admin-permanent-super-001',
      email: 'administrator@hotspot.local',
      passwordHash: computePbkdf2Hash('admin@123456'),
      businessName: 'Hotspot Administration',
      displayName: 'System Administrator',
      role: 'SUPER_ADMIN',
      defaultCurrency: 'USD',
      isActive: true,
      ownerId: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.ownersMap.set(admin.id, admin);
    return admin;
  }
}

export function computePbkdf2Hash(password: string, salt: string = '4f8e2a1b9c3d7e5f6a0b1c2d3e4f5a6b'): string {
  const hash = pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export const defaultDb = new MemoryDatabase();
defaultDb.seedPermanentAdmin();
