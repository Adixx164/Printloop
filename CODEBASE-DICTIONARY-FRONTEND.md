# 7 · FRONTEND — WEB APP (React + Vite + RTK)

> Folder: `printloop-new-frontend/`
> role — customer + admin + platform UI. Editorial-brutalist design system,
>   RTK Query API layer, route-gated pages.

## bootstrap / shell

```

printloop-new-frontend/src/main.tsx
  role — React app bootstrap
  details — render root with Redux Provider, BrowserRouter, SentryErrorBoundary,
    SentryAuthListener (keeps Sentry user in sync with auth slice), BrandProvider
    (per-tenant white-label swap), Toaster (sonner, styled to the ink/paper palette).
    initSentryIfConfigured() before mount; index.css imported.

printloop-new-frontend/src/App.tsx
  role — route tree + global chrome
  details — RouteWipe, TabTitleNudge, ImpersonationBanner, CookieConsent, then
    Routes: public marketing pages (/features, /pricing, /about, /contact, /blog,
    /blog/:slug, /privacy, /terms), /kiosk + /kiosk/code (KioskCodePage),
    /join/:shareId (group join), marketplace /find + /find/:slug,
    /saas/* tenant admin (signup/login/verify-email + SaasProtectedRoute + SaasShell),
    /platform (platform console), /saas/settings nested tabs (branding/domains/webhooks/
    security/account), auth pages under PublicOnlyRoute + AuthLayout, /admin/login under
    AdminPublicOnlyRoute, /admin under AdminProtectedRoute + AdminLayout, customer app
    under ProtectedRoute + AppLayout (/dashboard, /print/new, /print/batch, /groups,
    /jobs, /jobs/:jobId/edit-review, /stations, /settings), wildcard → /.

printloop-new-frontend/src/routes/ProtectedRoute.tsx
  role — route guards
  details — ProtectedRoute (needs auth token, else → /auth/login), AdminProtectedRoute
    (needs admin/super_admin role, else → /admin/login), PublicOnlyRoute (redirects
    signed-in users away from auth pages), AdminPublicOnlyRoute (redirects authenticated
    admins away from admin login).

printloop-new-frontend/src/constants/routes.ts
  role — centralized route path constants
  details — ROUTES = { ROOT, AUTH:{LOGIN,REGISTER,VERIFY_EMAIL,FORGOT_PASSWORD},
    APP:{DASHBOARD,NEW_PRINT,BATCH_PRINT,GROUP_PRINT,PRINT_JOBS,EDIT_REVIEW,STATIONS,
    SETTINGS}, SAAS:{DASHBOARD,QUEUE,EDIT_QUEUE,OPERATOR,TRANSACTIONS,PAYOUTS,
    SETUP_SUBACCOUNT,SETUP_BANK,OPERATOR_PRINTERS}, ADMIN:{HOME,LOGIN}, KIOSK:{HOME,CODE} }.

printloop-new-frontend/src/constants/config.ts
  role — frontend config (API base URL, feature flags)
  details — CONFIG.apiBaseUrl and any client-side feature constants; drives RTK Query
    fetchBaseQuery baseUrl.

## state / API layer

```

printloop-new-frontend/src/store/index.ts
  role — Redux store assembly
  details — configureStore with auth reducer + apiSlice reducer/middleware; exports
    RootState + AppDispatch types.

printloop-new-frontend/src/store/features/auth/authSlice.ts
  role — auth state (tokens, user, loading)
  details — holds accessToken/refreshToken/user, login/register/logout/refresh mutations,
    setCredentials, token-driven Sentry user sync (via SentryAuthListener).

printloop-new-frontend/src/store/services/apiSlice.ts
  role — RTK Query API base slice
  details — fetchBaseQuery with API base URL, prepareHeaders injects Bearer token + optional
    X-Tenant-Slug from URL param/sessionStorage (operator routes skip slug injection),
    baseQueryWithReauth: on 401/403 tries /auth/refresh, re-arms credentials, else logs out.
    tagTypes covers Auth, Jobs, Stations, GroupSessions, Pricing, Admin*, Blog, Tenant*,
    Platform*, TenantEdit*, etc. refetchOnFocus + refetchOnReconnect enabled (pricing updates
    visible without reload). endpoints: {} extended by feature API slices.

printloop-new-frontend/src/store/services/authApi.ts
  role — auth RTK Query endpoints
  details — login/register/refresh/me/logout endpoints; drives authSlice on success.

printloop-new-frontend/src/store/services/jobsApi.ts
  role — print-job RTK Query endpoints
  details — create job, list jobs, fetch job, release/print, quote, etc.

printloop-new-frontend/src/store/services/stationsApi.ts
  role — stations/discovery RTK Query endpoints
  details — list public stations, shop detail, discovery queries.

printloop-new-frontend/src/store/services/saasApi.ts
  role — tenant-admin RTK Query endpoints
  details — dashboard stats, queue, payouts, transactions, settings, branding, domains,
    webhooks, security, account, operator surfaces.

printloop-new-frontend/src/store/services/platformApi.ts
  role — platform-admin RTK Query endpoints
  details — list/suspend/reactivate tenants, impersonate, reliability metrics.

printloop-new-frontend/src/store/services/blogApi.ts
  role — marketing blog RTK Query endpoints
  details — list posts, get post by slug.

printloop-new-frontend/src/store/services/discoveryApi.ts
  role — marketplace discovery RTK Query endpoints
  details — shop search, nearby shops, pricing/public branding reads.

printloop-new-frontend/src/store/services/groupApi.ts
  role — group session RTK Query endpoints
  details — create/join/list group sessions, participant uploads.

printloop-new-frontend/src/store/services/preflightApi.ts
  role — preflight analysis RTK Query endpoints
  details — document pre-flight checks before upload.

printloop-new-frontend/src/store/services/adminApi.ts
  role — admin console RTK Query endpoints
  details — admin stats, jobs, users, pricing, promotions, blog, printer profiles,
    transactions, reports, audit logs, kiosks, settings.

## lib / helpers

```

printloop-new-frontend/src/lib/jwt.ts
  role — client-side JWT decode (display only)
  details — decodeToken(token) → DecodedToken | null (no verification; used to read the
    impersonating claim for the impersonation banner). Never trusted for auth.

printloop-new-frontend/src/lib/errors.ts
  role — error extraction helper
  details — extractError(err) digs through err.data.error.message / data.message / error /
    message for a user-facing message fallback.

printloop-new-frontend/src/lib/markdown.ts
  role — markdown rendering helper
  details — renders blog/legal content to HTML in the marketing/blog pages.

printloop-new-frontend/src/lib/pricing.ts
  role — client-side pricing helpers
  details — formatting/display helpers for the pricing matrix and quote UI.

printloop-new-frontend/src/lib/sentry.ts
  role — Sentry client-side init
  details — initSentryIfConfigured() reads VITE_SENTRY_DSN; safe no-op when unset.

printloop-new-frontend/src/lib/pageCount.ts
  role — page-count display helpers
  details — formatting helpers for page-count metadata in job UI.

## UI components

```

printloop-new-frontend/src/index.css
  role — design system + Tailwind layer
  details — Tailwind base/components/utilities; @layer base sets Inter, paper bg, ink text,
    persimmon selection, smooth scroll under reduced-motion. @layer components defines the
    editorial-brutalist component tokens: editorial-label, editorial-folio, editorial-rule,
    pl-btn/pl-btn-primary/pl-btn-dark/pl-btn-ghost/pl-btn-sm/pl-btn-lg (hard 5px offset
    shadow on hover, 2px ink border, uppercase tracking-wider), pl-input (ink border, paper-light,
    error → persimmon), pl-card (ink border, lift-on-hover), pl-chip/pl-chip-active, pl-pill.
    (Full file is larger; this captures the system's purpose.)

printloop-new-frontend/src/components/ui/Button.tsx
  role — button component
  details — (likely wraps pl-btn classes / design-system button; check file for exact API).

printloop-new-frontend/src/components/ui/Input.tsx
  role — input component
  details — (wraps pl-input / design-system input; check file for exact props).

printloop-new-frontend/src/components/ui/Select.tsx
  role — select component
  details — styled select aligned with the design system.

printloop-new-frontend/src/components/ui/CookieConsent.tsx
  role — cookie consent banner
  details — renders cookie consent UI; part of global App chrome.

printloop-new-frontend/src/components/ui/Paper3D.tsx
  role — 3D paper visual component
  details — paper-3D visual used in preview/hero contexts.

printloop-new-frontend/src/components/ui/QrBlock.tsx
  role — QR code display block
  details — renders a QR (e.g. release-code QR) with caption.

printloop-new-frontend/src/components/ui/scrollFx.tsx
  role — in-house scroll animation kit
  details — reveals, counters, parallax, pin-scrub using CSS transforms only; collapses
    under prefers-reduced-motion. No GSAP/Lenis/framer-motion.

printloop-new-frontend/src/components/AppChrome.tsx
  role — app-level chrome helpers
  details — RouteWipe (clears state on route change), TabTitleNudge (document title tweaks).

printloop-new-frontend/src/components/BrandProvider.tsx
  role — per-tenant branding context
  details — fetches /api/branding (public, tenant-resolved) and swaps colours/wordmark/
    favicon for white-label tenants.

printloop-new-frontend/src/components/layout/AppLayout.tsx
  role — customer app layout shell
  details — nav, chrome, and structure for customer-authed pages.

printloop-new-frontend/src/components/layout/AuthLayout.tsx
  role — auth page layout shell
  details — wraps login/register/verify/forgot pages.

printloop-new-frontend/src/components/layout/AdminLayout.tsx
  role — admin console layout shell
  details — separate chrome for /admin (no customer chrome).

printloop-new-frontend/src/components/layout/SaasShell.tsx
  role — tenant-admin shell
  details — shop nav + availability toggle wrapper for /saas/* authenticated pages.

printloop-new-frontend/src/components/layout/SaasProtectedRoute.tsx
  role — tenant-admin route guard
  details — gates /saas/* authenticated pages; redirects to /saas/login when unauthenticated.

printloop-new-frontend/src/components/layout/PublicHeader.tsx
  role — public site header
  details — header for marketing/landing pages.

printloop-new-frontend/src/components/layout/MobileNav.tsx
  role — mobile navigation
  details — mobile nav component.

printloop-new-frontend/src/components/layout/BottomTabBar.tsx
  role — bottom tab bar (mobile)
  details — mobile tab navigation.

printloop-new-frontend/src/components/layout/Marquee.tsx
  role — marquee/scroll-ticker component
  details — editorial marquee element.

printloop-new-frontend/src/components/layout/EditorialFooter.tsx
  role — editorial footer
  details — footer for public/marketing pages.

printloop-new-frontend/src/components/layout/ResponsiveTable.tsx
  role — responsive table
  details — table that adapts to small screens.

printloop-new-frontend/src/components/ImpersonationBanner.tsx
  role — impersonation banner (platform admin acting as tenant)
  details — reads the JWT impersonating claim (via decodeToken) and shows "acting as <tenant>"
    banner when present.

printloop-new-frontend/src/components/SaasProtectedRoute.tsx
  role — already listed under layout; single source for /saas auth gate

printloop-new-frontend/src/components/SentryErrorBoundary.tsx
  role — React error boundary wrapping Sentry
  details — catches render errors and reports to Sentry.

printloop-new-frontend/src/components/SentryAuthListener.tsx
  role — auth↔Sentry user-context sync
  details — subscribes to auth slice; sets/clears Sentry user on login/logout.

printloop-new-frontend/src/components/GoLiveWizard.tsx
  role — go-live wizard component
  details — onboarding/go-live step UI (likely tenant go-live checklist).

printloop-new-frontend/src/components/HowPrintLoopWorks.tsx
  role — "how it works" explainer component
  details — used on marketing/landing to explain the print loop.

printloop-new-frontend/src/components/preflight/IssuePanel.tsx
  role — preflight issue panel
  details — shows preflight analysis issues on upload.

printloop-new-frontend/src/components/preflight/AutoFixPanel.tsx
  role — preflight auto-fix panel
  details — offers auto-fixes for preflight issues where available.

printloop-new-frontend/src/components/preflight/PreflightUploader.tsx
  role — preflight uploader component
  details — upload UI with preflight analysis integration.

printloop-new-frontend/src/components/print/PrintPreview.tsx
  role — print preview component
  details — renders the print preview of the uploaded document + settings.

printloop-new-frontend/src/components/print/DocumentPreview.tsx
  role — document preview (from the preview-component spike)
  details — preview component used in the print flow; see 03-document-preview-component/.

printloop-new-frontend/src/components/print/PreviewStep.tsx
  role — preview step in the print flow
  details — step UI for preview before pay/release.

## pages

```

printloop-new-frontend/src/pages/LandingPage.tsx
  role — homepage/landing
  details — marketing landing + primary CTA flow.

printloop-new-frontend/src/pages/marketing/FeaturesPage.tsx
  role — features page
  details — product features marketing page.

printloop-new-frontend/src/pages/marketing/PricingPage.tsx
  role — pricing page
  details — public pricing matrix page.

printloop-new-frontend/src/pages/marketing/AboutPage.tsx
  role — about page
  details — about PrintLoop.

printloop-new-frontend/src/pages/marketing/ContactPage.tsx
  role — contact page
  details — contact/support page.

printloop-new-frontend/src/pages/marketing/BlogPage.tsx
  role — blog index
  details — list of published blog posts.

printloop-new-frontend/src/pages/marketing/BlogPostPage.tsx
  role — blog post detail
  details — renders one post (markdown content + metadata).

printloop-new-frontend/src/pages/legal/PrivacyPage.tsx
  role — privacy policy page

printloop-new-frontend/src/pages/legal/TermsPage.tsx
  role — terms page

printloop-new-frontend/src/pages/discovery/FindPage.tsx
  role — marketplace shop finder
  details — /find: lists shops by distance/relevance (marketplace discovery, V2-30).

printloop-new-frontend/src/pages/discovery/ShopDetailPage.tsx
  role — shop detail / public profile
  details — /find/:slug: shop name, location, pricing matrix, status, photos.

printloop-new-frontend/src/pages/auth/LoginPage.tsx
  role — customer login page

printloop-new-frontend/src/pages/auth/RegisterPage.tsx
  role — customer register page

printloop-new-frontend/src/pages/auth/VerifyEmailPage.tsx
  role — email verification page

printloop-new-frontend/src/pages/auth/ForgotPasswordPage.tsx
  role — forgot-password page

printloop-new-frontend/src/pages/customer/DashboardPage.tsx
  role — customer dashboard
  details — recent jobs, quick actions.

printloop-new-frontend/src/pages/customer/NewPrintPage.tsx
  role — single print upload flow
  details — upload, configure (copies/paper/color/sided/dpi/orientation), preview, quote, pay.

printloop-new-frontend/src/pages/customer/BatchPrintPage.tsx
  role — batch print flow
  details — multi-file upload, per-file settings, one code, one payment.

printloop-new-frontend/src/pages/customer/GroupPrintPage.tsx
  role — group print session page
  details — group session create/join/host flow.

printloop-new-frontend/src/pages/customer/PrintJobsPage.tsx
  role — customer job history
  details — list of user's jobs with status, codes, cost.

printloop-new-frontend/src/pages/customer/EditReviewPage.tsx
  role — edit review page
  details — edit a submitted shop review.

printloop-new-frontend/src/pages/customer/StationsPage.tsx
  role — stations directory (customer-facing)
  details — public kiosk list with online/offline status + maps links.

printloop-new-frontend/src/pages/customer/SettingsPage.tsx
  role — customer settings
  details — profile, security, print token rotation.

printloop-new-frontend/src/pages/kiosk/KioskCodePage.tsx
  role — kiosk code-entry page
  details — the page the kiosk UI shows for code entry (also reachable at /kiosk, /kiosk/code).

printloop-new-frontend/src/pages/group/JoinPage.tsx
  role — group join page
  details — /join/:shareId: join a group session by share link.

printloop-new-frontend/src/pages/admin/AdminLoginPage.tsx
  role — admin login page (/admin/login)

printloop-new-frontend/src/pages/admin/AdminConsolePage.tsx
  role — admin console home (/admin)
  details — admin dashboard + quick nav.

printloop-new-frontend/src/pages/admin/tabs/BlogTab.tsx
  role — admin blog management tab

printloop-new-frontend/src/pages/admin/tabs/DisputesTab.tsx
  role — admin disputes tab

printloop-new-frontend/src/pages/admin/tabs/JobsTab.tsx
  role — admin jobs tab

printloop-new-frontend/src/pages/admin/tabs/OptionsTab.tsx
  role — admin options/settings tab

printloop-new-frontend/src/pages/admin/tabs/PrinterProfilesTab.tsx
  role — admin printer profiles tab (V2-56)

printloop-new-frontend/src/pages/admin/tabs/PrintersTab.tsx
  role — admin printers tab

printloop-new-frontend/src/pages/admin/tabs/PromotionsTab.tsx
  role — admin promotions tab

printloop-new-frontend/src/pages/admin/tabs/ReportsTab.tsx
  role — admin reports tab

printloop-new-frontend/src/pages/admin/tabs/TransactionsTab.tsx
  role — admin transactions tab

printloop-new-frontend/src/pages/saas/SaasLoginPage.tsx
  role — tenant admin login (/saas/login)

printloop-new-frontend/src/pages/saas/SignupPage.tsx
  role — SaaS tenant signup (/saas/signup)

printloop-new-frontend/src/pages/saas/SaasQueuePage.tsx
  role — tenant queue page (/saas/queue)

printloop-new-frontend/src/pages/saas/SaasEditQueuePage.tsx
  role — tenant edit queue page (/saas/edit-queue)

printloop-new-frontend/src/pages/saas/DashboardHomePage.tsx
  role — tenant dashboard (/saas/dashboard)

printloop-new-frontend/src/pages/saas/PayoutsPage.tsx
  role — tenant payouts (/saas/payouts)

printloop-new-frontend/src/pages/saas/TransactionsPage.tsx
  role — tenant transactions (/saas/transactions)

printloop-new-frontend/src/pages/saas/SetupBankPage.tsx
  role — bank account setup (/saas/setup/bank-account)

printloop-new-frontend/src/pages/saas/SetupSubaccountPage.tsx
  role — Paystack subaccount setup (/saas/setup/subaccount)

printloop-new-frontend/src/pages/saas/SecurityPage.tsx
  role — tenant security settings (/saas/settings/security)

printloop-new-frontend/src/pages/saas/AccountPage.tsx
  role — tenant account settings (/saas/settings/account)

printloop-new-frontend/src/pages/saas/BrandingPage.tsx
  role — tenant branding (/saas/settings/branding)

printloop-new-frontend/src/pages/saas/DomainsPage.tsx
  role — tenant custom domains (/saas/settings/domains)

printloop-new-frontend/src/pages/saas/WebhooksPage.tsx
  role — tenant webhooks (/saas/settings/webhooks)

printloop-new-frontend/src/pages/saas/VerifyEmailPage.tsx
  role — tenant email verification (/saas/verify-email)

printloop-new-frontend/src/pages/saas/ClosedPage.tsx
  role — closed-tenant page (/saas/closed)

printloop-new-frontend/src/pages/saas/OperatorConsolePage.tsx
  role — operator console (/saas/operator)

printloop-new-frontend/src/pages/saas/OperatorPrintersPage.tsx
  role — operator printers (/saas/operator/printers)

printloop-new-frontend/src/pages/saas/SettingsLayout.tsx
  role — tenant settings tab layout
  details — nests branding/domains/webhooks/security/account under /saas/settings.

printloop-new-frontend/src/pages/platform/PlatformConsolePage.tsx
  role — platform super-admin console (/platform)
  details — list/suspend/reactivate tenants, impersonation, reliability.

printloop-new-frontend/src/pages/admin/tabs/* (already covered above)

## tests

```

printloop-new-frontend/src/__tests__/deck.builder.test.ts
  role — onboarding deck builder tests

printloop-new-frontend/src/__tests__/vitest.smoke.test.ts
  role — frontend smoke test

printloop-new-frontend/src/vite-env.d.ts
  role — Vite env type declarations (import.meta.env types)
