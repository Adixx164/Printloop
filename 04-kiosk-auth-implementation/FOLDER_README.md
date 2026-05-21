# 04 — Kiosk Authentication Implementation

This folder contains the authentication code for the physical kiosks (Raspberry Pi devices that talk to your backend). It's a standalone module that gets merged into the main backend when you're ready.

## What it does

When a customer types code `M7K3X9` at a kiosk, the kiosk needs to ask the backend "Is this a valid paid job?" The backend needs to know that the request is coming from a real authorized kiosk (not someone trying to fake it). This module handles:

1. **Per-kiosk API keys** — each physical kiosk gets a unique key, like a password
2. **Authentication middleware** — verifies the key on every kiosk request
3. **Admin endpoints** — generate new keys, regenerate compromised ones
4. **Database schema** — stores the kiosks and their hashed API keys

## What's inside

```
04-kiosk-auth-implementation/
├── KIOSK_AUTH_README.md            ← Detailed integration guide for this module
├── kiosk.entity.ts                  ← Database table definition
├── 1714500000000-CreateKiosksTable.ts ← Migration to create the table
├── seedKiosks.ts                   ← Adds your initial kiosks
├── kiosk.controller.ts             ← Customer-facing kiosk endpoints
├── kiosk.service.ts                ← Business logic
├── kioskAuth.middleware.ts         ← The authentication check
├── admin-kiosk.routes.ts           ← Admin endpoints (manage kiosks)
└── printer.routes.ts               ← Where the kiosk submits/picks up jobs
```

## Where this goes in the main backend

The main backend (in `01-backend/`) already includes everything from this folder. **You don't need to manually copy these files.** They're here as a standalone reference and in case you need to update only the kiosk auth module.

If you're starting fresh from the main backend, you can ignore this folder entirely. It's redundant with what's already in `01-backend/`.

## When this matters

When you're ready to set up your first physical kiosk:

1. Buy a Raspberry Pi 4 (~₦40k from Computer Village)
2. Buy a USB printer compatible with CUPS (HP LaserJet recommended)
3. Set up the Pi with Raspberry Pi OS
4. Install the kiosk agent (separate Node.js program — not in this package; needs to be built later)
5. Use the admin panel to register the kiosk and get its API key
6. Configure the kiosk agent with that API key
7. The kiosk is now authenticated and can accept print jobs

`KIOSK_AUTH_README.md` in this folder has the detailed walkthrough.
