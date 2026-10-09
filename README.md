# Internet Coupon Hotspot — Full-Stack Application

Production-oriented full-stack platform for the Android-first Internet Coupon Hotspot management system.

---

## Technical Stack & Architecture

- **Client SPA (`Internet_Coupon_Hotspot_Kernel/client`)**: React 19, TypeScript, centralized CSS design tokens (`theme.css`), responsive layouts (`styles.css`), Vite 6.
- **API Monolith (`Internet_Coupon_Hotspot_Kernel/server`)**: Node.js 22, Express 4.x, TypeScript, Helmet security headers, CORS, Zod validation, PBKDF2/SHA-512 authentication, general ledger accounting.
- **Unified Server Runtime (`server.ts`)**: Single entry point running on port 3000. Delegates `/api/*` to the Express backend and integrates Vite middleware in development (serving static bundle in production).
- **Target Platform Compatibility**: Android mobile & tablet responsive layout, touch targets, and viewport metadata configured for hybrid packaging (Capacitor/PWA).

---

## Implemented Subsystems & Capabilities

1. **Authentication & Session Management**:
   - Cryptographic PBKDF2/SHA-512 password hashing with random salt and timing-safe comparison.
   - Bearer session tokens with immediate revocation on logout or password change.
   - Progressive anti-automation lockout (15 minutes after 5 consecutive failed logins).
   - Password lifecycle: authenticated change, non-enumerating forgot-password, 15-minute single-use reset token validation.
   - Initial administrator bootstrap (`POST /api/v1/admin/bootstrap`).

2. **Multi-User & Role-Based Access Control (RBAC)**:
   - Four distinct account tiers: `SUPER_ADMIN`, `OWNER`, `STAFF`, `CUSTOMER`.
   - Server-side role enforcement middleware (`createRoleMiddleware`).
   - Safeguards preventing deactivation, demotion, or deletion of the last active `SUPER_ADMIN`.
   - Administrator console: user search, filtering by role/status, pagination, account activation/deactivation.

3. **Customers & Privacy Consent**:
   - Customer registration with consent parameters and device MAC address tracking (`/api/v1/customers`).
   - Multi-field search (phone, name, MAC) and pagination.

4. **Access Packages & Voucher Engine**:
   - Time-based internet packages with integer minor unit pricing and duration seconds (`/api/v1/packages`).
   - Voucher code generation with uppercase normalization, usage limits, and expiration bounds (`/api/v1/coupons`).
   - Public customer voucher redemption validator (`POST /api/v1/coupons/validate`).

5. **Payments, Counter Cash Desk & General Ledger**:
   - `SandboxPaymentAdapter` and `ManualCashPaymentAdapter`.
   - Replay-protected HMAC-SHA256 signed webhooks (`POST /api/v1/payments/webhooks/:provider`) with 300-second timestamp tolerance.
   - Idempotency key protection on payment intent creation (HTTP 409 on conflict).
   - Counter cash desk produces tamper-evident receipts (`CASH-YYYYMMDD-XXXXXX`), advances session to `payment_verified`, and posts ledger entry.
   - Double-entry general ledger with sales, refunds, adjustments, and automated reconciliation (`GET /api/v1/payments/reconcile`).

6. **Network Reality Disclosures**:
   - Honest capability matrix: disclosures state that standard Android system hotspot mode cannot enforce per-client disconnections or traffic quotas without managed gateway hardware.

---

## Verified Commands & Execution

### Run Full-Stack Development Server
```bash
npm run dev
```
Starts unified server on `http://0.0.0.0:3000`.

### Run Test Suites
```bash
npm test
```
Executes all 96 unit, integration, PWA, and full E2E acceptance tests across 20 suites (18 server suites, 2 client suites).

### TypeScript Typecheck
```bash
npm run lint
```
Executes `tsc --noEmit` across the codebase (0 errors).

### Build Production Bundle
```bash
npm run build
```
Compiles and bundles the client application into `/dist`.

### Production Execution
```bash
npm run start
```

---

## Health & Diagnostic Endpoints

- `GET /api/health`: Kernel diagnostic health monitor.
- `GET /api/v1/health`: API subsystem capability matrix.
- `GET /api/v1`: Root module registry.
- `GET /api/v1/admin/overview`: System and account telemetry.
- `GET /api/v1/admin/ai/insights`: Privacy-preserving operational AI insights.
- `GET /manifest.webmanifest`: Progressive Web App (PWA) manifest.
