# 00 · START HERE — PrintLoop SaaS v2

This is the **v2 fork** of PrintLoop, duplicated from the original
`printloop for anti-gravity` folder on 2026-05-31. The v1 folder
is untouched and still operable; v2 is where the new work happens.

The v2 thesis: **lean on the OpenPrinting ecosystem from day one**
instead of treating printing as a black box behind the OS print
dialog. We vendor 26 OpenPrinting projects, introduce a cloud
render worker, and reduce the kiosk to a dumb-but-fast spooler.

---

## What's new in v2 (vs v1)

| File / folder | Status | Purpose |
|---|---|---|
| `ARCHITECTURE.md` | **new** | Per-layer map: which OpenPrinting repo plays which role. Read this after `SAAS-ROADMAP.md`. |
| `MARKETPLACE_ARCHITECTURE.md` | **new** | Structured overview of the two-sided Uber-like marketplace layout (Users, Printshops, Couriers). |
| `vendor/openprinting/` | **new** | Shallow clones of 24 OpenPrinting projects (128 MB) we'll link, call, or learn from. Treated as read-only. Two shortlisted repos (`foomatic-db`, `sample-files`) were skipped due to size; see the vendor README. |
| `vendor/openprinting/README.md` | **new** | One-line description of every vendored repo. |
| `tools/refresh-vendor.ps1` | **new** | Re-pull all 26 vendor clones in one command. |
| `render-worker/` | **new (stub)** | Cloud BullMQ consumer that turns uploaded PDFs into PWG-Raster the kiosk spools straight to the printer. Not yet wired to `01-backend`. |
| `JOURNAL.md` | extended | New "Phase V2-0" entry at the top capturing what changed this session. |
| `SAAS-ROADMAP.md` | unchanged | The 14-dimension multi-tenant plan. Still the product strategy bible. |
| `01-backend/` | unchanged | TODO in a future phase: emit `render` jobs after payment confirm. |
| `printloop-new-frontend/` | unchanged | TODO: surface "final page count + cost" UI after render lands. |
| `printloop-kiosk-app/`, `printloop-agent/`, `printloop-kiosk/` | unchanged | TODO: pull rendered PWG artifact + submit via local CUPS. |

---

## What to read in what order

1. **This file** (you're here).
2. **`SAAS-ROADMAP.md`** — the multi-tenant SaaS plan. Still the
   north star; v2 doesn't replace it, it adds the print stack
   underneath it.
3. **`MARKETPLACE_ARCHITECTURE.md`** — the two-sided digital marketplace plan for printshops, users, and couriers.
4. **`ARCHITECTURE.md`** — the print-stack architecture using
   OpenPrinting. Read this to understand the cloud-render →
   kiosk-spool flow.
4. **`vendor/openprinting/README.md`** — what each vendored repo
   does for us.
5. **`render-worker/README.md`** — the new cloud worker. Has a
   TODO list for what's left to wire up.
6. **`JOURNAL.md` Phase V2-0** — what happened this session.

---

## What v2 still owes

The hard parts of v1 stay the hard parts of v2 — the SaaS roadmap
phases (multi-tenancy in the data model, Postgres migration,
self-serve onboarding, billing) all still need to happen. v2 just
adds a parallel workstream:

1. **Wire the render worker** — emit `render` jobs from
   `01-backend` after payment, persist `print_job_render` rows.
2. **Pick the kiosk OS for v2** — Linux unlocks the full stack;
   Windows keeps the v1 install path.
3. **First end-to-end test** — cloud render → kiosk pickup →
   physical print, on at least one printer of each driver family
   (HP / Gutenprint / PS / Ghostscript).
4. **Decide the render-worker host** — Railway / Fly / Render / AWS.

Each lives as an open question in `ARCHITECTURE.md` and a parked
decision in `JOURNAL.md` Phase V2-0.

---

## Same caveats as v1

You're still not expected to be a programmer. The setup manual
from v1 (`PrintLoop-Setup-Manual.docx`, referenced in old notes)
still applies for the parts of the stack that didn't change. The
v2 additions are for the contractor / developer you'll bring on to
turn this from "single-tenant Nigerian print shops" into "any
print business in any country signs up at a website."

If you hit something you don't understand:

1. Copy the exact error and search.
2. Paste into Claude with the file + line number.
3. Hire someone with the relevant skill for an hour or two
   (Node.js + Docker + Postgres for the cloud side; Linux + CUPS
   for the kiosk side).

---

**Next action:** open `SAAS-ROADMAP.md`, skim sections 1–3, then
open `ARCHITECTURE.md` and read the layer map.
