# PrintLoop — New Frontend (Editorial Energetic)

This is the new editorial-styled PrintLoop frontend, fully wired to talk to your existing backend.

## Quick start

1. Start the backend from `../01-backend` with `npm run dev`
2. Install dependencies: `pnpm install` (or `npm install`)
3. Run: `pnpm dev`
4. Open: http://localhost:5173

## Full instructions

Open **INTEGRATION_GUIDE.docx** (or .pdf) for the complete walkthrough.

## What's wired vs mock

**Wired to backend:** Register, Verify email, Login, Forgot password, Auto token refresh, dashboard jobs, wallet, wallet top-up, stations, single print, personal batch print, group sessions, kiosk code release, and admin overview.

**New story pages:** `/print/new`, `/print/batch`, `/groups`, `/jobs`, `/kiosk`, and `/admin`.

**UI ready, mock-backed:** Admin actions, participant uploads, real printer execution, real Paystack/USSD/bank transfer settlement.

**Not yet built:** File upload to Cloudinary, Paystack payment, Kiosk-side verification, Admin panel.

## Tech stack

React 18 · TypeScript · Vite · Tailwind CSS · Redux Toolkit + RTK Query · React Router 6 · Formik + Yup · Sonner toasts · Lucide icons

Fonts: Fraunces (serif), Inter (sans), JetBrains Mono.

Palette: Ink #1A1410 · Paper #F8F4ED · Persimmon #D14B2C · Ochre #C7944A · Sage #6B7A5C.
