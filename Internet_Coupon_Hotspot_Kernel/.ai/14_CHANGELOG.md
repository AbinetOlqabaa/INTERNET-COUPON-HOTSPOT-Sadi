# Changelog and Evidence

## Permanent Administrator Credentials & Login Hardening (Completed)
- **Eliminated Public Admin Bootstrap Vulnerability**:
  - Removed "Admin Bootstrap" mode and buttons completely from the login screen (`client/src/components/AuthView.tsx`).
  - Switched public login interface to standard owner/operator authentication (`POST /api/v1/auth/login`) with links for Owner Registration and Password Recovery.
  - Locked public bootstrap endpoint (`POST /api/v1/admin/bootstrap`), permanently rejecting unauthenticated initialization requests with `BOOTSTRAP_FAILED`.
- **Permanent Administrator Credentials**:
  - Assigned and automatically seeded primary Super Administrator on startup:
    - Identifier: `administrator@hotspot.local`
    - Initial Password: `admin@123456`
    - Role: `SUPER_ADMIN`
  - Seeded automatically in `MemoryDatabase.seedPermanentAdmin()` and `AuthService.ensureDefaultAdmin()`.
  - Credentials badge and hints removed from login UI; documented exclusively in `README.md` and security documentation to prevent public credential reconnaissance.
- **In-Dashboard Credential & Profile Lifecycle**:
  - Implemented real-time email address and display name updates in Account Security (`PUT /api/v1/owner/profile` / `PATCH /api/v1/admin/users/:id`), with database email uniqueness enforcement.
  - Implemented password change (`POST /api/v1/auth/change-password`) requiring existing password verification, PBKDF2 hashing, session revocation, and security audit event logging.
- **Verification & Test Evidence**:
  - Built dedicated test suite `server/src/admin/permanent_admin.test.ts` (4 tests).
  - Total test count: **100 / 100 tests passing across 21 test suites** in vitest.

## Phase 17, 18 & 19 — PWA Installability, Hardening & Full E2E Acceptance (Completed)
- Built Progressive Web App (PWA) Foundation & Installability (`client/public/`, `client/src/components/`):
  - Created Web App Manifests (`manifest.webmanifest`, `manifest.json`) with `id: '/'`, `short_name: 'Hotspot'`, `display: 'standalone'`, theme colors, and dual purpose (`any` & `maskable` safe-zone) SVG icons.
  - Built `usePWAInstall` React hook and `PWAInstallButton` component supporting Android/Chromium `beforeinstallprompt`, standalone auto-hiding, and iOS Safari Add-to-Home-Screen guide modal.
  - Built `useOnlineStatus` hook and non-intrusive `OfflineIndicator` toast notifying users of network drops.
  - Configured Capacitor container (`capacitor.config.ts`) and authored Android Permissions Specification (`.ai/17_ANDROID_PACKAGING_SPEC.md`).
- Authored Full End-to-End Acceptance Journey Test Suite (`server/src/e2e_acceptance.test.ts`):
  - Verifies complete lifecycle: SuperAdmin bootstrap → Hotspot Owner registration → Access package creation → Voucher generation (`FLIGHT2HR`) → Customer captive portal voucher redemption with MAC binding → Active countdown timer → Walk-in customer cash payment → Tamper-evident receipt generation → Session pause and resume cycle → Automated financial reconciliation → General ledger net balance → Cross-tenant security isolation.
- Authored Production Deployment Runbook & Hardware Compatibility Matrix (`.ai/19_DEPLOYMENT_RUNBOOK_AND_COMPATIBILITY_MATRIX.md`):
  - Explicit truth disclosures for all subsystems (Mode A unmanaged hotspot vs Mode B hardware router, physical device not tested, live sandbox verified).
- Verification & Test Evidence:
  - **96 / 96 tests passing across 20 test files** in vitest:
    - `server/src/e2e_acceptance.test.ts` (1 test)
    - `server/src/sessions/sessions.test.ts` (10 tests)
    - `server/src/payments/payments.test.ts` (10 tests)
    - `server/src/admin/admin.test.ts` (6 tests)
    - `server/src/gateway/gateway.test.ts` (6 tests)
    - `server/src/ai/ai.test.ts` (6 tests)
    - `server/src/db/db.test.ts` (6 tests)
    - `server/src/contracts/contracts.test.ts` (7 tests)
    - `server/src/auth/auth.test.ts` (5 tests)
    - `server/src/analytics/analytics.test.ts` (5 tests)
    - `server/src/auth/password_lifecycle.test.ts` (4 tests)
    - `server/src/customers/customers.test.ts` (4 tests)
    - `server/src/notifications/notifications.test.ts` (4 tests)
    - `server/src/loyalty/loyalty.test.ts` (4 tests)
    - `server/src/packages/packages.test.ts` (3 tests)
    - `server/src/coupons/coupons.test.ts` (3 tests)
    - `server/src/owner/owner.test.ts` (2 tests)
    - `server/src/app.test.ts` (2 tests)
    - `client/src/theme.test.ts` (5 tests)
    - `client/src/pwa.test.ts` (3 tests)
  - TypeScript compilation checks (`tsc --noEmit`): 0 errors across workspace.
  - Production build (`npm run build`): Clean build.
  - Dev server responding on port 3000 to `/api/v1/health`, `/api/v1`, and serving the SPA.

## Phase 12, 13, 14, 15 & 16 — Notifications, Analytics, Loyalty & AI Copilot (Completed)
- Built Notification Engine (`server/src/notifications/`):
  - Multi-channel notification pipeline supporting `in_app`, `portal_toast`, `sms_stub`, and `webhook` delivery targets.
  - Delivery lifecycle tracking (`pending`, `delivered`, `failed`, `read`), delivery retry endpoint (`POST /api/v1/notifications/:id/retry`), and public toast querying (`GET /api/v1/notifications/portal/:recipientId`).
  - Automated expiring session alert scanner (`POST /api/v1/notifications/check-expiring`) detecting active sessions with < 5 minutes remaining.
  - Operator drawer UI (`client/src/components/NotificationsModal.tsx`).
- Built Financial, Usage & Retention Analytics (`server/src/analytics/`):
  - Aggregated overview telemetry with integer minor units and data source attribution (`ledger_journal_verified`).
  - Time-series daily revenue breakdown, delivered hours, package distribution, and returning customer retention tracking.
  - CSV exports (`GET /api/v1/analytics/export?type=ledger|sessions`) with verified MIME types and headers.
  - Operator Analytics UI (`client/src/components/AnalyticsView.tsx`).
- Built Customer Segmentation & Loyalty Badges (`server/src/loyalty/`):
  - Deterministic customer segments (`NEW`, `REGULAR`, `VIP`, `AT_RISK`, `INACTIVE`) with explainable criteria and evidence.
  - Badges system with audit event trail (`POST /api/v1/loyalty/badges`).
  - Bounded loyalty bonuses (`POST /api/v1/loyalty/bonuses`) with abuse protection limits (max 3), expiration bounds, and claiming workflow.
  - Operator Loyalty UI (`client/src/components/LoyaltyView.tsx`).
- Built AI Provider Registry, Quota Management & Copilot (`server/src/ai/`):
  - Pluggable provider registry supporting Gemini, Groq, Anthropic, and Local models with encrypted API key storage and masked presentation.
  - Privacy scrubbing pipeline (`scrubPii`) removing emails, phone numbers, MAC addresses, credit cards, and tokens before synthesis.
  - Grounded Copilot Q&A requiring owner confirmation for actions; revenue forecasting with minimum-sample disclosures; anomaly detection; and privacy-safe customer support response drafter.
  - Operator Copilot UI (`client/src/components/AICopilotView.tsx`).
- Evidence & Verification:
  - 92/92 tests passing across 18 test suites in vitest:
    - `server/src/sessions/sessions.test.ts` (10 tests)
    - `server/src/payments/payments.test.ts` (10 tests)
    - `server/src/admin/admin.test.ts` (6 tests)
    - `server/src/gateway/gateway.test.ts` (6 tests)
    - `server/src/ai/ai.test.ts` (6 tests)
    - `server/src/db/db.test.ts` (6 tests)
    - `server/src/contracts/contracts.test.ts` (7 tests)
    - `server/src/auth/auth.test.ts` (5 tests)
    - `server/src/analytics/analytics.test.ts` (5 tests)
    - `server/src/auth/password_lifecycle.test.ts` (4 tests)
    - `server/src/customers/customers.test.ts` (4 tests)
    - `server/src/notifications/notifications.test.ts` (4 tests)
    - `server/src/loyalty/loyalty.test.ts` (4 tests)
    - `server/src/packages/packages.test.ts` (3 tests)
    - `server/src/coupons/coupons.test.ts` (3 tests)
    - `server/src/owner/owner.test.ts` (2 tests)
    - `server/src/app.test.ts` (2 tests)
    - `client/src/theme.test.ts` (5 tests)
  - TypeScript compilation checks (`tsc --noEmit`): 0 errors across workspace.
  - Production build (`npm run build`): Clean build.
  - Dev server responding on port 3000 to `/api/v1/health`, `/api/v1`, and serving the SPA.

## Phase 8, 9, 10 & 11 — Sessions State Machine, Gateway Adapters & Customer Portal (Completed)
- Built Server-Authoritative Session Engine (`server/src/sessions/service.ts` & `routes.ts`):
  - Authoritative UTC timestamps for `activatedAt` and `expiresAt` with server-enforced duration clocks.
  - Resolved `VALID_SESSION_TRANSITIONS` state table in `server/src/contracts/index.ts` to allow direct activation from verified payment states (`payment_verified` -> `active`).
  - Implemented session operations: `POST /api/v1/sessions` (creation), `POST /api/v1/sessions/:id/activate` (activation), `POST /api/v1/sessions/:id/extend` (extension), `POST /api/v1/sessions/:id/pause` (administrative pause with frozen remaining seconds), `POST /api/v1/sessions/:id/resume` (resume with recalculated expiry timestamp), and `POST /api/v1/sessions/:id/revoke` (administrative revocation).
  - Passive & automated expiry reconciliation: `POST /api/v1/sessions/reconcile-expiry`.
  - Built Operator Sessions UI (`client/src/components/SessionsView.tsx`): live 1-second dynamic countdown clocks, status filters, manual session creator, extension modal, pause/resume, and administrative revocation.
- Built Gateway Adapter Layer & Honest Network Architecture (`server/src/gateway/`):
  - `LimitedOwnerGatewayAdapter` for standard Android OS hotspot with honest disclosures (`canDisconnectClient: false`, `canLimitBandwidth: false`, `canMeasureTraffic: false`).
  - `MockTestGatewayAdapter` clearly marked `TEST ONLY` providing validated simulation of authoritative disconnections and byte counters.
  - Implemented Gateway routes: `GET /api/v1/gateways` (list & capabilities), `POST /api/v1/gateways` (registration), `GET /api/v1/gateways/:id/health` (health probe), `GET /api/v1/gateways/:id/accounting/:mac` (traffic accounting), `POST /api/v1/gateways/:id/disconnect` (client disconnection), and `POST /api/v1/gateways/events` (webhook ingestion).
  - Built Operator Gateways UI (`client/src/components/GatewaysView.tsx`): explicit architectural cards distinguishing unmanaged Android hotspots from managed hardware routers, hardware acceptance disclosure ("Physical hardware router integration NOT TESTED on physical device; verified with Mock Test Gateway adapter"), and diagnostic harness.
- Built Customer Captive Portal & Self-Service Experience (`client/src/components/CustomerPortalView.tsx`):
  - Voucher redemption directly into active sessions: `POST /api/v1/sessions/redeem`.
  - Public captive portal status polling without authentication leakage: `GET /api/v1/sessions/public/:id`.
  - Mobile-responsive customer captive portal with real-time remaining time countdown clock, package info, and step-by-step connection guides.
- Evidence & Verification:
  - 73/73 tests passing across 14 test suites in vitest:
    - `server/src/sessions/sessions.test.ts` (10 tests)
    - `server/src/gateway/gateway.test.ts` (6 tests)
    - `server/src/payments/payments.test.ts` (10 tests)
    - `server/src/admin/admin.test.ts` (6 tests)
    - `server/src/auth/password_lifecycle.test.ts` (4 tests)
    - `server/src/customers/customers.test.ts` (4 tests)
    - `server/src/auth/auth.test.ts` (5 tests)
    - `server/src/packages/packages.test.ts` (3 tests)
    - `server/src/coupons/coupons.test.ts` (3 tests)
    - `server/src/owner/owner.test.ts` (2 tests)
    - `server/src/app.test.ts` (2 tests)
    - `server/src/contracts/contracts.test.ts` (7 tests)
    - `server/src/db/db.test.ts` (6 tests)
    - `client/src/theme.test.ts` (5 tests)
  - TypeScript compilation checks (`tsc --noEmit`): 0 errors across workspace.
  - Production build (`npm run build`): Clean build.
  - Dev server responding on port 3000 to `/api/v1/health` and serving the SPA.
- Built authentication & session security engine in `server/src/auth/service.ts`:
  - PBKDF2/SHA-512 password hashing with random 16-byte salt, 10,000 iterations, 64-byte key length.
  - Timing-safe comparison preventing timing leakage attacks.
  - 24-hour cryptographically secure random session tokens with immediate invalidation upon logout, password change, password reset, or account deactivation.
  - In-memory progressive anti-automation rate limiter: enforces 15-minute lockout after 5 consecutive failed login attempts.
  - Password lifecycle: secure authenticated password change (`POST /api/v1/auth/change-password`), non-enumerating forgot-password request (`POST /api/v1/auth/forgot-password`), 15-minute single-use SHA-256 hashed reset token validation (`POST /api/v1/auth/reset-password`).
  - First-run administrator bootstrap (`POST /api/v1/admin/bootstrap`): initializes initial `SUPER_ADMIN` safely when no administrator exists, locking permanently after initialization.
- Built Role-Based Access Control & User Administration in `server/src/admin/routes.ts`:
  - Four distinct roles: `SUPER_ADMIN`, `OWNER`, `STAFF`, `CUSTOMER`.
  - Server-enforced role middleware (`createRoleMiddleware`).
  - Safeguard protection: system strictly prohibits deactivating, demoting, or deleting the last active `SUPER_ADMIN`.
  - User CRUD operations: list with search, role filters, status filters, and pagination; view user; create staff/owner; update user; activate and deactivate accounts with immediate session revocation; and delete user.
  - Administrative overview metrics (`GET /api/v1/admin/overview`): total users, active/inactive distribution, role distribution, system uptime, and rate-limiting status.
  - Tamper-evident administrative audit trail (`GET /api/v1/admin/audit-logs`).
  - AI operational telemetry foundation (`GET /api/v1/admin/ai/insights`): aggregates security posture and operational findings without leaking secrets or raw credentials.
- Built responsive operator UI in `client/src/App.tsx`, `client/src/components/AuthView.tsx`, and `client/src/components/LogoutModal.tsx`:
  - Polished authentication screen supporting Sign In, Register, Forgot Password, Reset Password, and Admin Bootstrap.
  - Password visibility toggle (`showPassword` state with accessible show/hide buttons).
  - Responsive collapsible sidebar (desktop collapse between 250px and 68px, mobile sliding drawer with backdrop).
  - Role-aware navigation links hiding admin sections from unauthorized users.
  - Accessible modal dialog for logout confirmation with reliable backend session revocation.
- Added database migration `002_user_management_and_roles.sql` defining role fields, display name, owner foreign key, and `password_reset_tokens` table.
- Added comprehensive unit and integration test suites:
  - `server/src/auth/password_lifecycle.test.ts` (4 tests)
  - `server/src/admin/admin.test.ts` (6 tests)
  - `client/src/theme.test.ts` (5 tests)
- Evidence: 57/57 tests passing across 12 test suites; zero TypeScript errors; clean production build.

## Phase 7 — Payment Adapters, Sandbox, Signed Webhooks, Manual Payments, Ledger & Reconciliation (Completed)
- Built extensible payment adapter layer in `server/src/payments/`:
  - `SandboxPaymentAdapter`: simulated tokenized checkout URLs, immediate success simulation, deterministic failure and 3DS challenge simulations.
  - `ManualCashPaymentAdapter`: front-desk on-premise cash collection producing tamper-evident receipt numbers (`CASH-YYYYMMDD-XXXXXX`).
- Built payment intent management in `server/src/payments/service.ts`:
  - Strict idempotency key handling: returns cached intent on duplicate calls; rejects with HTTP 409 if conflicting amounts or currencies are submitted.
  - Integration with general ledger: automatic posting of sales entries upon completion.
  - Automatic session state coordination: transitions linked session to `payment_verified`.
- Built replay-protected signed webhook processing:
  - Validates HMAC-SHA256 signatures with 300-second timestamp tolerance window to block replay attacks.
  - Validates amount and currency match against intent to prevent tampering anomalies.
- Built general ledger and reconciliation reporting:
  - `GET /api/v1/payments/ledger`: double-entry tracking of sales, refunds, and adjustments with net balance calculation.
  - `GET /api/v1/payments/reconcile`: audits payment intents against general ledger entries, confirming balanced status and detecting discrepancies.
  - `POST /api/v1/payments/:id/refund`: executes full or partial refunds with negative ledger debits, session state coordination, and duplicate refund prevention.
  - `POST /api/v1/payments/:id/dispute`: flags dispute states on payment intents and sessions.
- Added unit and integration test suite:
  - `server/src/payments/payments.test.ts` (10 tests)

## Phase 6 — Packages, Pricing Snapshots, Coupons & Abuse Controls (Completed)
- Built access package management in `server/src/packages/routes.ts`:
  - `POST /api/v1/packages` and `GET /api/v1/packages`.
  - Immutable historical price snapshot safety: updating package prices does not retroactively alter purchased sessions.
- Built voucher & coupon management in `server/src/coupons/routes.ts`:
  - `POST /api/v1/coupons` with uppercase normalization, usage limits, and expiration bounds.
  - `POST /api/v1/coupons/validate`: public redemption verification endpoint checking active status, expiry, and usage limits before returning package snapshot.
- Added comprehensive unit and integration tests:
  - `server/src/packages/packages.test.ts` (3 tests)
  - `server/src/coupons/coupons.test.ts` (3 tests)

## Phase 5 — Customers, Consent, Device/Session History, Search & Pagination (Completed)
- Built customer management in `server/src/customers/routes.ts`:
  - `POST /api/v1/customers` with terms consent and data retention tracking.
  - `GET /api/v1/customers` with multi-field search (phone, name, MAC) and pagination (`limit`, `offset`, `totalCount`, `hasMore`).
  - `GET /api/v1/customers/:id` returning customer details and complete historical session list.
  - `PUT /api/v1/customers/:id` for profile and consent updates.
  - `DELETE /api/v1/customers/:id` for privacy-compliant deletion.
- Added unit and integration tests in `server/src/customers/customers.test.ts` (4 tests).

## Phase 4 — Owner Profile, Settings, Capability Status & Dashboard Shell (Completed)
- Created owner routes in `server/src/owner/routes.ts`:
  - `GET /api/v1/owner/profile` (profile retrieval)
  - `PUT /api/v1/owner/profile` (profile update)
  - `GET /api/v1/owner/dashboard` (metrics: packages, active sessions, total revenue, customer count, and honest gateway mode disclosure)
- Mounted `/api/v1/owner` protected by `authMiddleware` in `server/src/app.ts`.
- Added unit and integration tests in `server/src/owner/owner.test.ts` (2 tests).

## Phase 3 — Authentication, Tenant Isolation, Permissions & Audit (Completed)
- Implemented `AuthService` in `server/src/auth/service.ts`:
  - PBKDF2/SHA-512 password hashing with cryptographically random per-user salt and timing-safe comparison.
  - Bearer session token issuance, validation, and revocation on logout.
- Created auth routes in `server/src/auth/routes.ts` (`/register`, `/login`, `/me`, `/logout`) and `createAuthMiddleware`.
- Added test suite in `server/src/auth/auth.test.ts` (5 tests).

## Phase 2 — Relational Schema, Repositories, Constraints & Backup Plan (Completed)
- Authored initial PostgreSQL 16 schema in `server/src/db/migrations/001_initial_schema.sql`.
- Created Zod entity schemas in `server/src/db/schema.ts`.
- Built `MemoryDatabase` repository registry in `server/src/db/repositories.ts`.
- Added unit test suite in `server/src/db/db.test.ts` (6 tests).

## Phase 1 — Product Contracts, Currency Math, Gateway Matrix & Privacy (Completed)
- Authored formal domain contracts in `server/src/contracts/index.ts`.
- Added contract unit test suite in `server/src/contracts/contracts.test.ts` (7 tests).

## Phase 0 — Kernel Baseline Audit and Repair (Completed)
- Baseline tests verified. Unified server runtime in `server.ts` bridges Express API (`/api/v1/*`) and Vite client on port 3000.
