# Phase 19: Deployment Runbook & Hardware Compatibility Matrix

## 1. System Topology & Architecture Overview

The **Internet Coupon Hotspot Platform** is architected as a modular full-stack application:
- **Frontend Client**: React 18 / TypeScript / Vite SPA with PWA installability, mobile responsive design tokens, and operator/customer captive portal modes.
- **Backend Core**: Node.js / Express monolith (`/api/v1/*`) with repository-pattern data persistence, server-authoritative duration clocks, double-entry general ledger, and privacy sanitization.
- **Unified Dev & Runtime**: Unified entry point (`server.ts`) binding the Express REST API and Vite development middleware (or static build artifacts in production) on port 3000.

---

## 2. Production Deployment Runbook

### Step 1: Environment Variables
Create `.env` based on `.env.example`:
```bash
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://your-hotspot-domain.com
DATABASE_URL=postgres://hotspot_user:secure_password@postgres:5432/hotspot_db
```

### Step 2: Database Provisioning & Migrations
```bash
# Start PostgreSQL via docker-compose
docker compose up -d postgres

# Apply relational migrations in order:
psql $DATABASE_URL -f server/src/db/migrations/001_initial_schema.sql
psql $DATABASE_URL -f server/src/db/migrations/002_user_management_and_roles.sql
```

### Step 3: Production Build & Startup
```bash
# 1. Install dependencies
npm install

# 2. Compile client assets to dist/
npm run build

# 3. Start unified full-stack server
npm run start
```

### Step 4: Health & Capability Verification
Verify backend health and active module registry:
```bash
curl -f https://your-hotspot-domain.com/api/v1/health
curl -f https://your-hotspot-domain.com/api/v1
```

---

## 3. Hardware & Provider Compatibility Matrix

Per Completion Gates, all real-world integrations are explicitly categorized:

| Component / Subsystem | Integration Target | Status Label | Verification Details |
| :--- | :--- | :--- | :--- |
| **Android Hotspot (Mode A)** | Built-in Android OS tethering | **IMPLEMENTED** | Unmanaged mode: honestly discloses inability to disconnect or shape per-client bandwidth at OS level. |
| **Hardware Router (Mode B)** | Mikrotik / OpenWrt / CoovaChilli | **VERIFIED (MOCK)** | Managed adapter tested with `MockTestGatewayAdapter`. Physical hardware integration: **NOT TESTED on physical device**. |
| **Customer Captive Portal** | Browser / Web App Manifest | **VERIFIED (PWA)** | Zero-install PWA with `beforeinstallprompt` handler, `manifest.webmanifest`, and `OfflineIndicator`. |
| **Android Packaging** | Capacitor 6+ Android Container | **CONFIGURED** | `capacitor.config.ts` and `AndroidManifest.xml` created. Real APK/device build: **NOT TESTED on physical device**. |
| **Counter Cash Desk** | Front-desk cash collection | **VERIFIED (LIVE)** | `ManualCashPaymentAdapter` tested: generates tamper-evident `CASH-YYYYMMDD-XXXXXX` receipts and ledger postings. |
| **Payment Sandbox** | Card & Digital Wallet Simulator | **VERIFIED (LIVE)** | `SandboxPaymentAdapter` tested: supports 3DS simulation, deterministic failures, and signed webhooks. |
| **Third-Party Gateways** | Stripe / M-Pesa Live APIs | **NOT TESTED** | Adapter interfaces prepared; live processing requires production merchant credentials. |
| **Database Persistence** | PostgreSQL 16+ / In-Memory Repos | **VERIFIED (LIVE)** | Complete repository layer with Zod validation and transaction boundaries tested. |
| **AI Copilot** | Gemini / Groq / Local LLM | **VERIFIED (LIVE)** | Provider registry, quota probing, and privacy scrubbing (`scrubPii`) tested with zero raw secret leaks. |

---

## 4. Disaster Recovery & Backup Plan

1. **Daily Logical Database Snapshots**:
   ```bash
   pg_dump -Fc -d $DATABASE_URL -f /backups/hotspot_$(date +%Y%m%d_%H%M%S).dump
   ```
2. **Weekly Restore Drill**:
   ```bash
   pg_restore -C -d postgres /backups/latest.dump
   ```
3. **Reconciliation Verification**:
   Execute `GET /api/v1/payments/reconcile` to ensure all payment intents match ledger debit/credit balances.
