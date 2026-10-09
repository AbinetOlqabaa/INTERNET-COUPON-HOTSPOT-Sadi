import type { RepositoryRegistry } from '../db/repositories.js';
import type { SessionEntity, PackageEntity } from '../db/schema.js';
import type { GatewayService } from '../gateway/service.js';
import { isValidSessionTransition, type SessionState } from '../contracts/index.js';

export interface CreateSessionInput {
  ownerId: string;
  packageId: string;
  customerId?: string | null;
  deviceMac?: string | null;
  clientIp?: string | null;
  gatewayId?: string | null;
  initialStatus?: 'created' | 'awaiting_payment' | 'payment_verified';
}

export interface RedeemVoucherInput {
  ownerId: string;
  code: string;
  customerId?: string | null;
  deviceMac?: string | null;
  clientIp?: string | null;
  actor: string;
}

export class SessionService {
  constructor(
    private db: RepositoryRegistry,
    private gatewayService: GatewayService
  ) {}

  /**
   * Creates a new access session intent associated with an access package
   */
  async createSession(input: CreateSessionInput): Promise<SessionEntity> {
    const pkg = await this.db.packages.findById(input.ownerId, input.packageId);
    if (!pkg) {
      throw new Error(`Access package '${input.packageId}' not found.`);
    }

    if (!pkg.active) {
      throw new Error(`Access package '${pkg.name}' is currently inactive.`);
    }

    if (input.customerId) {
      const customer = await this.db.customers.findById(input.ownerId, input.customerId);
      if (!customer) {
        throw new Error(`Customer '${input.customerId}' not found.`);
      }
    }

    const initialStatus = input.initialStatus || 'awaiting_payment';

    const session = await this.db.sessions.create({
      ownerId: input.ownerId,
      customerId: input.customerId ?? null,
      packageId: input.packageId,
      status: initialStatus,
      durationSeconds: pkg.durationSeconds,
      remainingSeconds: pkg.durationSeconds,
      activatedAt: null,
      expiresAt: null,
      deviceMac: input.deviceMac?.toUpperCase() ?? null,
      clientIp: input.clientIp ?? null,
      gatewayId: input.gatewayId ?? null,
    });

    await this.db.audit.append({
      ownerId: input.ownerId,
      actor: 'system',
      action: 'session.created',
      resourceType: 'access_session',
      resourceId: session.id,
      details: {
        packageId: pkg.id,
        packageName: pkg.name,
        durationSeconds: session.durationSeconds,
        initialStatus,
      },
    });

    return session;
  }

  /**
   * Authoritative Session Activation:
   * Sets UTC activatedAt and expiresAt timestamps, starts duration clock,
   * dispatches gateway authorization command, and transitions state to active.
   */
  async activateSession(ownerId: string, sessionId: string, actor: string): Promise<SessionEntity> {
    const session = await this.db.sessions.findById(ownerId, sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found.`);
    }

    // Idempotent: if already active and not expired, return immediately
    if (session.status === 'active') {
      const remaining = this.calculateRemainingSeconds(session);
      if (remaining > 0) return session;
    }

    if (!isValidSessionTransition(session.status, 'active')) {
      throw new Error(
        `Illegal state transition: Cannot activate session from state '${session.status}'. Must be 'payment_verified' or 'activation_pending'.`
      );
    }

    const now = Date.now();
    const activatedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + session.durationSeconds * 1000).toISOString();

    const pkg = await this.db.packages.findById(ownerId, session.packageId);

    // Dispatch to gateway adapter
    await this.gatewayService.authorizeSession(ownerId, session, pkg);

    const updated = await this.db.sessions.updateStatus(ownerId, session.id, 'active', {
      activatedAt,
      expiresAt,
    });

    await this.db.sessions.update(ownerId, session.id, {
      remainingSeconds: session.durationSeconds,
    });

    await this.db.audit.append({
      ownerId,
      actor,
      action: 'session.activated',
      resourceType: 'access_session',
      resourceId: session.id,
      details: {
        durationSeconds: session.durationSeconds,
        activatedAt,
        expiresAt,
        deviceMac: session.deviceMac,
      },
    });

    return updated!;
  }

  /**
   * Dynamically computes real-time remaining seconds and triggers automatic expiration if elapsed
   */
  calculateRemainingSeconds(session: SessionEntity): number {
    if (session.status === 'expired' || session.status === 'revoked' || session.status === 'cancelled') {
      return 0;
    }

    if (session.status === 'paused') {
      return Math.max(0, session.remainingSeconds);
    }

    if (session.status !== 'active') {
      return session.durationSeconds;
    }

    if (!session.expiresAt) {
      return session.durationSeconds;
    }

    const expiryTime = new Date(session.expiresAt).getTime();
    const now = Date.now();
    const remaining = Math.max(0, Math.floor((expiryTime - now) / 1000));

    // If active but clock has elapsed, automatically trigger expiration in background
    if (remaining === 0 && session.status === 'active') {
      this.db.sessions.updateStatus(session.ownerId, session.id, 'expired').catch(() => {});
      this.db.sessions.update(session.ownerId, session.id, { remainingSeconds: 0 }).catch(() => {});
      this.gatewayService.disconnectSession(session.ownerId, session, 'time_expired').catch(() => {});
    }

    return remaining;
  }

  /**
   * Retrieves a session with dynamically evaluated remaining seconds and status
   */
  async getSessionWithEvaluation(ownerId: string, sessionId: string): Promise<SessionEntity | null> {
    const session = await this.db.sessions.findById(ownerId, sessionId);
    if (!session) return null;

    const remaining = this.calculateRemainingSeconds(session);
    if (remaining === 0 && session.status === 'active') {
      session.status = 'expired';
      session.remainingSeconds = 0;
    } else if (session.status === 'active') {
      session.remainingSeconds = remaining;
    }

    return session;
  }

  /**
   * Extends duration of an active or paused session
   */
  async extendSession(
    ownerId: string,
    sessionId: string,
    additionalSeconds: number,
    actor: string
  ): Promise<SessionEntity> {
    if (additionalSeconds <= 0) {
      throw new Error('Additional duration must be positive seconds.');
    }

    const session = await this.db.sessions.findById(ownerId, sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found.`);
    }

    if (session.status !== 'active' && session.status !== 'paused') {
      throw new Error(`Cannot extend session in status '${session.status}'. Session must be active or paused.`);
    }

    const newDurationSeconds = session.durationSeconds + additionalSeconds;
    let newExpiresAt = session.expiresAt;
    let newRemainingSeconds = session.remainingSeconds + additionalSeconds;

    if (session.status === 'active' && session.expiresAt) {
      const currentExpiry = new Date(session.expiresAt).getTime();
      newExpiresAt = new Date(currentExpiry + additionalSeconds * 1000).toISOString();
      newRemainingSeconds = Math.max(0, Math.floor((new Date(newExpiresAt).getTime() - Date.now()) / 1000));
    }

    const updated = await this.db.sessions.update(ownerId, session.id, {
      durationSeconds: newDurationSeconds,
      remainingSeconds: newRemainingSeconds,
      expiresAt: newExpiresAt,
    });

    await this.db.audit.append({
      ownerId,
      actor,
      action: 'session.extended',
      resourceType: 'access_session',
      resourceId: session.id,
      details: {
        addedSeconds: additionalSeconds,
        newDurationSeconds,
        newExpiresAt,
      },
    });

    return updated!;
  }

  /**
   * Temporarily freezes the duration clock of an active session
   */
  async pauseSession(
    ownerId: string,
    sessionId: string,
    reason: string,
    actor: string
  ): Promise<SessionEntity> {
    const session = await this.db.sessions.findById(ownerId, sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found.`);
    }

    if (session.status !== 'active') {
      throw new Error(`Cannot pause session in status '${session.status}'. Only active sessions can be paused.`);
    }

    const remaining = this.calculateRemainingSeconds(session);

    // Disconnect client on hardware router
    await this.gatewayService.disconnectSession(ownerId, session, `Administrative pause: ${reason}`);

    const updated = await this.db.sessions.update(ownerId, session.id, {
      status: 'paused',
      remainingSeconds: remaining,
    });

    await this.db.audit.append({
      ownerId,
      actor,
      action: 'session.paused',
      resourceType: 'access_session',
      resourceId: session.id,
      details: { reason, remainingSecondsAtPause: remaining },
    });

    return updated!;
  }

  /**
   * Resumes a paused session, recalculating the authoritative UTC expiration timestamp
   */
  async resumeSession(ownerId: string, sessionId: string, actor: string): Promise<SessionEntity> {
    const session = await this.db.sessions.findById(ownerId, sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found.`);
    }

    if (session.status !== 'paused') {
      throw new Error(`Cannot resume session in status '${session.status}'. Only paused sessions can be resumed.`);
    }

    const now = Date.now();
    const newExpiresAt = new Date(now + session.remainingSeconds * 1000).toISOString();

    const pkg = await this.db.packages.findById(ownerId, session.packageId);
    await this.gatewayService.authorizeSession(ownerId, session, pkg);

    const updated = await this.db.sessions.update(ownerId, session.id, {
      status: 'active',
      expiresAt: newExpiresAt,
    });

    await this.db.audit.append({
      ownerId,
      actor,
      action: 'session.resumed',
      resourceType: 'access_session',
      resourceId: session.id,
      details: { newExpiresAt, remainingSeconds: session.remainingSeconds },
    });

    return updated!;
  }

  /**
   * Forcefully terminates an active or paused session
   */
  async revokeSession(
    ownerId: string,
    sessionId: string,
    reason: string,
    actor: string
  ): Promise<SessionEntity> {
    const session = await this.db.sessions.findById(ownerId, sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found.`);
    }

    if (!isValidSessionTransition(session.status, 'revoked')) {
      throw new Error(`Cannot revoke session in terminal state '${session.status}'.`);
    }

    await this.gatewayService.disconnectSession(ownerId, session, `Administrative revocation: ${reason}`);

    const updated = await this.db.sessions.update(ownerId, session.id, {
      status: 'revoked',
      remainingSeconds: 0,
    });

    await this.db.audit.append({
      ownerId,
      actor,
      action: 'session.revoked',
      resourceType: 'access_session',
      resourceId: session.id,
      details: { reason },
    });

    return updated!;
  }

  /**
   * Reconciles all active sessions across an owner, marking elapsed sessions as expired
   */
  async reconcileExpiredSessions(ownerId?: string): Promise<{ expiredCount: number }> {
    const activeSessions = await this.db.sessions.listAllActive();
    const now = Date.now();
    let expiredCount = 0;

    for (const session of activeSessions) {
      if (ownerId && session.ownerId !== ownerId) continue;

      if (session.expiresAt) {
        const expiryTime = new Date(session.expiresAt).getTime();
        if (expiryTime <= now) {
          await this.db.sessions.updateStatus(session.ownerId, session.id, 'expired');
          await this.db.sessions.update(session.ownerId, session.id, { remainingSeconds: 0 });
          await this.gatewayService.disconnectSession(session.ownerId, session, 'lease_expired');

          await this.db.audit.append({
            ownerId: session.ownerId,
            actor: 'system:cron',
            action: 'session.expired',
            resourceType: 'access_session',
            resourceId: session.id,
            details: { expiredAt: new Date(now).toISOString() },
          });

          expiredCount++;
        }
      }
    }

    return { expiredCount };
  }

  /**
   * End-to-end Voucher Redemption Workflow:
   * Validates voucher bounds, records usage increment, creates session,
   * marks payment verified, and activates session immediately.
   */
  async redeemVoucherForSession(input: RedeemVoucherInput): Promise<{
    session: SessionEntity;
    couponCode: string;
    packageName: string;
  }> {
    const coupon = await this.db.coupons.findByCode(input.ownerId, input.code);
    if (!coupon) {
      throw new Error(`Voucher code '${input.code}' is invalid or unrecognized.`);
    }

    if (!coupon.active) {
      throw new Error('This voucher has been deactivated.');
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
      throw new Error('This voucher has expired.');
    }

    if (coupon.currentUses >= coupon.maxUses) {
      throw new Error('This voucher has already reached its maximum usage limit.');
    }

    const pkg = await this.db.packages.findById(input.ownerId, coupon.packageId);
    if (!pkg || !pkg.active) {
      throw new Error('The package linked to this voucher is unavailable.');
    }

    // 1. Increment usage count
    const incremented = await this.db.coupons.incrementUses(input.ownerId, coupon.id);
    if (!incremented) {
      throw new Error('Failed to claim voucher redemption.');
    }

    // 2. Create session in payment_verified state
    const session = await this.createSession({
      ownerId: input.ownerId,
      packageId: pkg.id,
      customerId: input.customerId,
      deviceMac: input.deviceMac,
      clientIp: input.clientIp,
      initialStatus: 'payment_verified',
    });

    // 3. Immediately activate
    const activated = await this.activateSession(input.ownerId, session.id, input.actor);

    await this.db.audit.append({
      ownerId: input.ownerId,
      actor: input.actor,
      action: 'coupon.redeemed_for_session',
      resourceType: 'coupon',
      resourceId: coupon.id,
      details: {
        sessionId: activated.id,
        code: coupon.code,
        packageName: pkg.name,
      },
    });

    return {
      session: activated,
      couponCode: coupon.code,
      packageName: pkg.name,
    };
  }

  /**
   * Public Customer Session Status (Captive Portal safe)
   */
  async getPublicSessionStatus(sessionId: string): Promise<{
    id: string;
    status: SessionState;
    durationSeconds: number;
    remainingSeconds: number;
    activatedAt?: string | null;
    expiresAt?: string | null;
    deviceMac?: string | null;
    packageName?: string;
  } | null> {
    const session = await this.db.sessions.findByIdPublic(sessionId);
    if (!session) return null;

    const remaining = this.calculateRemainingSeconds(session);
    const pkg = await this.db.packages.findById(session.ownerId, session.packageId);

    return {
      id: session.id,
      status: remaining === 0 && session.status === 'active' ? 'expired' : session.status,
      durationSeconds: session.durationSeconds,
      remainingSeconds: remaining,
      activatedAt: session.activatedAt,
      expiresAt: session.expiresAt,
      deviceMac: session.deviceMac,
      packageName: pkg?.name,
    };
  }
}
