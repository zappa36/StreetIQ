# Threat Model

## Project Overview

This project is a pnpm monorepo for a delivery-driver voice assistant demo. A React/Vite frontend in `artifacts/demo` calls an Express 5 API in `artifacts/api-server`, which in turn uses Anthropic and OpenAI integrations for intent classification and text-to-speech. PostgreSQL/Drizzle code exists in `lib/db`, but the currently exposed production API surface is limited to `/api/healthz`, `/api/classify`, and `/api/tts`.

Production scope for this scan is limited to artifacts that are actually deployed or mounted in production. `artifacts/mockup-sandbox` is treated as dev-only and excluded unless later evidence shows production reachability. Assume `NODE_ENV=production` in deployed environments. TLS is platform-managed.

## Assets

- **Operational delivery data** — driver transcripts, parcel references, customer names, addresses, route/delay details, and event summaries. Exposure could reveal customer PII and live delivery operations.
- **AI service quotas and API-backed compute** — Anthropic and OpenAI usage is billable and finite. Abuse could create direct cost, exhaust quotas, or degrade service for legitimate users.
- **Application secrets** — database connection strings and AI integration API keys. Leakage would enable unauthorized backend or third-party API access.
- **Service availability** — the `/api/classify` and `/api/tts` routes are the main interactive backend features. Resource exhaustion or abuse would directly affect the product's core functionality.

## Trust Boundaries

- **Browser to Express API** — the frontend is untrusted and all request bodies, headers, and origins must be treated as attacker-controlled.
- **Express API to third-party AI providers** — requests crossing into Anthropic/OpenAI consume paid resources and may transmit sensitive transcript content.
- **Express API to logs** — data written to logs is copied into a broader access domain than the live request path and may be retained beyond the original request lifecycle.
- **Express API to database** — database code is present and remains a trust boundary even if not currently exercised by the exposed routes.

## Scan Anchors

- Production entry points:
  - `artifacts/api-server/src/index.ts`
  - `artifacts/api-server/src/app.ts`
  - `artifacts/demo/src/App.tsx`
- Highest-risk code areas:
  - `artifacts/api-server/src/routes/classify.ts`
  - `artifacts/api-server/src/routes/tts.ts`
  - `lib/integrations-anthropic-ai/src/client.ts`
  - `lib/integrations-openai-ai-server/src/audio/client.ts`
- Public surface: `/api/healthz`, `/api/classify`, `/api/tts`
- Authenticated/admin surfaces: none currently implemented
- Dev-only area normally excluded: `artifacts/mockup-sandbox/**`

## Threat Categories

### Spoofing

There is no implemented authentication boundary in the currently exposed API. If the service is intended for delivery drivers or internal operations, the backend must not rely on the frontend alone to distinguish legitimate users from arbitrary internet callers. Any production endpoint that consumes billable AI resources or processes operational delivery data must require a verifiable server-side identity or an equivalent abuse-control mechanism.

### Information Disclosure

Driver transcripts can contain customer names, parcel identifiers, addresses, and delay explanations. The system must treat those transcripts and derived AI outputs as sensitive operational data. They must not be written to production logs or exposed in client-visible error flows beyond what is necessary for the current user action. Secrets and provider credentials must remain server-side and never appear in browser bundles or logs.

### Denial of Service

The public API can trigger remote AI calls, which are relatively expensive and have external quotas. The system must protect these routes against unauthenticated bulk use, quota exhaustion, and oversized or repeated requests. Public endpoints that forward user input to external providers must enforce bounded request sizes, reasonable timeouts, and rate limits or equivalent abuse controls.

### Tampering

All request bodies crossing from the browser to the API are attacker-controlled. The server must validate mode selectors, text inputs, and any future structured fields before using them to drive downstream provider calls or business logic. The frontend cannot be trusted to constrain values such as voice names, route actions, or delay metadata.

### Elevation of Privilege

If this project later introduces differentiated user roles, all access control must be enforced on the server. In the current design, the largest privilege risk is exposing privileged backend capabilities—such as access to paid AI providers—to anonymous public users. Backend-only resources and secrets must never become reachable merely because a browser can call a route.
