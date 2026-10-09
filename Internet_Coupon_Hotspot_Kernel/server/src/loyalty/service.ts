import type { RepositoryRegistry } from '../db/repositories.js';
import type { CustomerSegment, LoyaltyBadgeEntity, BonusGrantEntity } from '../db/schema.js';

export interface CustomerLoyaltyProfile {
  customerId: string;
  displayName?: string | null;
  segment: CustomerSegment;
  segmentExplanation: {
    criteria: string;
    evidence: Record<string, unknown>;
  };
  badges: LoyaltyBadgeEntity[];
  bonuses: BonusGrantEntity[];
  lifetimeSpendMinor: number;
  totalSessions: number;
}

export class LoyaltyService {
  constructor(private db: RepositoryRegistry) {}

  async calculateSegment(
    ownerId: string,
    customerId: string
  ): Promise<{ segment: CustomerSegment; criteria: string; evidence: Record<string, unknown> }> {
    const customer = await this.db.customers.findById(ownerId, customerId);
    if (!customer) throw new Error('Customer not found');

    const sessions = await this.db.sessions.listByCustomer(ownerId, customerId);
    const payments = await this.db.payments.list(ownerId, { limit: 1000 });
    const customerPayments = payments.payments.filter(
      (p) => p.customerId === customerId && p.status === 'completed'
    );

    const totalSpendMinor = customerPayments.reduce((acc, p) => acc + p.amountMinor, 0);
    const sessionCount = sessions.length;

    const now = Date.now();
    const createdAtTime = new Date(customer.createdAt).getTime();
    const daysSinceCreated = Math.floor((now - createdAtTime) / (1000 * 60 * 60 * 24));

    let lastActiveTime = createdAtTime;
    for (const s of sessions) {
      const t = new Date(s.createdAt).getTime();
      if (t > lastActiveTime) lastActiveTime = t;
    }
    const daysSinceLastActive = Math.floor((now - lastActiveTime) / (1000 * 60 * 60 * 24));

    // Rule 1: VIP (High spend >= 5000 minor units OR 5+ sessions)
    if (totalSpendMinor >= 5000 || sessionCount >= 5) {
      return {
        segment: 'VIP',
        criteria: 'High cumulative spend (>= 50.00) or high visit frequency (>= 5 sessions).',
        evidence: { totalSpendMinor, sessionCount, daysSinceLastActive },
      };
    }

    // Rule 2: AT_RISK (Has past activity but no sessions in last 14 days)
    if (sessionCount > 0 && daysSinceLastActive >= 14) {
      return {
        segment: 'AT_RISK',
        criteria: 'Customer had previous activity but has been inactive for 14 or more days.',
        evidence: { daysSinceLastActive, sessionCount },
      };
    }

    // Rule 3: NEW (Account created within 7 days)
    if (daysSinceCreated <= 7) {
      return {
        segment: 'NEW',
        criteria: 'Customer account was first registered within the last 7 days.',
        evidence: { daysSinceCreated, sessionCount },
      };
    }

    // Rule 4: REGULAR
    return {
      segment: 'REGULAR',
      criteria: 'Standard repeating visitor with normal activity intervals.',
      evidence: { sessionCount, daysSinceLastActive, totalSpendMinor },
    };
  }

  async getCustomerProfile(ownerId: string, customerId: string): Promise<CustomerLoyaltyProfile> {
    const customer = await this.db.customers.findById(ownerId, customerId);
    if (!customer) throw new Error('Customer not found');

    const { segment, criteria, evidence } = await this.calculateSegment(ownerId, customerId);
    const badges = await this.db.loyalty.listBadges(ownerId, customerId);
    const bonuses = await this.db.loyalty.listBonuses(ownerId, customerId);

    const payments = await this.db.payments.list(ownerId, { limit: 1000 });
    const customerPayments = payments.payments.filter(
      (p) => p.customerId === customerId && p.status === 'completed'
    );
    const lifetimeSpendMinor = customerPayments.reduce((acc, p) => acc + p.amountMinor, 0);
    const sessions = await this.db.sessions.listByCustomer(ownerId, customerId);

    return {
      customerId,
      displayName: customer.displayName,
      segment,
      segmentExplanation: { criteria, evidence },
      badges,
      bonuses,
      lifetimeSpendMinor,
      totalSessions: sessions.length,
    };
  }

  async getSegmentsSummary(ownerId: string) {
    const customers = await this.db.customers.list(ownerId, 1000);
    const summary: Record<CustomerSegment, { count: number; customerIds: string[] }> = {
      VIP: { count: 0, customerIds: [] },
      REGULAR: { count: 0, customerIds: [] },
      AT_RISK: { count: 0, customerIds: [] },
      NEW: { count: 0, customerIds: [] },
    };

    for (const c of customers) {
      const { segment } = await this.calculateSegment(ownerId, c.id);
      summary[segment].count += 1;
      summary[segment].customerIds.push(c.id);
    }

    return {
      summary,
      totalCustomers: customers.length,
      rules: {
        VIP: 'Spend >= 50.00 OR >= 5 total sessions',
        AT_RISK: 'Past sessions exist but inactive >= 14 days',
        NEW: 'Registered within the last 7 days',
        REGULAR: 'Active customer not meeting other specific thresholds',
      },
    };
  }

  async awardBadge(
    ownerId: string,
    customerId: string,
    badgeCode: 'EARLY_ADOPTER' | 'LOYAL_STREAMER' | 'WEEKEND_WARRIOR' | 'COMMUNITY_REGULAR',
    evidence: Record<string, unknown> = {}
  ): Promise<LoyaltyBadgeEntity> {
    const customer = await this.db.customers.findById(ownerId, customerId);
    if (!customer) throw new Error('Customer not found');

    const badgeNames: Record<string, string> = {
      EARLY_ADOPTER: 'Early Hotspot Adopter',
      LOYAL_STREAMER: 'Loyal Streamer',
      WEEKEND_WARRIOR: 'Weekend Warrior',
      COMMUNITY_REGULAR: 'Community Regular',
    };

    const badge = await this.db.loyalty.awardBadge({
      ownerId,
      customerId,
      badgeCode,
      name: badgeNames[badgeCode] || badgeCode,
      criteriaEvidence: evidence,
    });

    await this.db.audit.append({
      ownerId,
      actor: 'system',
      action: 'LOYALTY_BADGE_AWARDED',
      resourceType: 'loyalty_badge',
      resourceId: badge.id,
      details: { customerId, badgeCode, evidence },
    });

    return badge;
  }

  async grantBonus(
    ownerId: string,
    data: {
      customerId: string;
      bonusType: 'free_minutes' | 'discount_voucher';
      amountUnits: number;
      budgetDeductionMinor: number;
      currency?: string;
      expiresAt: string;
      auditReason: string;
      createdBy: string;
    }
  ): Promise<BonusGrantEntity> {
    const customer = await this.db.customers.findById(ownerId, data.customerId);
    if (!customer) throw new Error('Customer not found');

    // Abuse control: Max 3 active unclaimed bonuses per customer
    const existingActive = await this.db.loyalty.listBonuses(ownerId, data.customerId, 'active');
    if (existingActive.length >= 3) {
      throw new Error('Abuse protection limit reached: Customer already has 3 active unredeemed bonuses.');
    }

    const owner = await this.db.owners.findById(ownerId);
    const currency = (data.currency as any) ?? owner?.defaultCurrency ?? 'USD';

    const bonus = await this.db.loyalty.createBonus({
      ownerId,
      customerId: data.customerId,
      bonusType: data.bonusType,
      amountUnits: data.amountUnits,
      budgetDeductionMinor: data.budgetDeductionMinor,
      currency,
      status: 'active',
      expiresAt: data.expiresAt,
      auditReason: data.auditReason,
      createdBy: data.createdBy,
    });

    await this.db.audit.append({
      ownerId,
      actor: data.createdBy,
      action: 'BONUS_GRANTED',
      resourceType: 'bonus_grant',
      resourceId: bonus.id,
      details: {
        customerId: data.customerId,
        bonusType: data.bonusType,
        amountUnits: data.amountUnits,
        budgetDeductionMinor: data.budgetDeductionMinor,
        reason: data.auditReason,
      },
    });

    return bonus;
  }

  async claimBonus(ownerId: string, bonusId: string, customerId: string): Promise<BonusGrantEntity> {
    const bonus = await this.db.loyalty.findBonusById(ownerId, bonusId);
    if (!bonus || bonus.customerId !== customerId) {
      throw new Error('Bonus grant not found or customer mismatch.');
    }

    if (bonus.status !== 'active') {
      throw new Error(`Bonus cannot be claimed: status is ${bonus.status}.`);
    }

    if (new Date(bonus.expiresAt).getTime() < Date.now()) {
      await this.db.loyalty.updateBonusStatus(ownerId, bonusId, 'expired');
      throw new Error('Bonus grant has expired.');
    }

    const now = new Date().toISOString();
    const updated = await this.db.loyalty.updateBonusStatus(ownerId, bonusId, 'claimed', now);

    await this.db.audit.append({
      ownerId,
      actor: customerId,
      action: 'BONUS_CLAIMED',
      resourceType: 'bonus_grant',
      resourceId: bonusId,
      details: { customerId, amountUnits: bonus.amountUnits, bonusType: bonus.bonusType },
    });

    return updated!;
  }
}
