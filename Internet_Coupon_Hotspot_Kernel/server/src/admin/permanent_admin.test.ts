import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MemoryDatabase } from '../db/repositories.js';
import { AuthService, DEFAULT_ADMIN_CREDENTIALS } from '../auth/service.js';
import { createAuthRouter, createAuthMiddleware } from '../auth/routes.js';
import { createOwnerRouter } from '../owner/routes.js';
import { createAdminRouter } from './routes.js';

describe('Permanent Administrator & Dashboard Credential Management Suite', () => {
  let db: MemoryDatabase;
  let authService: AuthService;
  let app: express.Express;

  beforeEach(() => {
    db = new MemoryDatabase();
    db.seedPermanentAdmin();
    authService = new AuthService(db);

    app = express();
    app.use(express.json());

    const authMiddleware = createAuthMiddleware(authService, db);

    app.use('/api/v1/auth', createAuthRouter(authService, db));
    app.use('/api/v1/admin', createAdminRouter(db, authService, authMiddleware));
    app.use('/api/v1/owner', authMiddleware, createOwnerRouter(db));
  });

  it('authenticates with seeded permanent administrator credentials (administrator@hotspot.local)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: DEFAULT_ADMIN_CREDENTIALS.email,
        password: DEFAULT_ADMIN_CREDENTIALS.password,
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.owner.email).toBe('administrator@hotspot.local');
    expect(res.body.owner.role).toBe('SUPER_ADMIN');
    expect(res.body.owner.isActive).toBe(true);
    expect(res.body.owner.passwordHash).toBeUndefined();
  });

  it('permanently locks /api/v1/admin/bootstrap to prevent rogue administrative takeover', async () => {
    const res = await request(app)
      .post('/api/v1/admin/bootstrap')
      .send({
        email: 'attacker@evil.corp',
        password: 'RogueAdminPassword999!',
        displayName: 'Intruder',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BOOTSTRAP_FAILED');
    expect(res.body.error.message).toContain('Administrator bootstrap is closed');
  });

  it('allows administrator to change password from the dashboard and invalidates old credentials', async () => {
    // 1. Log in with initial permanent password
    const login1 = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'administrator@hotspot.local',
        password: 'admin@123456',
      });
    expect(login1.status).toBe(200);
    const token = login1.body.token;

    // 2. Change password in security settings
    const newPassword = 'UpdatedAdminSecret2026!';
    const changeRes = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'admin@123456',
        newPassword,
      });
    expect(changeRes.status).toBe(200);
    expect(changeRes.body.message).toContain('Password changed successfully');

    // 3. Old session token is invalidated
    const oldSession = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(oldSession.status).toBe(401);

    // 4. Old password can no longer log in
    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'administrator@hotspot.local',
        password: 'admin@123456',
      });
    expect(oldLogin.status).toBe(401);

    // 5. New password logs in successfully
    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'administrator@hotspot.local',
        password: newPassword,
      });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.token).toBeDefined();
    expect(newLogin.body.owner.email).toBe('administrator@hotspot.local');
  });

  it('allows administrator to update email and display name in dashboard, enforcing email uniqueness', async () => {
    // 1. Initial admin login
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'administrator@hotspot.local',
        password: 'admin@123456',
      });
    const token = login.body.token;

    // 2. Register another user to test conflict
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'occupied@hotspot.local',
        password: 'OtherUserPassword123!',
        businessName: 'Occupied Spot',
      });

    // 3. Attempt to update admin email to occupied email -> rejected
    const conflictRes = await request(app)
      .put('/api/v1/owner/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'occupied@hotspot.local',
        displayName: 'Chief Lead',
      });
    expect(conflictRes.status).toBe(400);
    expect(conflictRes.body.error.code).toBe('EMAIL_EXISTS');

    // 4. Update to a unique new email and display name
    const updateRes = await request(app)
      .put('/api/v1/owner/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'superlead@hotspot.org',
        displayName: 'Chief Technology Administrator',
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.profile.email).toBe('superlead@hotspot.org');
    expect(updateRes.body.profile.displayName).toBe('Chief Technology Administrator');

    // 5. Log in with the updated email
    const loginUpdated = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'superlead@hotspot.org',
        password: 'admin@123456',
      });
    expect(loginUpdated.status).toBe(200);
    expect(loginUpdated.body.owner.email).toBe('superlead@hotspot.org');
  });
});
