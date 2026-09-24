# How PrintLoop works

PrintLoop is a **two-sided digital marketplace** — the Uber model applied to
printing. It connects:

- **Users** who need something printed
- **Printshops** who own the printers and do the printing

PrintLoop owns no printers and no shops. It is the **technology platform** that
matches demand to supply in real time, authenticates the handoff with a code,
and takes a commission on each transaction. This is an **asset-light platform
business** built on three pillars:

1. **Marketplace connectivity** — discovery + matching (the map, the live gate)
2. **Commission-based revenue** — a % of each print, taken before payout
3. **Data-driven optimization** — pricing, ranking, and fraud signals from usage

> **A note on the Uber analogy.** Uber moves a *driver* to the rider. PrintLoop
> doesn't move anything physical to the user by default — the **user walks to
> the printshop** and collects the printout. So "ETA" here is the user's
> estimated walk time to the shop, and "earnings" go to the **printshop**, not a
> driver. A courier/delivery leg (printshop → user's door) is a *future*
> add-on, not in the current build — see [§ Optional courier leg](#optional-courier-leg).

---

## 1. The two-sided marketplace (high level)

```mermaid
flowchart TB
    subgraph DEMAND["DEMAND SIDE — Users"]
        U["User<br/>(student, lecturer, business)"]
    end

    subgraph PLATFORM["PRINTLOOP PLATFORM (asset-light)"]
        direction TB
        DISC["Discovery + Matching<br/>map · distance · live gate"]
        PAY["Payments + Escrow<br/>Paystack split"]
        AUTH["Code Authentication<br/>6-char, single-use, expiring"]
        RATE["Ratings + Trust<br/>1–5 stars, accountability"]
        DATA["Data + ML<br/>pricing · ranking · fraud"]
        COMM["Commission Engine<br/>10–15% per print"]
    end

    subgraph SUPPLY["SUPPLY SIDE — Printshops"]
        S["Printshop<br/>(owns the printer + kiosk PC)"]
    end

    U -->|"1. find nearby shops"| DISC
    DISC -->|"2. shows shops, prices, ETA"| U
    U -->|"3. upload + pay"| PAY
    PAY -->|"4. job dispatched"| S
    U -->|"5. walk to shop + show code"| AUTH
    AUTH -->|"6. release print"| S
    S -->|"7. printed"| U
    U -->|"8. rate 1–5★"| RATE
    PAY -->|"9. payout minus commission"| S
    COMM -.->|"platform revenue"| PLATFORM
    DATA -.->|"optimizes"| DISC
    DATA -.->|"optimizes"| PAY
    RATE -.->|"feeds"| DATA
```

---

## 2. The user journey (Uber-style, step by step)

```mermaid
flowchart TD
    A["Open PrintLoop app"] --> B["Grant location<br/>(or enter manually)"]
    B --> C["See nearby printshops on a map<br/>sorted by distance"]
    C --> D{"Inspect a shop:<br/>prices · rating · open? · online?"}
    D -->|"pick one"| E["Upload document(s)<br/>PDF / DOCX / image"]
    E --> F["Configure: copies, colour,<br/>paper size, single/double-sided"]
    F --> G["Review order summary<br/>live total from shop's prices"]
    G --> H["Pay in-app<br/>(wallet or Paystack)"]
    H --> I{"Payment confirmed?"}
    I -->|"no"| H
    I -->|"yes"| J["Receive 6-char code<br/>in-app + SMS + email"]
    J --> K["App shows ETA to walk<br/>to the shop"]
    K --> L["Job dispatched to shop's<br/>kiosk PC instantly"]
    L --> M["App notifies shop:<br/>user is about to arrive"]
    M --> N["User arrives,<br/>shows / types code"]
    N --> O["Shop verifies code,<br/>file appears, prints"]
    O --> P["Print done"]
    P --> Q["App prompts: rate the<br/>shop 1–5 ★"]
    Q --> R["Money released to shop<br/>minus PrintLoop commission"]
```

### What backs each step in the codebase

| Step | Backend / frontend |
|---|---|
| Find nearby shops | `GET /api/discovery/shops/nearby?lat&lng&radius` (Haversine) → `/find` map |
| Inspect a shop | `GET /api/discovery/shops/:slug` → `/find/:slug` (pricing matrix, rating, online status) |
| Upload | `POST /api/customer/files/upload` (Cloudinary, page-count) |
| Configure + price | per-shop `PricingConfig` 24-cell matrix |
| Pay | `POST /api/customer/print-jobs/:id/pay` (wallet) / Paystack split |
| 6-char code | generated on `PAID`, single-use, expiring; sent via `EmailService` + `SMSService` (Termii) |
| Dispatch to shop | BullMQ queue → kiosk PC's agent claims via `/api/agent/*` |
| Shop verifies code | `POST /api/printer/validate-code` (brute-force-rate-limited) |
| Print | agent dispatches via IPP / raw9100 / OS spooler |
| Rate 1–5★ | `ShopReview` entity (rating 1–5 + comment) |
| Payout minus commission | `commission.service.ts` (10% default) → Paystack subaccount split |

---

## 3. The job lifecycle (state machine)

This is the actual `PrintJobStatus` enum the backend runs.

```mermaid
stateDiagram-v2
    [*] --> PENDING: job created (awaiting payment)
    PENDING --> RENDERING: paid → cloud normalises file
    RENDERING --> READY: rendered to print-ready format
    READY --> RELEASING: customer typed code at shop
    RELEASING --> PRINTING: on-site agent claimed the job
    PRINTING --> DONE: printed successfully
    DONE --> [*]

    RENDERING --> FAILED: render error
    PRINTING --> FAILED: printer error
    READY --> EXPIRED: code expired (60 min, uncollected)
    FAILED --> REFUNDED: money returned to wallet
    EXPIRED --> REFUNDED: money returned to wallet
    REFUNDED --> [*]
```

**Escrow rule:** the customer's money is captured at payment but only **released
to the shop when the job reaches `DONE`**. If the code expires uncollected
(`EXPIRED`) or the print fails (`FAILED`), it auto-refunds to the customer's
wallet. A cron sweep (`workers/retention.ts`) handles expiry.

---

## 4. The money flow (commission-based revenue)

```mermaid
flowchart LR
    U["User pays<br/>₦1,000"] --> SPLIT{"Paystack Split<br/>at charge time"}
    SPLIT -->|"₦900 (90%)"| SHOP["Printshop<br/>subaccount"]
    SPLIT -->|"₦100 (10%)"| PL["PrintLoop<br/>commission"]
    SHOP --> PAYOUT["Weekly / instant payout<br/>to shop's bank"]
    PL --> REV["Platform revenue"]

    REV -.-> R1["Commission 10–15%"]
    REV -.-> R2["Wallet float<br/>(interest on prepaid balances)"]
    REV -.-> R3["Premium map placement"]
```

**Three revenue streams** (your model):
1. **Commission** — 10–15% of every print cost, taken before payout. Default 10%,
   negotiable per shop. Implemented via Paystack Split — the shop's cut routes
   straight to their subaccount; PrintLoop's cut is the platform's.
2. **Wallet float** — users prepay into a wallet; the held balance earns interest.
3. **Premium placement** — shops can pay to rank higher on the map.

The split is computed in `commission.service.ts` (money-math unit-tested) and
routed by Paystack. The shop never has to invoice PrintLoop — the cut is taken
at the moment of charge.

---

## 5. The trust + accountability loop

```mermaid
flowchart TD
    P["Print completed"] --> R["App prompts rating 1–5★"]
    R --> SR["ShopReview saved<br/>(rating + comment)"]
    SR --> AGG["Shop's average rating<br/>recomputed"]
    AGG --> RANK["Feeds map ranking<br/>+ search"]
    AGG --> GATE{"Rating too low /<br/>too many failures?"}
    GATE -->|"yes"| FLAG["Flagged for platform<br/>admin review"]
    FLAG --> SUSP["Suspend or coach<br/>the shop"]
    GATE -->|"no"| OK["Stays live + discoverable"]
    DISP["User disputes a job"] --> ADMIN["Admin disputes queue"]
    ADMIN --> RES{"Resolve"}
    RES -->|"refund user"| REF["Wallet refund"]
    RES -->|"pay shop"| PAYS["Release escrow"]
```

The feedback system fosters "a community of respect and accountability": every
print ends with a rating, ratings drive map ranking, and consistently poor
shops get flagged to the platform admin (`/admin/disputes` queue) for coaching
or suspension. Disputes are resolved case-by-case with refund / pay-shop /
split options.

---

## 6. Real-time data + ML optimization (the third pillar)

```mermaid
flowchart LR
    subgraph SIGNALS["Signals collected"]
        S1["Job volumes per shop / hour"]
        S2["Accept + completion rates"]
        S3["Ratings + disputes"]
        S4["Walk-time / distance"]
        S5["Price elasticity"]
    end
    SIGNALS --> ML["Optimization layer"]
    ML --> O1["Dynamic ranking<br/>(who shows first on the map)"]
    ML --> O2["Surge / off-peak pricing hints"]
    ML --> O3["Fraud + abuse detection<br/>(code brute-force, fake shops)"]
    ML --> O4["Demand forecasting<br/>(where to recruit shops)"]
```

> **Build status:** the **data capture** is live (structured pino logs with
> `tenantId`, ratings, job states, the observability stack in
> `OBSERVABILITY.md`). The **ML optimization layer** is the roadmap target — the
> signals are being collected now so the models have history to train on later.
> Today, ranking is distance + online-status + rating; dynamic ML pricing is the
> next-phase upgrade.

---

## Optional courier leg

Your brief mentioned "couriers" and "transportation." The current build is
**collect-at-shop** (user walks to the shop, Uber-Eats-style pickup). If you want
a **delivery** model (printshop → courier → user's door), here's where it slots
in — it's a real future feature, **not built yet**:

```mermaid
flowchart LR
    DONE["Print DONE at shop"] --> CHOICE{"Delivery chosen?"}
    CHOICE -->|"no — pickup"| PICKUP["User collects with code<br/>(current model)"]
    CHOICE -->|"yes — delivery"| MATCH["Match nearest courier"]
    MATCH --> ETA2["Courier ETA to shop,<br/>then to user"]
    ETA2 --> DROP["Courier delivers<br/>+ user confirms"]
    DROP --> RATE2["User rates shop AND courier"]
```

Adding this would mean: a `Courier` role + entity, a courier matching service
(reuse the Haversine discovery code), a third commission split leg, and a
courier app surface. Ballpark 3–4 weeks. Say the word and I'll scope it as a
phase.

---

## One-glance summary

```mermaid
flowchart LR
    U["USER"] -->|find · upload · pay · rate| PL(("PRINTLOOP<br/>platform"))
    PL -->|dispatch · code · payout| S["PRINTSHOP"]
    S -->|print| U
    PL -->|takes 10–15%<br/>commission| REV["Revenue"]
```

**The whole thing in one line:** user finds a nearby shop on a map → uploads +
pays in-app → gets a code → walks over → shows the code → shop prints it →
user rates the shop → PrintLoop keeps a commission and pays the shop the rest.

---

## How to view these diagrams

The diagrams above are [Mermaid](https://mermaid.js.org/). They render
automatically on **GitHub**, in **VS Code** (with the "Markdown Preview Mermaid
Support" extension), and on [mermaid.live](https://mermaid.live) (paste a block).
If you're reading raw text and want images, paste any block into mermaid.live to
get a PNG/SVG.

---

## Last updated
2026-06-09
