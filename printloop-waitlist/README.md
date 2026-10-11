# PrintLoop Waitlist — University of Abuja Pilot

A production-ready waitlist landing page for PrintLoop's UniAbuja launch. Built with React 18 + TypeScript + Vite, featuring a distinctive design system grounded in print vernacular: paper, ink, toner.

## 🎯 Features

- **Dual waitlist flows**: Students (4-step) + Print Shops (4-step) with progressive disclosure
- **Early bird incentives**: First 200 students get **20% off first 3 prints**; First 5 shops get **Month 1 = 0% fees**
- **App-first messaging**: Mobile app for customers, PC app for shops (download required)
- **Shop-set pricing**: Print shops set their own ₦/page; displayed to students before selection
- **Signature QR element**: Generative, animated QR code that responds to cursor — the visual bridge between digital upload and physical print
- **API-agnostic**: Works with any backend (Netlify Functions, Vercel Functions, Supabase, custom API)
- **Nigeria-optimized**: WhatsApp primary contact, ₦ pricing, UniAbuja locations
- **Distinctive design system**: Editorial-brutalist with Fraunces variable font, hard paper-sheet shadows, toner-red accents

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev
# Opens http://localhost:3000

# 3. Build for production
npm run build
# Output in dist/
```

## 📁 Project Structure

```
printloop-waitlist/
├── public/                 # Static assets
│   ├── favicon.svg
│   └── og-image.svg
├── src/
│   ├── components/         # React components
│   │   ├── QRCode.tsx      # Generative QR code (signature element)
│   │   ├── StudentWaitlistForm.tsx
│   │   └── ShopWaitlistForm.tsx
│   ├── hooks/
│   │   └── useWaitlistForm.ts
│   ├── styles/
│   │   └── index.css       # Complete design system
│   ├── types/
│   │   └── waitlist.ts     # TypeScript interfaces + constants
│   ├── utils/
│   │   ├── api.ts          # API client (configure for your backend)
│   │   ├── supabase.ts     # Supabase integration (optional)
│   │   └── validation.ts   # Form validation
│   ├── App.tsx             # Main page component
│   ├── main.tsx            # Entry point
│   └── vite-env.d.ts       # Vite env types
├── netlify/
│   └── functions/
│       └── waitlist.ts     # Example Netlify Function
├── vercel.json             # Vercel deployment config
├── netlify.toml            # Netlify deployment config
├── Dockerfile              # Docker deployment
├── nginx.conf              # Nginx config for Docker
└── .env.example            # Environment variables template
```

## 🌐 Deployment Options

### Option 1: Vercel (Recommended — Zero Config)

```bash
# 1. Push to GitHub
git init && git add . && git commit -m "Initial waitlist"
gh repo create printloop-waitlist --public --push

# 2. Import on vercel.com
# - Select repo, framework auto-detected as Vite
# - Deploy!
```

### Option 2: Netlify

```bash
# 1. Push to GitHub (same as above)
# 2. Connect to Netlify
# - Go to netlify.com → "Add new site" → "Import from Git"
# - Build settings auto-detected from netlify.toml
# - Deploy!

# 3. For local dev with functions:
npm install -g netlify-cli
netlify dev  # Runs on http://localhost:8888
```

### Option 3: Docker (VPS / Railway / Render / Fly.io / Coolify)

```bash
# Build
docker build -t printloop-waitlist .

# Run
docker run -p 80:80 printloop-waitlist
```

### Option 4: Static Hosting + Custom API

Deploy the `dist/` folder to any static host (Cloudflare Pages, GitHub Pages, AWS S3 + CloudFront, etc.) and configure `VITE_API_BASE` to point to your API endpoint.

## ⚙️ Configuration

### Environment Variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE` | No | API endpoint (default: `/api`) |
| `VITE_SUPABASE_URL` | No | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | No | Supabase anon key |
| `VITE_GA_ID` | No | Google Analytics 4 measurement ID |

### API Integration

The forms use `src/utils/api.ts` which expects these endpoints:

```
POST   /api/waitlist              # Submit waitlist entry
GET    /api/waitlist/position     # Check position
GET    /api/waitlist/stats        # Get aggregate stats
```

**Request body (student):**
```json
{
  "type": "student",
  "fullName": "John Doe",
  "whatsappNumber": "+2348012345678",
  "email": "john@student.uniabuja.edu.ng",
  "faculty": "engineering",
  "level": "300",
  "hostelArea": "Main Campus Hostel",
  "printsMost": ["assignments", "past-questions"],
  "currentPrintMethod": "cyber-cafe"
}
```

**Request body (shop):**
```json
{
  "type": "shop",
  "shopName": "Campus Print Hub",
  "ownerName": "Jane Smith",
  "whatsappNumber": "+2348012345678",
  "location": "faculty-science",
  "printerModels": "HP LaserJet Pro M404, Canon imageRUNNER 2525",
  "computerOS": "windows-11",
  "internetType": "fiber",
  "dailyVolume": 200,
  "pricePerPage": 30,
  "operatingHours": "Mon-Fri 8am-8pm, Sat 9am-2pm",
  "whyJoin": "Want more student volume"
}
```

**Success response:**
```json
{
  "success": true,
  "message": "You're in the first 200! 20% off first 3 prints locked in.",
  "position": 42,
  "isEarlyBird": true,
  "discountPercent": 20
}
```

### Early Bird Limits

In your API implementation:
- Students: First 200 get 20% off first 3 prints
- Shops: First 5 get Month 1 = 0% platform fees

### Customizing Content

Edit `src/App.tsx` for:
- Hero headlines, subheadlines
- Timeline steps (How it works)
- Student/shop benefit lists
- Pilot program perks
- Founder quote

Edit `src/types/waitlist.ts` for:
- Faculty/level/location dropdown options
- Printer OS/internet type options
- Print method/prints-most checkbox options

## 🎨 Design System

**Colors — named for print materials:**

| Token | Hex | Usage |
|-------|-----|-------|
| `--paper` | `#F8F4ED` | Background (warm paper stock) |
| `--paper-deep` | `#E8E0D0` | Folded edges, alt backgrounds |
| `--ink` | `#1A1410` | Primary text, borders (deep toner) |
| `--ink-soft` | `#2D2620` | Secondary text |
| `--toner` | `#D14B2C` | **Primary accent** — fresh laser toner |
| `--toner-glow` | `#E85D3D` | Hover/active states |
| `--margin` | `#C7944A` | Page margin/aging — shop accent |
| `--stock` | `#6B7A5C` | Paper stock green — success states |
| `--stock-pale` | `#E8EDE4` | Stock tint backgrounds |
| `--fog` | `#888888` | Muted metadata |
| `--fog-light` | `#B8B8B8` | Placeholders |

**Typography:**
- **Display**: Fraunces (variable) — optical sizing, weights 700-900, condensed for impact
- **Body**: Inter — tight tracking (-0.005em), weights 400/500/600/700
- **Mono**: JetBrains Mono — tabular nums for prices, codes

**Signature Component:**
- **Generative QR Code** — Canvas-rendered, animated "burn-in" on load, cursor-reactive glow. The visual representation of "digital → physical."

**Components:**
- `.btn` — Paper sheet metaphor (hard offset shadows)
- `.field` — Inputs with ink borders, toner focus rings
- `.card` — Paper sheets with lift-on-hover
- `.badge` — Chips for labels/status
- `.timeline` — Horizontal scroll for sequential process

## 📱 Mobile App Messaging

The landing page communicates:
- **Customers**: Download PrintLoop mobile app (iOS/Android) → upload → QR → print
- **Shops**: Download PrintLoop PC agent (Windows/Linux) → auto-receives jobs → prints via local spooler

No app store links yet — waitlist captures interest for launch notification.

## 🧪 Testing

```bash
# Type check
npx tsc --noEmit

# Lint
npm run lint

# Build production
npm run build

# Preview production build
npm run preview
```

## 📊 Analytics Events (Add to Forms)

```typescript
// In form onSuccess:
if (typeof gtag !== 'undefined') {
  gtag('event', 'waitlist_signup', {
    user_type: type, // 'student' | 'shop'
    early_bird: response.isEarlyBird,
    position: response.position,
  });
}
```

## 🚨 Production Checklist

- [ ] Replace mock API with real backend (Supabase, Postgres, etc.)
- [ ] Set up custom domain (printloop.ng / waitlist.printloop.ng)
- [ ] Configure HTTPS + security headers
- [ ] Add reCAPTCHA/hCaptcha to prevent spam
- [ ] Set up email/WhatsApp notifications for new signups
- [ ] Configure GA4 / Plausible analytics
- [ ] Test on real devices (Android Chrome, iOS Safari)
- [ ] Verify WhatsApp click-to-chat links work
- [ ] Load test API endpoint (target: 100 req/s)
- [ ] Update WhatsApp number in footer/contact links

## 📞 Support

- **WhatsApp**: +234-XXX-XXXX (update in `src/App.tsx` footer)
- **Email**: email@printloop.ng
- **Issues**: GitHub Issues on this repo

---

## 📝 For the Engineer Receiving This

**This is a complete, deployable codebase.** Works on Vercel, Netlify, Docker, or any static host + API.

**To deploy on Vercel in 2 minutes:**
1. `git init && git add . && git commit -m "Initial"`
2. `gh repo create printloop-waitlist --public --push`
3. Go to vercel.com → Import from Git → Select repo → Deploy
4. Done.

**To connect a real backend:**
1. Implement the 3 API endpoints above
2. Set `VITE_API_BASE=https://your-api.com` in Vercel/Netlify env vars
3. Redeploy

**No Netlify lock-in** — the `netlify/functions/waitlist.ts` is just an example. Use any backend.

---

Built for PrintLoop SaaS v2 — University of Abuja Pilot Launch