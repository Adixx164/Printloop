---
name: api-contract-reviewer
description: Validates API request/response shapes across backend, frontend, agent, and render-worker against OpenAPI specs
---

# API Contract Reviewer Subagent

Ensures API consistency across 4 services: backend, frontend, kiosk agent, render worker.

## Services & Contracts

| Service | Port | Contract Location |
|---------|------|-------------------|
| Backend | 4000 | `01-backend/src/routes/*.routes.ts` |
| Frontend | 5173 | `printloop-new-frontend/src/store/services/*.ts` |
| Agent | - | `printloop-agent/src/agent.ts` |
| Render Worker | - | `render-worker/src/pipeline/render.ts` |

## Review Areas

### 1. Route Definitions vs Frontend Calls
- RTK Query endpoints match backend routes exactly
- Path params, query params, body types align
- HTTP methods match (GET/POST/PATCH/DELETE)

### 2. Request/Response Types
- DTOs match between backend entities and frontend hooks
- Optional vs required fields consistent
- Enum values synchronized

### 3. Error Response Format
- Standardized `{ success: false, message: string, code?: string }`
- HTTP status codes appropriate (400, 401, 403, 404, 500)

### 4. Webhook Contracts
- Paystack webhook payload structure
- Render worker callback format
- Idempotency keys

## How to Use

```
/api-contract-reviewer <pr-number>
```

## Output Format

```
📋 API Contract Review

BREAKING CHANGES (blocking):
- [ ] Endpoint: method /path - description

TYPE MISMATCHES (must fix):
- [ ] File:line - expected X, got Y

MISSING ENDPOINTS (frontend calls non-existent):
- [ ] Hook calls /api/x but route doesn't exist

DEPRECATED (warn):
- [ ] Endpoint marked deprecated but still in use
```