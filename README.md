# Hotspot Project Kernel

Minimal, production-oriented technical landing environment for the proposed Android-first Internet Coupon Hotspot application.

## Purpose

This project establishes a clean, stable technical landing environment designed to receive the separately prepared `.ai` instruction pack. It confirms basic frontend/backend runtime plumbing and provides a clean foundation for subsequent autonomous development phases.

## Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide icons
- **Build Tool**: Vite 8
- **Backend Runtime**: Node.js 22+, Express 4
- **Dev Runner**: `tsx` (running Express server mounting Vite middleware on port 3000)

## Project Structure

```
├── .env.example        # Environment variable definitions
├── index.html          # HTML entry point with metadata
├── metadata.json       # Applet configuration metadata
├── package.json        # Dependencies and lifecycle scripts
├── server.ts           # Express entry point & /api/health endpoint
├── src/
│   ├── App.tsx         # Responsive kernel status & health check UI
│   ├── index.css       # Tailwind CSS import
│   └── main.tsx        # React client entry point
├── tsconfig.json       # TypeScript compiler configuration
├── vite.config.ts      # Vite bundler configuration
└── README.md           # Technical documentation and verification guide
```

## Available Scripts

- `npm install`: Install dependencies
- `npm run dev`: Launch the full-stack dev server (`tsx server.ts` on port 3000)
- `npm run build`: Compile the production frontend bundle into `dist/`
- `npm run lint`: Run TypeScript typecheck without emit (`tsc --noEmit`)
- `npm start`: Launch the production server (`node server.ts`)

## Verification Steps

1. **Type Checking**:
   ```bash
   npm run lint
   ```
2. **Production Build**:
   ```bash
   npm run build
   ```
3. **Health Endpoint**:
   ```bash
   curl http://localhost:3000/api/health
   ```
   Returns JSON indicating service health, timestamp, and runtime info.

## Critical Notice

Application business logic (customer management, coupon generation, payment processing, hotspot gateway integration, etc.) is strictly omitted in this kernel and will be directed exclusively by the uploaded `.ai` instruction pack.
