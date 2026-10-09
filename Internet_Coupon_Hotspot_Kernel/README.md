# Internet Coupon Hotspot — Kernel

This is a minimal full-stack landing pad, not the complete application. It establishes a React/TypeScript frontend, Express/TypeScript API, centralized design tokens, health check, and autonomous build instructions in `.ai/`.

## Important network limitation
An ordinary Android application cannot universally control the system hotspot, disconnect individual clients, apply per-client speed limits, or obtain reliable per-client traffic accounting. Genuine enforcement requires a compatible managed gateway/router or a specifically supported privileged integration. Never simulate enforcement or claim it has happened without confirmation.

## Administrator Credentials
- **Email**: `administrator@hotspot.local`
- **Password**: `admin@123456`
- **Role**: `SUPER_ADMIN`

*(Credentials are removed from the public login screen for security and can be updated from the Admin Dashboard > Account Security tab).*

## Run
Requires Node.js 20+ and npm. In two terminals:

```sh
cd server && npm install && cp .env.example .env && npm run dev
```
```sh
cd client && npm install && npm run dev
```

API health: `http://localhost:4000/api/v1/health`. Run `npm test` and `npm run build` in each package. The kernel has no business database, authentication, payments, gateway integration, or AI integration yet. Do not call it production-ready until the `.ai/` completion gates pass. Start with `.ai/00_START_HERE.md`.
